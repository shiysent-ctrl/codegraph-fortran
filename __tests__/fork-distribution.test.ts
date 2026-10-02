/** 功能：验证 fork 发行来源、预览版选择及 Windows 管理命令的安装委托。
 * 输入：模拟 GitHub 发行和注入的命令执行器；输出：发行渠道回归断言，无真实安装。
 */
import { describe, it, expect } from 'vitest';
import { REPO, NPM_PACKAGE, WINDOWS_ASSET, buildWindowsInstallerScript, buildUnixInstallerScript, releaseAsset, isBundleOnPath } from '../src/distribution';
import { resolveLatestVersion, selectForkRelease, compareVersions, compareForkVersions, isUpdateAvailable, buildWindowsUpgradeScript,
  runUpgrade, type UpgradeDeps } from '../src/upgrade';
import { planBinaryRemoval } from '../src/upgrade/remove-binary';

const release = (tag_name: string, over = {}) => ({ tag_name, draft: false, prerelease: true,
  assets: [WINDOWS_ASSET, 'SHA256SUMS', 'install.ps1'].map(name => ({ name })), ...over });

describe('fork distribution', () => {
  it('selects the consolidated tag over numbered previews and permits the next base version', () => {
    const tags = [release('v1.6.1-fortran.4'), release('v1.6.1-fortran'), release('v1.6.1-fortran.10')];
    expect(selectForkRelease(tags, 'win32', 'x64')).toBe('v1.6.1-fortran');
    expect(selectForkRelease([release('v1.6.1-fortran', { assets: [] })], 'win32', 'x64')).toBeNull();
    expect(compareForkVersions('1.6.1-fortran', '1.6.1-fortran.4')).toBeGreaterThan(0);
    expect(isUpdateAvailable('1.6.1-fortran.4', '1.6.1-fortran')).toBe(true);
    expect(isUpdateAvailable('1.6.1-fortran', '1.6.1-fortran.10')).toBe(false);
    expect(isUpdateAvailable('1.6.1-fortran', '1.6.2-fortran')).toBe(true);
    expect(compareVersions('1.6.1-fortran', '1.6.1-fortran.4')).toBeLessThan(0);
  });
  it.each(['linux', 'darwin'])('selects %s releases for the running architecture only', platform => {
    for (const arch of ['x64', 'arm64']) {
      const asset = releaseAsset(platform, arch);
      const releases = [release('v1.6.1-fortran.10'), release('v1.6.1-fortran.4', {
        assets: [asset, 'SHA256SUMS', 'install.sh'].map(name => ({ name })) })];
      expect(selectForkRelease(releases, platform, arch)).toBe('v1.6.1-fortran.4');
      expect(selectForkRelease([release('v1.6.1-fortran.3')], platform, arch)).toBeNull();
    }
  });
  it('checks Unix PATH symlinks and refuses a shadowed selected bundle', () => {
    const root = '/home/test/.codegraph/versions/v1';
    const canonical = root + '/bin/codegraph';
    expect(isBundleOnPath(root, '/home/test/.local/bin:/usr/bin', () => true, 'linux',
      p => p.endsWith('/.local/bin/codegraph') ? canonical : p)).toBe(true);
    expect(isBundleOnPath(root, '/other/bin:/home/test/.local/bin', () => true, 'darwin', p => p)).toBe(false);
    expect(() => releaseAsset('linux', 'ia32')).toThrow(/Unsupported/);
  });
  it('downloads the Unix installer fully before executing and keeps errors fatal', () => {
    for (const downloader of ['curl', 'wget'] as const) {
      const script = buildUnixInstallerScript(downloader, false);
      expect(script).toContain(REPO);
      expect(script).toContain('set -eu');
      expect(script).toContain('sh "$script"');
      expect(script).not.toContain('| sh');
    }
  });
  it('keeps the selected bundle when install only needs to wire agents', () => {
    expect(isBundleOnPath('C:\\codegraph\\current', 'C:\\CODEGRAPH\\CURRENT\\bin;C:\\Windows', () => true, 'win32')).toBe(true);
    expect(isBundleOnPath('C:\\codegraph\\current', 'C:\\other\\bin', () => true)).toBe(false);
    expect(isBundleOnPath('C:\\codegraph\\current', 'C:\\other\\bin;C:\\codegraph\\current\\bin', () => true)).toBe(false);
    expect(isBundleOnPath('C:\\source', 'C:\\source\\bin', () => false, 'win32')).toBe(false);
  });
  it('selects the newest complete standard-entry preview, including numeric suffixes', () => {
    expect(selectForkRelease([release('v1.6.1-fortran.2'), release('v1.6.1-fortran.3'),
      release('v1.6.1-fortran.10'), release('v1.6.1-fortran.11', { draft: true }),
      release('v1.6.1-fortran.12', { assets: [] }), release('v9.0.0')], 'win32', 'x64')).toBe('v1.6.1-fortran.10');
    expect(compareVersions('1.6.1-fortran.10', '1.6.1-fortran.3')).toBeGreaterThan(0);
    expect(selectForkRelease([release('v1.6.1-fortran.2')], 'win32', 'x64')).toBeNull();
  });

  it('requests only fork releases and does not fall back to the upstream', async () => {
    const urls: string[] = [];
    const get = async (url: string) => {
      urls.push(url);
      return { status: 200, headers: {}, body: JSON.stringify([release('v1.6.1-fortran.3')]) };
    };
    expect(await resolveLatestVersion(undefined, 1000, get, 'win32', 'x64')).toBe('v1.6.1-fortran.3');
    expect(urls).toEqual([`https://api.github.com/repos/${REPO}/releases?per_page=100`]);
    await expect(resolveLatestVersion(undefined, 1000, async () => ({ status: 403, headers: {}, body: '{}' }), 'win32', 'x64'))
      .rejects.toThrow(REPO);
  });

  it('delegates updates to the canonical installer with a safely quoted destination', () => {
    const script = buildWindowsUpgradeScript("C:\\用户's 工具\\codegraph\\current", 'v1.6.1-fortran.4', 'x64');
    expect(script).toContain("用户''s 工具");
    expect(script).toContain("-Version 'v1.6.1-fortran.4'");
    expect(script).toContain('-Replace -NoPath');
    expect(script).not.toContain('colbymchenry');
    expect(() => buildWindowsInstallerScript("v1.6.1';exit")).toThrow();
    expect(() => buildWindowsUpgradeScript('C:\\x', 'v1.6.1-fortran.4', 'arm64')).toThrow(/x64/);
  });

  it('refuses an unpublished npm channel without executing npm or an upstream installer', async () => {
    const runs: string[] = [];
    const deps: UpgradeDeps = { currentVersion: '1.6.1-fortran.3', method: { kind: 'npm', scope: 'global' },
      platform: 'win32', resolveLatest: async () => 'v1.6.1-fortran.4',
      run: cmd => { runs.push(cmd); return 0; }, capture: () => null, hasCommand: () => false,
      log: () => {}, warn: () => {}, error: msg => expect(msg).toContain(REPO) };
    expect(await runUpgrade({}, deps)).toBe(1);
    expect(runs).toEqual([]);
  });

  it('uninstall targets the fork npm identity and leaves the upstream package alone', () => {
    expect(NPM_PACKAGE).toBe('@shiysent-ctrl/codegraph-fortran');
    const probes = { filename: '/project/dist/bin/codegraph.js', platform: 'linux' as const,
      cwd: '/project', env: {}, homedir: '/home/test', readlink: () => null,
      capture: () => ({ code: 0, stdout: '/npm/node_modules' }),
      exists: (p: string) => p === '/npm/node_modules/@colbymchenry/codegraph' };
    expect(planBinaryRemoval(probes).npmGlobal).toBe(false);
    expect(planBinaryRemoval({ ...probes, exists: p => p === `/npm/node_modules/${NPM_PACKAGE}` }).npmGlobal).toBe(true);
  });
});
