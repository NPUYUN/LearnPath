"""为资源生成准备资料库 / 全网上下文。"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.db.repository import get_library
from app.rag.library_retriever import builtin_kb_root, retrieve_from_library
from app.services.web_research_service import full_web_research, supplement_library_context
from app.services.library_service import ensure_library_assets

logger = logging.getLogger(__name__)


def _looks_like_web_prompt_echo(text: str) -> bool:
    normalized = (text or "").strip()
    if not normalized:
        return False
    markers = ("主题：", "检索查询：", "关注方向：", "请整理为可用于后续生成")
    return sum(1 for m in markers if m in normalized) >= 2


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


def _library_docs_context(lib: dict | None, *, query: str = "", max_chars: int = 4200) -> str:
    if not lib:
        return ""
    lib = ensure_library_assets(lib)
    synthesis = lib.get("synthesis") or {}
    if not isinstance(synthesis, dict):
        return ""
    parts: list[str] = []
    for label, key in (
        ("资料库说明", "description_doc"),
        ("资料库索引", "index_doc"),
        ("文件关系", "relationship_doc"),
    ):
        text = str(synthesis.get(key) or "").strip()
        if text:
            parts.append(f"【{label}】\n{text}")
    file_docs = synthesis.get("file_docs") or []
    if isinstance(file_docs, list) and file_docs:
        rendered: list[str] = []
        query_tokens = [t for t in query.replace("：", " ").replace("、", " ").split() if len(t) >= 2]
        ordered_docs = sorted(
            [item for item in file_docs if isinstance(item, dict)],
            key=lambda item: _file_doc_score(item, query_tokens),
            reverse=True,
        )
        for item in ordered_docs[:5]:
            if not isinstance(item, dict):
                continue
            filename = str(item.get("filename") or item.get("title") or "文件说明")
            doc = str(item.get("doc") or "").strip()
            if doc:
                rendered.append(f"### {filename}\n{doc[:700]}")
        if rendered:
            parts.append("【文件说明文档】\n" + "\n\n".join(rendered))
    requirements = str(synthesis.get("requirements") or "").strip()
    if requirements:
        parts.append(f"【建库诉求】\n{requirements}")
    query_tokens = [t for t in re.split(r"[\s、，,：:]+", query) if len(t) >= 2]
    profile = synthesis.get("library_profile") if isinstance(synthesis.get("library_profile"), dict) else {}
    if profile:
        parts.insert(0, "【资料库画像】\n" + json.dumps(profile, ensure_ascii=False))
    knowledge_rows = synthesis.get("knowledge_index") if isinstance(synthesis.get("knowledge_index"), list) else []
    if knowledge_rows:
        ranked = sorted(
            [row for row in knowledge_rows if isinstance(row, dict)],
            key=lambda row: sum(token in json.dumps(row, ensure_ascii=False) for token in query_tokens),
            reverse=True,
        )[:12]
        parts.insert(1, "【相关知识索引】\n" + json.dumps(ranked, ensure_ascii=False))
    relations = synthesis.get("knowledge_relations") if isinstance(synthesis.get("knowledge_relations"), list) else []
    if relations:
        relevant = [
            row for row in relations
            if isinstance(row, dict)
            and (not query_tokens or any(token in json.dumps(row, ensure_ascii=False) for token in query_tokens))
        ][:12]
        if relevant:
            parts.append("【相关知识关系】\n" + json.dumps(relevant, ensure_ascii=False))
    manifest = synthesis.get("resource_manifest") if isinstance(synthesis.get("resource_manifest"), list) else []
    if manifest:
        ranked_manifest = sorted(
            [row for row in manifest if isinstance(row, dict) and row.get("status") != "draft"],
            key=lambda row: (
                sum(token in json.dumps(row, ensure_ascii=False) for token in query_tokens),
                float(row.get("quality_score") or 0),
            ),
            reverse=True,
        )[:10]
        if ranked_manifest:
            parts.append("【相关学习资源清单】\n" + json.dumps(ranked_manifest, ensure_ascii=False))
    text = "\n\n---\n\n".join(parts)
    return text[:max_chars]


def _file_doc_score(item: dict, query_tokens: list[str]) -> int:
    if not query_tokens:
        return 0
    blob = f"{item.get('filename', '')} {item.get('title', '')} {item.get('doc', '')[:300]}"
    return sum(1 for token in query_tokens if token in blob)


async def build_generation_context(
    *,
    topic: str,
    library_id: str | None,
    user_id: str,
    requirements: str = "",
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
        if lib:
            lib = ensure_library_assets(lib)

    library_docs = _library_docs_context(lib, query=topic)

    has_library_chunks = False
    if lib and lib.get("status") == "ready" and lib.get("chunk_count", 0) > 0:
        library_name = lib.get("name", "")
        chunks = await retrieve_from_library(
            library_id,
            topic,
            collection_name=lib.get("collection_name", ""),
            k=10,
            fallback_dir=_fallback_dir(lib),
        )
        if chunks:
            has_library_chunks = True
            library_context = "\n\n---\n\n".join(
                f"【{c.get('metadata', {}).get('title', '片段')}】\n{c['text']}"
                for c in chunks
            )
            if library_docs:
                library_context = f"{library_docs}\n\n---\n\n【索引命中的资源片段】\n{library_context}"
            sources.extend(
                c.get("metadata", {}).get("source_file")
                or c.get("metadata", {}).get("title", "chunk")
                for c in chunks
            )
            mode = "library"

    elif library_docs:
        library_name = lib.get("name", "") if lib else ""
        library_context = library_docs
        has_library_chunks = True
        mode = "library"
        sources.append("资料库说明与索引文档")

    if has_library_chunks:
        if len(library_context) < 1200:
            try:
                supplement_topic = f"{topic}\n补充诉求：{requirements}" if requirements else topic
                supplement = await supplement_library_context(supplement_topic, library_context)
                web_context = supplement
                mode = "library+web"
                sources.append("全网补充检索")
            except Exception as exc:
                logger.warning("supplement library context failed topic=%s: %s", topic, exc)
                web_context = _fallback_web_context(topic)
                sources.append("本地降级补充")
    else:
        try:
            research_topic = f"{topic}\n资料库名称/诉求：{requirements}" if requirements else topic
            summary, queries = await full_web_research(research_topic)
            if _looks_like_web_prompt_echo(summary):
                logger.warning("web research summary looks like prompt echo topic=%s", topic)
                web_context = _fallback_web_context(topic)
                sources.append("本地降级主题摘要")
            else:
                web_context = summary
                sources.extend([f"检索:{q}" for q in queries[:3]])
        except Exception as exc:
            logger.warning("web research failed topic=%s: %s", topic, exc)
            web_context = _fallback_web_context(topic)
            sources.append("本地降级主题摘要")
        mode = "web"

    return {
        "mode": mode,
        "library_context": library_context,
        "web_context": web_context,
        "sources": sources,
        "library_name": library_name,
        "library_id": library_id or "",
        "requirements": requirements,
        "library_profile": (lib.get("synthesis") or {}).get("library_profile", {}) if lib else {},
        "knowledge_index": (lib.get("synthesis") or {}).get("knowledge_index", []) if lib else [],
        "knowledge_relations": (lib.get("synthesis") or {}).get("knowledge_relations", []) if lib else [],
        "resource_manifest": (lib.get("synthesis") or {}).get("resource_manifest", []) if lib else [],
    }


def _fallback_dir(lib: dict) -> Any:
    path = lib.get("kb_path")
    if path:
        return builtin_kb_root() / path
    return None


def _fallback_web_context(topic: str) -> str:
    return (
        f"# {topic} 资源生成摘要\n\n"
        f"- 核心主题：{topic}\n"
        "- 生成时优先给出定义、关键步骤、典型例题、常见误区和练习任务。\n"
        "- 如果主题偏概念，先讲清楚概念边界和应用场景；如果主题偏计算或代码，补充步骤化例题和可执行思路。\n"
        "- 当前外部检索或大模型补充暂不可用，系统将基于主题、画像和已有本地资料降级生成。"
    )
