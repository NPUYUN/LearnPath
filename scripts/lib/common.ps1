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
    $codexPython = Join-Path $backend ".venv-codex\Scripts\python.exe"
    if (Test-Path $codexPython) { return $codexPython }

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
        "NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000"
        "API_PROXY_TARGET=http://127.0.0.1:8000"
    ) | Set-Content -Path (Join-Path $Root "frontend\.env.local") -Encoding UTF8
}

function Get-BackendPython([string]$Root) {
    $junction = "C:\LP"
    $rootResolved = (Resolve-Path $Root).Path
    $ji = Get-Item $junction -Force -ErrorAction SilentlyContinue
    $junctionOk = $false
    if ($ji -and $ji.LinkType -eq "Junction") {
        $target = ($ji.Target | Select-Object -First 1)
        if ($target) {
            try {
                $junctionOk = ((Resolve-Path $target).Path -eq $rootResolved)
            } catch {
                $junctionOk = $false
            }
        }
    }
    if (-not $junctionOk) {
        try {
            if (Test-Path $junction) { cmd /c "rmdir `"$junction`"" 2>$null }
            New-Item -ItemType Junction -Path $junction -Target $rootResolved -ErrorAction Stop | Out-Null
            Write-Step "Junction $junction -> $rootResolved (ASCII path for Python)"
        } catch {
            return @{
                Python = Join-Path $Root "backend\.venv\Scripts\python.exe"
                WorkDir = Join-Path $Root "backend"
            }
        }
    }
    $junctionCodexPython = "$junction\backend\.venv-codex\Scripts\python.exe"
    if (Test-Path $junctionCodexPython) {
        return @{
            Python = $junctionCodexPython
            WorkDir = "$junction\backend"
        }
    }
    return @{
        Python = "$junction\backend\.venv\Scripts\python.exe"
        WorkDir = "$junction\backend"
    }
}

function Stop-PortListeners([int[]]$Ports) {
    foreach ($port in $Ports) {
        for ($round = 0; $round -lt 5; $round++) {
            $procIds = @()
            try {
                $procIds += @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                    ForEach-Object { $_.OwningProcess } | Sort-Object -Unique)
            } catch {}
            try {
                $procIds += @(netstat -ano | Select-String ":$port\s" | ForEach-Object {
                    if ($_ -match 'LISTENING\s+(\d+)\s*$') { [int]$Matches[1] }
                })
            } catch {}
            $procIds = @($procIds | Where-Object { $_ -and $_ -gt 0 } | Sort-Object -Unique)
            if (-not $procIds.Count) { break }
            foreach ($procId in $procIds) {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                taskkill /F /PID $procId 2>$null | Out-Null
                Write-Step "Released port $port (PID $procId)"
            }
            Start-Sleep -Milliseconds 500
        }
    }
}

function Get-AlivePortListenerIds([int]$Port) {
    $procIds = @()
    try {
        $procIds += @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            ForEach-Object { $_.OwningProcess })
    } catch {}
    try {
        $procIds += @(netstat -ano | Select-String ":$Port\s" | ForEach-Object {
            if ($_ -match 'LISTENING\s+(\d+)\s*$') { [int]$Matches[1] }
        })
    } catch {}
    return @($procIds | Where-Object { $_ -and $_ -gt 0 } | Sort-Object -Unique | Where-Object {
        $null -ne (Get-Process -Id $_ -ErrorAction SilentlyContinue)
    })
}

function Stop-LearnPathPythonProcesses {
    $killed = 0
    try {
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.Name -eq "python.exe" -and $_.CommandLine -match "uvicorn|app\.main|spawn_main|multiprocessing-fork"
            } |
            ForEach-Object {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
                taskkill /F /PID $_.ProcessId 2>$null | Out-Null
                $killed++
            }
    } catch {}
    return $killed
}

function Stop-OrphanUvicornWorkers {
    $killed = 0
    try {
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.Name -eq "python.exe" -and $_.CommandLine -match "spawn_main|multiprocessing-fork"
            } |
            ForEach-Object {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
                taskkill /F /PID $_.ProcessId 2>$null | Out-Null
                Write-Step "Stopped orphan uvicorn worker (PID $($_.ProcessId))"
                $killed++
            }
    } catch {}
    return $killed
}

function Stop-LearnPathProcessesDeep {
    Write-Step "Releasing ports 8000/8001/3000..."
    Stop-PortListeners -Ports @(8000, 8001, 3000, 3001, 3002)

    $pyCount = Stop-LearnPathPythonProcesses
    if ($pyCount -gt 0) {
        Write-Step "Stopped $pyCount Python backend process(es)"
    }

    $orphanCount = Stop-OrphanUvicornWorkers
    if ($orphanCount -eq 0) {
        Write-Step "No orphan uvicorn reload workers found"
    }

    try {
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match "next" } |
            ForEach-Object {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
                Write-Step "Stopped frontend (PID $($_.ProcessId))"
            }
    } catch {}

    Start-Sleep -Milliseconds 600

    Write-Step "Final sweep..."
    Stop-PortListeners -Ports @(8000, 8001, 3000, 3001, 3002)
    Stop-LearnPathPythonProcesses | Out-Null
    Stop-OrphanUvicornWorkers | Out-Null

    $busy = @()
    foreach ($port in @(8000, 3000)) {
        $alive = @(Get-AlivePortListenerIds -Port $port)
        if ($alive.Count) {
            $busy += "$port(PID $($alive -join ','))"
        }
    }
    return @{
        OrphanWorkersStopped = $orphanCount
        BusyPorts = $busy
    }
}

function Stop-LearnPathProcesses {
    Stop-LearnPathProcessesDeep | Out-Null
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

function Get-WritableLogPath([string]$Path, [string]$Label) {
    try {
        $s = [System.IO.File]::Open($Path, "OpenOrCreate", "ReadWrite", "None")
        $s.Close()
        return $Path
    } catch {
        $dir = Split-Path -Parent $Path
        $file = [System.IO.Path]::GetFileNameWithoutExtension($Path)
        $ext = [System.IO.Path]::GetExtension($Path)
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $fallback = Join-Path $dir "$file.$stamp.$PID$ext"
        Write-Step "$Label log is busy; using $(Split-Path -Leaf $fallback)"
        return $fallback
    }
}

function Prepare-ServiceLogs {
    param(
        [string]$Label,
        [string]$LogFile
    )
    $errFile = "$LogFile.err"
    Rotate-LogFile -Path $LogFile
    Rotate-LogFile -Path $errFile
    $LogFile = Get-WritableLogPath -Path $LogFile -Label $Label
    $errFile = Get-WritableLogPath -Path $errFile -Label $Label
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    try {
        "==== $ts $Label ====" | Out-File -FilePath $errFile -Encoding utf8
    } catch {}
    return @{ Log = $LogFile; Err = $errFile }
}

function Show-LogTail {
    param(
        [string]$Path,
        [int]$Lines = 20
    )
    if (-not (Test-Path $Path)) { return }
    Write-Host "      --- $(Split-Path -Leaf $Path) (last $Lines lines) ---" -ForegroundColor DarkGray
    Get-Content -LiteralPath $Path -Tail $Lines -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "      $_" -ForegroundColor DarkGray
    }
}

function Start-BackgroundService {
    param(
        [string]$Label,
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory,
        [string]$LogFile,
        [ValidateSet("Hidden", "Normal")]
        [string]$WindowStyle = "Hidden"
    )
    $logs = Prepare-ServiceLogs -Label $Label -LogFile $LogFile
    $proc = Start-Process -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -WindowStyle $WindowStyle `
        -RedirectStandardOutput $logs.Log `
        -RedirectStandardError $logs.Err `
        -PassThru
    return @{
        Process = $proc
        Log = $logs.Log
        Err = $logs.Err
    }
}

function Start-LearnPathBackend {
    param(
        [string]$Python,
        [string]$WorkDir,
        [string]$LogFile,
        [string[]]$UvicornArgs,
        [ValidateSet("Hidden", "Normal")]
        [string]$WindowStyle = "Hidden"
    )
    return Start-BackgroundService -Label "backend" `
        -FilePath $Python -ArgumentList $UvicornArgs `
        -WorkingDirectory $WorkDir -LogFile $LogFile -WindowStyle $WindowStyle
}

function Start-LearnPathFrontend {
    param(
        [string]$FrontDir,
        [string]$LogFile,
        [ValidateSet("Hidden", "Normal")]
        [string]$WindowStyle = "Hidden"
    )
    $logs = Prepare-ServiceLogs -Label "frontend" -LogFile $LogFile
    $ws = $WindowStyle
    $next = Get-NextDevCommand -FrontDir $FrontDir
    if ($next) {
        $proc = Start-Process -FilePath $next.Node `
            -ArgumentList @($next.Next, "dev", "-p", "3000") `
            -WorkingDirectory $next.Dir `
            -WindowStyle $ws `
            -RedirectStandardOutput $logs.Log `
            -RedirectStandardError $logs.Err `
            -PassThru
    } else {
        $proc = Start-Process -FilePath "cmd.exe" `
            -ArgumentList @("/c", "set PORT=3000&& npm run dev") `
            -WorkingDirectory $FrontDir `
            -WindowStyle $ws `
            -RedirectStandardOutput $logs.Log `
            -RedirectStandardError $logs.Err `
            -PassThru
    }
    return @{ Process = $proc; Log = $logs.Log; Err = $logs.Err }
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
    if (Test-Path $chromaModel) { return 180 }
    Write-Step "First run: Chroma may download ~80MB model; backend can take 2-6 min"
    return 360
}

function Wait-LearnPathFrontend {
    param([int]$TimeoutSec = 120)
    for ($i = 1; $i -le $TimeoutSec; $i++) {
        foreach ($port in @(3000, 3001)) {
            try {
                $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
                if ($r.StatusCode -eq 200) {
                    return "http://127.0.0.1:$port/chat"
                }
            } catch {}
        }
        if ($i % 15 -eq 0) { Write-Step "Waiting for frontend ... ${i}s" }
        Start-Sleep -Seconds 1
    }
    return $null
}
