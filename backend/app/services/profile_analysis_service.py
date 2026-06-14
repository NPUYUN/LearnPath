"""综合长期画像 + 实时画像 + 行为信号，生成并持久化 AI 可消费的学习者分析报告。"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from app.agents.nodes.profile_agent import _parse_profile_json
from app.core.guardrails import filter_sensitive
from app.core.llm import get_primary_llm
from app.core.prompts import profile_analysis_system, profile_temperature
from app.db.repository import (
    get_learner_analysis,
    get_preferences,
    get_profile,
    get_realtime_state,
    list_resources,
    save_learner_analysis,
)
from app.models.schemas import LearnerProfileAnalysis, PersonalizationStrategy, StudentProfile
from app.services.personalization_strategy_service import (
    build_personalization_strategy,
    format_personalization_strategy_prompt,
)
from app.services.profile_refresh_service import _gather_learning_signals, refresh_profile_from_activity
from app.services.realtime_state_service import default_realtime_state
from app.services.user_defaults import profile_fallback_fields


def _parse_analysis_json(text: str) -> dict[str, Any]:
    parsed = _parse_profile_json(text)
    if not parsed:
        return {}
    for key in ("long_term", "realtime", "behavioral"):
        block = parsed.get(key)
        if not isinstance(block, dict):
            parsed[key] = {}
    for key in ("strengths", "gaps", "risks", "recommended_focus", "planning_hints"):
        if not isinstance(parsed.get(key), list):
            parsed[key] = []
    return parsed


def _rule_based_analysis(
    *,
    user_id: str,
    profile: dict,
    realtime: dict,
    signals: dict[str, Any],
    kept_resources: list[dict],
) -> dict[str, Any]:
    goal = profile.get("learning_goal") or "未明确"
    level = profile.get("knowledge_level") or "未评估"
    style = profile.get("cognitive_style") or "未评估"
    weak = list(profile.get("error_prone_topics") or [])
    progress = profile.get("recent_progress") or "尚无记录"
    emotion = realtime.get("emotion") or "neutral"
    stuck = list(realtime.get("stuck_topics") or [])
    curious = list(realtime.get("curiosity_topics") or [])

    summary = (
        f"学习者当前基础为「{level}」，目标为「{goal}」。"
        f"实时情绪为 {emotion}，近期进度：{progress[:80]}。"
    )
    strengths: list[str] = []
    gaps: list[str] = []
    risks: list[str] = []
    focus: list[str] = []
    hints: list[str] = []

    if signals.get("chat_turn_count", 0) >= 3:
        strengths.append("愿意通过对话主动探索问题")
    if signals.get("resource_view_count", 0) >= 2:
        strengths.append("有持续浏览学习资源的习惯")
    if weak:
        gaps.extend(weak[:4])
        focus.extend(weak[:3])
    if stuck:
        gaps.extend([t for t in stuck[:3] if t not in gaps])
        focus.extend([t for t in stuck[:2] if t not in focus])
    if curious:
        focus.extend([t for t in curious[:2] if t not in focus])
    if emotion in ("frustrated", "anxious", "tired"):
        risks.append(f"当前情绪为 {emotion}，规划时宜控制单阶段负荷")
    if not kept_resources:
        risks.append("保留资源为空，后续需优先生成配套学习材料")
        hints.append("按目标主题从基础到进阶分阶段生成 doc/quiz/reading 资源")
    else:
        hints.append(f"优先围绕已保留的 {len(kept_resources)} 项收藏资源组织路径")
    if signals.get("topics"):
        hints.append(f"结合近期关注主题：{'、'.join(signals['topics'][:3])}")

    return {
        "summary": summary,
        "long_term": {
            "knowledge_assessment": f"综合行为与画像，当前水平判断为：{level}。",
            "goal_clarity": f"学习目标：{goal}。",
            "cognitive_style_notes": f"认知风格倾向：{style}。",
            "error_prone_analysis": (
                f"需重点巩固：{'、'.join(weak)}" if weak else "暂未识别明显易错主题。"
            ),
            "progress_narrative": progress,
        },
        "realtime": {
            "emotional_state": f"当前情绪：{emotion}；隐性描述：{realtime.get('implicit_emotion', '')}。",
            "engagement_notes": f"投入度：{realtime.get('engagement', 'medium')}。",
            "confusion_and_stuck": (
                f"卡点主题：{'、'.join(stuck)}" if stuck else "暂无明确卡点记录。"
            ),
            "curiosity_notes": (
                f"好奇方向：{'、'.join(curious)}" if curious else "暂无突出好奇点。"
            ),
            "cognitive_load_notes": f"认知负荷：{realtime.get('cognitive_load', 'medium')}。",
            "confidence_notes": f"自信程度约 {realtime.get('confidence_level', 0.6)}。",
        },
        "behavioral": {
            "chat_patterns": (
                f"累计 {signals.get('chat_turn_count', 0)} 轮对话；"
                f"近期主题：{'、'.join(signals.get('topics') or []) or '未提取'}"
            ),
            "resource_usage": (
                f"浏览 {signals.get('resource_view_count', 0)} 次、"
                f"完成 {signals.get('resource_complete_count', 0)} 次；"
                f"当前保留资源 {len(kept_resources)} 项"
            ),
            "quiz_performance": (
                f"最近测验 {signals['last_quiz'].get('score', 0)}/{signals['last_quiz'].get('total', 0)}"
                if signals.get("last_quiz")
                else "暂无测验记录"
            ),
            "modality_preference": profile.get("preferred_modality")
            or "+".join(signals.get("modality_hints") or [])
            or "未设定",
        },
        "strengths": strengths[:6],
        "gaps": gaps[:8],
        "risks": risks[:6],
        "recommended_focus": focus[:6],
        "planning_hints": hints[:8],
        "sources": {
            "chat_turns": signals.get("chat_turn_count", 0),
            "resource_views": signals.get("resource_view_count", 0),
            "kept_resources": len(kept_resources),
            "topics": signals.get("topics") or [],
        },
    }


def format_learner_analysis_for_ai(analysis: dict | None) -> str:
    """将分析快照格式化为可直接拼入 LLM prompt 的文本块。"""
    if not analysis:
        return ""

    lines = [
        "【学习者综合画像分析 · 仅供 AI 内部使用】",
        f"总览：{analysis.get('summary', '')}",
    ]

    lt = analysis.get("long_term") or {}
    if any(lt.values()):
        lines.append(
            "长期画像："
            f"基础={lt.get('knowledge_assessment', '')}；"
            f"目标={lt.get('goal_clarity', '')}；"
            f"风格={lt.get('cognitive_style_notes', '')}；"
            f"易错={lt.get('error_prone_analysis', '')}；"
            f"进度={lt.get('progress_narrative', '')}"
        )

    rt = analysis.get("realtime") or {}
    if any(rt.values()):
        lines.append(
            "实时状态："
            f"情绪={rt.get('emotional_state', '')}；"
            f"投入={rt.get('engagement_notes', '')}；"
            f"卡点={rt.get('confusion_and_stuck', '')}；"
            f"好奇={rt.get('curiosity_notes', '')}；"
            f"负荷={rt.get('cognitive_load_notes', '')}"
        )

    beh = analysis.get("behavioral") or {}
    if any(beh.values()):
        lines.append(
            "行为信号："
            f"对话={beh.get('chat_patterns', '')}；"
            f"资源={beh.get('resource_usage', '')}；"
            f"测验={beh.get('quiz_performance', '')}；"
            f"模态偏好={beh.get('modality_preference', '')}"
        )

    for label, key in (
        ("优势", "strengths"),
        ("短板", "gaps"),
        ("风险", "risks"),
        ("建议聚焦", "recommended_focus"),
        ("规划提示", "planning_hints"),
    ):
        items = analysis.get(key) or []
        if items:
            lines.append(f"{label}：{'；'.join(str(x) for x in items[:8])}")

    strategy = analysis.get("personalization_strategy")
    strategy_text = format_personalization_strategy_prompt(strategy)
    if strategy_text:
        lines.append(strategy_text)

    return "\n".join(lines).strip()


def _build_ai_context_brief(analysis_body: dict, strategy: dict) -> str:
    merged = {**analysis_body, "personalization_strategy": strategy}
    return format_learner_analysis_for_ai(merged)


async def analyze_learner_profile(
    user_id: str,
    *,
    deep_thinking: bool = False,
    conversation_id: str | None = None,
) -> dict[str, Any]:
    """刷新长期画像 → 综合推理 → 写入 learner_profile_analyses。"""
    refresh_result = await refresh_profile_from_activity(user_id, deep_thinking=deep_thinking)
    profile = refresh_result.get("profile") or await get_profile(user_id) or {}
    fallbacks = profile_fallback_fields(user_id, profile)

    intent_signals = await _gather_learning_signals(user_id, conversation_id=conversation_id)
    behavior_signals = await _gather_learning_signals(user_id)
    realtime_raw = await get_realtime_state(user_id) or default_realtime_state(user_id)
    from app.services.replan_context_service import filter_realtime_by_evidence

    event_titles = [
        (v.get("title") or "")
        for v in (behavior_signals.get("viewed_resources") or [])
        if v.get("title")
    ]
    realtime_raw = filter_realtime_by_evidence(
        realtime_raw,
        chat_samples=intent_signals.get("chat_samples") or behavior_signals.get("chat_samples") or [],
        topics=list(intent_signals.get("topics") or behavior_signals.get("topics") or []),
        event_titles=event_titles,
    )
    signals = behavior_signals
    prefs = await get_preferences(user_id)
    starred_ids = set(prefs.get("starred_resource_ids") or [])
    all_resources = await list_resources(user_id)
    kept_resources = [r for r in all_resources if r.get("id") in starred_ids] if starred_ids else all_resources

    payload = {
        "long_term_profile": {k: profile.get(k, fallbacks.get(k)) for k in fallbacks},
        "realtime_profile": {
            k: realtime_raw.get(k)
            for k in (
                "emotion",
                "implicit_emotion",
                "engagement",
                "confusion_level",
                "curiosity_level",
                "cognitive_load",
                "cognitive_load_level",
                "frustration_level",
                "confidence_level",
                "initiative_level",
                "curiosity_topics",
                "stuck_topics",
                "language_style",
                "preferred_reply_style",
                "next_best_action",
                "evidence",
            )
        },
        "behavior_signals": {
            "chat_turn_count": signals["chat_turn_count"],
            "chat_samples": signals["chat_samples"][-10:],
            "intent_chat_turn_count": intent_signals.get("chat_turn_count", 0),
            "intent_chat_samples": (intent_signals.get("chat_samples") or [])[-10:],
            "topics": intent_signals.get("topics") or signals["topics"],
            "global_topics": signals["topics"],
            "resource_view_count": signals["resource_view_count"],
            "resource_complete_count": signals["resource_complete_count"],
            "viewed_resources": signals["viewed_resources"][:8],
            "kept_resource_titles": [r.get("title", "") for r in kept_resources[:12]],
            "modality_hints": signals["modality_hints"],
            "last_quiz": signals["last_quiz"],
        },
    }

    llm = get_primary_llm()
    parsed: dict[str, Any] = {}
    if not llm.use_mock:
        try:
            raw = await llm.chat(
                [
                    {"role": "system", "content": profile_analysis_system(deep_thinking)},
                    {
                        "role": "user",
                        "content": json.dumps(payload, ensure_ascii=False, default=str),
                    },
                ],
                temperature=profile_temperature(deep_thinking),
                deep_thinking=deep_thinking,
                task="profile",
            )
            parsed = _parse_analysis_json(filter_sensitive(raw or ""))
        except Exception:
            parsed = {}

    if not parsed.get("summary"):
        parsed = _rule_based_analysis(
            user_id=user_id,
            profile=profile,
            realtime=realtime_raw,
            signals=signals,
            kept_resources=kept_resources,
        )

    strategy = build_personalization_strategy(
        profile=profile,
        realtime_state=realtime_raw,
        question_type="path_planning",
        question="重新规划学习路径",
    )

    analysis_body = {
        "user_id": user_id,
        "summary": parsed.get("summary") or "",
        "long_term": parsed.get("long_term") or {},
        "realtime": parsed.get("realtime") or {},
        "behavioral": parsed.get("behavioral") or {},
        "strengths": list(parsed.get("strengths") or [])[:8],
        "gaps": list(parsed.get("gaps") or [])[:8],
        "risks": list(parsed.get("risks") or [])[:6],
        "recommended_focus": list(parsed.get("recommended_focus") or [])[:8],
        "planning_hints": list(parsed.get("planning_hints") or [])[:10],
        "personalization_strategy": strategy,
        "sources": parsed.get("sources")
        or {
            "chat_turns": signals.get("chat_turn_count", 0),
            "intent_chat_turns": intent_signals.get("chat_turn_count", 0),
            "conversation_id": conversation_id or "",
            "resource_views": signals.get("resource_view_count", 0),
            "kept_resources": len(kept_resources),
            "topics": intent_signals.get("topics") or signals.get("topics") or [],
            "goal_source": "conversation" if intent_signals.get("chat_turn_count") else "profile",
        },
        "updated_at": datetime.utcnow().isoformat(),
    }
    analysis_body["ai_context_brief"] = _build_ai_context_brief(analysis_body, strategy)

    await save_learner_analysis(analysis_body)

    analysis_model = LearnerProfileAnalysis(
        **{
            k: v
            for k, v in analysis_body.items()
            if k in LearnerProfileAnalysis.model_fields
        }
    )
    profile_model = StudentProfile(
        **{k: v for k, v in profile.items() if k in StudentProfile.model_fields}
    )

    return {
        "analysis": analysis_model.model_dump(mode="json"),
        "profile": profile_model.model_dump(mode="json"),
        "message": "已综合长期画像、实时画像与行为信号完成分析并写入系统",
    }


async def get_learner_analysis_brief(user_id: str) -> str:
    row = await get_learner_analysis(user_id)
    if not row:
        return ""
    return str(row.get("ai_context_brief") or format_learner_analysis_for_ai(row))
