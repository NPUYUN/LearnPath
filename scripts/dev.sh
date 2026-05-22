#!/usr/bin/env bash
# 学径本地开发启动（Linux/macOS）
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

[ -f .env ] || cp .env.example .env
python scripts/ingest_kb.py

(cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
sleep 2
(cd frontend && npm run dev) &

wait
