# LearnPath dev launcher (Windows PowerShell)
# Usage: .\scripts\dev.ps1
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
Set-Location $Root

# -- Step 1: Kill stale processes ------------------------------------------
Write-Host "[1/3] Cleaning up old processes..."

foreach ($port in @(8000, 3000, 3001)) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        $conns | ForEach-Object {
            try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
        }
        Write-Host "      Released port $port"
    }
}
Start-Sleep -Seconds 1

# -- Step 2: Ensure .env exists --------------------------------------------
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "      Created .env (LLM_MOCK=true by default)"
    }
}

# -- Step 3: Start backend -------------------------------------------------
Write-Host "[2/3] Starting backend  http://localhost:8000"
$backendCmd = "Set-Location '$Root\backend'; if (Test-Path .venv) { .venv\Scripts\Activate.ps1 }; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Write-Host "      Waiting for backend..."
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}
if ($ready) { Write-Host "      Backend ready" }
else         { Write-Host "      Backend not ready yet - check its window" }

# -- Step 4: Start frontend ------------------------------------------------
Write-Host "[3/3] Starting frontend http://localhost:3000"
$frontendCmd = "Set-Location '$Root\frontend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host ""
Write-Host "Done. Backend: http://localhost:8000  Frontend: http://localhost:3000"
