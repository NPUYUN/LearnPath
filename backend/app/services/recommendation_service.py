"""Personalized resource recommendations.

The service ranks existing resources with short-term learning state first, then
falls back to long-term profile, learning path, and behavior signals. When an
auxiliary LLM is available, it can choose from the ranked catalog; rule scoring
still supplies stable ordering and reasons.
"""

from __future__ import annotations

import json
import re

from app.core.llm import get_aux_llm
from app.core.prompts import recommendation_select_system
from app.db.repository import (
    get_path,
    get_profile,
    get_realtime_state,
    list_chat_messages,
    list_events,
    list_resources,
)
from app.models.schemas import ResourceRecommendation
from app.services.personalization_strategy_service import build_personalization_strategy

_TYPE_LABEL = {
    "doc": "讲解文档",
    "mindmap": "思维导图",
    "quiz": "练习题",
    "reading": "拓展阅读",
    "media": "多模态讲解",
    "code": "代码案例",
    "ppt": "课件提纲",
    "design": "设计方案",
    "project": "实践项目",
}

_UNBLOCK_TYPES = {"mindmap": 2.2, "doc": 1.8, "media": 1.5}
_LIGHT_TYPES = {"mindmap": 1.4, "media": 1.1, "reading": 0.9, "doc": 0.7}
_EXPLORE_TYPES = {"code": 1.5, "project": 1.4, "reading": 1.2, "design": 1.0, "quiz": 0.7}


def _as_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _num(value: object, default: float = 0.0) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _resource_text(resource: dict) -> str:
    return " ".join(
        [
            str(resource.get("title") or ""),
            str(resource.get("topic") or ""),
            str(resource.get("content") or "")[:600],
        ]
    ).lower()


def _first_match(needles: list[str], text: str) -> str:
    for item in needles:
        needle = item.lower()
        if needle and needle in text:
            return item
    return ""


def _active_path_context(path: dict | None) -> tuple[set[str], list[str]]:
    steps = (path or {}).get("steps") or []
    active = next((step for step in steps if step.get("status") == "in_progress"), None)
    if active is None:
        active = next((step for step in steps if step.get("status") == "pending"), None)
    if not active:
        return set(), []
    ids = {str(x) for x in active.get("resource_ids") or [] if x}
    terms = [
        str(active.get("title") or "").strip(),
        str(active.get("objective") or "").strip(),
    ]
    return ids, [x for x in terms if x]


def _add_reason(reasons: list[str], reason: str) -> None:
    if reason and reason not in reasons:
        reasons.append(reason)


def _reason(reasons: list[str], *, realtime_state: dict | None, resource_type: str) -> str:
    if reasons:
        return "，".join(reasons[:2])
    state = realtime_state or {}
    if state.get("cognitive_load") == "high" or state.get("emotion") in ("confused", "frustrated"):
        return "先降低理解负荷"
    if _num(state.get("curiosity_level")) >= 0.65:
        return "顺着好奇点拓展"
    return f"适合用{_TYPE_LABEL.get(resource_type, '资源')}推进"


def _score_resource(
    resource: dict,
    profile: dict,
    completed_ids: set[str],
    *,
    realtime_state: dict | None = None,
    path: dict | None = None,
    strategy: dict | None = None,
) -> tuple[float, str]:
    if resource.get("id") in completed_ids:
        return -1.0, ""

    score = 1.0
    reasons: list[str] = []
    resource_id = str(resource.get("id") or "")
    resource_type = str(resource.get("type") or "")
    text = _resource_text(resource)
    state = realtime_state or {}

    active_ids, active_terms = _active_path_context(path)
    if resource_id in active_ids:
        score += 2.0
        _add_reason(reasons, "贴合当前路径")
    elif _first_match(active_terms, text):
        score += 0.9
        _add_reason(reasons, "靠近当前阶段")

    stuck_topics = _as_list(state.get("stuck_topics"))
    curiosity_topics = _as_list(state.get("curiosity_topics"))
    weak_topics = _as_list(profile.get("error_prone_topics"))

    stuck = _first_match(stuck_topics, text)
    if stuck:
        score += 4.0
        _add_reason(reasons, f"对准当前卡点：{stuck[:12]}")
    else:
        weak = _first_match(weak_topics, text)
        if weak:
            score += 2.4
            _add_reason(reasons, f"补强薄弱点：{weak[:12]}")

    curious = _first_match(curiosity_topics, text)
    if curious and curious != stuck:
        score += 2.1
        _add_reason(reasons, f"回应好奇点：{curious[:12]}")

    strategy = strategy or build_personalization_strategy(
        profile=profile,
        realtime_state=state,
        question_type="resource_recommendation",
    )
    preferred_types = _as_list(strategy.get("preferred_resource_types"))
    avoid_types = set(_as_list(strategy.get("avoid_resource_types")))
    if resource_type in preferred_types:
        index = preferred_types.index(resource_type)
        score += max(0.6, 1.7 - index * 0.25)
        _add_reason(reasons, "适合此刻节奏")
    if resource_type in avoid_types:
        score -= 2.2

    modality = str(profile.get("preferred_modality") or "")
    label = _TYPE_LABEL.get(resource_type, resource_type)
    if label and label in modality:
        score += 1.1
        _add_reason(reasons, f"符合偏好模态：{label}")

    emotion = state.get("emotion", "neutral")
    engagement = state.get("engagement", "medium")
    load = state.get("cognitive_load", "medium")
    confusion = _num(state.get("confusion_level"))
    curiosity_level = _num(state.get("curiosity_level"))

    if emotion in ("confused", "frustrated", "anxious") or load == "high" or confusion >= 0.65:
        if resource_type in _UNBLOCK_TYPES:
            score += _UNBLOCK_TYPES[resource_type]
            _add_reason(reasons, "先降低理解负荷")
        if resource_type in ("project", "design", "code"):
            score -= 1.4
        if resource_type == "quiz":
            score += 0.4 if (stuck or _first_match(weak_topics, text)) else -0.6
    elif emotion == "tired" or engagement == "low":
        if resource_type in _LIGHT_TYPES:
            score += _LIGHT_TYPES[resource_type]
            _add_reason(reasons, "轻量复习更合适")
        if resource_type in ("project", "design", "code"):
            score -= 0.8
    elif emotion == "excited" or engagement == "high" or curiosity_level >= 0.7:
        if resource_type in _EXPLORE_TYPES:
            score += _EXPLORE_TYPES[resource_type]
            _add_reason(reasons, "适合继续探索")

    return score, _reason(reasons, realtime_state=state, resource_type=resource_type)


def _rule_rank(
    resources: list[dict],
    profile: dict,
    completed_ids: set[str],
    limit: int,
    *,
    realtime_state: dict | None = None,
    path: dict | None = None,
    strategy: dict | None = None,
) -> list[tuple[float, str, dict]]:
    scored: list[tuple[float, str, dict]] = []
    for resource in resources:
        score, reason = _score_resource(
            resource,
            profile,
            completed_ids,
            realtime_state=realtime_state,
            path=path,
            strategy=strategy,
        )
        if score >= 0:
            scored.append((score, reason, resource))
    scored.sort(key=lambda item: (item[0], str(item[2].get("title") or "")), reverse=True)
    return scored[:limit]


def _rotate_ranked_candidates(
    ranked: list[tuple[float, str, dict]],
    *,
    limit: int,
    offset: int,
) -> list[tuple[float, str, dict]]:
    if not ranked:
        return []
    start = (max(0, offset) * limit) % len(ranked)
    rotated = ranked[start:] + ranked[:start]
    return rotated[:limit]


def _format_user_context(
    *,
    profile: dict,
    path: dict | None,
    events: list[dict],
    messages: list[dict],
    completed_ids: set[str],
    realtime_state: dict | None = None,
    strategy: dict | None = None,
) -> str:
    state = realtime_state or {}
    strategy = strategy or {}
    weak = "、".join(_as_list(profile.get("error_prone_topics"))) or "无"
    stuck = "、".join(_as_list(state.get("stuck_topics"))) or "无"
    curious = "、".join(_as_list(state.get("curiosity_topics"))) or "无"
    preferred = "、".join(_as_list(strategy.get("preferred_resource_types"))) or "无特别偏好"
    avoid = "、".join(_as_list(strategy.get("avoid_resource_types"))) or "无"
    focus = "、".join(_as_list(strategy.get("focus_topics"))) or "当前学习主题"

    lines = [
        f"知识基础：{profile.get('knowledge_level') or '未知'}",
        f"学习目标：{profile.get('learning_goal') or '掌握课程核心'}",
        f"认知风格：{profile.get('cognitive_style') or '未知'}",
        f"长期薄弱点：{weak}",
        f"偏好模态：{profile.get('preferred_modality') or '未知'}",
        f"学习节奏：{profile.get('pace_and_time') or '未知'}",
        f"近期进展：{profile.get('recent_progress') or '无'}",
        f"已完成资源数：{len(completed_ids)}",
        (
            "实时画像："
            f"情绪={state.get('emotion', 'neutral')}；"
            f"投入={state.get('engagement', 'medium')}；"
            f"认知负荷={state.get('cognitive_load', 'medium')}；"
            f"当前卡点={stuck}；当前好奇点={curious}"
        ),
        f"推荐策略：聚焦={focus}；优先资源类型={preferred}；避免资源类型={avoid}",
    ]

    if path and path.get("steps"):
        step_lines = []
        for step in path["steps"][:8]:
            status = step.get("status", "pending")
            step_lines.append(f"- [{status}] {step.get('title', '')}: {str(step.get('objective', ''))[:60]}")
        lines.append("学习路径：\n" + "\n".join(step_lines))

    recent_events = events[:12]
    if recent_events:
        event_lines = [
            f"- {event.get('event_type', '')} / 资源={event.get('resource_id') or '无'}"
            for event in recent_events
        ]
        lines.append("近期行为：\n" + "\n".join(event_lines))

    recent_msgs = [msg for msg in messages if msg.get("role") in ("user", "assistant")][-10:]
    if recent_msgs:
        chat_lines = []
        for msg in recent_msgs:
            role = "用户" if msg.get("role") == "user" else "助手"
            text = (msg.get("content") or "").replace("\n", " ")[:120]
            chat_lines.append(f"- {role}：{text}")
        lines.append("近期对话：\n" + "\n".join(chat_lines))

    return "\n".join(lines)


def _format_resource_catalog(
    resources: list[dict],
    completed_ids: set[str],
    scored_map: dict[str, tuple[float, str]],
) -> str:
    lines: list[str] = []
    for resource in resources:
        resource_id = resource.get("id", "")
        resource_type = _TYPE_LABEL.get(resource.get("type", ""), resource.get("type", ""))
        topic = resource.get("topic") or ""
        done = "已完成" if resource_id in completed_ids else "未完成"
        score, reason = scored_map.get(resource_id, (0.0, ""))
        lines.append(
            f"- id={resource_id}; 标题={resource.get('title', '')}; 类型={resource_type}; "
            f"主题={topic}; 状态={done}; 规则分={score:.2f}; 规则理由={reason}"
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
    realtime_state: dict | None,
    strategy: dict | None,
    limit: int,
) -> list[tuple[dict, str, float]] | None:
    aux = get_aux_llm()
    if aux.use_mock or not resources:
        return None

    scored_map = {
        resource.get("id"): _score_resource(
            resource,
            profile,
            completed_ids,
            realtime_state=realtime_state,
            path=path,
            strategy=strategy,
        )
        for resource in resources
        if resource.get("id")
    }
    ranked_resources = [
        item[2]
        for item in _rule_rank(
            resources,
            profile,
            completed_ids,
            min(max(limit * 3, 8), 24),
            realtime_state=realtime_state,
            path=path,
            strategy=strategy,
        )
    ]

    catalog = _format_resource_catalog(ranked_resources, completed_ids, scored_map)
    context = _format_user_context(
        profile=profile,
        path=path,
        events=events,
        messages=messages,
        completed_ids=completed_ids,
        realtime_state=realtime_state,
        strategy=strategy,
    )
    prompt = [
        {"role": "system", "content": recommendation_select_system()},
        {
            "role": "user",
            "content": (
                f"请从候选中选出最适合学生此刻学习的 {limit} 条资源，可以少于 {limit} 条。\n\n"
                f"【用户数据】\n{context}\n\n"
                f"【候选资源】\n{catalog}"
            ),
        },
    ]

    try:
        raw = await aux.chat(prompt, temperature=0.25)
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            return None
        data = json.loads(match.group())
        items = data.get("items") if isinstance(data, dict) else None
        if not isinstance(items, list):
            return None

        by_id = {resource.get("id"): resource for resource in resources if resource.get("id")}
        out: list[tuple[dict, str, float]] = []
        seen: set[str] = set()
        for item in items:
            if not isinstance(item, dict):
                continue
            resource_id = str(item.get("id") or "").strip()
            if not resource_id or resource_id in seen or resource_id in completed_ids:
                continue
            resource = by_id.get(resource_id)
            if not resource:
                continue
            score, fallback_reason = scored_map.get(resource_id, (1.0, ""))
            reason = str(item.get("reason") or "").strip()[:40] or fallback_reason or "当前推荐"
            out.append((resource, reason, score))
            seen.add(resource_id)
            if len(out) >= limit:
                break
        return out or None
    except Exception:
        return None


async def get_recommendations(
    user_id: str,
    limit: int = 5,
    *,
    refresh: bool = False,
    offset: int = 0,
) -> list[ResourceRecommendation]:
    limit = max(1, min(limit, 10))
    profile = await get_profile(user_id) or {}
    resources = await list_resources(user_id)
    if not resources:
        return []

    events = list_events(user_id, limit=50)
    messages = list_chat_messages(user_id, limit=40)
    path = await get_path(user_id)
    realtime_state = await get_realtime_state(user_id)
    completed_ids = {
        event["resource_id"]
        for event in events
        if event.get("event_type") == "resource_complete" and event.get("resource_id")
    }
    strategy = build_personalization_strategy(
        profile=profile,
        realtime_state=realtime_state,
        question_type="resource_recommendation",
    )

    if refresh:
        candidate_limit = min(len(resources), max(limit * 4, limit))
        ranked = _rule_rank(
            resources,
            profile,
            completed_ids,
            candidate_limit,
            realtime_state=realtime_state,
            path=path,
            strategy=strategy,
        )
        picks = [
            (resource, reason, score)
            for score, reason, resource in _rotate_ranked_candidates(
                ranked,
                limit=limit,
                offset=offset,
            )
        ]
    else:
        llm_picks = await _llm_select_recommendations(
            profile=profile,
            resources=resources,
            completed_ids=completed_ids,
            path=path,
            events=events,
            messages=messages,
            realtime_state=realtime_state,
            strategy=strategy,
            limit=limit,
        )

        picks = llm_picks or [
            (resource, reason, score)
            for score, reason, resource in _rule_rank(
                resources,
                profile,
                completed_ids,
                limit,
                realtime_state=realtime_state,
                path=path,
                strategy=strategy,
            )
        ]

    return [
        ResourceRecommendation(
            id=resource.get("id", ""),
            type=resource.get("type", "doc"),
            title=resource.get("title", ""),
            topic=resource.get("topic", ""),
            score=round(score, 2),
            reason=reason,
        )
        for resource, reason, score in picks
    ]
