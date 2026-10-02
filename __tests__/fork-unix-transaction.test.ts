/** 功能：在 POSIX 文件系统验收安装事务及失败恢复；不下载或运行真实发行程序。
 * 输入：模拟 runtime 的 tar.gz、原安装与故障注入；输出：符号链接和目录恢复断言。
 * 模拟 runtime 只用于控制安装阶段，真实 CLI/MCP 验收由 check-management-unix 单独完成。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawnSync } from 'child_process';
const source = fs.readFileSync(path.join(__dirname, '../install.sh'), 'utf8');
const version = 'v1.6.1-fortran.3';
const quote = (s: string) => "'" + s.replace(/'/g, "'\"'\"'") + "'";
function fixture(check: (f: { work: string; dest: string; install: string; bin: string;
  run: (failSwap?: boolean, failVerification?: boolean) => ReturnType<typeof spawnSync> }) => void) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-unix-transaction-'));
  const home = path.join(work, "中文 user's home"), install = path.join(home, '.codegraph'), bin = path.join(home, '.local/bin');
  const dest = path.join(install, 'versions', version);
  const target = process.platform + '-' + process.arch, name = 'codegraph-fortran-' + target;
  const bundle = path.join(work, name), archive = path.join(work, name + '.tar.gz'), sums = path.join(work, 'SHA256SUMS');
  for (const dir of [home, bin, path.join(bundle, 'bin'), path.join(bundle, 'lib'), path.join(bundle, 'validation'), path.join(dest, 'bin'), path.join(dest, 'lib')])
    fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(bundle, 'node'), '#!/bin/sh\n[ "${CG_TEST_VERIFY_FAIL:-0}" != 1 ] || exit 7\nexit 0\n');
  fs.chmodSync(path.join(bundle, 'node'), 0o755);
  fs.writeFileSync(path.join(bundle, 'bin/codegraph'), '#!/bin/sh\nexit 0\n'); fs.chmodSync(path.join(bundle, 'bin/codegraph'), 0o755);
  for (const file of ['verify.cjs', 'write-config.cjs']) fs.writeFileSync(path.join(bundle, 'validation', file), '// mocked runtime acceptance\n');
  fs.writeFileSync(path.join(bundle, 'lib/package.json'), JSON.stringify({ name: '@shiysent-ctrl/codegraph-fortran' }));
  fs.writeFileSync(path.join(bundle, 'fortran-release.json'), JSON.stringify({ repository: 'shiysent-ctrl/codegraph-fortran' }));
  fs.writeFileSync(path.join(bundle, 'payload'), 'new');
  fs.writeFileSync(path.join(dest, 'node'), 'previous runtime');
  fs.writeFileSync(path.join(dest, 'bin/codegraph'), 'previous launcher');
  fs.writeFileSync(path.join(dest, 'lib/package.json'), JSON.stringify({ name: '@shiysent-ctrl/codegraph-fortran' }));
  fs.writeFileSync(path.join(dest, 'payload'), 'previous');
  fs.symlinkSync(dest, path.join(install, 'current'));
  fs.symlinkSync(path.join(dest, 'bin/codegraph'), path.join(bin, 'codegraph'));
  const tar = spawnSync('tar', ['-czf', archive, name], { cwd: work, encoding: 'utf8' });
  expect(tar.status, tar.stderr).toBe(0);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  fs.writeFileSync(sums, hash + '  ' + path.basename(archive) + '\n');
  const env = { ...process.env, HOME: home, CODEGRAPH_VERSION: version };
  delete env.CODEGRAPH_INSTALL_DIR; delete env.CODEGRAPH_BIN_DIR;
  const run = (failSwap = false, failVerification = false) => spawnSync('sh', ['-s'], {
    input: `set -- --archive ${quote(archive)} --checksum-file ${quote(sums)}
      ${failSwap ? 'ln() { [ "$1" != -sfn ] || return 8; command ln "$@"; }' : ''}
      ${source}`, encoding: 'utf8', timeout: 30000,
    env: { ...env, CG_TEST_VERIFY_FAIL: failVerification ? '1' : '0' } });
  try { check({ work, dest, install, bin, run }); }
  finally { fs.rmSync(work, { recursive: true, force: true }); }
}
describe.skipIf(process.platform === 'win32')('fork Unix install transaction on POSIX filesystem', () => {
  it('replaces a recognized same-version bundle using the standard links', () => fixture(f => {
    const r = f.run(); expect(r.status, String(r.stderr)).toBe(0);
    expect(fs.readFileSync(path.join(f.dest, 'payload'), 'utf8')).toBe('new');
    expect(fs.realpathSync(path.join(f.install, 'current'))).toBe(f.dest);
    expect(fs.realpathSync(path.join(f.bin, 'codegraph'))).toBe(path.join(f.dest, 'bin/codegraph'));
    expect(fs.readdirSync(f.install).some(n => n.startsWith('.install-'))).toBe(false);
  }));
  it('restores the old directory and both links if linking the replacement fails', () => fixture(f => {
    const r = f.run(true); expect(r.status).toBe(8);
    expect(fs.readFileSync(path.join(f.dest, 'payload'), 'utf8')).toBe('previous');
    expect(fs.realpathSync(path.join(f.install, 'current'))).toBe(f.dest);
    expect(fs.realpathSync(path.join(f.bin, 'codegraph'))).toBe(path.join(f.dest, 'bin/codegraph'));
    expect(fs.readdirSync(f.install).some(n => n.startsWith('.install-'))).toBe(false);
  }));
  it('keeps the old bundle when runtime verification rejects the stage', () => fixture(f => {
    const r = f.run(false, true); expect(r.status).toBe(7);
    expect(fs.readFileSync(path.join(f.dest, 'payload'), 'utf8')).toBe('previous');
    expect(fs.realpathSync(path.join(f.install, 'current'))).toBe(f.dest);
  }));
});
