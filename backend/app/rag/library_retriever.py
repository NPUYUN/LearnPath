"""按资料库维度的 Chroma 检索与入库。"""

from __future__ import annotations

from pathlib import Path
import re
from typing import Any

from app.core.config import ROOT_DIR, get_settings
from app.rag.chunking import load_markdown_files, split_text


def _collection_name(library_id: str, explicit: str = "") -> str:
    if explicit:
        return explicit
    safe = library_id.replace("-", "_").replace(" ", "_")[:96]
    return f"lib_{safe}"


def _get_client():
    import chromadb
    from chromadb.config import Settings as ChromaSettings

    settings = get_settings()
    Path(settings.chroma_persist_dir).mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(
        path=settings.chroma_persist_dir,
        settings=ChromaSettings(anonymized_telemetry=False),
    )


def get_collection(library_id: str, collection_name: str = ""):
    name = _collection_name(library_id, collection_name)
    try:
        client = _get_client()
        return client.get_or_create_collection(name)
    except Exception:
        return None


async def retrieve_from_library(
    library_id: str,
    query: str,
    *,
    collection_name: str = "",
    k: int = 5,
    fallback_dir: Path | None = None,
) -> list[dict[str, Any]]:
    collection = get_collection(library_id, collection_name)
    if collection is not None and collection.count() > 0:
        n = min(max(k * 4, k), collection.count())
        result = collection.query(query_texts=[query], n_results=n)
        docs = result.get("documents", [[]])[0]
        metas = result.get("metadatas", [[]])[0]
        ids = result.get("ids", [[]])[0]
        rows = [
            {"id": ids[i], "text": docs[i], "metadata": metas[i] or {}}
            for i in range(len(docs))
        ]
        return _diversify_chunks(rows, query=query, limit=k)

    if fallback_dir and fallback_dir.exists():
        docs = load_markdown_files(fallback_dir)
        q = set(query.lower().split())
        scored = []
        for d in docs:
            words = set(d["text"].lower().split())
            scored.append((len(q & words), d))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [d for _, d in scored[:k]] or docs[:k]

    return []


def _diversify_chunks(rows: list[dict[str, Any]], *, query: str, limit: int) -> list[dict[str, Any]]:
    if len(rows) <= limit:
        return rows
    query_text = query.lower()
    query_tokens = _query_tokens(query_text)
    per_source: dict[str, int] = {}
    selected: list[dict[str, Any]] = []

    def source_key(row: dict[str, Any]) -> str:
        meta = row.get("metadata") or {}
        return str(meta.get("source_file") or meta.get("title") or row.get("id") or "")

    def chapter_bonus(row: dict[str, Any]) -> int:
        meta = row.get("metadata") or {}
        blob = f"{meta.get('source_file', '')} {meta.get('title', '')}".lower()
        return sum(1 for token in query_tokens if token in blob)

    ordered = sorted(enumerate(rows), key=lambda pair: (chapter_bonus(pair[1]), -pair[0]), reverse=True)
    for _, row in ordered:
        src = source_key(row)
        if per_source.get(src, 0) >= 2:
            continue
        selected.append(row)
        per_source[src] = per_source.get(src, 0) + 1
        if len(selected) >= limit:
            break
    if len(selected) < limit:
        picked = {r.get("id") for r in selected}
        for row in rows:
            if row.get("id") in picked:
                continue
            selected.append(row)
            if len(selected) >= limit:
                break
    return selected[:limit]


def _query_tokens(query: str) -> list[str]:
    tokens = [t for t in re.split(r"[\s,，、:：;；/]+", query) if len(t) >= 2]
    known = [
        "应用层",
        "运输层",
        "传输层",
        "网络层",
        "链路层",
        "无线网络",
        "移动网络",
        "因特网",
        "tcp",
        "udp",
        "http",
        "dns",
        "ip",
    ]
    for item in known:
        if item in query and item not in tokens:
            tokens.append(item)
    return tokens


def ingest_text_chunks(
    library_id: str,
    chunks: list[dict[str, Any]],
    *,
    collection_name: str = "",
    reset: bool = False,
) -> int:
    if not chunks:
        return 0
    name = _collection_name(library_id, collection_name)
    try:
        client = _get_client()
        if reset:
            try:
                client.delete_collection(name)
            except Exception:
                pass
        collection = client.get_or_create_collection(name)
        if not reset:
            existing = set()
            try:
                if collection.count() > 0:
                    existing = set(collection.get(include=[])["ids"])
            except Exception:
                pass
            chunks = [c for c in chunks if c["id"] not in existing]
        if not chunks:
            return 0
        collection.add(
            ids=[c["id"] for c in chunks],
            documents=[c["text"] for c in chunks],
            metadatas=[c.get("metadata", {}) for c in chunks],
        )
        return len(chunks)
    except Exception as e:
        print(f"资料库 {library_id} 向量入库失败: {e}")
        return 0


def chunk_uploaded_documents(
    files: list[dict[str, Any]],
    *,
    library_id: str,
    chunk_size: int = 800,
) -> list[dict[str, Any]]:
    """files: [{id, filename, text, analysis}]"""
    out: list[dict[str, Any]] = []
    for f in files:
        text = (f.get("text") or "").strip()
        if not text:
            continue
        parts = split_text(text, chunk_size=chunk_size)
        title = f.get("analysis", {}).get("title") or f.get("filename", "文档")
        for i, part in enumerate(parts):
            out.append(
                {
                    "id": f"{library_id}_{f['id']}_{i}",
                    "text": part,
                    "metadata": {
                        "title": title,
                        "source_file": f.get("filename", ""),
                        "library_id": library_id,
                        "chunk_index": i,
                    },
                }
            )
    return out


def builtin_kb_root() -> Path:
    return ROOT_DIR / "data" / "knowledge_base"
