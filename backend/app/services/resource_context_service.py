"""为资源生成准备资料库 / 全网上下文。"""

from __future__ import annotations

from typing import Any

from app.db.repository import get_library
from app.rag.library_retriever import builtin_kb_root, retrieve_from_library
from app.services.web_research_service import full_web_research, supplement_library_context


def _profile_summary(profile: dict | None) -> str:
    if not profile:
        return ""
    parts = [
        f"知识基础：{profile.get('knowledge_level', '')}",
        f"学习目标：{profile.get('learning_goal', '')}",
        f"薄弱点：{', '.join(profile.get('error_prone_topics') or [])}",
        f"偏好模态：{profile.get('preferred_modality', '')}",
    ]
    return "；".join(p for p in parts if p.split("：", 1)[-1])


async def build_generation_context(
    *,
    topic: str,
    library_id: str | None,
    user_id: str,
) -> dict[str, Any]:
    """
    返回:
      mode: library | library+web | web
      library_context, web_context, sources, library_name
    """
    sources: list[str] = []
    library_context = ""
    web_context = ""
    mode = "web"
    library_name = ""

    lib = None
    if library_id:
        lib = await get_library(library_id, user_id)

    has_library_chunks = False
    if lib and lib.get("status") == "ready" and lib.get("chunk_count", 0) > 0:
        library_name = lib.get("name", "")
        chunks = await retrieve_from_library(
            library_id,
            topic,
            collection_name=lib.get("collection_name", ""),
            k=6,
            fallback_dir=_fallback_dir(lib),
        )
        if chunks:
            has_library_chunks = True
            library_context = "\n\n---\n\n".join(
                f"【{c.get('metadata', {}).get('title', '片段')}】\n{c['text']}"
                for c in chunks
            )
            sources.extend(
                c.get("metadata", {}).get("source_file")
                or c.get("metadata", {}).get("title", "chunk")
                for c in chunks
            )
            mode = "library"

    if has_library_chunks:
        if len(library_context) < 1200:
            supplement = await supplement_library_context(topic, library_context)
            web_context = supplement
            mode = "library+web"
            sources.append("全网补充检索")
    else:
        summary, queries = await full_web_research(topic)
        web_context = summary
        sources.extend([f"检索:{q}" for q in queries[:3]])
        mode = "web"

    return {
        "mode": mode,
        "library_context": library_context,
        "web_context": web_context,
        "sources": sources,
        "library_name": library_name,
        "library_id": library_id or "",
    }


def _fallback_dir(lib: dict) -> Any:
    path = lib.get("kb_path")
    if path:
        return builtin_kb_root() / path
    return None
