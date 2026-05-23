# LearnPath one-click launcher (Windows PowerShell 5.1+)
# Usage: .\scripts\start.ps1  |  .\scripts\start.ps1 -NoBrowser
param(
    [switch]$NoBrowser
)

# 不用 Stop：避免 Get-NetTCPConnection 等 cmdlet 缺失时整脚本闪退
$ErrorActionPreference = "Continue"

$Root = $PSScriptRoot | Split-Path -Parent
if (-not (Test-Path $Root)) {
    Write-Host "ERROR: cannot resolve project root." -ForegroundColor Red
    exit 1
}

function Write-Step([string]$msg) { Write-Host "  $msg" }

function Wait-HttpOk {
    param(
        [string]$Url,
        [int]$TimeoutSec = 90,
        [string]$Label = "service"
    )
    for ($i = 1; $i -le $TimeoutSec; $i++) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { return $true }
        } catch {}
        if ($i % 5 -eq 0) { Write-Step "waiting for $Label ... ${i}s" }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Ensure-EnvFile {
    try {
        $envPath = Join-Path $Root ".env"
        if (-not (Test-Path $envPath)) {
            Copy-Item (Join-Path $Root ".env.example") $envPath -ErrorAction Stop
            Write-Step "created .env from .env.example"
        }
        $cors = "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001"
        $lines = @(Get-Content $envPath -Encoding UTF8 -ErrorAction Stop)
        $found = $false
        $newLines = foreach ($line in $lines) {
            if ($line -match '^\s*CORS_ORIGINS\s*=') {
                $found = $true
                "CORS_ORIGINS=$cors"
            } else { $line }
        }
        if (-not $found) { $newLines += "CORS_ORIGINS=$cors" }
        Set-Content -Path $envPath -Value $newLines -Encoding UTF8
    } catch {
        Write-Step "env setup skipped: $($_.Exception.Message)"
    }
}

function Ensure-FrontendEnv {
    try {
        $localPath = Join-Path $Root "frontend\.env.local"
        @(
            "# managed by scripts/start.ps1"
            "NEXT_PUBLIC_API_BASE="
        ) | Set-Content -Path $localPath -Encoding UTF8
    } catch {
        Write-Step "frontend .env.local skipped: $($_.Exception.Message)"
    }
}

function Stop-PortListeners {
    param([int[]]$Ports)
    try {
        foreach ($port in $Ports) {
            $conns = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
            $pids = $conns | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique
            foreach ($procId in $pids) {
                if ($procId -and $procId -ne 0) {
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                    Write-Step "released port $port (PID $procId)"
                }
            }
        }
    } catch {
        Write-Step "port cleanup skipped (non-fatal)"
    }
}

function Stop-UvicornProcesses {
    try {
        Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -match "uvicorn" } |
            ForEach-Object {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }
    } catch {
        Write-Step "uvicorn cleanup skipped (non-fatal)"
    }
}

function Get-LaunchPaths {
    $junction = "C:\LP"
    $ji = $null
    try { $ji = Get-Item $junction -ErrorAction SilentlyContinue } catch {}
    $ok = ($ji -ne $null) -and ($ji.LinkType -eq "Junction") -and
        (Test-Path "$junction\backend\.venv\Scripts\python.exe")
    if (-not $ok) {
        try {
            if (Test-Path $junction) { cmd /c "rmdir `"$junction`"" 2>$null }
            New-Item -ItemType Junction -Path $junction -Target $Root -ErrorAction Stop | Out-Null
            Write-Step "junction $junction -> $Root"
        } catch {
            Write-Step "junction skipped; using project path"
            $junction = $Root
        }
    }
    return @{
        Python = "$junction\backend\.venv\Scripts\python.exe"
        BackendDir = "$junction\backend"
    }
}

try {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "  LearnPath"
    Write-Host "========================================"
    Write-Host "  Root: $Root"
    Write-Host ""

    Write-Host "[1/5] cleanup..."
    Stop-PortListeners -Ports @(8000, 3000, 3001, 3002)
    Stop-UvicornProcesses
    Start-Sleep -Seconds 1

    Write-Host "[2/5] env..."
    Ensure-EnvFile
    Ensure-FrontendEnv

    $paths = Get-LaunchPaths
    if (-not (Test-Path $paths.Python)) {
        Write-Host ""
        Write-Host "ERROR: Python venv not found at:" -ForegroundColor Red
        Write-Host "  $($paths.Python)"
        Write-Host ""
        Write-Host "Please run in PowerShell:"
        Write-Host "  cd `"$Root\backend`""
        Write-Host "  python -m venv .venv"
        Write-Host "  .\.venv\Scripts\pip install -r requirements.txt"
        exit 1
    }

    if (-not (Test-Path (Join-Path $Root "frontend\node_modules"))) {
        Write-Host "[*] npm install (first run, may take a few minutes)..."
        Push-Location (Join-Path $Root "frontend")
        & npm install --no-fund --no-audit
        if ($LASTEXITCODE -ne 0) {
            Pop-Location
            Write-Host "ERROR: npm install failed." -ForegroundColor Red
            exit 1
        }
        Pop-Location
    }

    Write-Host "[3/5] backend http://127.0.0.1:8000 ..."
    $py = $paths.Python
    $reloadFlag = ""
    try {
        $envPath = Join-Path $Root ".env"
        if (Test-Path $envPath) {
            $envText = Get-Content $envPath -Raw -Encoding UTF8
            if ($envText -match '(?m)^\s*DEV_RELOAD\s*=\s*true\s*$') {
                $reloadFlag = " --reload"
                Write-Step "DEV_RELOAD=true, uvicorn hot reload enabled"
            }
        }
    } catch {}
    $backendArgs = '/k title LearnPath Backend & "' + $py + '" -m uvicorn app.main:app --host 127.0.0.1 --port 8000' + $reloadFlag
    Start-Process -FilePath "cmd.exe" -ArgumentList $backendArgs -WorkingDirectory $paths.BackendDir -WindowStyle Normal

    $backendOk = Wait-HttpOk -Url "http://127.0.0.1:8000/api/health" -TimeoutSec 90 -Label "backend"
    if (-not $backendOk) {
        Write-Host ""
        Write-Host "WARN: backend not ready in 90s. Check the LearnPath Backend window." -ForegroundColor Yellow
    } else {
        Write-Host "      backend ready"
    }

    Write-Host "[4/5] frontend http://localhost:3000 ..."
    $frontDir = Join-Path $Root "frontend"
    $frontendArgs = '/k title LearnPath Frontend & cd /d "' + $frontDir + '" & set PORT=3000&& npm run dev'
    Start-Process -FilePath "cmd.exe" -ArgumentList $frontendArgs -WindowStyle Normal

    $frontUrl = $null
    for ($i = 1; $i -le 60; $i++) {
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
        if ($i % 10 -eq 0) { Write-Step "waiting for frontend ... ${i}s" }
        Start-Sleep -Seconds 1
    }

    Write-Host "[5/5] done"
    Write-Host ""
    Write-Host "  API:      http://127.0.0.1:8000"
    if (-not $frontUrl) { $frontUrl = "http://localhost:3000/chat" }
    Write-Host "  Frontend: $frontUrl"
    Write-Host ""

    if (-not $NoBrowser) {
        Write-Host "Opening browser: $frontUrl"
        Start-Process $frontUrl
    }

    # 后端慢启动不算致命错误，避免 bat 误判失败
    exit 0
}
catch {
    Write-Host ""
    Write-Host "FATAL: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace
    exit 1
}
