"use strict";
/** 功能：在真实 Windows PowerShell 5.1 中验收发行安装脚本，防止中文解码和模块路径回归。
 * 输入：release/fortran 中的 ZIP 和校验文件；输出：安装及启动器验证结果。
 * 依赖：Node、Windows PowerShell；只创建并清理本次临时安装，不修改客户端。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const tempRoot = fs.realpathSync.native(os.tmpdir());
const parent = fs.mkdtempSync(path.join(tempRoot, 'cgfortran-ps51-'));
const destination = path.join(parent, '中文 安装');
const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
const result = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'install.ps1'),
  '-Archive', path.join(root, 'release/fortran/codegraph-fortran-win32-x64.zip'),
  '-ChecksumFile', path.join(root, 'release/fortran/SHA256SUMS'), '-Destination', destination],
  { env, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
assert.ifError(result.error);
assert.equal(result.status, 0, result.stderr + result.stdout);
const installed = spawnSync(path.join(destination, 'node.exe'), ['--liftoff-only', path.join(destination, 'lib/dist/bin/codegraph.js'), '--version'],
  { env, encoding: 'utf8', timeout: 30000 });
assert.equal(installed.status, 0, installed.stderr);
assert.equal(installed.stdout.trim(), require('../../package.json').version);
assert.ok(fs.existsSync(path.join(destination, 'codex-mcp.toml')));
console.log('Windows PowerShell 5.1 install, cleanup and launch: passed.');
if (fs.realpathSync.native(parent).startsWith(tempRoot + path.sep) && path.basename(parent).startsWith('cgfortran-ps51-'))
  fs.rmSync(parent, { recursive: true, maxRetries: 10, retryDelay: 200 });
