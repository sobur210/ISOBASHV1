# Restart the ISOBASH local stack when the supervisor runs as SYSTEM.
#
# The Scheduled Task "ISOBASH-Service" owns the API/web/worker processes, so a
# normal (non-elevated) stop silently fails on Windows. This helper asks for
# elevation once (UAC), stops the supervisor, and hands control back to the
# scheduled task, which rebuilds stale artifacts and restarts everything.
#
# Usage: npm run service:restart:elevated

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$log = Join-Path $env:TEMP 'isobash-elevated-restart.log'

Start-Process -FilePath 'cmd.exe' -Verb RunAs -Wait -ArgumentList @(
    '/c',
    "cd /d `"$repo`" && node scripts\service.mjs stop > `"$log`" 2>&1 && " +
    "cscript //nologo `"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\ISOBASH-Service.vbs`" >> `"$log`" 2>&1"
)

if (Test-Path $log) {
    Get-Content $log
} else {
    Write-Host 'No restart log was produced. Run the command manually from an elevated shell.'
}
Write-Host 'Restart requested. Give the stack ~20 seconds, then run: npm run service:status'
