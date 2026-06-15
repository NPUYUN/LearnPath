# LearnPath — start backend + frontend (Windows)
# Usage:
#   .\scripts\start.ps1                 # start + open browser
#   .\scripts\start.ps1 -NoBrowser
#   .\scripts\start.ps1 -ShowWindows      # visible consoles (debug)
#   .\scripts\start.ps1 -KeepOpen         # pause before exit (start.bat)

param(
    [switch]$NoBrowser,
    [switch]$ShowWindows,
    [switch]$KeepOpen
)

$ErrorActionPreference = "Continue"
. "$PSScriptRoot\lib\common.ps1"

$Root = Get-ProjectRoot
$exitCode = 0
$backendMeta = $null
$frontendMeta = $null

try {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "  LearnPath"
    Write-Host "========================================"
    Write-Host "  Root: $Root"
    Write-Host ""

    Write-Host "[1/5] Stopping old processes..."
    Stop-LearnPathProcesses
    Start-Sleep -Seconds 1

    Write-Host "[2/5] Environment..."
    Ensure-EnvFiles -Root $Root

    $venvPython = Ensure-PythonVenv -Root $Root
    if (-not $venvPython) { exit 1 }

    if (-not (Ensure-NodeModules -Root $Root)) {
        Write-Host "ERROR: npm install failed." -ForegroundColor Red
        exit 1
    }

    $paths = Get-BackendPython -Root $Root
    if (-not (Test-Path $paths.Python)) {
        Write-Host "ERROR: venv not found at $($paths.Python)" -ForegroundColor Red
        exit 1
    }

    $logDir = Ensure-LogDir -Root $Root
    $backendLog = Join-Path $logDir "backend.log"
    $frontendLog = Join-Path $logDir "frontend.log"
    $frontDir = Join-Path $Root "frontend"
    $windowStyle = if ($ShowWindows) { "Normal" } else { "Hidden" }

    $uvicornArgs = @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000")
    $envText = Get-Content (Join-Path $Root ".env") -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if ($envText -match '(?m)^\s*DEV_RELOAD\s*=\s*true\s*$') {
        $uvicornArgs += "--reload"
        Write-Step "DEV_RELOAD=true, hot reload enabled"
    }

    Write-Host "[3/5] Backend http://127.0.0.1:8000 ..."
    $backendMeta = Start-LearnPathBackend -Python $paths.Python -WorkDir $paths.WorkDir `
        -LogFile $backendLog -UvicornArgs $uvicornArgs -WindowStyle $windowStyle

    $backendTimeout = Get-BackendReadyTimeoutSec
    $backendOk = Wait-HttpOk -Url "http://127.0.0.1:8000/api/health" `
        -TimeoutSec $backendTimeout -Label "backend"

    if (-not $backendOk -and $windowStyle -eq "Hidden") {
        Write-Host "      Hidden start failed, retrying with visible console..." -ForegroundColor Yellow
        Stop-PortListeners -Ports @(8000, 8001)
        Start-Sleep -Seconds 1
        $backendMeta = Start-LearnPathBackend -Python $paths.Python -WorkDir $paths.WorkDir `
            -LogFile $backendLog -UvicornArgs $uvicornArgs -WindowStyle "Normal"
        $backendOk = Wait-HttpOk -Url "http://127.0.0.1:8000/api/health" `
            -TimeoutSec 90 -Label "backend"
    }

    if ($backendOk) {
        Write-Host "      Backend ready"
    } else {
        Write-Host "      ERROR: Backend not ready" -ForegroundColor Red
        Show-LogTail -Path $backendMeta.Err
        Show-LogTail -Path $backendMeta.Log
        exit 1
    }

    Write-Host "[4/5] Frontend http://127.0.0.1:3000 ..."
    $frontendMeta = Start-LearnPathFrontend -FrontDir $frontDir -LogFile $frontendLog `
        -WindowStyle $windowStyle

    $frontUrl = Wait-LearnPathFrontend -TimeoutSec 120
    if (-not $frontUrl) {
        Write-Host "      ERROR: Frontend not ready" -ForegroundColor Red
        Show-LogTail -Path $frontendMeta.Err
        Show-LogTail -Path $frontendMeta.Log
        exit 1
    }
    Write-Host "      Frontend ready"

    Write-Host "[5/5] Done"
    Write-Host ""
    Write-Host "  API:      http://127.0.0.1:8000"
    Write-Host "  App:      $frontUrl"
    if ($ShowWindows) {
        Write-Host "  Mode:     visible console windows (debug)"
    } else {
        Write-Host "  Logs:     storage\logs\backend.log, frontend.log"
        Write-Host "  Stop:     .\scripts\stop.ps1  or  stop.bat"
    }
    Write-Host ""

    if (-not $NoBrowser) {
        Write-Host "Opening browser..."
        Start-Process $frontUrl
    }
} catch {
    Write-Host ""
    Write-Host "FATAL: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace
    $exitCode = 1
}

if ($KeepOpen) {
    Write-Host ""
    Write-Host "Press Enter to close this window..."
    Read-Host | Out-Null
}
exit $exitCode
