#!/usr/bin/env bash
# 学径本地开发启动（Linux / macOS）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo ""
echo "========================================"
echo "  学径 LearnPath 启动"
echo "========================================"
echo ""

# ── 环境文件 ──────────────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "  已从 .env.example 创建 .env"
fi

CORS="http://localhost:3000,http://localhost:3001,http://localhost:3002"
if grep -q '^CORS_ORIGINS=' .env; then
  sed -i.bak "s|^CORS_ORIGINS=.*|CORS_ORIGINS=$CORS|" .env && rm -f .env.bak
else
  echo "CORS_ORIGINS=$CORS" >> .env
fi

cat > frontend/.env.local <<'EOF'
# 开发走 Next 同源代理
NEXT_PUBLIC_API_BASE=
EOF

# ── 后端 venv ─────────────────────────────────────────────────────────────────
if [[ ! -d backend/.venv ]]; then
  echo "  创建 Python 虚拟环境..."
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -r backend/requirements.txt
fi

# ── 前端依赖 ──────────────────────────────────────────────────────────────────
if [[ ! -d frontend/node_modules ]]; then
  echo "  安装前端依赖..."
  (cd frontend && npm install --no-fund --no-audit)
fi

# ── 清理端口 ──────────────────────────────────────────────────────────────────
for port in 8000 3000; do
  if command -v lsof >/dev/null 2>&1; then
    pid=$(lsof -ti:"$port" 2>/dev/null || true)
    [[ -n "$pid" ]] && kill -9 $pid 2>/dev/null || true
  fi
done

cleanup() {
  echo ""
  echo "正在停止服务..."
  kill "$BACK_PID" "$FRONT_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── 启动后端 ──────────────────────────────────────────────────────────────────
echo "[1/2] 启动后端 http://127.0.0.1:8000 ..."
(
  cd backend
  source .venv/bin/activate
  exec uvicorn app.main:app --host 127.0.0.1 --port 8000
) &
BACK_PID=$!

echo "      等待后端就绪..."
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:8000/api/health" >/dev/null 2>&1; then
    echo "      后端已就绪 (~${i}s)"
    break
  fi
  sleep 1
  if [[ $i -eq 60 ]]; then
    echo "警告: 后端未在 60s 内响应，请检查日志" >&2
  fi
done

# ── 启动前端 ──────────────────────────────────────────────────────────────────
echo "[2/2] 启动前端 http://localhost:3000 ..."
(
  cd frontend
  export PORT=3000
  exec npm run dev
) &
FRONT_PID=$!

echo ""
echo "  后端: http://127.0.0.1:8000"
echo "  前端: http://localhost:3000/chat"
echo "  按 Ctrl+C 停止"
echo ""

wait
