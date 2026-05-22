# 在默认浏览器中打开学径（需已启动前后端）
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent

Write-Host "打开本地入口页..."
Start-Process (Join-Path $Root "entry.html")

Start-Sleep -Milliseconds 500

$urls = @(
    "http://localhost:3000/chat",
    "http://localhost:3001/chat"
)
foreach ($u in $urls) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) {
            Write-Host "后端已就绪: http://localhost:8000"
            break
        }
    } catch {
        Write-Host "提示: 后端未启动，请先运行 uvicorn 或 scripts\dev.ps1"
    }
}

# 尝试打开可用前端端口
foreach ($u in $urls) {
    try {
        $r = Invoke-WebRequest -Uri ($u -replace "/chat","") -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) {
            Write-Host "打开前端: $u"
            Start-Process $u
            exit 0
        }
    } catch { }
}

Write-Host "未检测到前端服务，请先在 frontend 目录执行 npm run dev"
