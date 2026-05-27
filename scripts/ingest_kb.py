#!/usr/bin/env python3
"""将课程知识库写入 Chroma 向量库。从项目根目录运行：python scripts/ingest_kb.py"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from app.rag.ingest import ingest_knowledge_base  # noqa: E402


def main() -> None:
    count = ingest_knowledge_base()
    print(f"知识库入库完成，共处理 {count} 个文本块。")
    print(f"向量库目录：{ROOT / 'storage' / 'chroma'}")


if __name__ == "__main__":
    main()
