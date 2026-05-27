"""智能对话：资源库优先检索、匹配度路由、多模态回答、画像增量更新。"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, AsyncIterator

from app.core.guardrails import attach_sources, filter_sensitive
from app.core.llm import get_primary_llm
from app.core.prompts import (
    chat_direct_system,
    chat_library_polish_system,
    chat_profile_patch_system,
    chat_temperature,
)
from app.db.repository import list_libraries, save_profile
from app.rag.library_retriever import retrieve_from_library
from app.services.user_defaults import profile_fallback_fields

# 资源库片段匹配度阈值（满分约 10+）
MATCH_THRESHOLD = 2.8

QUESTION_TYPES = (
    "concept",
    "code",
    "media",
    "practice",
    "profile_info",
    "general",
)


def classify_question_type(message: str) -> str:
    """根据用户提问判断回答形态（关键词优先，轻量快速）。"""
    text = message.strip()
    if any(k in text for k in ["代码", "编程", "python", "实现", "报错", "调试", "运行", "程序"]):
        return "code"
    if any(k in text for k in ["视频", "分镜", "动画", "多媒体", "演示", "镜头"]):
        return "media"
    if any(k in text for k in ["练习", "做题", "测验", "题目", "求解", "计算", "证明"]):
        return "practice"
    if any(
        k in text
        for k in ["是什么", "为什么", "解释", "定义", "区别", "原理", "不懂", "怎么理解", "如何理解"]
    ):
        return "concept"
    if any(k in text for k in ["我是", "专业", "基础", "目标", "画像", "风格", "每周", "时间"]):
        return "profile_info"
    return "general"


def _tokenize(text: str) -> set[str]:
    parts = re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z]{2,}|\d+", text.lower())
    return set(parts)


def _keyword_score(query: str, text: str) -> float:
    q = _tokenize(query)
    if not q:
        return 0.0
    t = _tokenize(text)
    if not t:
        return 0.0
    overlap = len(q & t)
    ratio = overlap / max(len(q), 1)
    bonus = 0.5 if any(kw in text for kw in re.findall(r"[\u4e00-\u9fff]{2,}", query)) else 0.0
    return overlap + ratio * 2 + bonus


def _search_user_resources(
    resources: list[dict], query: str, *, k: int = 5
) -> list[dict[str, Any]]:
    scored: list[tuple[float, dict[str, Any]]] = []
    for r in resources:
        body = (r.get("content") or "")[:2500]
        blob = f"{r.get('title', '')} {r.get('topic', '')} {body}"
        score = _keyword_score(query, blob)
        if score <= 0:
            continue
        scored.append(
            (
                score,
                {
                    "id": f"res-{r.get('id', '')}",
                    "text": body or r.get("title", ""),
                    "metadata": {
                        "title": r.get("title", "学习资源"),
                        "source": "resource_library",
                        "resource_id": r.get("id", ""),
                        "type": r.get("type", "doc"),
                        "topic": r.get("topic", ""),
                    },
                    "_score": score,
                },
            )
        )
    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:k]]


async def _search_material_libraries(user_id: str, query: str, *, k: int = 5) -> list[dict[str, Any]]:
    libs = await list_libraries(user_id)
    merged: list[tuple[float, dict[str, Any]]] = []
    for lib in libs:
        if lib.get("status") != "ready" or int(lib.get("chunk_count") or 0) <= 0:
            continue
        lib_id = lib.get("id", "")
        chunks = await retrieve_from_library(
            lib_id,
            query,
            collection_name=lib.get("collection_name", ""),
            k=min(3, k),
            fallback_dir=None,
        )
        for c in chunks:
            meta = dict(c.get("metadata") or {})
            meta.setdefault("title", meta.get("source_file") or lib.get("name", "资料库"))
            meta["source"] = "material_library"
            meta["library_name"] = lib.get("name", "")
            score = _keyword_score(query, c.get("text", ""))
            merged.append(
                (
                    score + 0.5,
                    {
                        "id": c.get("id", ""),
                        "text": c.get("text", ""),
                        "metadata": meta,
                        "_score": score,
                    },
                )
            )
    merged.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in merged[:k]]


def _evaluate_match_score(chunks: list[dict[str, Any]]) -> float:
    if not chunks:
        return 0.0
    scores = [float(c.get("_score") or _keyword_score("", c.get("text", ""))) for c in chunks]
    scores.sort(reverse=True)
    if len(scores) == 1:
        return scores[0]
    return scores[0] * 0.6 + (sum(scores[:3]) / min(3, len(scores))) * 0.4


async def retrieve_resource_library_context(
    user_id: str,
    query: str,
    user_resources: list[dict] | None = None,
    *,
    k: int = 6,
) -> dict[str, Any]:
    """优先检索用户资源库 + 资料库，返回片段与匹配度。"""
    from app.db.repository import list_resources

    resources = user_resources if user_resources is not None else await list_resources(user_id)
    res_chunks = _search_user_resources(resources, query, k=k)
    lib_chunks = await _search_material_libraries(user_id, query, k=k)
    combined = res_chunks + lib_chunks
    # 去重并按分排序
    seen: set[str] = set()
    ranked: list[dict[str, Any]] = []
    for c in sorted(combined, key=lambda x: float(x.get("_score") or 0), reverse=True):
        key = c.get("id") or c.get("text", "")[:80]
        if key in seen:
            continue
        seen.add(key)
        ranked.append(c)
    ranked = ranked[:k]
    score = _evaluate_match_score(ranked)
    return {
        "chunks": ranked,
        "match_score": score,
        "mode": "library_polish" if score >= MATCH_THRESHOLD else "direct",
        "resource_count": len(resources),
    }


def _format_chunks_context(chunks: list[dict[str, Any]]) -> str:
    if not chunks:
        return "（资源库暂无相关片段）"
    parts: list[str] = []
    for i, c in enumerate(chunks, 1):
        meta = c.get("metadata") or {}
        title = meta.get("title", f"片段{i}")
        src = meta.get("source", "")
        parts.append(f"### [{i}] {title} ({src})\n{c.get('text', '')[:1800]}")
    return "\n\n".join(parts)


def build_intelligent_chat_messages(
    *,
    question: str,
    topic: str,
    question_type: str,
    profile: dict | None,
    retrieval: dict[str, Any],
    deep_thinking: bool = False,
) -> tuple[list[dict[str, str]], list[dict[str, Any]], str]:
    chunks = retrieval.get("chunks") or []
    mode = retrieval.get("mode", "direct")
    ctx = _format_chunks_context(chunks)

    profile_hint = ""
    if profile:
        profile_hint = (
            f"知识基础：{profile.get('knowledge_level', '')}；"
            f"目标：{profile.get('learning_goal', '')}；"
            f"薄弱点：{', '.join(profile.get('error_prone_topics') or [])}；"
            f"偏好：{profile.get('preferred_modality', '')}"
        )

    if mode == "library_polish":
        system = chat_library_polish_system(question_type, deep_thinking)
        user = (
            f"学习主题：{topic}\n"
            f"提问类型：{question_type}\n"
            f"学生画像：{profile_hint or '暂无'}\n"
            f"用户问题：{question}\n\n"
            f"【资源库检索片段（请优先依据以下内容润色作答）】\n{ctx}\n\n"
            "请输出结构化 Markdown 回答，并注明与资源库的对应关系。"
        )
    else:
        system = chat_direct_system(question_type, deep_thinking)
        user = (
            f"学习主题：{topic}\n"
            f"提问类型：{question_type}\n"
            f"学生画像：{profile_hint or '暂无'}\n"
            f"用户问题：{question}\n\n"
            "说明：资源库匹配度较低，请基于你的学科知识直接作答；"
            "勿编造具体教材页码或链接。"
        )

    return [{"role": "system", "content": system}, {"role": "user", "content": user}], chunks, mode


def postprocess_multimodal_answer(
    answer: str,
    question_type: str,
    chunks: list[dict[str, Any]],
    topic: str,
    *,
    mode: str = "direct",
) -> str:
    answer = filter_sensitive(answer)

    if question_type == "code" and "```" not in answer:
        answer += (
            "\n\n### 代码示例\n\n```python\n"
            f"# {topic} 相关示例\n"
            "import numpy as np\n"
            "# 请根据讲解替换为完整可运行代码\n"
            "print('示例占位 — 请结合上文理解后运行')\n```\n"
        )
    if question_type == "media" and "分镜" not in answer and "镜头" not in answer:
        answer += (
            "\n\n### 短视频分镜脚本\n"
            "| 镜头 | 画面 | 旁白 | 时长 |\n|------|------|------|------|\n"
            f"| 1 | {topic} 概念引入 | 本讲学习目标… | 15s |\n"
            "| 2 | 公式/图示演示 | 关键推导… | 25s |\n"
            "| 3 | 例题 walkthrough | 一步骤一结论… | 20s |\n"
            "| 4 | 小结与易错点 | 复习要点… | 10s |\n"
        )
    if question_type in ("concept", "general", "practice") and "```mermaid" not in answer:
        answer += (
            "\n\n### 知识关系图解\n\n```mermaid\nflowchart LR\n"
            f"  A[{topic}] --> B[核心概念]\n  B --> C[应用/练习]\n```\n"
        )
    if question_type == "practice" and "步骤" not in answer and "解题" not in answer:
        answer += "\n\n### 解题思路\n1. 明确已知与求解目标\n2. 选择公式或方法\n3. 分步推导并检验\n"

    if mode == "library_polish" and chunks:
        answer = attach_sources(answer, chunks)

    return answer


async def patch_profile_from_chat(
    user_id: str,
    question: str,
    question_type: str,
    topic: str,
    existing: dict | None,
) -> dict | None:
    """依据提问类型增量完善学生画像。"""
    ex = dict(existing or {})
    fallbacks = profile_fallback_fields(user_id, ex)
    llm = get_primary_llm()

    prompt = [
        {"role": "system", "content": chat_profile_patch_system()},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "question": question[:500],
                    "question_type": question_type,
                    "topic": topic,
                    "current_profile": {
                        k: ex.get(k, fallbacks.get(k))
                        for k in (
                            "knowledge_level",
                            "learning_goal",
                            "cognitive_style",
                            "error_prone_topics",
                            "preferred_modality",
                            "pace_and_time",
                            "recent_progress",
                        )
                    },
                },
                ensure_ascii=False,
            ),
        },
    ]
    try:
        raw = await llm.chat(prompt, temperature=0.35)
        raw = filter_sensitive(raw)
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            return None
        patch = json.loads(match.group())
        if not isinstance(patch, dict):
            return None
    except Exception:
        patch = _rule_profile_patch(question, question_type, topic, ex)

    if not patch:
        return None

    merged = {**ex}
    for key in (
        "knowledge_level",
        "learning_goal",
        "cognitive_style",
        "preferred_modality",
        "pace_and_time",
        "recent_progress",
    ):
        val = patch.get(key)
        if val and str(val).strip() and str(val) not in ("待补充", "未评估", "未设定"):
            merged[key] = str(val)[:200]

    weak = list(merged.get("error_prone_topics") or [])
    for w in patch.get("error_prone_topics") or []:
        w = str(w).strip()[:80]
        if w and w not in weak:
            weak.append(w)
    if topic and topic not in weak and question_type == "practice":
        weak.append(topic)
    merged["error_prone_topics"] = weak[:8]
    merged["user_id"] = user_id
    merged["updated_at"] = datetime.utcnow().isoformat()
    await save_profile(merged)
    return merged


def _rule_profile_patch(
    question: str, question_type: str, topic: str, existing: dict
) -> dict:
    modality = str(existing.get("preferred_modality") or "")
    tags: list[str] = []
    if question_type == "code" and "代码" not in modality:
        tags.append("代码")
    if question_type == "media" and "视频" not in modality:
        tags.append("视频")
    if question_type == "practice" and "练习" not in modality:
        tags.append("练习")
    if question_type == "concept" and "文档" not in modality:
        tags.append("文档")
    new_mod = modality
    if tags:
        new_mod = (modality + "+" + "+".join(tags)) if modality and modality != "未设定" else "+".join(tags)

    return {
        "preferred_modality": new_mod[:120],
        "recent_progress": f"近期在对话中咨询：{topic or question[:40]}（{question_type}）",
        "error_prone_topics": [topic] if question_type == "practice" and topic else [],
    }


async def run_intelligent_chat(
    user_id: str,
    question: str,
    topic: str,
    *,
    profile: dict | None = None,
    resources: list[dict] | None = None,
    deep_thinking: bool = False,
    update_profile: bool = True,
) -> dict[str, Any]:
    """执行完整智能对话管线。"""
    question_type = classify_question_type(question)
    retrieval = await retrieve_resource_library_context(
        user_id, question, resources
    )

    messages, chunks, mode = build_intelligent_chat_messages(
        question=question,
        topic=topic,
        question_type=question_type,
        profile=profile,
        retrieval=retrieval,
        deep_thinking=deep_thinking,
    )

    llm = get_primary_llm()
    raw = await llm.chat(
        messages,
        temperature=chat_temperature(deep_thinking),
        deep_thinking=deep_thinking,
    )
    answer = postprocess_multimodal_answer(
        raw, question_type, chunks, topic, mode=mode
    )

    updated_profile = None
    if update_profile:
        updated_profile = await patch_profile_from_chat(
            user_id, question, question_type, topic, profile
        )

    return {
        "reply": filter_sensitive(answer),
        "profile": updated_profile,
        "question_type": question_type,
        "retrieval_mode": mode,
        "match_score": retrieval.get("match_score", 0),
        "chunks": chunks,
    }


async def prepare_intelligent_chat(
    user_id: str,
    question: str,
    topic: str,
    *,
    profile: dict | None = None,
    resources: list[dict] | None = None,
    deep_thinking: bool = False,
) -> dict[str, Any]:
    """检索 + 构建 LLM 消息（供流式与非流式共用）。"""
    question_type = classify_question_type(question)
    retrieval = await retrieve_resource_library_context(user_id, question, resources)
    messages, chunks, mode = build_intelligent_chat_messages(
        question=question,
        topic=topic,
        question_type=question_type,
        profile=profile,
        retrieval=retrieval,
        deep_thinking=deep_thinking,
    )
    return {
        "question_type": question_type,
        "retrieval": retrieval,
        "messages": messages,
        "chunks": chunks,
        "mode": mode,
    }


async def stream_intelligent_chat(
    user_id: str,
    question: str,
    topic: str,
    *,
    profile: dict | None = None,
    resources: list[dict] | None = None,
    deep_thinking: bool = False,
    update_profile: bool = True,
) -> AsyncIterator[dict[str, Any]]:
    """
    真流式智能对话：逐 token 推送 LLM 输出，结束后补全后处理与画像。
    产出: {"type": "token", "data": str} | {"type": "done", "data": str, "profile": ...}
    """
    from app.core.llm import get_primary_llm

    ctx = await prepare_intelligent_chat(
        user_id, question, topic,
        profile=profile, resources=resources, deep_thinking=deep_thinking,
    )
    question_type = ctx["question_type"]
    chunks = ctx["chunks"]
    mode = ctx["mode"]

    llm = get_primary_llm()
    acc = ""
    try:
        async for token in llm.stream_chat(
            ctx["messages"],
            temperature=chat_temperature(deep_thinking),
            deep_thinking=deep_thinking,
        ):
            acc += token
            yield {"type": "token", "data": token}
    except Exception as exc:
        yield {"type": "error", "data": str(exc)}
        return

    if not acc.strip():
        yield {
            "type": "error",
            "data": "LLM 未返回内容。请检查 .env 中 KIMI_API_KEY，或设置 LLM_MOCK=true 后重启后端。",
        }
        return

    final = postprocess_multimodal_answer(
        acc, question_type, chunks, topic, mode=mode
    )
    if len(final) > len(acc):
        for ch in final[len(acc) :]:
            yield {"type": "token", "data": ch}

    updated_profile = None
    if update_profile:
        updated_profile = await patch_profile_from_chat(
            user_id, question, question_type, topic, profile
        )

    yield {
        "type": "done",
        "data": filter_sensitive(final),
        "profile": updated_profile,
    }

