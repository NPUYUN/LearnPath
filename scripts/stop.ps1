# LearnPath — stop backend and frontend (Windows)

$ErrorActionPreference = "Continue"
. "$PSScriptRoot\lib\common.ps1"

Write-Host ""
Write-Host "Stopping LearnPath..."
Stop-LearnPathProcesses
Write-Host "Done."
Write-Host ""
