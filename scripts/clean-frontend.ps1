# LearnPath — remove Next.js build cache (fixes vendor-chunks errors)

$ErrorActionPreference = "Continue"
. "$PSScriptRoot\lib\common.ps1"

$front = Join-Path (Get-ProjectRoot) "frontend"
$nextDir = Join-Path $front ".next"

Write-Host ""
Write-Host "LearnPath — clean frontend cache"
Write-Host ""

if (Test-Path $nextDir) {
    Remove-Item -Recurse -Force $nextDir
    Write-Host "Removed frontend/.next"
} else {
    Write-Host "frontend/.next not found (nothing to clean)"
}

Write-Host ""
Write-Host "Next: cd frontend && npm run dev"
Write-Host "  Or run start.bat / scripts\start.ps1"
Write-Host ""
