<#
.SYNOPSIS
    Launcher used by the ISOBASH Scheduled Task. Starts the supervisor hidden and
    redirects its output to log files outside the repository.

.DESCRIPTION
    Scheduled tasks cannot redirect stdout/stderr on their own, and a console
    window flashing on every logon is unacceptable. This wrapper:
      * resolves node.exe
      * creates the log directory under ISOBASH-DATA\logs\service
      * runs `node scripts/service.mjs start` with output appended to
        autostart.out.log / autostart.err.log
      * keeps running in the foreground so the task stays in "Running" state and
        Windows can supervise it (restart on failure is configured on the task)
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

$serviceScript = Join-Path $RepoRoot 'scripts\service.mjs'
if (-not (Test-Path $serviceScript)) {
    $logDir = Join-Path $RepoRoot '..\ISOBASH-DATA\logs\service'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    Add-Content -Path (Join-Path $logDir 'autostart.err.log') -Value "ISOBASH autostart failed: missing $serviceScript"
    exit 1
}

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = (Get-Command node -ErrorAction SilentlyContinue).Source }
if (-not $node) {
    $logDir = Join-Path $RepoRoot '..\ISOBASH-DATA\logs\service'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    Add-Content -Path (Join-Path $logDir 'autostart.err.log') -Value 'ISOBASH autostart failed: node.exe not found on PATH'
    exit 1
}

$logDir = Join-Path $RepoRoot '..\ISOBASH-DATA\logs\service'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stdoutLog = Join-Path $logDir 'autostart.out.log'
$stderrLog = Join-Path $logDir 'autostart.err.log'

Add-Content -Path $stdoutLog -Value "=== autostart $(Get-Date -Format o) (node $node) ==="

& $node $serviceScript start 1>> $stdoutLog 2>> $stderrLog
exit $LASTEXITCODE
