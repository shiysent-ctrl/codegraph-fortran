/**
 * 功能：集中定义本 fork 的发行来源和 跨平台安装调用。
 * 输入：目标版本、可选安装路径；输出：对应平台的安装脚本。依赖：Node 内置模块。
 * 命令与目录沿用 CodeGraph；发行来源始终属于本 fork，禁止回退到上游包。
 */
import * as fs from 'fs';
import * as path from 'path';

export const REPO = 'shiysent-ctrl/codegraph-fortran';
export const NPM_PACKAGE = '@shiysent-ctrl/codegraph-fortran';
export const WINDOWS_ASSET = 'codegraph-fortran-win32-x64.zip';
export function releaseAsset(platform: string = process.platform, arch: string = process.arch): string {
  if (platform === 'win32' && arch === 'x64') return WINDOWS_ASSET;
  if ((platform === 'linux' || platform === 'darwin') && (arch === 'x64' || arch === 'arm64'))
    return `codegraph-fortran-${platform}-${arch}.tar.gz`;
  throw new Error(`Unsupported CodeGraph bundle target: ${platform}-${arch}`);
}
export const INSTALL_SH_URL = `https://raw.githubusercontent.com/${REPO}/main/install.sh`;
export const INSTALL_PS_URL = `https://raw.githubusercontent.com/${REPO}/main/install.ps1`;

/** 已选 bundle 在 PATH 上时，install 只接入客户端，避免重新下载相同版本。 */
export function isBundleOnPath(bundleRoot: string, pathEnv: string,
  exists: (p: string) => boolean = fs.existsSync, platform: string = process.platform,
  realpath: (p: string) => string = fs.realpathSync): boolean {
  if (platform !== 'win32') {
    if (!exists(path.posix.join(bundleRoot, 'node')) || !exists(path.posix.join(bundleRoot, 'bin/codegraph'))) return false;
    for (const dir of pathEnv.split(':')) {
      const candidate = path.posix.join(dir || '.', 'codegraph');
      if (!exists(candidate)) continue;
      try { return realpath(candidate) === realpath(path.posix.join(bundleRoot, 'bin/codegraph')); }
      catch { return false; }
    }
    return false;
  }
  const P = path.win32;
  const bin = P.resolve(bundleRoot, 'bin').toLowerCase();
  if (!exists(P.join(bundleRoot, 'node.exe')) || !exists(P.join(bundleRoot, 'bin/codegraph.cmd'))) return false;
  // PATH 中更早的其他版本会遮蔽所选包；不能只检查本包目录是否出现在列表中。
  for (const dir of pathEnv.split(';').filter(Boolean)) {
    if (['codegraph.exe', 'codegraph.cmd', 'codegraph.bat', 'codegraph.ps1'].some(name => exists(P.join(dir, name))))
      return P.resolve(dir).toLowerCase() === bin;
  }
  return false;
}

export function localInstallerPath(): string | undefined {
  return [path.resolve(__dirname, '../install.ps1'),
    path.resolve(__dirname, '../../validation/install.ps1')].find(p => fs.existsSync(p));
}

export function buildWindowsInstallerScript(version: string, destination?: string, replace = false): string {
  if (!/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('Choose a Fortran fork release version, such as v1.6.1-fortran.');
  }
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const local = localInstallerPath();
  const args = `-Version ${quote(version)}${destination ? ` -Destination ${quote(destination)}` : ''}${replace ? ' -Replace -NoPath' : ''}`;
  // 已安装包携带同一安装器，升级复用其校验和替换流程；源码入口也使用本地安装器。
  if (local) return `$ErrorActionPreference='Stop'; & ${quote(local)} ${args}`;
  return [
    "$ErrorActionPreference='Stop'",
    "$tmp=Join-Path $env:TEMP ('cg-fork-script-'+[guid]::NewGuid().ToString('N'))",
    'New-Item -ItemType Directory -Path $tmp | Out-Null',
    "$installer=Join-Path $tmp 'install.ps1'",
    `try { Invoke-WebRequest -UseBasicParsing -Uri ${quote(INSTALL_PS_URL)} -OutFile $installer; & $installer ${args} } finally { Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue }`,
  ].join(';');
}

/** 先完整下载再运行，避免 curl | sh 把下载失败误报为成功；所有版本通过环境传递。 */
export function buildUnixInstallerScript(downloader: 'curl' | 'wget' = 'curl', preferLocal = true): string {
  const local = preferLocal ? [path.resolve(__dirname, '../install.sh'),
    path.resolve(__dirname, '../../validation/install.sh')].find(p => fs.existsSync(p)) : undefined;
  const quote = (value: string) => "'" + value.replace(/'/g, "'\"'\"'") + "'";
  if (local) return `exec sh ${quote(local)}`;
  const fetch = downloader === 'curl' ? 'curl -fsSL --connect-timeout 15 --max-time 120'
    : 'wget -q --timeout=120 -O';
  const download = downloader === 'curl' ? `${fetch} ${quote(INSTALL_SH_URL)} -o "$script"`
    : `${fetch} "$script" ${quote(INSTALL_SH_URL)}`;
  return ['set -eu', 'script=$(mktemp)', `trap 'rm -f "$script"' EXIT`,
    download, 'sh "$script"'].join('; ');
}
