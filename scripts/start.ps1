# LearnPath — start backend + frontend (Windows)
# Usage:
#   .\scripts\start.ps1
#   .\scripts\start.ps1 -NoBrowser
#   .\scripts\start.ps1 -ShowWindows

param(
    [switch]$NoBrowser,
    [switch]$ShowWindows,
    [switch]$KeepOpen
)

$ErrorActionPreference = "Continue"
. "$PSScriptRoot\lib\common.ps1"

$Root = Get-ProjectRoot

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

    Write-Host "[3/5] Backend http://127.0.0.1:8000 ..."
    $uvicornArgs = @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000")
    $envText = Get-Content (Join-Path $Root ".env") -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if ($ShowWindows -and $envText -match '(?m)^\s*DEV_RELOAD\s*=\s*true\s*$') {
        $uvicornArgs += "--reload"
        Write-Step "DEV_RELOAD=true, hot reload enabled"
    }

    if ($ShowWindows) {
        Start-Process -FilePath $paths.Python -ArgumentList $uvicornArgs `
            -WorkingDirectory $paths.WorkDir -WindowStyle Normal | Out-Null
    } else {
        Start-LoggedBackgroundProcess -Label "backend" -FilePath $paths.Python `
            -ArgumentList $uvicornArgs -WorkingDirectory $paths.WorkDir -LogFile $backendLog
    }

    $backendTimeout = Get-BackendReadyTimeoutSec
    $backendOk = Wait-HttpOk -Url "http://127.0.0.1:8000/api/health" `
        -TimeoutSec $backendTimeout -Label "backend"
    if ($backendOk) {
        Write-Host "      Backend ready"
    } else {
        Write-Host "      WARN: Backend not ready in ${backendTimeout}s" -ForegroundColor Yellow
        if ($ShowWindows) {
            Write-Host "      Check the backend console window." -ForegroundColor Yellow
        } else {
            Write-Host "      Check storage\logs\backend.log.err" -ForegroundColor Yellow
        }
    }

    Write-Host "[4/5] Frontend http://localhost:3000 ..."
    $frontDir = Join-Path $Root "frontend"
    if ($ShowWindows) {
        $cmd = "title LearnPath Frontend & cd /d `"$frontDir`" & set PORT=3000&& npm run dev"
        Start-Process cmd.exe -ArgumentList @("/c", $cmd) -WorkingDirectory $frontDir -WindowStyle Normal | Out-Null
    } else {
        $next = Get-NextDevCommand -FrontDir $frontDir
        if ($next) {
            Start-LoggedBackgroundProcess -Label "frontend" -FilePath $next.Node `
                -ArgumentList @($next.Next, "dev", "-p", "3000") `
                -WorkingDirectory $next.Dir -LogFile $frontendLog
        } else {
            $cmd = "cd /d `"$frontDir`" && set PORT=3000&& npm run dev >> `"$frontendLog`" 2>&1"
            Start-Process cmd.exe -ArgumentList @("/c", $cmd) -WorkingDirectory $frontDir `
                -WindowStyle Hidden | Out-Null
        }
    }

    $frontUrl = $null
    for ($i = 1; $i -le 90; $i++) {
        foreach ($port in @(3000, 3001)) {
            try {
                $r = Invoke-WebRequest -Uri "http://localhost:$port" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
                if ($r.StatusCode -eq 200) {
                    $frontUrl = "http://localhost:$port/chat"
                    break
                }
            } catch {}
        }
        if ($frontUrl) { break }
        if ($i % 15 -eq 0) { Write-Step "Waiting for frontend ... ${i}s" }
        Start-Sleep -Seconds 1
    }
    if (-not $frontUrl) { $frontUrl = "http://localhost:3000/chat" }

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

    $exitCode = 0
} catch {
    Write-Host ""
    Write-Host "FATAL: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace
    $exitCode = 1
}

if ($KeepOpen) {
    Write-Host ""
    Write-Host "Press Enter to return to start.bat..."
    Read-Host | Out-Null
}
exit $exitCode
