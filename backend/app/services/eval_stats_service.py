"""学习效果评估：聚合学习数据并生成 AI 建议。"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.core.llm.router import get_primary_llm
from app.core.prompts import eval_advice_system, eval_advice_user_payload
from app.db.repository import (
    get_last_quiz_attempt,
    get_path,
    get_preferences,
    get_profile,
    list_events,
    list_resources_with_meta,
    record_event,
    set_preferences,
)
from app.models.schemas import EvalEvent, EvalStats, RadarData

def _collect_study_dates(events: list, resources: list) -> set[str]:
    dates: set[str] = set()
    for e in events:
        if e.get("created_at"):
            dates.add(str(e["created_at"])[:10])
    for r in resources:
        ts = r.get("created_at", "")
        if ts:
            dates.add(str(ts)[:10])
    return dates


def _compute_study_streak(dates: set[str]) -> tuple[int, bool]:
    if not dates:
        return 0, False
    today = date.today()
    today_str = today.isoformat()
    studied_today = today_str in dates
    streak = 0
    cursor = today if studied_today else today - timedelta(days=1)
    while cursor.isoformat() in dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak, studied_today


def _study_metrics(events: list, resources: list) -> tuple[int, int, bool]:
    dates = _collect_study_dates(events, resources)
    study_days = len(dates) if dates else 0
    streak, studied_today = _compute_study_streak(dates)
    return study_days, streak, studied_today


_PROFILE_DEFAULTS = {
    "knowledge_level": "未评估",
    "learning_goal": "未设定",
    "cognitive_style": "未评估",
    "preferred_modality": "文档+练习",
    "pace_and_time": "未设定",
    "recent_progress": "尚未开始学习",
}


def _profile_completeness(p: dict) -> int:
    if not p:
        return 0
    filled = sum(1 for k, v in _PROFILE_DEFAULTS.items() if p.get(k) and p.get(k) != v)
    bonus = 15 if p.get("error_prone_topics") else 0
    return min(100, int(filled / len(_PROFILE_DEFAULTS) * 85) + bonus)


def _compute_radar(
    p: dict,
    resources: list[dict],
    path: dict | None,
    last_quiz: dict | None,
    events: list[dict],
) -> RadarData:
    before = [40, 35, 45, 50, 30]
    completed = sum(1 for e in events if e.get("event_type") == "resource_complete")
    done_steps = sum(1 for s in (path or {}).get("steps", []) if s.get("status") == "done")
    quiz_pct = 0
    if last_quiz and last_quiz.get("total"):
        quiz_pct = int(last_quiz.get("score", 0) / last_quiz["total"] * 100)
    has_kl = p.get("knowledge_level", "未评估") != "未评估"
    has_goal = p.get("learning_goal", "未设定") != "未设定"
    has_style = p.get("cognitive_style", "未评估") != "未评估"
    has_pace = p.get("pace_and_time", "未设定") != "未设定"

    after = [
        min(95, before[0] + (20 if has_kl else 0) + min(15, quiz_pct // 10)),
        min(95, before[1] + min(25, completed * 8) + min(10, done_steps * 5)),
        min(95, before[2] + (15 if has_style else 0) + (10 if has_goal else 0) + min(10, quiz_pct // 15)),
        min(95, before[3] + (15 if has_pace else 0) + min(10, len(events))),
        min(95, before[4] + min(20, done_steps * 8) + min(15, completed * 3)),
    ]

    return RadarData(
        dimensions=["知识掌握度", "实践能力", "理解深度", "学习效率", "应用迁移"],
        before=before,
        after=after,
    )


def _format_date(ts: str) -> str:
    if not ts:
        return "未知"
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        aware_dt = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        diff = now - aware_dt
        if diff.days == 0:
            return "今天"
        if diff.days == 1:
            return "昨天"
        if diff.days < 7:
            return f"{diff.days} 天前"
        return ts[:10]
    except Exception:
        return str(ts)[:10]


def _compute_events(
    resources: list[dict],
    profile: dict | None,
    last_quiz: dict | None = None,
    learning_events: list[dict] | None = None,
) -> list[EvalEvent]:
    events: list[EvalEvent] = []

    for e in (learning_events or [])[:6]:
        label_map = {
            "resource_view": ("浏览", "cyan"),
            "resource_complete": ("完成", "green"),
            "chat": ("对话", "blue"),
            "quiz_submit": ("测验", "orange"),
            "mastery_feedback": ("掌握度", "purple"),
            "eval_refresh": ("评估", "geekblue"),
            "review_card_generate": ("复习卡", "purple"),
        }
        lbl, color = label_map.get(e.get("event_type", ""), ("学习", "default"))
        meta = e.get("meta") or {}
        if e.get("event_type") == "mastery_feedback":
            label = meta.get("mastery_label") or "掌握度"
            title = meta.get("title") or "学习项"
            content = f"{title} · {label}"
            if meta.get("next_review_at"):
                content += " · 下次复习已安排"
        elif e.get("event_type") == "eval_refresh":
            content = meta.get("summary") or "更新学习效果评估"
        else:
            content = meta.get("title") or e.get("event_type", "学习行为")
        events.append(
            EvalEvent(
                label=lbl,
                color=color,
                content=str(content)[:80],
                date=_format_date(e.get("created_at", "")),
            )
        )

    if last_quiz and not any(e.get("event_type") == "quiz_submit" for e in (learning_events or [])):
        events.append(
            EvalEvent(
                label="测验",
                color="orange",
                content=f"完成测验 {last_quiz.get('score', 0)}/{last_quiz.get('total', 0)}",
                date=_format_date(last_quiz.get("created_at", "")),
            )
        )

    for r in resources[:4]:
        events.append(
            EvalEvent(
                label="生成",
                color="blue",
                content=f"生成资源：{r.get('title', '未命名')}",
                date=_format_date(r.get("created_at", "")),
            )
        )

    if profile:
        events.append(
            EvalEvent(
                label="画像",
                color="green",
                content="更新学习画像",
                date=_format_date(str(profile.get("updated_at", ""))),
            )
        )

    return events


def _rule_based_advice(stats: EvalStats, profile: dict | None) -> tuple[str, str, str]:
    p = profile or {}
    if stats.total_resources == 0:
        summary = "你尚未生成任何学习资源。建议先与 AI 助手对话，构建学习画像并生成首批资源。"
    elif stats.profile_completeness < 50:
        summary = (
            f"当前画像完整度为 {stats.profile_completeness}%，"
            "建议继续补充学习目标、认知风格与时间投入等信息，以便获得更精准的评估。"
        )
    else:
        summary = (
            f"整体表现良好，已生成 {stats.total_resources} 个学习资源，"
            f"画像完整度 {stats.profile_completeness}%，累计学习 {stats.study_days} 天。"
        )

    strengths = (
        "学习画像较完整，资源推荐精准度高。"
        if stats.profile_completeness >= 60
        else "已开始学习，具备初步数据基础。"
    )
    improvements = (
        "继续按路径推进，完成更多资源学习。"
        if stats.has_path
        else "尚未生成学习路径，建议在 AI 助手中规划个性化路径。"
    )

    weak = p.get("error_prone_topics") or []
    if weak:
        improvements += f" 建议重点巩固：{'、'.join(weak[:3])}。"

    recent = p.get("recent_progress") or ""
    if recent and recent != _PROFILE_DEFAULTS["recent_progress"]:
        summary += f" {recent}"

    return summary, strengths, improvements


async def _generate_ai_advice(profile: dict, last_quiz: dict | None) -> str:
    llm = get_primary_llm()
    if llm.use_mock:
        return ""
    try:
        advice = await llm.chat(
            [
                {"role": "system", "content": eval_advice_system(deep=False)},
                {
                    "role": "user",
                    "content": eval_advice_user_payload(profile=profile, last_quiz=last_quiz),
                },
            ],
            temperature=0.55,
            task="eval",
        )
        return advice.strip()
    except Exception:
        return ""


def _attach_cached_advice(stats: EvalStats, cache: dict | None) -> EvalStats:
    if not cache:
        return stats
    return stats.model_copy(
        update={
            "ai_advice": str(cache.get("ai_advice") or stats.ai_advice),
            "strengths": str(cache.get("strengths") or stats.strengths),
            "improvements": str(cache.get("improvements") or stats.improvements),
            "advice_updated_at": str(cache.get("updated_at") or stats.advice_updated_at),
        }
    )


async def build_eval_stats(user_id: str) -> EvalStats:
    profile = await get_profile(user_id)
    resources = list_resources_with_meta(user_id)
    path = await get_path(user_id)
    prefs = await get_preferences(user_id)
    cache = prefs.get("eval_cache") if isinstance(prefs.get("eval_cache"), dict) else None

    total = len(resources)
    by_type: dict[str, int] = {}
    for r in resources:
        t = r.get("type", "doc")
        by_type[t] = by_type.get(t, 0) + 1

    completeness = _profile_completeness(profile or {})
    events = list_events(user_id, limit=100)
    study_days, study_streak, studied_today = _study_metrics(events, resources)

    last_quiz = await get_last_quiz_attempt(user_id)
    radar = _compute_radar(profile or {}, resources, path, last_quiz, events)
    recent_events = _compute_events(resources, profile, last_quiz, events)

    stats = EvalStats(
        total_resources=total,
        resources_by_type=by_type,
        profile_completeness=completeness,
        study_days=study_days,
        study_streak=study_streak,
        studied_today=studied_today,
        has_path=bool(path and path.get("steps")),
        radar=radar,
        recent_events=recent_events,
    )
    summary, strengths, improvements = _rule_based_advice(stats, profile)
    stats = stats.model_copy(
        update={
            "ai_advice": summary,
            "strengths": strengths,
            "improvements": improvements,
        }
    )
    return _attach_cached_advice(stats, cache)


async def refresh_eval_stats(user_id: str) -> EvalStats:
    profile = await get_profile(user_id) or {"user_id": user_id}
    resources = list_resources_with_meta(user_id)
    path = await get_path(user_id)

    total = len(resources)
    by_type: dict[str, int] = {}
    for r in resources:
        t = r.get("type", "doc")
        by_type[t] = by_type.get(t, 0) + 1

    completeness = _profile_completeness(profile)
    events = list_events(user_id, limit=100)
    study_days, study_streak, studied_today = _study_metrics(events, resources)

    last_quiz = await get_last_quiz_attempt(user_id)
    radar = _compute_radar(profile, resources, path, last_quiz, events)
    recent_events = _compute_events(resources, profile, last_quiz, events)

    stats = EvalStats(
        total_resources=total,
        resources_by_type=by_type,
        profile_completeness=completeness,
        study_days=study_days,
        study_streak=study_streak,
        studied_today=studied_today,
        has_path=bool(path and path.get("steps")),
        radar=radar,
        recent_events=recent_events,
    )

    summary, strengths, improvements = _rule_based_advice(stats, profile)
    ai_advice = await _generate_ai_advice(profile, last_quiz)
    if not ai_advice:
        ai_advice = summary

    now = datetime.now(timezone.utc).isoformat()
    await set_preferences(
        user_id,
        {
            "eval_cache": {
                "ai_advice": ai_advice,
                "strengths": strengths,
                "improvements": improvements,
                "updated_at": now,
            }
        },
    )
    await record_event(
        user_id,
        "eval_refresh",
        meta={
            "summary": f"画像完整度 {completeness}% · 资源 {total} 个",
            "profile_completeness": completeness,
            "total_resources": total,
        },
    )

    return stats.model_copy(
        update={
            "ai_advice": ai_advice,
            "strengths": strengths,
            "improvements": improvements,
            "advice_updated_at": now,
        }
    )
