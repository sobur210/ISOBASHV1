<#
.SYNOPSIS
    Removes ISOBASH auto-start: the scheduled task, the Startup-folder launcher,
    and the running supervisor.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/win/uninstall-autostart.ps1
#>
[CmdletBinding()]
param(
    [string]$TaskName = 'ISOBASH-Service',
    [switch]$Elevated
)

$ErrorActionPreference = 'Stop'

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator) -and -not $Elevated) {
    $arguments = @(
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', ('"{0}"' -f $MyInvocation.MyCommand.Path),
        '-TaskName', $TaskName, '-Elevated'
    )
    try {
        $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -Wait -PassThru
        if ($process.ExitCode -ne 0) { exit $process.ExitCode }
    }
    catch {
        Write-Warning "Elevation declined; removing what can be removed without it. $($_.Exception.Message)"
    }
}

if ((Test-Administrator) -or $Elevated) {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed scheduled task '$TaskName'."
    }
    else {
        Write-Host "Scheduled task '$TaskName' is not installed."
    }
}
else {
    Write-Warning "Not elevated: cannot remove the scheduled task '$TaskName'. Re-run from an elevated PowerShell to remove it."
}

$startupDir = [Environment]::GetFolderPath('Startup')
$vbsPath = Join-Path $startupDir 'ISOBASH-Service.vbs'
if (Test-Path $vbsPath) {
    Remove-Item $vbsPath -Force
    Write-Host "Removed startup launcher $vbsPath."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if ($node) {
    & $node (Join-Path $repoRoot 'scripts\service.mjs') stop
}
