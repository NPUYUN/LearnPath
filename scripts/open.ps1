# LearnPath launcher: clean + start backend & frontend + open browser
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent

# -- Start services --------------------------------------------------------
& "$Root\scripts\dev.ps1"

# -- Wait for frontend (up to 30 s) ----------------------------------------
Write-Host ""
Write-Host "Waiting for frontend..."
$frontUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    foreach ($port in @(3000, 3001)) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:$port" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { $frontUrl = "http://localhost:$port/chat"; break }
        } catch {}
    }
    if ($frontUrl) { break }
}

# -- Open browser ----------------------------------------------------------
if ($frontUrl) {
    Write-Host "Opening: $frontUrl"
    Start-Process $frontUrl
} else {
    Write-Host "Frontend not ready, opening http://localhost:3000/chat"
    Start-Process "http://localhost:3000/chat"
}
