"""重规划参考上下文：四层依据（意图 / 锚点 / 行为 / 画像）与软拦截。"""

from __future__ import annotations

from typing import Any

from app.db.repository import (
    get_preferences,
    get_profile,
    get_realtime_state,
    list_chat_messages,
    list_resources,
)
from app.services.profile_refresh_service import _gather_learning_signals
from app.services.realtime_state_service import default_realtime_state
from app.services.user_defaults import profile_fallback_fields

DEFAULT_REPLAN_REQUEST = (
    "请根据我的学习画像分析报告、保留的学习资源与薄弱点，"
    "重新规划一条高质量、递进清晰、可执行的学习路径。"
    "阶段划分须符合学习规律，每个阶段目标须具体可衡量。"
)

_EMPTY_GOALS = frozenset({"", "未设定", "未明确"})


def _is_meaningful_goal(goal: str | None) -> bool:
    g = (goal or "").strip()
    return bool(g) and g not in _EMPTY_GOALS


def _summarize_intent_messages(user_msgs: list[dict], *, max_turns: int = 8) -> str:
    parts: list[str] = []
    for m in user_msgs[-max_turns:]:
        text = (m.get("content") or "").strip().replace("\n", " ")
        if text:
            parts.append(text[:120])
    return "；".join(parts)


def _library_label(library_id: str | None, library_name: str = "") -> str:
    if library_name:
        return library_name
    if library_id:
        return "已选资料库"
    return ""


async def get_replan_context(
    user_id: str,
    *,
    conversation_id: str | None = None,
    learning_goal: str | None = None,
    library_id: str | None = None,
    library_name: str = "",
    planning_mode: str = "auto",
    planning_requirement: str | None = None,
) -> dict[str, Any]:
    """汇总本次重规划四层依据，供 API 预览与 Job 执行。"""
    profile = await get_profile(user_id) or {}
    fallbacks = profile_fallback_fields(user_id, profile)
    prefs = await get_preferences(user_id)
    starred_ids = set(prefs.get("starred_resource_ids") or [])
    all_resources = await list_resources(user_id)
    kept_resources = [r for r in all_resources if r.get("id") in starred_ids] if starred_ids else []

    intent_signals = await _gather_learning_signals(user_id, conversation_id=conversation_id)
    behavior_signals = await _gather_learning_signals(user_id)

    explicit_goal = (learning_goal or "").strip()
    profile_goal = str(profile.get("learning_goal") or fallbacks.get("learning_goal") or "")
    intent_turns = int(intent_signals.get("chat_turn_count") or 0)
    intent_summary = _summarize_intent_messages(
        [
            m
            for m in (intent_signals.get("chat_samples") or [])
            if (m.get("content") or "").strip()
        ]
    )

    goal_source = "none"
    resolved_goal = ""
    if _is_meaningful_goal(explicit_goal):
        resolved_goal = explicit_goal
        goal_source = "user_input"
    elif _is_meaningful_goal(profile_goal):
        resolved_goal = profile_goal
        goal_source = "profile"
    elif intent_signals.get("topics"):
        resolved_goal = "、".join(intent_signals["topics"][:3])
        goal_source = "conversation_topics"
    elif kept_resources:
        resolved_goal = "、".join(r.get("title", "")[:16] for r in kept_resources[:2] if r.get("title"))
        goal_source = "starred_resources"
    elif _library_label(library_id, library_name):
        resolved_goal = f"围绕资料库「{_library_label(library_id, library_name)}」系统学习"
        goal_source = "library"

    quiz = behavior_signals.get("last_quiz") or {}
    quiz_label = ""
    if quiz.get("total"):
        quiz_label = f"最近测验 {quiz.get('score', 0)}/{quiz.get('total', 0)}"

    chat_label = (
        f"当前会话 {intent_turns} 轮"
        if conversation_id and intent_turns
        else (f"全部会话 {behavior_signals.get('chat_turn_count', 0)} 轮" if behavior_signals.get("chat_turn_count") else "无")
    )

    context = {
        "learning_goal": resolved_goal,
        "goal_source": goal_source,
        "conversation_id": conversation_id or "",
        "chat_basis": chat_label,
        "intent_turn_count": intent_turns,
        "intent_summary": intent_summary[:400],
        "intent_topics": list(intent_signals.get("topics") or [])[:6],
        "starred_count": len(kept_resources),
        "starred_titles": [r.get("title", "") for r in kept_resources[:6]],
        "resource_view_count": int(behavior_signals.get("resource_view_count") or 0),
        "resource_complete_count": int(behavior_signals.get("resource_complete_count") or 0),
        "quiz_summary": quiz_label,
        "library_id": library_id or "",
        "library_name": _library_label(library_id, library_name),
        "planning_mode": planning_mode or "auto",
        "planning_requirement": (planning_requirement or "").strip(),
        "has_l1_intent": bool(intent_turns or _is_meaningful_goal(explicit_goal) or _is_meaningful_goal(profile_goal)),
        "has_l2_anchor": bool(kept_resources or library_id),
        "has_l3_behavior": bool(
            behavior_signals.get("resource_view_count")
            or behavior_signals.get("resource_complete_count")
            or quiz.get("total")
        ),
    }
    context["can_start"] = context["has_l1_intent"] or context["has_l2_anchor"] or context["has_l3_behavior"]
    context["block_reason"] = (
        ""
        if context["can_start"]
        else "缺少规划依据：请先对话说明学习目标，或选择资料库 / 保留收藏资源后再重规划"
    )
    return context


def build_replan_user_request(context: dict[str, Any]) -> str:
    """由四层依据生成 path_node 的 user_request。"""
    parts: list[str] = [DEFAULT_REPLAN_REQUEST]
    goal = (context.get("learning_goal") or "").strip()
    if goal:
        parts.append(f"当前学习目标与主题侧重：{goal}。")
    summary = (context.get("intent_summary") or "").strip()
    if summary:
        parts.append(f"近期对话中的学习诉求摘要：{summary}。")
    topics = context.get("intent_topics") or []
    if topics:
        parts.append(f"对话提取的关注主题：{'、'.join(topics[:5])}。")
    starred = context.get("starred_titles") or []
    if starred:
        parts.append(f"请优先围绕用户收藏的 {len(starred)} 项资源组织路径：{'、'.join(starred[:4])}。")
    lib = context.get("library_name") or ""
    if lib:
        parts.append(f"配套资源生成需结合资料库「{lib}」。")
    mode = str(context.get("planning_mode") or "auto")
    mode_labels = {
        "chapter": "按章节/知识模块划分，章节下可继续拆子路径。",
        "time": "按时间节奏划分，目标中写明每阶段建议时长与复习节奏。",
        "detailed": "生成更细的路径结构，复杂节点必须拆成可执行子步骤。",
        "auto": "由模型按资料结构和学习规律自动决定划分方式。",
    }
    parts.append(f"路径划分偏好：{mode_labels.get(mode, mode_labels['auto'])}")
    requirement = str(context.get("planning_requirement") or "").strip()
    if requirement:
        parts.append(f"用户对路径划分的补充要求：{requirement}。")
    quiz = context.get("quiz_summary") or ""
    if quiz:
        parts.append(f"行为参考：{quiz}；资源浏览 {context.get('resource_view_count', 0)} 次。")
    return "".join(parts)


def filter_realtime_by_evidence(
    realtime: dict[str, Any],
    *,
    chat_samples: list[dict],
    topics: list[str],
    event_titles: list[str] | None = None,
) -> dict[str, Any]:
    """仅保留有聊天/行为证据支撑的 realtime 主题。"""
    evidence_text = " ".join(
        [
            *(m.get("content", "") for m in chat_samples),
            *topics,
            *(event_titles or []),
        ]
    ).lower()

    def _keep_topic(item: str) -> bool:
        t = (item or "").strip()
        if not t:
            return False
        low = evidence_text
        if t.lower() in low:
            return True
        for n in range(min(len(t), 8), 1, -1):
            if t[:n].lower() in low:
                return True
        return False

    out = dict(realtime)
    for key in ("stuck_topics", "curiosity_topics"):
        raw = list(out.get(key) or [])
        out[key] = [t for t in raw if _keep_topic(str(t))][:6]
    return out


async def invalidate_chat_derived_state(
    user_id: str,
    *,
    conversation_id: str | None = None,
) -> None:
    """删聊天后清理无证据的 realtime 衍生字段。"""
    from app.db.repository import save_realtime_state

    remaining = list_chat_messages(user_id, conversation_id=None, limit=300)
    user_msgs = [m for m in remaining if m.get("role") == "user" and (m.get("content") or "").strip()]
    signals = await _gather_learning_signals(user_id)
    previous = await get_realtime_state(user_id) or default_realtime_state(user_id)

    if not user_msgs:
        cleaned = default_realtime_state(user_id)
        cleaned["evidence"] = ["聊天记录已清空，实时状态已重置"]
        await save_realtime_state(cleaned)
        return

    chat_samples = [{"content": (m.get("content") or "")[:400]} for m in user_msgs[-25:]]
    filtered = filter_realtime_by_evidence(
        previous,
        chat_samples=chat_samples,
        topics=list(signals.get("topics") or []),
    )
    filtered["user_id"] = user_id
    filtered["evidence"] = list(dict.fromkeys(
        [*(filtered.get("evidence") or []), "已根据剩余聊天记录刷新实时状态"]
    ))[:8]
    await save_realtime_state(filtered)
