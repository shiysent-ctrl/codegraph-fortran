"use strict";
/** 功能：在 Linux/macOS 原生平台验收默认安装、CLI/MCP 配置、运行中替换和卸载。
 * 输入：当前平台已构建的 tar.gz/SHA256SUMS；输出：平台管理验收记录。
 * 依赖：随包 Node/POSIX 工具；HOME、PATH、客户端目录与项目均限于私有临时目录。
 */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
assert.ok(['linux', 'darwin'].includes(process.platform), 'Run this acceptance on native Linux/macOS');
const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.argv[2] || path.join(root, 'release/fortran'));
const version = require('../../package.json').version;
const target = process.platform + '-' + process.arch;
const work = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'cg-fork-unix-'));
const home = path.join(work, "中文 user's home"), project = path.join(work, 'project');
const install = path.join(home, '.codegraph'), bin = path.join(home, '.local/bin');
const bundle = path.join(install, 'versions', 'v' + version);
for (const dir of [home, project, path.join(work, 'tmp')]) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(project, 'sample.f90'), 'module sample\ncontains\nsubroutine hello()\nend subroutine hello\nend module sample\n');
const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: path.join(work, 'tmp'),
  XDG_CONFIG_HOME: path.join(home, '.config'), XDG_CACHE_HOME: path.join(home, '.cache'),
  CODEGRAPH_VERSION: 'v' + version, CODEGRAPH_TELEMETRY: '0', CODEGRAPH_NO_DAEMON: '1',
  CODEGRAPH_NO_UPDATE_CHECK: '1', CODEGRAPH_NO_PROMPT_HOOK: '1', CODEGRAPH_NO_INSTALL_REFRESH: '1',
  PATH: [bin, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':') };
for (const key of ['CODEGRAPH_INSTALL_DIR', 'CODEGRAPH_BIN_DIR', 'CODEGRAPH_DIR', 'CODEX_HOME']) delete env[key];
const archive = path.join(output, 'codegraph-fortran-' + target + '.tar.gz');
const sums = path.join(output, 'SHA256SUMS');
function run(command, args, options = {}) {
  const r = spawnSync(command, args, { env, cwd: project, encoding: 'utf8', timeout: 240000,
    maxBuffer: 8 * 1024 * 1024, ...options });
  assert.ifError(r.error); assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout;
}
const cli = (...args) => run('codegraph', args);
const quote = s => "'" + s.replace(/'/g, "'\"'\"'") + "'";
try {
  run('sh', [path.join(root, 'install.sh'), '--archive', archive, '--checksum-file', sums]);
  assert.equal(fs.realpathSync(path.join(install, 'current')), bundle);
  assert.equal(fs.realpathSync(path.join(bin, 'codegraph')), path.join(bundle, 'bin/codegraph'));
  assert.equal(cli('--version').trim(), version);
  assert.equal(JSON.parse(fs.readFileSync(path.join(bundle, 'mcp-config.json'), 'utf8')).mcpServers.codegraph.command, path.join(install, 'current', 'node'));
  const invalid = spawnSync('codegraph', ['status', '--__invalid_option'], { env, cwd: project, encoding: 'utf8' });
  assert.ifError(invalid.error); assert.equal(invalid.status, 1);
  cli('init', '--yes');
  assert.ok(fs.existsSync(path.join(project, '.codegraph/codegraph.db')));
  assert.ok(!fs.existsSync(path.join(project, '.codegraph-fortran')));
  cli('install', '--yes', '--target', 'codex', '--location', 'local');
  assert.match(fs.readFileSync(path.join(project, '.codex/config.toml'), 'utf8'), /command = "codegraph"/);
  fs.writeFileSync(path.join(install, 'keep-state.json'), '{}');
  // 从当前运行的 vendored Node 委托同一安装器，覆盖同版本重新安装的文件替换路径。
  const runner = path.join(work, 'replace.cjs');
  fs.writeFileSync(runner, `const {spawnSync}=require('node:child_process');
    const {buildUnixInstallerScript}=require(${JSON.stringify(path.join(bundle, 'lib/dist/distribution'))});
    const script=buildUnixInstallerScript()+' --archive '+${JSON.stringify(quote(archive))}+' --checksum-file '+${JSON.stringify(quote(sums))};
    const r=spawnSync('sh',['-c',script],{env:process.env,stdio:'inherit',timeout:240000});process.exit(r.status??1);`);
  run(path.join(bundle, 'node'), [runner]);
  assert.equal(cli('--version').trim(), version);
  // 坏校验文件必须保留原运行时与 current 链接。
  const badSums = path.join(work, 'bad-sums');
  fs.writeFileSync(badSums, '0'.repeat(64) + '  ' + path.basename(archive) + '\n');
  const rejected = spawnSync('sh', [path.join(root, 'install.sh'), '--archive', archive, '--checksum-file', badSums], { env, cwd: project, encoding: 'utf8' });
  assert.ifError(rejected.error); assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /SHA-256 mismatch/); assert.equal(cli('--version').trim(), version);
  cli('uninstall', '--yes', '--target', 'codex', '--location', 'local');
  assert.ok(fs.existsSync(bundle));
  cli('install', '--yes', '--target', 'codex', '--location', 'global');
  assert.match(fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8'), /\[mcp_servers\.codegraph\]/);
  cli('uninstall', '--yes', '--target', 'codex', '--location', 'global');
  assert.ok(!fs.existsSync(path.join(install, 'versions')));
  assert.ok(!fs.existsSync(path.join(install, 'current')));
  assert.ok(!fs.existsSync(path.join(bin, 'codegraph')));
  assert.ok(fs.existsSync(path.join(install, 'keep-state.json')));
  assert.ok(fs.existsSync(path.join(project, '.codegraph/codegraph.db')));
  const result = { target, standardLayout: true, cliInit: true, localAndGlobalMcpConfig: true,
    runningRuntimeReplacement: true, corruptArchiveRejected: true, uninstallPreservesStateAndProject: true };
  fs.writeFileSync(path.join(output, 'management-' + target + '.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (path.basename(work).startsWith('cg-fork-unix-') && fs.realpathSync(work).startsWith(fs.realpathSync(os.tmpdir()) + path.sep))
    fs.rmSync(work, { recursive: true, force: true });
}
