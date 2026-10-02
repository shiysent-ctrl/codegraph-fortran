/** 功能：验收多平台合并的完整性与拒绝覆盖；仅创建模拟资产，不运行发行二进制。
 * 输入：五个平台临时校验清单及管理收据；输出：合并成功、坏包拒绝和缺少验收拒绝断言。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawnSync } from 'child_process';
const targets = ['win32-x64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'];
const script = path.join(__dirname, '../scripts/fortran/assemble-release.cjs');
function fixture(check: (input: string, output: string) => void) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-artifacts-'));
  const input = path.join(work, 'inputs'), output = path.join(work, 'release');
  for (const target of targets) {
    const dir = path.join(input, 'codegraph-fortran-' + target);
    fs.mkdirSync(dir, { recursive: true });
    const asset = 'codegraph-fortran-' + target + (target.startsWith('win32') ? '.zip' : '.tar.gz');
    const body = 'mock bundle ' + target;
    fs.writeFileSync(path.join(dir, asset), body);
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    fs.writeFileSync(path.join(dir, 'SHA256SUMS'), hash + '  ' + asset + '\n');
    fs.writeFileSync(path.join(dir, target.startsWith('win32') ? 'install.ps1' : 'install.sh'), 'mock installer');
    if (!target.startsWith('win32')) fs.writeFileSync(path.join(dir, 'management-' + target + '.json'), JSON.stringify({ target,
      standardLayout: true, cliInit: true, localAndGlobalMcpConfig: true, runningRuntimeReplacement: true,
      corruptArchiveRejected: true, uninstallPreservesStateAndProject: true }));
  }
  try { check(input, output); } finally { fs.rmSync(work, { recursive: true, force: true }); }
}
const assemble = (input: string, output: string) => spawnSync(process.execPath, [script, input, output], { encoding: 'utf8' });
describe('fork multiplatform asset assembly', () => {
  it('combines five verified archives and both installers without overwriting', () => fixture((input, output) => {
    const r = assemble(input, output);
    expect(r.error).toBeUndefined(); expect(r.status, r.stderr).toBe(0);
    expect(fs.readFileSync(path.join(output, 'SHA256SUMS'), 'utf8').trim().split('\n')).toHaveLength(5);
    expect(fs.existsSync(path.join(output, 'install.ps1'))).toBe(true);
    expect(fs.existsSync(path.join(output, 'install.sh'))).toBe(true);
    expect(assemble(input, output).status).toBe(1);
  }));
  it('rejects a corrupted platform archive before emitting output', () => fixture((input, output) => {
    fs.appendFileSync(path.join(input, 'codegraph-fortran-darwin-arm64/codegraph-fortran-darwin-arm64.tar.gz'), 'corruption');
    expect(assemble(input, output).status).toBe(1); expect(fs.existsSync(output)).toBe(false);
  }));
  it('requires native management acceptance from every Unix target', () => fixture((input, output) => {
    fs.rmSync(path.join(input, 'codegraph-fortran-linux-arm64/management-linux-arm64.json'));
    expect(assemble(input, output).status).toBe(1); expect(fs.existsSync(output)).toBe(false);
  }));
});
