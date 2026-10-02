/** 功能：直接执行 Unix 安装器的发行选择和拒绝路径；不下载或安装真实程序。
 * 输入：模拟 uname/curl、私有 HOME、离线损坏包；输出：平台分派与失败保留断言。
 * Windows 通过 Git Bash 检查 shell 控制流；原生运行时由 CI 验收脚本单独验证。
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
const source = fs.readFileSync(path.join(__dirname, '../install.sh'), 'utf8');
const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'sh';
const shq = (s: string) => "'" + s.replace(/\\/g, '/').replace(/'/g, "'\"'\"'") + "'";
function probe(platform: string, arch: string, releases: unknown, version = '', offline = false) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-unix-shell-'));
  const home = path.join(work, '中文 user');
  fs.mkdirSync(home);
  const json = path.join(work, 'releases.json'), log = path.join(work, 'downloads');
  fs.writeFileSync(json, typeof releases === 'string' ? releases : JSON.stringify(releases));
  const asset = `codegraph-fortran-${platform === 'Darwin' ? 'darwin' : 'linux'}-${arch === 'x86_64' ? 'x64' : 'arm64'}.tar.gz`;
  fs.writeFileSync(path.join(work, 'bad.tar.gz'), 'damaged archive');
  fs.writeFileSync(path.join(work, 'SHA256SUMS'), '0'.repeat(64) + '  ' + asset + '\n');
  const prefix = `HOME=${shq(home)}; export HOME
    unset CODEGRAPH_INSTALL_DIR CODEGRAPH_BIN_DIR
    CODEGRAPH_VERSION=${shq(version)}; export CODEGRAPH_VERSION
    uname() { case "$1" in -s) echo ${shq(platform)} ;; *) echo ${shq(arch)} ;; esac; }
    curl() {
      case "$*" in
        *api.github*) while [ "$#" -gt 0 ]; do
          if [ "$1" = -o ]; then shift; cp ${shq(json)} "$1"; return; fi
          shift
        done; return 1 ;;
        *) printf '%s\\n' "$*" >> ${shq(log)}; return 22 ;;
      esac
    }
    ${offline ? `set -- --archive ${shq(path.join(work, 'bad.tar.gz'))} --checksum-file ${shq(path.join(work, 'SHA256SUMS'))}` : 'set --'}
  `;
  try {
    const result = spawnSync(shell, ['-s'], { input: prefix + source, encoding: 'utf8', timeout: 30000,
      env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
    expect(result.error).toBeUndefined();
    return { status: result.status, stderr: result.stderr,
      urls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '',
      installed: fs.existsSync(path.join(home, '.codegraph/current')),
      leftovers: fs.existsSync(path.join(home, '.codegraph')) ? fs.readdirSync(path.join(home, '.codegraph')) : [] };
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}
const release = (tag: string, assets: string[], extra = {}) => ({ tag_name: tag, draft: false,
  body: 'quoted "text", brackets [ ] and nested { }', nested: { tag_name: 'v9.9.9-fortran.99' },
  assets: assets.map(name => ({ name, extra: { name: 'misleading' } })), ...extra });
describe('fork Unix installer shell control flow', () => {
  it.each([['Linux', 'x86_64', 'linux-x64'], ['Darwin', 'arm64', 'darwin-arm64']])(
    'selects the unnumbered release over previews for %s %s', (platform, arch, target) => {
      const assets = [`codegraph-fortran-${target}.tar.gz`, 'install.sh', 'SHA256SUMS'];
      const r = probe(platform, arch, [release('v1.6.1-fortran.4', assets),
        release('v1.6.1-fortran', assets), release('v1.6.1-fortran.10', assets)]);
      expect(r.urls).toContain(`releases/download/v1.6.1-fortran/codegraph-fortran-${target}.tar.gz`);
      expect(r.installed).toBe(false);
    });
  it('prunes only recognized older bundles and preserves the previous active version', () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-prune-shell-'));
    const block = source.split('# >>> CODEGRAPH_PRUNE_OLD_VERSIONS')[1].split('# <<< CODEGRAPH_PRUNE_OLD_VERSIONS')[0];
    try {
      const script = `set -eu
        INSTALL_DIR=${shq(work)}
        dest="$INSTALL_DIR/versions/current"
        previous_dir="$INSTALL_DIR/versions/previous"
        for v in older previous current unknown; do
          mkdir -p "$INSTALL_DIR/versions/$v/bin"
          printf '#!/bin/sh\\n' > "$INSTALL_DIR/versions/$v/bin/codegraph"
          printf 'runtime' > "$INSTALL_DIR/versions/$v/node"
        done
        for v in older previous current; do
          printf '{"repository":"shiysent-ctrl/codegraph-fortran"}' > "$INSTALL_DIR/versions/$v/fortran-release.json"
        done
        ${block}
      `;
      const r = spawnSync(shell, ['-s'], { input: script, encoding: 'utf8', timeout: 30000 });
      expect(r.error).toBeUndefined(); expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain('Removed    1 older version(s)');
      expect(fs.readdirSync(path.join(work, 'versions')).sort()).toEqual(['current', 'previous', 'unknown']);
    } finally { fs.rmSync(work, { recursive: true, force: true }); }
  });
  it.each([['Linux', 'x86_64', 'linux-x64'], ['Linux', 'aarch64', 'linux-arm64'],
    ['Darwin', 'x86_64', 'darwin-x64'], ['Darwin', 'arm64', 'darwin-arm64']])(
    'selects a complete numeric preview for %s %s', (platform, arch, target) => {
      const assets = [`codegraph-fortran-${target}.tar.gz`, 'install.sh', 'SHA256SUMS'];
      const r = probe(platform, arch, [release('v1.6.1-fortran.3', assets), release('v1.6.1-fortran.10', assets),
        release('v1.6.1-fortran.11', assets, { draft: true }), release('v1.6.1-fortran.12', ['install.sh']),
        release('v1.6.1-fortran.2', assets)]);
      expect(r.status).toBe(1); // 模拟下载故意失败，仅验收发行选择。
      expect(r.urls).toContain(`releases/download/v1.6.1-fortran.10/codegraph-fortran-${target}.tar.gz`);
      expect(r.installed).toBe(false);
      expect(r.leftovers).toEqual([]);
    });
  it('rejects Windows-only releases rather than selecting an incompatible bundle', () => {
    const r = probe('Darwin', 'arm64', [release('v1.6.1-fortran.3', ['codegraph-fortran-win32-x64.zip', 'install.ps1', 'SHA256SUMS'])]);
    expect(r.stderr).toContain('No compatible fork release');
    expect(r.urls).toBe('');
  });
  it.each(['{"message":"rate limited"}', '[{"tag_name":', '[false]'])('rejects malformed release data: %s', data => {
    const r = probe('Linux', 'x86_64', data);
    expect(r.status).toBe(1);
    expect(r.urls).toBe('');
    expect(r.installed).toBe(false);
  });
  it('rejects an invalid pinned tag before downloading', () => {
    const r = probe('Linux', 'x86_64', [], "v1.6.1-fortran.3; echo unsafe");
    expect(r.stderr).toContain('Invalid fork release version');
    expect(r.urls).toBe('');
  });
  it('rejects a corrupt offline archive before creating version directories', () => {
    const r = probe('Darwin', 'arm64', [], 'v1.6.1-fortran.3', true);
    expect(r.stderr).toContain('SHA-256 mismatch');
    expect(r.urls).toBe('');
    expect(r.leftovers).toEqual([]);
  });
});
