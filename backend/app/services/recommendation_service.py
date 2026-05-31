"""基于画像、路径、对话与行为的 LLM 个性化推荐；失败时回退规则打分。"""

from __future__ import annotations

import json
import re

from app.core.llm import get_aux_llm
from app.core.prompts import recommendation_select_system
from app.db.repository import (
    get_path,
    get_profile,
    list_chat_messages,
    list_events,
    list_resources,
)
from app.models.schemas import ResourceRecommendation

_TYPE_LABEL = {
    "doc": "文档",
    "mindmap": "导图",
    "quiz": "练习",
    "reading": "阅读",
    "media": "视频",
    "code": "代码",
}


def _score_resource(r: dict, profile: dict, completed_ids: set[str]) -> tuple[float, str]:
    if r.get("id") in completed_ids:
        return -1.0, ""
    score = 1.0
    reasons: list[str] = []
    topic = (r.get("topic") or "").lower()
    title = (r.get("title") or "").lower()
    weak = profile.get("error_prone_topics") or []
    for w in weak:
        if w and (w in topic or w in title or w in (r.get("content") or "")[:200]):
            score += 3.0
            reasons.append(f"薄弱点「{w}」")
            break
    modality = profile.get("preferred_modality") or ""
    rtype = r.get("type", "")
    label = _TYPE_LABEL.get(rtype, rtype)
    if label and label in modality:
        score += 1.5
        reasons.append(f"偏好{label}")
    if rtype == "quiz" and weak:
        score += 0.5
    reason = "、".join(reasons) if reasons else "综合推荐"
    return score, reason


def _rule_rank(
    resources: list[dict], profile: dict, completed_ids: set[str], limit: int
) -> list[tuple[float, str, dict]]:
    scored: list[tuple[float, str, dict]] = []
    for r in resources:
        s, reason = _score_resource(r, profile, completed_ids)
        if s >= 0:
            scored.append((s, reason, r))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[:limit]


def _format_user_context(
    *,
    profile: dict,
    path: dict | None,
    events: list[dict],
    messages: list[dict],
    completed_ids: set[str],
) -> str:
    weak = "、".join(profile.get("error_prone_topics") or []) or "无"
    lines = [
        f"知识基础：{profile.get('knowledge_level') or '未知'}",
        f"学习目标：{profile.get('learning_goal') or '掌握课程核心'}",
        f"认知风格：{profile.get('cognitive_style') or '未知'}",
        f"薄弱点：{weak}",
        f"偏好模态：{profile.get('preferred_modality') or '未知'}",
        f"学习节奏：{profile.get('pace_and_time') or '未知'}",
        f"近期进展：{profile.get('recent_progress') or '无'}",
        f"已完成资源数：{len(completed_ids)}",
    ]
    if path and path.get("steps"):
        step_lines = []
        for s in path["steps"][:8]:
            status = s.get("status", "pending")
            step_lines.append(f"- [{status}] {s.get('title', '')}: {s.get('objective', '')[:60]}")
        lines.append("学习路径：\n" + "\n".join(step_lines))
    recent_events = events[:12]
    if recent_events:
        ev = [
            f"- {e.get('event_type', '')} / 资源={e.get('resource_id') or '无'}"
            for e in recent_events
        ]
        lines.append("近期行为：\n" + "\n".join(ev))
    recent_msgs = [m for m in messages if m.get("role") in ("user", "assistant")][-10:]
    if recent_msgs:
        chat = []
        for m in recent_msgs:
            role = "用户" if m.get("role") == "user" else "助手"
            text = (m.get("content") or "").replace("\n", " ")[:120]
            chat.append(f"- {role}：{text}")
        lines.append("近期对话：\n" + "\n".join(chat))
    return "\n".join(lines)


def _format_resource_catalog(resources: list[dict], completed_ids: set[str]) -> str:
    lines: list[str] = []
    for r in resources:
        rid = r.get("id", "")
        rtype = _TYPE_LABEL.get(r.get("type", ""), r.get("type", ""))
        topic = r.get("topic") or ""
        done = "已完成" if rid in completed_ids else "未完成"
        lines.append(
            f"- id={rid}; 标题={r.get('title', '')}; 类型={rtype}; 主题={topic}; 状态={done}"
        )
    return "\n".join(lines) if lines else "（资源库为空）"


async def _llm_select_recommendations(
    *,
    profile: dict,
    resources: list[dict],
    completed_ids: set[str],
    path: dict | None,
    events: list[dict],
    messages: list[dict],
    limit: int,
) -> list[tuple[dict, str, float]] | None:
    aux = get_aux_llm()
    if aux.use_mock or not resources:
        return None

    catalog = _format_resource_catalog(resources, completed_ids)
    context = _format_user_context(
        profile=profile,
        path=path,
        events=events,
        messages=messages,
        completed_ids=completed_ids,
    )
    prompt = [
        {"role": "system", "content": recommendation_select_system()},
        {
            "role": "user",
            "content": (
                f"请从候选中选出最适合今天学习的 {limit} 条资源（可少于 {limit} 条）。\n\n"
                f"【用户数据】\n{context}\n\n"
                f"【候选资源】\n{catalog}"
            ),
        },
    ]
    try:
        raw = await aux.chat(prompt, temperature=0.35)
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            return None
        data = json.loads(match.group())
        items = data.get("items") if isinstance(data, dict) else None
        if not isinstance(items, list):
            return None

        by_id = {r.get("id"): r for r in resources if r.get("id")}
        scored_map = {
            r.get("id"): _score_resource(r, profile, completed_ids)
            for r in resources
            if r.get("id")
        }
        out: list[tuple[dict, str, float]] = []
        seen: set[str] = set()
        for item in items:
            if not isinstance(item, dict):
                continue
            rid = str(item.get("id") or "").strip()
            if not rid or rid in seen or rid in completed_ids:
                continue
            resource = by_id.get(rid)
            if not resource:
                continue
            reason = str(item.get("reason") or "")[:40].strip() or "今日推荐"
            score, _ = scored_map.get(rid, (1.0, ""))
            out.append((resource, reason, score))
            seen.add(rid)
            if len(out) >= limit:
                break
        return out or None
    except Exception:
        return None


async def get_recommendations(user_id: str, limit: int = 5) -> list[ResourceRecommendation]:
    profile = await get_profile(user_id) or {}
    resources = await list_resources(user_id)
    if not resources:
        return []

    events = list_events(user_id, limit=50)
    messages = list_chat_messages(user_id, limit=40)
    path = await get_path(user_id)
    completed_ids = {
        e["resource_id"]
        for e in events
        if e.get("event_type") == "resource_complete" and e.get("resource_id")
    }

    llm_picks = await _llm_select_recommendations(
        profile=profile,
        resources=resources,
        completed_ids=completed_ids,
        path=path,
        events=events,
        messages=messages,
        limit=limit,
    )

    if llm_picks:
        return [
            ResourceRecommendation(
                id=r.get("id", ""),
                type=r.get("type", "doc"),
                title=r.get("title", ""),
                topic=r.get("topic", ""),
                score=round(score, 2),
                reason=reason,
            )
            for r, reason, score in llm_picks
        ]

    top = _rule_rank(resources, profile, completed_ids, limit)
    return [
        ResourceRecommendation(
            id=r.get("id", ""),
            type=r.get("type", "doc"),
            title=r.get("title", ""),
            topic=r.get("topic", ""),
            score=round(s, 2),
            reason=reason,
        )
        for s, reason, r in top
    ]
