"use strict";
/** 功能：从当前源码构建 Windows x64 独立发行包并运行 CLI/MCP 验收。
 * 输入：固定官方 npm 平台 tgz；输出：release/fortran 下的 ZIP、SHA256SUMS 和验证记录。
 * 仅复用已校验的 Node 和生产依赖；所有应用代码和语法均来自本 fork，不复制旧内核。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { verify } = require('./verify.cjs');
const root = path.resolve(__dirname, '../..');
const version = require('../../package.json').version;
const integrity = 'qUcpAR32HgKMcrkZAOAXwY6vCV9TztF1YE61/SGC6TRNqPkJGHMD22yNe2VmrCmSmPNf0/aQIWS/BKGJ3ZFDPA==';
const hash = (file, algorithm = 'sha256', encoding = 'hex') => crypto.createHash(algorithm).update(fs.readFileSync(file)).digest(encoding);
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout.trim();
}
function walk(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`不接受发行包符号链接：${relative}`);
    return entry.isDirectory() ? walk(path.join(dir, entry.name), relative + '/') : [relative];
  });
}
async function build(archive, outputDirectory) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('第一版发行构建仅支持 Windows x64');
  if (version !== '1.6.1-fortran.3') throw new Error('升级版本时同步验证器、安装入口和发行工作流');
  archive = fs.realpathSync(archive);
  if (hash(archive, 'sha512', 'base64') !== integrity) throw new Error('官方平台包 SHA-512 不匹配');
  const output = outputDirectory ? path.resolve(outputDirectory) : path.join(root, 'release', 'fortran');
  fs.mkdirSync(output, { recursive: true });
  const zip = path.join(output, 'codegraph-fortran-win32-x64.zip');
  if (fs.existsSync(zip)) throw new Error('发行 ZIP 已存在；请先核实或换用新的 checkout，禁止静默覆盖');
  const work = fs.mkdtempSync(path.join(output, '.stage-'));
  const base = path.join(work, 'base');
  fs.mkdirSync(base);
  run('tar.exe', ['-xzf', archive, '-C', base]);
  const original = path.join(base, 'package');
  const originalPackage = JSON.parse(fs.readFileSync(path.join(original, 'lib/package.json'), 'utf8'));
  const current = require('../../package.json');
  if (originalPackage.version !== '1.6.1' || JSON.stringify(originalPackage.dependencies) !== JSON.stringify(current.dependencies))
    throw new Error('生产依赖或上游版本变化，不能复用平台包');
  // tsc 和 viewer 已在 npm run build 中构建；构建门检查复制资产，避免旧 dist 假成功。
  run(process.execPath, ['scripts/check-ui-build.mjs']);
  const bundle = path.join(work, 'codegraph-fortran-win32-x64');
  fs.mkdirSync(path.join(bundle, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(bundle, 'bin'));
  fs.copyFileSync(path.join(original, 'node.exe'), path.join(bundle, 'node.exe'));
  fs.cpSync(path.join(original, 'lib/node_modules'), path.join(bundle, 'lib/node_modules'), { recursive: true });
  fs.cpSync(path.join(root, 'dist'), path.join(bundle, 'lib/dist'), { recursive: true });
  fs.copyFileSync(path.join(root, 'package.json'), path.join(bundle, 'lib/package.json'));
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(bundle, 'LICENSE'));
  fs.copyFileSync(path.join(root, 'FORTRAN.md'), path.join(bundle, 'FORTRAN.md'));
  fs.cpSync(path.join(root, 'third_party'), path.join(bundle, 'third_party'), { recursive: true });
  fs.cpSync(path.join(root, '__tests__/fixtures/fortran'), path.join(bundle, 'validation/fixtures'), { recursive: true });
  for (const name of ['verify.cjs', 'write-config.cjs']) fs.copyFileSync(path.join(__dirname, name), path.join(bundle, 'validation', name));
  fs.writeFileSync(path.join(bundle, 'bin/codegraph.cmd'), [
    '@echo off', 'setlocal',
    // 沿用引擎默认 .codegraph 和显式 CODEGRAPH_DIR；所有原版子命令直接转交 CLI。
    'set "CODEGRAPH_NO_DAEMON=1"',
    'set "CODEGRAPH_NO_UPDATE_CHECK=1"', 'set "CODEGRAPH_TELEMETRY=0"',
    '@"%~dp0..\\node.exe" --liftoff-only --disable-warning=ExperimentalWarning "%~dp0..\\lib\\dist\\bin\\codegraph.js" %*',
    'exit /b %errorlevel%', '',
  ].join('\r\n'));
  const descriptor = { version, repository: 'shiysent-ctrl/codegraph-fortran',
    sourceCommit: run('git', ['rev-parse', 'HEAD']), sourceDirty: run('git', ['status', '--porcelain']).length > 0,
    runtimePackage: '@colbymchenry/codegraph-win32-x64@1.6.1', runtimePackageIntegrity: `sha512-${integrity}`,
    nativeKernel: false, cliName: 'codegraph', indexDirectory: '.codegraph', grammar: require('../../third_party/fortran/manifest.json'), files: {} };
  for (const relative of walk(bundle)) descriptor.files[relative] = hash(path.join(bundle, relative));
  fs.writeFileSync(path.join(bundle, 'fortran-release.json'), JSON.stringify(descriptor, null, 2) + '\n');
  const result = await verify(bundle);
  fs.writeFileSync(path.join(bundle, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
  run('tar.exe', ['-a', '-cf', zip, path.basename(bundle)], work);
  fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${hash(zip)}  ${path.basename(zip)}\n`);
  fs.copyFileSync(path.join(root, 'install.ps1'), path.join(output, 'install.ps1'));
  console.log(JSON.stringify({ zip, sha256: hash(zip), validation: result }, null, 2));
  // 仅清理本次创建且位于固定输出目录下的暂存目录。
  if (fs.realpathSync(work).startsWith(fs.realpathSync(output) + path.sep) && path.basename(work).startsWith('.stage-'))
    fs.rmSync(work, { recursive: true, maxRetries: 10, retryDelay: 200 });
}
const index = process.argv.indexOf('--archive');
const outputIndex = process.argv.indexOf('--output');
if (index < 0 || !process.argv[index + 1] || (outputIndex >= 0 && !process.argv[outputIndex + 1])) {
  console.error('用法：node scripts/fortran/build-release.cjs --archive <平台 tgz> [--output <输出目录>]');
  process.exitCode = 1;
} else build(process.argv[index + 1], outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined).catch(error => {
  console.error(error.stack); process.exitCode = 1;
});
