"""实时学习状态分析：短期情绪、投入度、好奇点与卡点。"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from app.core.guardrails import filter_sensitive
from app.core.llm import get_primary_llm
from app.core.prompts import realtime_state_analysis_system
from app.db.repository import get_realtime_state, list_chat_messages, save_realtime_state
from app.models.schemas import RealtimeLearningState

KNOWN_TOPICS = (
    "线性回归",
    "逻辑回归",
    "梯度下降",
    "学习率",
    "损失函数",
    "过拟合",
    "欠拟合",
    "正则化",
    "特征工程",
    "决策树",
    "随机森林",
    "机器学习",
    "深度学习",
    "神经网络",
    "Python",
    "数据结构",
    "算法",
)


def default_realtime_state(user_id: str) -> dict[str, Any]:
    return RealtimeLearningState(user_id=user_id).model_dump(mode="json")


async def analyze_realtime_state(
    user_id: str,
    message: str,
    *,
    profile: dict | None = None,
    question_type: str = "general",
    deep_thinking: bool = False,
) -> dict[str, Any]:
    """分析并保存实时画像。快速模式仅用规则；深度思考时再走 LLM 增强。"""
    previous = await get_realtime_state(user_id)
    recent_messages = list_chat_messages(user_id, limit=12)
    rule_state = _rule_analyze(
        user_id,
        message,
        profile=profile,
        previous=previous,
        recent_messages=recent_messages,
        question_type=question_type,
    )
    enhanced = None
    if deep_thinking:
        enhanced = await _llm_enhance(rule_state, message, profile, recent_messages, question_type)
    state = _normalize_state({**(enhanced or {}), **rule_state}, user_id)
    await save_realtime_state(state)
    return state


def _rule_analyze(
    user_id: str,
    message: str,
    *,
    profile: dict | None,
    previous: dict | None,
    recent_messages: list[dict],
    question_type: str,
) -> dict[str, Any]:
    text = (message or "").strip()
    lower = text.lower()
    evidence: list[str] = []
    question_marks = text.count("?") + text.count("？")
    short_utterance = len(text) <= 12

    emotion = "neutral"
    if _has_any(text, "崩溃", "烦", "好难", "太难", "学不会", "看不下去", "服了"):
        emotion = "frustrated"
        evidence.append("出现挫败或抵触表达")
    elif _has_any(text, "不懂", "不会", "看不懂", "搞不清", "迷糊", "困惑", "卡住"):
        emotion = "confused"
        evidence.append("出现困惑或卡住表达")
    elif _has_any(text, "累", "困", "疲惫", "学不动", "没精神", "休息"):
        emotion = "tired"
        evidence.append("出现疲惫表达")
    elif _has_any(text, "焦虑", "来不及", "害怕", "担心", "考试", "急"):
        emotion = "anxious"
        evidence.append("出现压力或时间焦虑表达")
    elif _has_any(text, "有意思", "好奇", "想知道", "深入", "挑战", "继续讲"):
        emotion = "excited"
        evidence.append("出现好奇或探索表达")

    confusion_level = 0.15
    if emotion in ("confused", "frustrated"):
        confusion_level = 0.78 if emotion == "confused" else 0.68
    if _has_any(text, "还是", "反复", "一直", "完全"):
        confusion_level = min(confusion_level + 0.12, 1.0)
        evidence.append("存在重复卡住信号")
    if question_marks >= 2 or _has_any(text, "啊", "咋", "啥意思", "什么意思", "怎么弄"):
        confusion_level = min(confusion_level + 0.1, 1.0)
        evidence.append("语言中有追问或试探求助信号")

    curiosity_level = 0.2
    if _has_any(text, "为什么", "怎么来的", "原理", "本质", "好奇", "深入", "能不能"):
        curiosity_level = 0.72
        evidence.append("出现原因/原理型追问")
    if emotion == "excited":
        curiosity_level = max(curiosity_level, 0.82)

    cognitive_load = "medium"
    cognitive_load_level = 0.52
    if _has_any(text, "抽象", "公式", "推导", "太多", "复杂", "绕"):
        cognitive_load = "high"
        cognitive_load_level = 0.78
        evidence.append("认知负荷偏高")
    elif short_utterance and emotion == "neutral":
        cognitive_load = "low"
        cognitive_load_level = 0.28
    if emotion in ("confused", "frustrated", "anxious"):
        cognitive_load_level = max(cognitive_load_level, 0.68)
    if question_marks >= 2:
        cognitive_load_level = max(cognitive_load_level, 0.72)

    engagement = "medium"
    if emotion == "tired" or _has_any(text, "随便", "算了", "不想学"):
        engagement = "low"
    elif len(text) >= 40 or curiosity_level >= 0.7 or _has_any(text, "继续", "深入", "挑战"):
        engagement = "high"

    frustration_level = 0.12
    if emotion == "frustrated":
        frustration_level = 0.78
    elif emotion == "anxious":
        frustration_level = 0.48
    elif emotion == "confused":
        frustration_level = 0.36
    if _has_any(text, "烦", "服了", "崩溃", "不会了", "学不会"):
        frustration_level = min(frustration_level + 0.15, 1.0)

    confidence_level = 0.62
    if _has_any(text, "懂了", "会了", "可以", "明白", "我试试", "我能"):
        confidence_level = 0.78
    if emotion in ("confused", "frustrated", "anxious"):
        confidence_level = min(confidence_level, 0.42)
    if _has_any(text, "完全不会", "没思路", "不知道", "救救", "懵"):
        confidence_level = min(confidence_level, 0.3)

    initiative_level = 0.5
    if engagement == "high" or _has_any(text, "我想", "我要", "继续", "深入", "挑战", "试试", "能不能"):
        initiative_level = 0.78
    if engagement == "low" or _has_any(text, "随便", "算了", "不想"):
        initiative_level = 0.24

    implicit_emotion = _infer_implicit_emotion(
        text,
        emotion=emotion,
        confusion_level=confusion_level,
        curiosity_level=curiosity_level,
        cognitive_load_level=cognitive_load_level,
        frustration_level=frustration_level,
        confidence_level=confidence_level,
        initiative_level=initiative_level,
    )

    topics = _extract_topics(text)
    stuck_topics = _extract_stuck_topics(text, topics)
    curiosity_topics = _extract_curiosity_topics(text, topics)
    if not stuck_topics and emotion in ("confused", "frustrated") and topics:
        stuck_topics = topics[:3]
    if not curiosity_topics and curiosity_level >= 0.65 and topics:
        curiosity_topics = topics[:3]

    if not topics and previous:
        if emotion in ("confused", "frustrated"):
            stuck_topics = list(previous.get("stuck_topics") or [])[:3]
        if curiosity_level >= 0.65:
            curiosity_topics = list(previous.get("curiosity_topics") or [])[:3]

    language_style = _infer_language_style(text, profile)
    preferred_reply_style = _reply_style_for(text, emotion, cognitive_load, question_type)
    next_best_action = _next_action_for(
        emotion,
        engagement,
        cognitive_load,
        stuck_topics=stuck_topics,
        curiosity_topics=curiosity_topics,
    )

    if recent_messages:
        user_recent = [m for m in recent_messages if m.get("role") == "user"]
        if len(user_recent) >= 3:
            repeated = _repeated_topics(user_recent[-3:])
            for topic in repeated:
                if topic not in stuck_topics and emotion in ("confused", "frustrated"):
                    stuck_topics.append(topic)
                    evidence.append(f"近几轮反复提到「{topic}」")

    return {
        "user_id": user_id,
        "emotion": emotion,
        "implicit_emotion": implicit_emotion,
        "engagement": engagement,
        "confusion_level": round(confusion_level, 2),
        "curiosity_level": round(curiosity_level, 2),
        "cognitive_load_level": round(cognitive_load_level, 2),
        "frustration_level": round(frustration_level, 2),
        "confidence_level": round(confidence_level, 2),
        "initiative_level": round(initiative_level, 2),
        "curiosity_topics": curiosity_topics[:5],
        "stuck_topics": stuck_topics[:5],
        "language_style": language_style,
        "preferred_reply_style": preferred_reply_style,
        "cognitive_load": cognitive_load,
        "next_best_action": next_best_action,
        "confidence": 0.72 if evidence else 0.55,
        "evidence": evidence[:5],
        "updated_at": datetime.utcnow().isoformat(),
    }


async def _llm_enhance(
    rule_state: dict[str, Any],
    message: str,
    profile: dict | None,
    recent_messages: list[dict],
    question_type: str,
) -> dict[str, Any] | None:
    llm = get_primary_llm()
    if getattr(llm, "use_mock", False):
        return None
    payload = {
        "message": message[:800],
        "question_type": question_type,
        "long_term_profile": profile or {},
        "rule_state": rule_state,
        "recent_user_messages": [
            (m.get("content") or "")[:180]
            for m in recent_messages
            if m.get("role") == "user"
        ][-6:],
    }
    try:
        raw = await llm.chat(
            [
                {"role": "system", "content": realtime_state_analysis_system()},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0.2,
            task="realtime_state",
        )
        raw = filter_sensitive(raw)
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            return None
        data = json.loads(match.group())
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _normalize_state(data: dict[str, Any], user_id: str) -> dict[str, Any]:
    allowed_emotions = {"neutral", "confused", "frustrated", "excited", "tired", "anxious"}
    allowed_engagement = {"low", "medium", "high"}
    allowed_load = {"low", "medium", "high"}

    def _float(key: str, default: float) -> float:
        try:
            return max(0.0, min(1.0, float(data.get(key, default))))
        except Exception:
            return default

    def _list(key: str) -> list[str]:
        val = data.get(key) or []
        if not isinstance(val, list):
            return []
        out = []
        for item in val:
            s = str(item).strip()[:80]
            if s and s not in out:
                out.append(s)
        return out[:5]

    normalized = {
        "user_id": user_id,
        "emotion": data.get("emotion") if data.get("emotion") in allowed_emotions else "neutral",
        "implicit_emotion": str(data.get("implicit_emotion") or "平稳专注")[:80],
        "engagement": data.get("engagement") if data.get("engagement") in allowed_engagement else "medium",
        "confusion_level": round(_float("confusion_level", 0.0), 2),
        "curiosity_level": round(_float("curiosity_level", 0.0), 2),
        "cognitive_load_level": round(_float("cognitive_load_level", 0.5), 2),
        "frustration_level": round(_float("frustration_level", 0.0), 2),
        "confidence_level": round(_float("confidence_level", 0.6), 2),
        "initiative_level": round(_float("initiative_level", 0.5), 2),
        "curiosity_topics": _list("curiosity_topics"),
        "stuck_topics": _list("stuck_topics"),
        "language_style": str(data.get("language_style") or "自然口语")[:160],
        "preferred_reply_style": str(data.get("preferred_reply_style") or "结构化说明，配合例子")[:180],
        "cognitive_load": data.get("cognitive_load") if data.get("cognitive_load") in allowed_load else "medium",
        "next_best_action": str(data.get("next_best_action") or "正常回答并给出下一步建议")[:220],
        "confidence": round(_float("confidence", 0.6), 2),
        "evidence": _list("evidence"),
        "updated_at": datetime.utcnow().isoformat(),
    }
    return RealtimeLearningState(**normalized).model_dump(mode="json")


def realtime_state_strategy_hint(state: dict | None) -> str:
    """给 LLM 的实时状态快照。教学动作由 personalization_strategy_service 生成。"""
    if not state:
        return "实时画像：暂无。"
    stuck = "、".join(state.get("stuck_topics") or []) or "暂无"
    curiosity = "、".join(state.get("curiosity_topics") or []) or "暂无"
    return (
        "实时画像："
        f"情绪={state.get('emotion', 'neutral')}；"
        f"隐含情绪={state.get('implicit_emotion', '平稳专注')}；"
        f"投入度={state.get('engagement', 'medium')}；"
        f"困惑强度={state.get('confusion_level', 0)}；"
        f"好奇强度={state.get('curiosity_level', 0)}；"
        f"认知负荷={state.get('cognitive_load', 'medium')}({state.get('cognitive_load_level', 0.5)})；"
        f"受挫={state.get('frustration_level', 0)}；"
        f"信心={state.get('confidence_level', 0.6)}；"
        f"主动性={state.get('initiative_level', 0.5)}；"
        f"卡点={stuck}；"
        f"好奇点={curiosity}。"
    )


def _has_any(text: str, *words: str) -> bool:
    return any(w.lower() in text.lower() for w in words)


def _extract_topics(text: str) -> list[str]:
    topics = [kw for kw in KNOWN_TOPICS if kw.lower() in text.lower() or kw in text]
    for m in re.finditer(r"(?:关于|讲讲|解释|学习|复习|不懂|好奇)([\u4e00-\u9fffA-Za-z0-9]{2,12})", text):
        val = m.group(1).strip("，。！？,.!? ")
        if 2 <= len(val) <= 12 and val not in topics:
            topics.append(val)
    return topics[:6]


def _extract_stuck_topics(text: str, topics: list[str]) -> list[str]:
    stuck: list[str] = []
    for topic in topics:
        if topic in text and re.search(rf"(不懂|不会|卡|看不懂|搞不清|烦|难).{{0,12}}{re.escape(topic)}|{re.escape(topic)}.{{0,12}}(不懂|不会|卡|看不懂|搞不清|烦|难)", text):
            stuck.append(topic)
    return stuck


def _extract_curiosity_topics(text: str, topics: list[str]) -> list[str]:
    curious: list[str] = []
    for topic in topics:
        if topic in text and re.search(rf"(为什么|好奇|想知道|原理|本质|怎么).{{0,16}}{re.escape(topic)}|{re.escape(topic)}.{{0,16}}(为什么|好奇|想知道|原理|本质|怎么)", text):
            curious.append(topic)
    return curious


def _repeated_topics(messages: list[dict]) -> list[str]:
    joined = " ".join(m.get("content", "") for m in messages)
    return [kw for kw in KNOWN_TOPICS if joined.count(kw) >= 2]


def _infer_implicit_emotion(
    text: str,
    *,
    emotion: str,
    confusion_level: float,
    curiosity_level: float,
    cognitive_load_level: float,
    frustration_level: float,
    confidence_level: float,
    initiative_level: float,
) -> str:
    if emotion == "frustrated" or frustration_level >= 0.65:
        return "轻微受挫，期待更换讲法"
    if emotion == "anxious":
        return "急切焦虑，需要明确优先级"
    if emotion == "tired":
        return "低能量疲惫，适合降低任务量"
    if curiosity_level >= 0.72 and initiative_level >= 0.65:
        return "兴奋探索，适合延展挑战"
    if confusion_level >= 0.65 and confidence_level <= 0.45:
        return "迷茫求助，需要先建立把握感"
    if cognitive_load_level >= 0.7:
        return "信息负荷偏高，需要减少密度"
    if "?" in text or "？" in text:
        return "试探求助，等待快速确认"
    if initiative_level >= 0.7:
        return "主动推进，适合给可执行任务"
    return "平稳专注"


def _infer_language_style(text: str, profile: dict | None) -> str:
    hints: list[str] = []
    if _has_any(text, "简单", "通俗", "白话", "别太抽象"):
        hints.append("通俗口语")
    if _has_any(text, "例子", "举例", "案例"):
        hints.append("例子优先")
    if _has_any(text, "代码", "python", "实现"):
        hints.append("代码辅助")
    if _has_any(text, "图", "导图", "画"):
        hints.append("图解辅助")
    if not hints and profile:
        style = str(profile.get("cognitive_style") or "").strip()
        modality = str(profile.get("preferred_modality") or "").strip()
        if style:
            hints.append(style)
        if modality:
            hints.append(modality)
    return "、".join(hints[:3]) if hints else "自然口语"


def _reply_style_for(text: str, emotion: str, cognitive_load: str, question_type: str) -> str:
    if emotion in ("confused", "frustrated") or cognitive_load == "high":
        return "先安抚并确认卡点，再用少公式、类比和最小例子分步解释"
    if emotion == "tired":
        return "缩短回答，给 3 个以内要点和一个 5 分钟小任务"
    if emotion == "anxious":
        return "降低压力，先给清晰步骤和优先级，再补充必要解释"
    if emotion == "excited":
        return "保持探索感，先回答核心问题，再给一个延展挑战"
    if question_type == "code":
        return "先给可运行代码，再解释关键行"
    if question_type == "practice":
        return "按解题步骤拆分，并标注易错点"
    return "结构化说明，配合例子和下一步建议"


def _next_action_for(
    emotion: str,
    engagement: str,
    cognitive_load: str,
    *,
    stuck_topics: list[str],
    curiosity_topics: list[str],
) -> str:
    target = stuck_topics[0] if stuck_topics else (curiosity_topics[0] if curiosity_topics else "当前问题")
    if emotion in ("confused", "frustrated"):
        return f"围绕「{target}」换一种讲法，先建立直觉，再推荐基础图解或练习"
    if emotion == "tired":
        return f"把「{target}」压缩成短总结，并安排一个低负担小任务"
    if emotion == "anxious":
        return f"先给「{target}」的优先级和最短学习路径，减少不确定感"
    if emotion == "excited" or engagement == "high":
        return f"顺着「{target}」补充延展问题，并推荐挑战型资源"
    if cognitive_load == "high":
        return f"降低「{target}」的抽象度，用例子替代大段推导"
    return "正常回答并给出下一步建议"
