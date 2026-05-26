# 停止 LearnPath 后端/前端（释放 8000、3000 等端口）
$ErrorActionPreference = "Continue"
$Root = $PSScriptRoot | Split-Path -Parent

function Stop-PortListeners {
    param([int[]]$Ports)
    foreach ($port in $Ports) {
        try {
            $conns = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
            $pids = $conns | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique
            foreach ($procId in $pids) {
                if ($procId -and $procId -ne 0) {
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                    Write-Host "  stopped port $port (PID $procId)"
                }
            }
        } catch {}
    }
}

Write-Host "Stopping LearnPath services..."
Stop-PortListeners -Ports @(8000, 3000, 3001, 3002)

try {
    Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match "uvicorn" } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Host "  stopped uvicorn (PID $($_.ProcessId))"
        }
} catch {}

try {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match "next" } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Host "  stopped next (PID $($_.ProcessId))"
        }
} catch {}

Write-Host "Done."
