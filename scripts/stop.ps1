# LearnPath — stop backend and frontend (Windows)

$ErrorActionPreference = "Continue"
. "$PSScriptRoot\lib\common.ps1"

Write-Host ""
Write-Host "Stopping LearnPath..."
Write-Host "  (includes orphaned uvicorn reload workers on port 8000)"
Write-Host ""

$result = Stop-LearnPathProcessesDeep

if ($result.BusyPorts.Count -gt 0) {
    Write-Host ""
    Write-Host "WARNING: Some ports are still in use: $($result.BusyPorts -join ', ')" -ForegroundColor Yellow
    Write-Host "  Close Task Manager -> end remaining python.exe, then run stop.bat again." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Done. Ports 8000 and 3000 are free."
Write-Host ""
