"use strict";
/** 功能：合并五个平台已验收的资产和校验清单；不发布或覆盖任何文件。
 * 输入：CI 下载的各平台 artifact 目录；输出：统一 SHA256SUMS、安装器与 Release 说明。
 * 依赖：Node 内置模块；来源资产和校验不完整时整体失败。
 */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const targets = Object.keys(require('./runtime-packages.json'));
const input = path.resolve(process.argv[2] || 'release/artifacts');
const output = path.resolve(process.argv[3] || 'release/fortran-all');
const version = require('../../package.json').version;
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.ok(!fs.existsSync(output), 'Choose a fresh output directory; release assets are never overwritten');
const files = [], sums = [];
for (const target of targets) {
  const dir = path.join(input, 'codegraph-fortran-' + target);
  const asset = 'codegraph-fortran-' + target + (target.startsWith('win32') ? '.zip' : '.tar.gz');
  const file = path.join(dir, asset);
  const checksum = hash(file);
  const matching = fs.readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8').trim().split(/\r?\n/)
    .filter(line => line === checksum + '  ' + asset);
  assert.equal(matching.length, 1, 'Invalid checksum for ' + target);
  if (!target.startsWith('win32')) {
    const acceptance = JSON.parse(fs.readFileSync(path.join(dir, 'management-' + target + '.json'), 'utf8'));
    assert.equal(acceptance.target, target);
    for (const key of ['standardLayout', 'cliInit', 'localAndGlobalMcpConfig', 'runningRuntimeReplacement',
      'corruptArchiveRejected', 'uninstallPreservesStateAndProject']) assert.equal(acceptance[key], true, target + ': ' + key);
  }
  files.push([file, asset]); sums.push(checksum + '  ' + asset);
}
files.push([path.join(input, 'codegraph-fortran-win32-x64/install.ps1'), 'install.ps1']);
const unixInstaller = path.join(input, 'codegraph-fortran-linux-x64/install.sh');
for (const target of targets.filter(t => !t.startsWith('win32')))
  assert.equal(hash(path.join(input, 'codegraph-fortran-' + target, 'install.sh')), hash(unixInstaller), 'Unix installers differ');
files.push([unixInstaller, 'install.sh']);
fs.mkdirSync(output, { recursive: true });
for (const [from, name] of files) fs.copyFileSync(from, path.join(output, name));
fs.writeFileSync(path.join(output, 'SHA256SUMS'), sums.join('\n') + '\n');
fs.writeFileSync(path.join(output, 'RELEASE-NOTES.md'), `CodeGraph ${version} with the Fortran extension.\n\n` +
  'Preserves the original language support, standard `codegraph` commands and `.codegraph` project indexes.\n\n' +
  '- Windows x64, Linux x64/ARM64, macOS Intel/Apple Silicon bundles include Node and production dependencies.\n' +
  '- Windows installs to `%LOCALAPPDATA%\\codegraph\\current`; Linux/macOS use `~/.codegraph` and `~/.local/bin/codegraph`.\n' +
  '- Download the installer, matching archive and SHA256SUMS for offline installation. Unix offline installation requires CODEGRAPH_VERSION.\n' +
  '- CLI/MCP mixed Fortran/Python/C++ verification and platform management acceptance are required before publication.\n' +
  '- MIT license, original CodeGraph credits and third-party license notices are retained.\n\n' +
  'See [README](https://github.com/shiysent-ctrl/codegraph-fortran#readme) for installation and known extraction limits.\n');
console.log(JSON.stringify({ output, targets, published: false }, null, 2));
