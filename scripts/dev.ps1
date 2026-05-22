# 学径本地开发启动（Windows PowerShell）
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
Set-Location $Root

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "已创建 .env（默认 LLM_MOCK=true）"
}

Write-Host ">>> 知识库入库..."
python scripts/ingest_kb.py

Write-Host ">>> 启动后端 http://localhost:8000 ..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\backend'; if (Test-Path .venv) { .\.venv\Scripts\Activate.ps1 }; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

Start-Sleep -Seconds 2
Write-Host ">>> 启动前端 http://localhost:3000 ..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\frontend'; npm run dev"

Write-Host "完成。请在新窗口查看服务日志。"
