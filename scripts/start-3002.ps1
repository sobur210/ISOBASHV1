param(
  [string]$Repo = 'C:\laragon\www\Isobash'
)
# Detached launcher for the public localhost:3002 entry point.
#
# `Start-Process` is used instead of a backgrounded shell job because a job
# started from an interactive shell is torn down with it: the gateway API and
# the Next.js dev server both died the moment the shell that launched them
# exited. These two have to outlive the shell that starts them.
$logRoot = 'C:\laragon\www\ISOBASH-DATA\logs\gateway'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

Start-Process -FilePath 'node' `
  -ArgumentList 'scripts/dev-gateway-api.mjs' `
  -WorkingDirectory $Repo `
  -RedirectStandardOutput "$logRoot\api.log" `
  -RedirectStandardError "$logRoot\api.err.log" `
  -WindowStyle Hidden | Out-Null

Start-Process -FilePath 'node' `
  -ArgumentList 'node_modules/next/dist/bin/next', 'dev', '--port', '3002' `
  -WorkingDirectory "$Repo\apps\frontend" `
  -RedirectStandardOutput "$logRoot\web.log" `
  -RedirectStandardError "$logRoot\web.err.log" `
  -WindowStyle Hidden | Out-Null

Write-Output 'started gateway api (3006) and web (3002)'