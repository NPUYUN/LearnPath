from pathlib import Path
from typing import Any

from app.core.config import get_settings

_collection = None
_fallback_docs: list[dict[str, Any]] | None = None


def _get_collection():
    global _collection
    if _collection is not None:
        return _collection
    try:
        import chromadb
        from chromadb.config import Settings as ChromaSettings

        settings = get_settings()
        Path(settings.chroma_persist_dir).mkdir(parents=True, exist_ok=True)
        client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        _collection = client.get_or_create_collection("ml_intro")
        return _collection
    except Exception:
        return None


def _load_fallback() -> list[dict[str, Any]]:
    global _fallback_docs
    if _fallback_docs is not None:
        return _fallback_docs
    from app.rag.chunking import load_markdown_files

    settings = get_settings()
    _fallback_docs = load_markdown_files(Path(settings.knowledge_base_dir))
    return _fallback_docs


async def retrieve(query: str, k: int = 5) -> list[dict[str, Any]]:
    collection = _get_collection()
    if collection is not None and collection.count() > 0:
        result = collection.query(query_texts=[query], n_results=min(k, collection.count()))
        docs = result.get("documents", [[]])[0]
        metas = result.get("metadatas", [[]])[0]
        ids = result.get("ids", [[]])[0]
        return [
            {"id": ids[i], "text": docs[i], "metadata": metas[i] or {}}
            for i in range(len(docs))
        ]

    # 无向量库时：简单关键词回退
    docs = _load_fallback()
    scored = []
    q = set(query.lower().split())
    for d in docs:
        words = set(d["text"].lower().split())
        score = len(q & words)
        scored.append((score, d))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [d for _, d in scored[:k]] or docs[:k]
