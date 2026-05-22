from pathlib import Path

from app.core.config import get_settings
from app.rag.chunking import load_markdown_files


def ingest_knowledge_base() -> int:
    settings = get_settings()
    base = Path(settings.knowledge_base_dir)
    documents = load_markdown_files(base)
    if not documents:
        return 0

    try:
        import chromadb
        from chromadb.config import Settings as ChromaSettings

        Path(settings.chroma_persist_dir).mkdir(parents=True, exist_ok=True)
        client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        collection = client.get_or_create_collection("ml_intro")
        # 清空后重建（框架阶段）
        try:
            client.delete_collection("ml_intro")
        except Exception:
            pass
        collection = client.get_or_create_collection("ml_intro")
        collection.add(
            ids=[d["id"] for d in documents],
            documents=[d["text"] for d in documents],
            metadatas=[d["metadata"] for d in documents],
        )
        return len(documents)
    except Exception as e:
        print(f"Chroma 入库跳过（将使用关键词回退检索）: {e}")
        return len(documents)
