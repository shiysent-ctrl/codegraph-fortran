"use strict";
/** 功能：在临时安装根目录验收标准入口、客户端配置和运行中升级/卸载。
 * 输入：同一源码构建的 ZIP 和校验文件；输出：验收记录。
 * 依赖：Node、Windows PowerShell 5.1；所有安装均使用 NoPath，客户端 HOME/CWD 指向临时目录。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.argv[2] || path.join(root, 'release/fortran'));
const temp = fs.realpathSync.native(os.tmpdir());
const work = fs.mkdtempSync(path.join(temp, 'cg-fork-management-'));
const installRoot = path.join(work, '中文 用户', 'codegraph');
const bundle = path.join(installRoot, 'current');
const project = path.join(work, 'project');
fs.mkdirSync(project);
fs.writeFileSync(path.join(project, 'sample.f90'), 'module sample\ncontains\nsubroutine hello()\nend subroutine hello\nend module sample\n');
const system = process.env.SystemRoot || 'C:\\Windows';
const shell = path.join(system, 'System32/WindowsPowerShell/v1.0/powershell.exe');
const env = { ...process.env, USERPROFILE: path.join(work, 'home'), HOME: path.join(work, 'home'),
  LOCALAPPDATA: path.join(work, 'local'), APPDATA: path.join(work, 'roaming'),
  TEMP: path.join(work, 'runtime-temp'), TMP: path.join(work, 'runtime-temp'),
  CODEGRAPH_INSTALL_DIR: installRoot, CODEGRAPH_TELEMETRY: '0', CODEGRAPH_NO_UPDATE_CHECK: '1',
  CODEGRAPH_NO_DAEMON: '1', CODEGRAPH_NO_PROMPT_HOOK: '1', CODEGRAPH_NO_INSTALL_REFRESH: '1' };
// 仅改变子进程环境，排除真实 npm/PATH 和 PowerShell 7 的模块路径。
for (const key of Object.keys(env)) if (['path', 'psmodulepath', 'codegraph_dir'].includes(key.toLowerCase())) delete env[key];
env.PATH = [path.join(bundle, 'bin'), path.join(system, 'System32'), system].join(';');
fs.mkdirSync(env.USERPROFILE, { recursive: true });
fs.mkdirSync(env.TEMP, { recursive: true });
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { env, cwd: project, encoding: 'utf8', timeout: 240000,
    maxBuffer: 8 * 1024 * 1024, ...options });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}
const archive = path.join(output, 'codegraph-fortran-win32-x64.zip');
const sums = path.join(output, 'SHA256SUMS');
const cli = (...args) => run(path.join(system, 'System32/cmd.exe'), ['/d', '/s', '/c', 'codegraph ' + args.join(' ')]);
try {
  // 验证 CODEGRAPH_INSTALL_DIR/current 的默认布局，故意不指定 Destination。
  run(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'install.ps1'),
    '-Archive', archive, '-ChecksumFile', sums, '-NoPath']);
  assert.equal(cli('--version').trim(), require('../../package.json').version);
  const invalid = spawnSync(path.join(system, 'System32/cmd.exe'), ['/d', '/s', '/c', 'codegraph status --__invalid_option'],
    { env, cwd: project, encoding: 'utf8', timeout: 30000 });
  assert.ifError(invalid.error);
  assert.equal(invalid.status, 1); // 启动器不能把 CLI 失败吞成成功。
  cli('init', '--yes');
  assert.ok(fs.existsSync(path.join(project, '.codegraph/codegraph.db')));
  assert.ok(!fs.existsSync(path.join(project, '.codegraph-fortran')));
  cli('install', '--yes', '--target', 'codex', '--location', 'local');
  const config = fs.readFileSync(path.join(project, '.codex/config.toml'), 'utf8');
  assert.match(config, /\[mcp_servers\.codegraph\]/);
  assert.match(config, /command = "codegraph"/);

  // 由安装中的 node.exe 启动升级安装器，实际覆盖运行时锁定场景；离线使用同一新源码包。
  const runner = path.join(work, 'upgrade.cjs');
  fs.writeFileSync(runner, `const {spawnSync}=require('node:child_process');
    const {buildWindowsUpgradeScript}=require(${JSON.stringify(path.join(bundle, 'lib/dist/upgrade'))});
    const quote=s=>"'"+s.replace(/'/g,"''")+"'";
    const script=buildWindowsUpgradeScript(${JSON.stringify(bundle)}, 'v'+${JSON.stringify(require('../../package.json').version)}, 'x64')
      +' -Archive '+quote(${JSON.stringify(archive)})+' -ChecksumFile '+quote(${JSON.stringify(sums)});
    const result=spawnSync(${JSON.stringify(shell)}, ['-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
      {env:process.env,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});
    process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);`);
  run(path.join(bundle, 'node.exe'), [runner]);
  assert.equal(cli('--version').trim(), require('../../package.json').version);
  assert.ok(fs.existsSync(path.join(project, '.codegraph/codegraph.db')));
  cli('uninstall', '--yes', '--target', 'codex', '--location', 'local');
  assert.ok(fs.existsSync(bundle)); // 项目级卸载只移除配置，保持全局 CLI。
  assert.ok(fs.existsSync(path.join(project, '.codegraph/codegraph.db')));
  if (fs.existsSync(path.join(project, '.codex/config.toml')))
    assert.doesNotMatch(fs.readFileSync(path.join(project, '.codex/config.toml'), 'utf8'), /\[mcp_servers\.codegraph\]/);
  cli('install', '--yes', '--target', 'codex', '--location', 'global');
  assert.ok(fs.existsSync(path.join(env.USERPROFILE, '.codex/config.toml')));
  cli('uninstall', '--yes', '--target', 'codex', '--location', 'global');
  assert.ok(!fs.existsSync(bundle));
  assert.ok(fs.existsSync(path.join(project, '.codegraph/codegraph.db')));
  console.log('Fork management: standard layout, CLI init, local MCP install, locked-runtime replacement and uninstall preserving project index passed.');
} finally {
  if (fs.realpathSync.native(work).startsWith(temp + path.sep) && path.basename(work).startsWith('cg-fork-management-'))
    fs.rmSync(work, { recursive: true, maxRetries: 10, retryDelay: 200 });
}
