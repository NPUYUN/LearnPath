# 清理前端构建缓存并重新安装依赖（修复 vendor-chunks 缺失等）
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$Frontend = Join-Path $Root "frontend"

Write-Host ">>> 停止后请手动关闭正在运行的 npm run dev 窗口"
Set-Location $Frontend

if (Test-Path ".next") {
    Remove-Item -Recurse -Force ".next"
    Write-Host "已删除 frontend/.next"
}

Write-Host ">>> 重新构建..."
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host "构建成功。请执行: cd frontend && npm run dev"
} else {
    Write-Host "构建失败，尝试: Remove-Item -Recurse -Force node_modules; npm install; npm run build"
}
