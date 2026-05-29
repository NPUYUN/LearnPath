"""依据对话、资源浏览、测验等行为综合刷新学习画像。"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from typing import Any

from app.agents.nodes.profile_agent import _parse_profile_json
from app.core.guardrails import filter_sensitive
from app.core.llm import get_primary_llm
from app.core.prompts import profile_refresh_system, profile_temperature
from app.db.repository import (
    get_last_quiz_attempt,
    get_profile,
    list_chat_messages,
    list_events,
    list_resources_with_meta,
    save_profile,
)
from app.services.user_defaults import profile_fallback_fields


async def _gather_learning_signals(user_id: str) -> dict[str, Any]:
    messages = list_chat_messages(user_id, limit=300)
    user_msgs = [m for m in messages if m.get("role") == "user" and (m.get("content") or "").strip()]
    events = list_events(user_id, limit=80)
    resources = list_resources_with_meta(user_id)
    last_quiz = await get_last_quiz_attempt(user_id)

    view_events = [e for e in events if e.get("event_type") == "resource_view"]
    complete_events = [e for e in events if e.get("event_type") == "resource_complete"]
    res_by_id = {r["id"]: r for r in resources if r.get("id")}

    viewed: list[dict] = []
    for e in view_events[:30]:
        rid = e.get("resource_id") or ""
        meta = res_by_id.get(rid, {})
        viewed.append(
            {
                "title": meta.get("title") or rid or "未知资源",
                "type": meta.get("type") or "",
                "at": e.get("created_at", ""),
            }
        )

    chat_samples = [
        {"content": (m.get("content") or "")[:400], "at": m.get("created_at", "")}
        for m in user_msgs[-25:]
    ]

    topics = _extract_topics_from_chats(user_msgs)
    modality_hints = _infer_modality(user_msgs, resources, viewed)

    return {
        "chat_turn_count": len(user_msgs),
        "chat_samples": chat_samples,
        "topics": topics,
        "resource_view_count": len(view_events),
        "resource_complete_count": len(complete_events),
        "viewed_resources": viewed,
        "owned_resource_count": len(resources),
        "resource_titles": [r.get("title", "") for r in resources[:15]],
        "modality_hints": modality_hints,
        "last_quiz": last_quiz,
        "last_event_at": events[0].get("created_at") if events else "",
    }


def _extract_topics_from_chats(user_msgs: list[dict]) -> list[str]:
    text = " ".join(m.get("content", "") for m in user_msgs[-40:])
    found: list[str] = []
    for kw in (
        "Java",
        "Kotlin",
        "Python",
        "机器学习",
        "线性回归",
        "深度学习",
        "梯度下降",
        "过拟合",
        "数据结构",
        "算法",
    ):
        if kw.lower() in text.lower() or kw in text:
            found.append(kw)
    if not found and user_msgs:
        snippet = user_msgs[-1].get("content", "")[:30]
        if snippet:
            found.append(snippet.replace("\n", " ")[:24])
    return found[:6]


def _infer_modality(
    user_msgs: list[dict],
    resources: list[dict],
    viewed: list[dict],
) -> list[str]:
    text = " ".join(m.get("content", "") for m in user_msgs).lower()
    types = [r.get("type", "") for r in resources] + [v.get("type", "") for v in viewed]
    counter = Counter(types)
    hints: list[str] = []
    if counter.get("code") or "代码" in text or "编程" in text:
        hints.append("代码")
    if counter.get("quiz") or "题" in text or "练习" in text:
        hints.append("练习")
    if counter.get("media") or "视频" in text:
        hints.append("视频")
    if counter.get("mindmap"):
        hints.append("思维导图")
    if counter.get("doc") or counter.get("reading") or not hints:
        hints.append("文档")
    return hints[:4]


def _rule_based_progress(signals: dict[str, Any]) -> str:
    parts: list[str] = []
    if signals["chat_turn_count"]:
        parts.append(f"累计 {signals['chat_turn_count']} 轮智能对话")
    if signals["resource_view_count"]:
        parts.append(f"浏览资源 {signals['resource_view_count']} 次")
    if signals["topics"]:
        parts.append(f"近期关注：{'、'.join(signals['topics'][:3])}")
    if signals["last_quiz"]:
        q = signals["last_quiz"]
        parts.append(f"最近测验 {q.get('score', 0)}/{q.get('total', 0)} 分")
    if signals["viewed_resources"]:
        t = signals["viewed_resources"][0].get("title", "")
        if t:
            parts.append(f"最近学习「{t[:20]}」")
    return "；".join(parts) if parts else "尚无足够学习行为记录"


async def refresh_profile_from_activity(user_id: str, *, deep_thinking: bool = False) -> dict[str, Any]:
    """汇总行为信号 + LLM 综合推理，写入并返回新画像。"""
    existing = await get_profile(user_id) or {}
    fallbacks = profile_fallback_fields(user_id, existing)
    signals = await _gather_learning_signals(user_id)

    if (
        signals["chat_turn_count"] == 0
        and signals["resource_view_count"] == 0
        and not signals["last_quiz"]
    ):
        profile = {
            "user_id": user_id,
            **fallbacks,
            "recent_progress": "暂无对话或资源浏览记录，请先与智能体交流或浏览学习资源",
            "updated_at": datetime.utcnow().isoformat(),
        }
        await save_profile(profile)
        return {
            "profile": profile,
            "message": "暂无足够学习行为，画像保持默认状态",
            "sources": {
                "chat_turns": 0,
                "resource_views": 0,
                "resources_owned": signals["owned_resource_count"],
            },
        }

    llm = get_primary_llm()
    payload = {
        "current_profile": {k: existing.get(k, fallbacks.get(k)) for k in fallbacks},
        "signals": {
            "chat_turn_count": signals["chat_turn_count"],
            "chat_samples": signals["chat_samples"][-12:],
            "topics": signals["topics"],
            "resource_view_count": signals["resource_view_count"],
            "viewed_resources": signals["viewed_resources"][:10],
            "owned_resources": signals["resource_titles"][:12],
            "modality_hints": signals["modality_hints"],
            "last_quiz": signals["last_quiz"],
            "rule_progress_hint": _rule_based_progress(signals),
        },
    }

    prompt = [
        {"role": "system", "content": profile_refresh_system(deep_thinking)},
        {
            "role": "user",
            "content": json.dumps(payload, ensure_ascii=False, default=str),
        },
    ]

    raw = ""
    try:
        raw = await llm.chat(
            prompt,
            temperature=profile_temperature(deep_thinking),
            deep_thinking=deep_thinking,
        )
    except Exception as exc:
        raw = json.dumps(
            {
                **fallbacks,
                "recent_progress": _rule_based_progress(signals),
                "_error": str(exc),
            },
            ensure_ascii=False,
        )

    raw = filter_sensitive(raw)
    parsed = _parse_profile_json(raw)

    error_topics = list(existing.get("error_prone_topics") or [])
    if signals["last_quiz"] and signals["last_quiz"].get("total"):
        score = int(signals["last_quiz"].get("score") or 0)
        total = int(signals["last_quiz"].get("total") or 1)
        if score < total * 0.6 and signals["topics"]:
            for t in signals["topics"][:2]:
                if t not in error_topics:
                    error_topics.append(t)

    profile = {
        "user_id": user_id,
        "knowledge_level": parsed.get("knowledge_level")
        or _infer_knowledge(signals, fallbacks["knowledge_level"]),
        "learning_goal": parsed.get("learning_goal")
        or _infer_goal(signals, fallbacks["learning_goal"]),
        "cognitive_style": parsed.get("cognitive_style") or fallbacks["cognitive_style"],
        "error_prone_topics": parsed.get("error_prone_topics")
        if parsed.get("error_prone_topics")
        else error_topics[:8],
        "preferred_modality": parsed.get("preferred_modality")
        or "+".join(signals["modality_hints"])
        or fallbacks["preferred_modality"],
        "pace_and_time": parsed.get("pace_and_time") or fallbacks["pace_and_time"],
        "recent_progress": parsed.get("recent_progress") or _rule_based_progress(signals),
        "updated_at": datetime.utcnow().isoformat(),
    }

    await save_profile(profile)
    return {
        "profile": profile,
        "message": f"已根据 {signals['chat_turn_count']} 轮对话、"
        f"{signals['resource_view_count']} 次资源浏览等行为更新画像",
        "sources": {
            "chat_turns": signals["chat_turn_count"],
            "resource_views": signals["resource_view_count"],
            "resources_owned": signals["owned_resource_count"],
            "topics": signals["topics"],
        },
    }


def _infer_knowledge(signals: dict[str, Any], default: str) -> str:
    n = signals["chat_turn_count"] + signals["resource_view_count"]
    if n >= 15:
        return "入门偏进阶"
    if n >= 5:
        return "入门"
    if n >= 1:
        return "初学"
    return default


def _infer_goal(signals: dict[str, Any], default: str) -> str:
    if signals["topics"]:
        return f"学习{'、'.join(signals['topics'][:2])}"
    for sample in reversed(signals.get("chat_samples") or []):
        c = sample.get("content", "")
        if len(c) > 4:
            return c[:40].replace("\n", " ")
    return default
