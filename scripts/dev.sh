#!/usr/bin/env bash
# LearnPath — start backend + frontend (Linux / macOS)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo ""
echo "========================================"
echo "  LearnPath"
echo "========================================"
echo ""

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "  Created .env from .env.example"
fi

CORS="http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3001"
if grep -q '^CORS_ORIGINS=' .env 2>/dev/null; then
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^CORS_ORIGINS=.*|CORS_ORIGINS=$CORS|" .env
  else
    sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=$CORS|" .env
  fi
else
  echo "CORS_ORIGINS=$CORS" >> .env
fi

cat > frontend/.env.local <<'EOF'
# Managed by scripts/dev.sh
NEXT_PUBLIC_API_BASE=
API_PROXY_TARGET=http://127.0.0.1:8000
EOF

if [[ ! -d backend/.venv ]]; then
  echo "[setup] Creating backend/.venv..."
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -r backend/requirements.txt
fi

if [[ ! -d frontend/node_modules ]]; then
  echo "[setup] npm install..."
  (cd frontend && npm install --no-fund --no-audit)
fi

for port in 8000 3000 3001; do
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    [[ -n "$pids" ]] && kill -9 $pids 2>/dev/null || true
  fi
done

cleanup() {
  echo ""
  echo "Stopping services..."
  kill "$BACK_PID" "$FRONT_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[1/2] Backend http://127.0.0.1:8000 ..."
(
  cd backend
  source .venv/bin/activate
  exec uvicorn app.main:app --host 127.0.0.1 --port 8000
) &
BACK_PID=$!

echo "      Waiting for backend..."
for i in $(seq 1 180); do
  if curl -sf "http://127.0.0.1:8000/api/health" >/dev/null 2>&1; then
    echo "      Backend ready (~${i}s)"
    break
  fi
  if [[ $i -eq 180 ]]; then
    echo "WARN: Backend not ready in 180s (first run: Chroma model download may be slow)" >&2
  fi
  sleep 1
done

echo "[2/2] Frontend http://localhost:3000 ..."
(
  cd frontend
  export PORT=3000
  exec npm run dev
) &
FRONT_PID=$!

echo ""
echo "  API:  http://127.0.0.1:8000"
echo "  App:  http://localhost:3000/chat"
echo "  Press Ctrl+C to stop"
echo ""

wait
