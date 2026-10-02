<#
.SYNOPSIS
    Registers ISOBASH Windows auto-start so the platform is always reachable.

.DESCRIPTION
    Two complementary triggers are installed:

      1. Scheduled Task "ISOBASH-Service" (AtStartup +45s, AtLogOn +20s).
         Runs as LOCAL SYSTEM with highest privileges, so the API, worker, web and
         Redis are up during boot with nobody logged in. Registering a task in the
         root Task Scheduler folder requires an elevated session; when this script
         is not elevated it re-launches itself with -Verb RunAs so Windows shows a
         single UAC consent prompt. If elevation is declined the task is skipped and
         the Startup-folder trigger below is used instead.

      2. Per-user Startup folder launcher (no elevation required).
         Runs at every logon. Redundant with the scheduled task on purpose: the
         supervisor takes a single-instance lock, so the second launcher exits
         immediately instead of fighting over ports.

    Both triggers run scripts\win\run-service.ps1, which starts
    `node scripts/service.mjs start` hidden with output redirected to
    ISOBASH-DATA\logs\service.

.PARAMETER TaskName
    Scheduled task name. Defaults to ISOBASH-Service.

.PARAMETER Mode
    System (default) runs the scheduled task as LOCAL SYSTEM so services exist
    before login. User runs it inside the interactive user session instead.

.PARAMETER InstallMode
    Both (default) = scheduled task + Startup launcher.
    Task = scheduled task only. Startup = Startup launcher only.

.PARAMETER StartNow
    Start the scheduled task immediately after registering it.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/win/install-autostart.ps1

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/win/install-autostart.ps1 -InstallMode Startup
#>
[CmdletBinding()]
param(
    [string]$TaskName = 'ISOBASH-Service',
    [ValidateSet('System', 'User')]
    [string]$Mode = 'System',
    [ValidateSet('Both', 'Task', 'Startup')]
    [string]$InstallMode = 'Both',
    [switch]$StartNow,
    [switch]$Elevated
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$serviceScript = Join-Path $repoRoot 'scripts\service.mjs'
$runnerScript = Join-Path $repoRoot 'scripts\win\run-service.ps1'
$logDir = Join-Path $repoRoot '..\ISOBASH-DATA\logs\service'
$startupDir = [Environment]::GetFolderPath('Startup')

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Install-StartupLauncher {
    if (-not (Test-Path $startupDir)) {
        Write-Warning "Startup folder not found: $startupDir"
        return $false
    }
    $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $node) { $node = (Get-Command node -ErrorAction SilentlyContinue).Source }
    if (-not $node) { throw 'node.exe was not found on PATH. Install Node.js 20+ and re-run.' }

    $vbsPath = Join-Path $startupDir 'ISOBASH-Service.vbs'
    $vbs = @"
' ISOBASH auto-start (per-user, runs at logon).
' Launches the ISOBASH service supervisor with no visible window.
' Managed by scripts\win\install-autostart.ps1 - do not edit by hand.
Set shell = CreateObject("WScript.Shell")
shell.Run """$node"" ""$serviceScript"" start", 0, False
"@
    Set-Content -Path $vbsPath -Value $vbs -Encoding ASCII
    Write-Host "  startup launcher : $vbsPath"
    return $true
}

if (-not (Test-Path $serviceScript)) { throw "Missing $serviceScript" }
if (-not (Test-Path $runnerScript)) { throw "Missing $runnerScript" }
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$isAdmin = Test-Administrator
Write-Host 'ISOBASH autostart installer'
Write-Host "  repo        : $repoRoot"
Write-Host "  task        : $TaskName"
Write-Host "  install mode: $InstallMode"
Write-Host "  identity    : $Mode"
Write-Host "  elevated    : $isAdmin"

$taskInstalled = $false

if ($InstallMode -in @('Both', 'Task')) {
    if (-not $isAdmin -and -not $Elevated) {
        Write-Host '  elevation required for the Scheduled Task; requesting consent (UAC)...'
        $arguments = @(
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-File', ('"{0}"' -f $MyInvocation.MyCommand.Path),
            '-TaskName', $TaskName, '-Mode', $Mode, '-InstallMode', $InstallMode, '-Elevated'
        )
        try {
            $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -Wait -PassThru
            if ($process.ExitCode -eq 0) {
                $taskInstalled = $true
                Write-Host '  scheduled task registered (elevated).'
            }
            else {
                Write-Warning "Elevated installer exited with code $($process.ExitCode)."
            }
        }
        catch {
            Write-Warning "Elevation was declined or unavailable: $($_.Exception.Message)"
        }
    }
    else {
        try {
            $argumentLine = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $runnerScript
            $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argumentLine -WorkingDirectory $repoRoot

            $atStartup = New-ScheduledTaskTrigger -AtStartup
            $atStartup.Delay = 'PT45S'
            $atLogon = New-ScheduledTaskTrigger -AtLogOn
            $atLogon.Delay = 'PT20S'

            $principal = if ($Mode -eq 'System') {
                New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
            }
            else {
                $userId = "$env:USERDOMAIN\$env:USERNAME"
                New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
            }

            $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
                -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

            if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
                Write-Host "  replacing existing task '$TaskName'"
                Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
                Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
            }

            Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($atStartup, $atLogon) `
                -Principal $principal -Settings $settings `
                -Description 'ISOBASH supervisor: API (3001), web (3002), BullMQ worker, plus PostgreSQL/Redis/Ollama readiness.' | Out-Null

            $taskInstalled = $true
            Write-Host "  scheduled task : $TaskName (AtStartup+45s, AtLogOn+20s, identity=$Mode)"
        }
        catch {
            Write-Warning "Scheduled Task registration failed: $($_.Exception.Message)"
            Write-Warning 'Falling back to the Startup-folder launcher only (starts at logon).'
        }
    }
}

if ($InstallMode -in @('Both', 'Startup')) {
    Install-StartupLauncher | Out-Null
}

if (-not $taskInstalled -and $InstallMode -eq 'Task') {
    Write-Error 'The scheduled task could not be registered. Re-run from an elevated PowerShell, or use -InstallMode Startup.'
    exit 1
}

if ($StartNow -and $taskInstalled) {
    Write-Host '  starting the scheduled task now...'
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 15
    $statusFile = Join-Path $repoRoot '..\ISOBASH-DATA\run\service-status.json'
    if (Test-Path $statusFile) { Get-Content $statusFile }
}

Write-Host ''
Write-Host 'ISOBASH autostart installed.'
Write-Host '  status : npm run service:status'
Write-Host '  logs   : npm run service:logs'
Write-Host '  stop   : npm run service:stop'
Write-Host '  remove : npm run service:uninstall'
