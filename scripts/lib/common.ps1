# LearnPath — shared helpers for Windows scripts (PowerShell 5.1+)

function Get-ProjectRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Write-Step([string]$Message) {
    Write-Host "  $Message"
}

function Ensure-LogDir([string]$Root) {
    $dir = Join-Path $Root "storage\logs"
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    return $dir
}

function Find-PythonCommand {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        return @{ Exe = "py"; Args = @("-3") }
    }
    foreach ($name in @("python", "python3")) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { return @{ Exe = $cmd.Source; Args = @() } }
    }
    return $null
}

function Ensure-PythonVenv([string]$Root) {
    $backend = Join-Path $Root "backend"
    $python = Join-Path $backend ".venv\Scripts\python.exe"
    if (Test-Path $python) { return $python }

    $launcher = Find-PythonCommand
    if (-not $launcher) {
        Write-Host "ERROR: Python 3 not found. Install from https://www.python.org/" -ForegroundColor Red
        return $null
    }

    Write-Host "[setup] Creating backend/.venv (first run, may take a few minutes)..."
    Push-Location $backend
    try {
        if ($launcher.Exe -eq "py") {
            & py -3 -m venv .venv
        } else {
            & $launcher.Exe -m venv .venv
        }
        if (-not (Test-Path $python)) {
            Write-Host "ERROR: Failed to create venv." -ForegroundColor Red
            return $null
        }
        & $python -m pip install --upgrade pip -q
        & $python -m pip install -r requirements.txt
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: pip install failed." -ForegroundColor Red
            return $null
        }
        Write-Step "Python venv ready"
        return $python
    } finally {
        Pop-Location
    }
}

function Ensure-NodeModules([string]$Root) {
    $front = Join-Path $Root "frontend"
    if (Test-Path (Join-Path $front "node_modules")) { return $true }
    Write-Host "[setup] npm install (first run)..."
    Push-Location $front
    try {
        & npm install --no-fund --no-audit
        return ($LASTEXITCODE -eq 0)
    } finally {
        Pop-Location
    }
}

function Ensure-EnvFiles([string]$Root) {
    $envPath = Join-Path $Root ".env"
    if (-not (Test-Path $envPath)) {
        Copy-Item (Join-Path $Root ".env.example") $envPath
        Write-Step "Created .env from .env.example"
    }
    $cors = "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001"
    $lines = @(Get-Content $envPath -Encoding UTF8 -ErrorAction SilentlyContinue)
    $found = $false
    $out = foreach ($line in $lines) {
        if ($line -match '^\s*CORS_ORIGINS\s*=') { $found = $true; "CORS_ORIGINS=$cors" }
        else { $line }
    }
    if (-not $found) { $out += "CORS_ORIGINS=$cors" }
    Set-Content -Path $envPath -Value $out -Encoding UTF8

    @(
        "# Managed by scripts/start.ps1"
        "NEXT_PUBLIC_API_BASE="
        "API_PROXY_TARGET=http://127.0.0.1:8000"
    ) | Set-Content -Path (Join-Path $Root "frontend\.env.local") -Encoding UTF8
}

function Get-BackendPython([string]$Root) {
    $junction = "C:\LP"
    $ji = Get-Item $junction -ErrorAction SilentlyContinue
    $useJunction = ($ji -and $ji.LinkType -eq "Junction") -and
        (Test-Path "$junction\backend\.venv\Scripts\python.exe")
    if (-not $useJunction) {
        try {
            if (Test-Path $junction) { cmd /c "rmdir `"$junction`"" 2>$null }
            New-Item -ItemType Junction -Path $junction -Target $Root -ErrorAction Stop | Out-Null
            Write-Step "Junction $junction -> $Root (ASCII path for Python)"
        } catch {
            return @{
                Python = Join-Path $Root "backend\.venv\Scripts\python.exe"
                WorkDir = Join-Path $Root "backend"
            }
        }
    }
    return @{
        Python = "$junction\backend\.venv\Scripts\python.exe"
        WorkDir = "$junction\backend"
    }
}

function Stop-PortListeners([int[]]$Ports) {
    foreach ($port in $Ports) {
        try {
            $pids = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                ForEach-Object { $_.OwningProcess } | Sort-Object -Unique)
            foreach ($pid in $pids) {
                if ($pid) {
                    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                    Write-Step "Released port $port (PID $pid)"
                }
            }
        } catch {}
    }
}

function Stop-LearnPathProcesses {
    Stop-PortListeners -Ports @(8000, 3000, 3001, 3002)
    try {
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                ($_.Name -eq "python.exe" -and $_.CommandLine -match "uvicorn|app\.main") -or
                ($_.Name -eq "node.exe" -and $_.CommandLine -match "next")
            } |
            ForEach-Object {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }
    } catch {}
}

function Wait-HttpOk {
    param(
        [string]$Url,
        [int]$TimeoutSec = 120,
        [string]$Label = "service"
    )
    for ($i = 1; $i -le $TimeoutSec; $i++) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { return $true }
        } catch {}
        if ($i % 10 -eq 0) { Write-Step "Waiting for $Label ... ${i}s" }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Rotate-LogFile([string]$Path) {
    if (-not (Test-Path $Path)) { return }
    try {
        $s = [System.IO.File]::Open($Path, "Open", "ReadWrite", "None")
        $s.Close()
        [System.IO.File]::WriteAllText($Path, "")
        return
    } catch {}
    $bak = "$Path.bak"
    if (Test-Path $bak) { Remove-Item $bak -Force -ErrorAction SilentlyContinue }
    Move-Item -LiteralPath $Path -Destination $bak -Force -ErrorAction SilentlyContinue
}

function Start-LoggedBackgroundProcess {
    param(
        [string]$Label,
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory,
        [string]$LogFile
    )
    $errFile = "$LogFile.err"
    Rotate-LogFile -Path $LogFile
    Rotate-LogFile -Path $errFile
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "==== $ts $Label ====" | Out-File -FilePath $errFile -Encoding utf8
    Start-Process -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput $LogFile `
        -RedirectStandardError $errFile | Out-Null
}

function Get-NextDevCommand([string]$FrontDir) {
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { return $null }
    foreach ($rel in @(
        "node_modules\next\dist\bin\next",
        "node_modules\next\dist\bin\next.js"
    )) {
        $next = Join-Path $FrontDir $rel
        if (Test-Path $next) {
            return @{ Node = $node; Next = $next; Dir = $FrontDir }
        }
    }
    return $null
}

function Get-BackendReadyTimeoutSec {
    $chromaModel = Join-Path $env:USERPROFILE ".cache\chroma\onnx_models\all-MiniLM-L6-v2"
    if (Test-Path $chromaModel) { return 120 }
    Write-Step "First run: Chroma may download ~80MB model; backend can take 2-6 min"
    return 360
}
