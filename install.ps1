<#
功能：安装固定的 Windows x64 CodeGraph Fortran 发行包。
输入：可选独立目标、离线 ZIP 与 SHA256SUMS；输出：独立安装及 MCP 片段。
依赖：PowerShell/.NET；运行使用随包 Node。不会修改 PATH、全局 CodeGraph 或客户端。
#>
[CmdletBinding()]
param(
    [string]$Destination,
    [string]$Archive,
    [string]$ChecksumFile
)
$ErrorActionPreference = 'Stop'
$taskVersion = '1.6.1-fortran.1'
$taskRepo = 'shiysent-ctrl/codegraph-fortran'
$taskAssetName = 'codegraph-fortran-win32-x64.zip'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or [Environment]::Is64BitOperatingSystem -ne $true) {
    throw 'This release supports Windows x64 only.'
}
$taskCpu = [Environment]::GetEnvironmentVariable('PROCESSOR_ARCHITEW6432')
if (-not $taskCpu) { $taskCpu = [Environment]::GetEnvironmentVariable('PROCESSOR_ARCHITECTURE') }
if ($taskCpu -ne 'AMD64') { throw 'This release supports Windows x64 only.' }
if (-not $Destination) { $Destination = Join-Path $env:LOCALAPPDATA "CodeGraphFortran\$taskVersion" }
$taskTarget = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $taskTarget) { throw "Destination exists; choose a new directory: $taskTarget" }
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
    & (Join-Path $taskBundle 'node.exe') --liftoff-only --disable-warning=ExperimentalWarning (Join-Path $taskBundle 'validation\verify.cjs') $taskBundle
    if ($LASTEXITCODE -ne 0) { throw 'Fortran CLI/MCP verification failed.' }
    & (Join-Path $taskBundle 'node.exe') (Join-Path $taskBundle 'validation\write-config.cjs') $taskBundle $taskTarget
    if ($LASTEXITCODE -ne 0) { throw 'MCP configuration generation failed.' }
    if (Test-Path -LiteralPath $taskTarget) { throw 'Destination appeared during installation; refusing to overwrite.' }
    Move-Item -LiteralPath $taskBundle -Destination $taskTarget
    # 仅清理自己创建的暂存目录；目标必须仍在已核实的父目录中。
    $taskResolvedStage = [IO.Path]::GetFullPath($taskStage)
    $taskResolvedParent = [IO.Path]::GetFullPath($taskParent).TrimEnd('\') + '\'
    if ($taskResolvedStage.StartsWith($taskResolvedParent, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $taskResolvedStage).StartsWith('.cgfortran-install-')) {
        Remove-Item -LiteralPath $taskResolvedStage -Recurse -Force
    }
    Write-Output "Installed: $taskTarget"
    Write-Output "CLI: $(Join-Path $taskTarget 'bin\codegraph-fortran.cmd')"
    Write-Output 'MCP configuration snippets were generated; no client configuration was changed.'
} catch {
    Write-Warning "Installation failed. Diagnostics retained in: $taskStage"
    throw
}
