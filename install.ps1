<#
功能：安装固定的 Windows x64 CodeGraph Fortran 发行包。
输入：可选独立目标、离线 ZIP 与 SHA256SUMS；输出：独立安装及 MCP 片段。
依赖：PowerShell/.NET；运行使用随包 Node。默认沿用上游 Windows 目录和用户 PATH；不会修改客户端或初始化项目。
#>
[CmdletBinding()]
param(
    [string]$Destination,
    [string]$Archive,
    [string]$ChecksumFile,
    [string]$Version,
    [switch]$Replace,
    [switch]$NoPath
)
$ErrorActionPreference = 'Stop'
$taskVersion = if ($Version) { $Version.TrimStart('v') } elseif ($env:CODEGRAPH_VERSION) { $env:CODEGRAPH_VERSION.TrimStart('v') } else { '1.6.1-fortran.4' }
if ($taskVersion -notmatch '^\d+\.\d+\.\d+-fortran\.\d+$') { throw 'Choose a Fortran fork release version.' }
$taskRepo = 'shiysent-ctrl/codegraph-fortran'
$taskAssetName = 'codegraph-fortran-win32-x64.zip'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or [Environment]::Is64BitOperatingSystem -ne $true) {
    throw 'This release supports Windows x64 only.'
}
$taskCpu = [Environment]::GetEnvironmentVariable('PROCESSOR_ARCHITEW6432')
if (-not $taskCpu) { $taskCpu = [Environment]::GetEnvironmentVariable('PROCESSOR_ARCHITECTURE') }
if ($taskCpu -ne 'AMD64') { throw 'This release supports Windows x64 only.' }
if (-not $Destination) {
    $taskInstallRoot = if ($env:CODEGRAPH_INSTALL_DIR) { $env:CODEGRAPH_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'codegraph' }
    $Destination = Join-Path $taskInstallRoot 'current'
    $Replace = $true
}
$taskTarget = [IO.Path]::GetFullPath($Destination)
if ($taskTarget -eq [IO.Path]::GetPathRoot($taskTarget) -or $taskTarget.TrimEnd('\') -ieq $env:USERPROFILE.TrimEnd('\')) { throw 'Unsafe installation destination.' }
$taskReplacing = Test-Path -LiteralPath $taskTarget
if ($taskReplacing) {
    if (-not $Replace) { throw "Destination exists; choose a new directory or use -Replace: $taskTarget" }
    # 只替换可识别的 CodeGraph 程序目录；项目索引、源码和普通目录不属于安装器。
    if ((Test-Path -LiteralPath (Join-Path $taskTarget '.git')) -or -not (Test-Path -LiteralPath (Join-Path $taskTarget 'node.exe')) -or -not (Test-Path -LiteralPath (Join-Path $taskTarget 'bin\codegraph.cmd'))) { throw 'Existing destination is not a CodeGraph bundle.' }
    $taskExistingPackage = Get-Content -LiteralPath (Join-Path $taskTarget 'lib\package.json') -Raw | ConvertFrom-Json
    if ($taskExistingPackage.name -notin @('@shiysent-ctrl/codegraph-fortran', '@colbymchenry/codegraph')) { throw 'Existing destination is not a recognized CodeGraph package.' }
}
$taskParent = Split-Path -Parent $taskTarget
if (-not (Test-Path -LiteralPath $taskParent)) { New-Item -ItemType Directory -Path $taskParent -Force | Out-Null }
$taskStage = Join-Path $taskParent ('.cgfortran-install-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskStage | Out-Null
try {
    if ($Archive) {
        if (-not $ChecksumFile) { throw 'Offline install requires -ChecksumFile SHA256SUMS.' }
        $taskZip = (Resolve-Path -LiteralPath $Archive).Path
        $taskSums = Get-Content -LiteralPath $ChecksumFile -Raw
    } else {
        if ($ChecksumFile) { throw '-ChecksumFile requires -Archive.' }
        $taskBaseUrl = "https://github.com/$taskRepo/releases/download/v$taskVersion"
        $taskZip = Join-Path $taskStage $taskAssetName
        $taskSumsPath = Join-Path $taskStage 'SHA256SUMS'
        Invoke-WebRequest -UseBasicParsing -Uri "$taskBaseUrl/SHA256SUMS" -OutFile $taskSumsPath
        Invoke-WebRequest -UseBasicParsing -Uri "$taskBaseUrl/$taskAssetName" -OutFile $taskZip
        $taskSums = Get-Content -LiteralPath $taskSumsPath -Raw
    }
    $taskMatch = [regex]::Matches($taskSums, ('(?m)^([a-fA-F0-9]{64})[ \t]+\*?' + [regex]::Escape($taskAssetName) + '\r?$'))
    if ($taskMatch.Count -ne 1) { throw 'Missing or ambiguous release checksum.' }
    $taskActual = (Get-FileHash -LiteralPath $taskZip -Algorithm SHA256).Hash
    if ($taskActual -ine $taskMatch[0].Groups[1].Value) { throw 'Release ZIP SHA-256 mismatch.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $taskZipReader = [IO.Compression.ZipFile]::OpenRead($taskZip)
    $taskExpand = Join-Path $taskStage 'expanded'
    $taskPrefix = [IO.Path]::GetFullPath($taskExpand) + [IO.Path]::DirectorySeparatorChar
    try {
        foreach ($taskEntry in $taskZipReader.Entries) {
            $taskResolved = [IO.Path]::GetFullPath((Join-Path $taskExpand $taskEntry.FullName))
            if (-not $taskResolved.StartsWith($taskPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe ZIP entry path.' }
        }
    } finally { $taskZipReader.Dispose() }
    Expand-Archive -LiteralPath $taskZip -DestinationPath $taskExpand
    $taskBundle = Join-Path $taskExpand 'codegraph-fortran-win32-x64'
    $taskDescriptor = Get-Content -LiteralPath (Join-Path $taskBundle 'fortran-release.json') -Raw | ConvertFrom-Json
    if ($taskDescriptor.version -ne $taskVersion -or $taskDescriptor.repository -ne $taskRepo) { throw 'Unexpected fork release identity.' }
    if ($taskDescriptor.cliName -ne 'codegraph' -or $taskDescriptor.indexDirectory -ne '.codegraph' -or -not (Test-Path -LiteralPath (Join-Path $taskBundle 'bin\codegraph.cmd'))) {
        throw 'This checkout requires the rebuilt standard-codegraph bundle; published isolation bundles are not compatible.'
    }
    & (Join-Path $taskBundle 'node.exe') --liftoff-only --disable-warning=ExperimentalWarning (Join-Path $taskBundle 'validation\verify.cjs') $taskBundle
    if ($LASTEXITCODE -ne 0) { throw 'Fortran CLI/MCP verification failed.' }
    & (Join-Path $taskBundle 'node.exe') (Join-Path $taskBundle 'validation\write-config.cjs') $taskBundle $taskTarget
    if ($LASTEXITCODE -ne 0) { throw 'MCP configuration generation failed.' }
    if ((Test-Path -LiteralPath $taskTarget) -ne $taskReplacing) { throw 'Destination changed during installation.' }
    $taskBackup = Join-Path $taskParent ('.cgfortran-backup-' + [Guid]::NewGuid().ToString('N'))
    $taskLockedNode = $null
    try {
        if ($taskReplacing) {
            # Windows 自升级进程锁定 node.exe：先改名到安装目录之外，再交换整份已验收的包。
            $taskLockedNode = Join-Path $taskParent ('codegraph-old-node-' + [Guid]::NewGuid().ToString('N') + '.exe')
            Move-Item -LiteralPath (Join-Path $taskTarget 'node.exe') -Destination $taskLockedNode
            Move-Item -LiteralPath $taskTarget -Destination $taskBackup
        }
        Move-Item -LiteralPath $taskBundle -Destination $taskTarget
    } catch {
        if ((Test-Path -LiteralPath $taskBackup) -and -not (Test-Path -LiteralPath $taskTarget)) { Move-Item -LiteralPath $taskBackup -Destination $taskTarget }
        if ($taskLockedNode -and (Test-Path -LiteralPath $taskLockedNode) -and -not (Test-Path -LiteralPath (Join-Path $taskTarget 'node.exe'))) { Move-Item -LiteralPath $taskLockedNode -Destination (Join-Path $taskTarget 'node.exe') }
        throw
    }
    # 删除前核实备份确实是本次生成且仍位于同一父目录。
    if (Test-Path -LiteralPath $taskBackup) {
        if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($taskBackup)) -ne [IO.Path]::GetFullPath($taskParent) -or -not (Split-Path -Leaf $taskBackup).StartsWith('.cgfortran-backup-')) { throw 'Unsafe backup path.' }
        Remove-Item -LiteralPath $taskBackup -Recurse -Force
    }
    if ($taskLockedNode) { try { Remove-Item -LiteralPath $taskLockedNode -Force -ErrorAction Stop } catch { Write-Warning "Old runtime is still in use; remove after it exits: $taskLockedNode" } }
    if (-not $NoPath) {
        $taskBin = Join-Path $taskTarget 'bin'
        $taskUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        $taskPathEntries = @($taskUserPath -split ';' | Where-Object { $_ -and $_.TrimEnd('\') -ine $taskBin.TrimEnd('\') })
        [Environment]::SetEnvironmentVariable('Path', (@($taskBin) + $taskPathEntries -join ';'), 'User')
        Write-Output 'The codegraph CLI was added to your user PATH; open a new terminal.'
    }
    # 仅清理自己创建的暂存目录；目标必须仍在已核实的父目录中。
    $taskResolvedStage = [IO.Path]::GetFullPath($taskStage)
    $taskResolvedParent = [IO.Path]::GetFullPath($taskParent).TrimEnd('\') + '\'
    if ($taskResolvedStage.StartsWith($taskResolvedParent, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $taskResolvedStage).StartsWith('.cgfortran-install-')) {
        Remove-Item -LiteralPath $taskResolvedStage -Recurse -Force
    }
    Write-Output "Installed: $taskTarget"
    Write-Output "CLI: $(Join-Path $taskTarget 'bin\codegraph.cmd')"
    Write-Output 'MCP configuration snippets were generated; no client configuration was changed.'
} catch {
    Write-Warning "Installation failed. Diagnostics retained in: $taskStage"
    throw
}
