#!/usr/bin/env python3
"""刷新内置资料库元数据并重新向量化 knowledge_base。从项目根目录运行：

    python scripts/seed_builtin_libraries.py
"""

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from app.db.session import init_db  # noqa: E402
from app.services.library_service import ensure_builtin_libraries  # noqa: E402
from app.rag.ingest import ingest_knowledge_base  # noqa: E402


async def main() -> None:
    init_db()
    n = await ensure_builtin_libraries()
    print(f"已同步 {n} 个内置资料库（文件数与片段数已按磁盘更新）。")
    chunks = ingest_knowledge_base()
    print(f"Chroma 入库完成，处理 {chunks} 个文本块。")


if __name__ == "__main__":
    asyncio.run(main())
