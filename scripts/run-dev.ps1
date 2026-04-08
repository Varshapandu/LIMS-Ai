$port = if ($env:PORT) { [int]$env:PORT } else { 3000 }

try {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop |
    Select-Object -ExpandProperty OwningProcess -Unique
} catch {
  $listeners = @()
}

foreach ($pidValue in $listeners) {
  $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
  if (-not $process) {
    continue
  }

  if ($process.ProcessName -notmatch '^(node|bun|deno)$') {
    Write-Error "Port $port is being used by $($process.ProcessName) (PID $pidValue). Refusing to stop a non-dev process automatically."
    exit 1
  }

  Write-Host "Port $port is occupied by $($process.ProcessName) (PID $pidValue). Stopping it..."
  Stop-Process -Id $pidValue -Force
}

# Next.js dev artifacts can get corrupted on Windows and leave missing chunk/module
# references behind. Clear the generated server/static outputs along with webpack cache
# so a fresh `next dev` can rebuild them deterministically.
$nextRoot = Join-Path $PSScriptRoot "..\.next"
$pathsToClear = @(
  (Join-Path $nextRoot "cache\webpack"),
  (Join-Path $nextRoot "server"),
  (Join-Path $nextRoot "static")
)

foreach ($path in $pathsToClear) {
  if (Test-Path $path) {
    Write-Host "Clearing stale Next.js artifact: $path"
    Remove-Item $path -Recurse -Force
  }
}

function Sync-NextServerChunks {
  $serverRoot = Join-Path $nextRoot "server"
  $chunksRoot = Join-Path $serverRoot "chunks"

  if (-not (Test-Path $chunksRoot)) {
    return
  }

  Get-ChildItem -Path $chunksRoot -Filter "*.js" -File -ErrorAction SilentlyContinue | ForEach-Object {
    $target = Join-Path $serverRoot $_.Name
    if (-not (Test-Path $target)) {
      try {
        Copy-Item -LiteralPath $_.FullName -Destination $target -Force
      } catch {
        Write-Warning "Unable to mirror chunk $($_.Name) into $serverRoot"
      }
    }
  }
}

$nextCmd = Join-Path $PSScriptRoot "..\node_modules\.bin\next.cmd"
$devProcess = Start-Process -FilePath $nextCmd -ArgumentList @("dev", "-p", "$port") -NoNewWindow -PassThru

try {
  while (-not $devProcess.HasExited) {
    Sync-NextServerChunks
    Start-Sleep -Milliseconds 400
  }
} finally {
  Sync-NextServerChunks
}

exit $devProcess.ExitCode
