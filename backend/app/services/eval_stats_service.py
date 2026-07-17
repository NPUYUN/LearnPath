"""学习效果评估：聚合学习数据并生成 AI 建议。"""

from __future__ import annotations

import uuid
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
    save_resources,
    set_preferences,
)
from app.models.schemas import EvalEvent, EvalStats, PressureBalance, RadarData, TrendPoint
from app.services.resource_metadata_service import build_resource_metadata


def _parse_iso_dt(raw: str) -> datetime | None:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _estimate_minutes(resource: dict) -> int:
    metadata = resource.get("metadata") or {}
    value = metadata.get("estimated_minutes") or resource.get("estimated_minutes") or 8
    try:
        return max(4, min(30, int(value)))
    except Exception:
        return 8


def _next_seven_labels() -> list[str]:
    today = date.today()
    labels: list[str] = []
    for offset in range(7):
        current = today + timedelta(days=offset)
        if offset == 0:
            labels.append("今天")
        elif offset == 1:
            labels.append("明天")
        else:
            labels.append(f"{current.month}/{current.day}")
    return labels


def _build_review_trends(resources: list[dict], prefs: dict | None) -> tuple[list[TrendPoint], list[TrendPoint], list[TrendPoint], PressureBalance]:
    resource_minutes = {row.get("id"): _estimate_minutes(row) for row in resources}
    mastery_records = prefs.get("mastery_records") if isinstance(prefs, dict) else {}
    records = list(mastery_records.values()) if isinstance(mastery_records, dict) else []
    today = date.today()
    labels = _next_seven_labels()
    risk_rows: list[TrendPoint] = []
    pressure_rows: list[TrendPoint] = []
    retention_rows: list[TrendPoint] = []
    total_records = max(1, len(records))

    for offset, label in enumerate(labels):
        current_day = today + timedelta(days=offset)
        due_weight = 0
        due_minutes = 0
        retention_values: list[int] = []
        for record in records:
            next_review = _parse_iso_dt(str(record.get("next_review_at") or ""))
            updated_at = _parse_iso_dt(str(record.get("updated_at") or "")) or datetime.now(timezone.utc)
            resource_id = str(record.get("resource_id") or "")
            interval_days = max(1, int(record.get("interval_days") or 3))
            level = str(record.get("level") or "fuzzy")
            level_score = {"forgot": 42, "fuzzy": 66, "mastered": 86}.get(level, 60)
            if next_review and next_review.date() <= current_day:
                due_weight += 1
            if next_review and next_review.date() == current_day:
                due_minutes += resource_minutes.get(resource_id, 8)

            elapsed = max(0, (datetime.combine(current_day, datetime.min.time(), tzinfo=timezone.utc) - updated_at).days)
            decay = min(40, int(elapsed / interval_days * (16 if level == "forgot" else 10 if level == "fuzzy" else 7)))
            if next_review and next_review.date() < current_day:
                decay += 6
            retention_values.append(max(28, min(96, level_score - decay)))

        risk_rows.append(
            TrendPoint(label=label, value=min(100, int(due_weight / total_records * 100)))
        )
        pressure_rows.append(TrendPoint(label=label, value=min(90, due_minutes)))
        retention_rows.append(
            TrendPoint(
                label=label,
                value=int(sum(retention_values) / len(retention_values)) if retention_values else 65,
            )
        )

    due_today = records and sum(
        1 for record in records if (_parse_iso_dt(str(record.get("next_review_at") or "")) or datetime.max.replace(tzinfo=timezone.utc)).date() <= today
    ) or 0
    due_soon = records and sum(
        1
        for record in records
        if (_parse_iso_dt(str(record.get("next_review_at") or "")) or datetime.max.replace(tzinfo=timezone.utc)).date()
        <= (today + timedelta(days=2))
    ) or 0
    today_pressure = pressure_rows[0].value if pressure_rows else 0
    if due_today >= 3 or today_pressure >= 24:
        mode = "review_heavy"
        summary = "今日待复习较多，建议先清复习队列，再开启新内容。"
        review_minutes = max(18, today_pressure or 18)
        new_minutes = 8
    elif due_today == 0 and due_soon <= 1:
        mode = "new_learning"
        summary = "今日复习压力较轻，可以把更多时间放在新内容推进。"
        review_minutes = 6
        new_minutes = 18
    else:
        mode = "balanced"
        summary = "今日节奏较均衡，建议复习与新学并行推进。"
        review_minutes = max(10, min(16, today_pressure or 10))
        new_minutes = 12

    return (
        risk_rows,
        pressure_rows,
        retention_rows,
        PressureBalance(
            mode=mode,
            due_today=due_today,
            due_soon=due_soon,
            recommended_review_minutes=review_minutes,
            recommended_new_minutes=new_minutes,
            summary=summary,
        ),
    )

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


def _path_progress_summary(path: dict | None) -> str:
    steps = (path or {}).get("steps") or []
    if not steps:
        return ""
    done = sum(1 for step in steps if step.get("status") == "done")
    active = next((step for step in steps if step.get("status") == "in_progress"), None)
    if active:
        return f"当前路径已完成 {done}/{len(steps)} 个阶段，正在学习「{active.get('title') or '当前阶段'}」。"
    if done == len(steps):
        return f"当前路径 {len(steps)} 个阶段已全部完成。"
    return f"当前路径已完成 {done}/{len(steps)} 个阶段，下一阶段尚未开始。"


def _advice_context_key(
    profile: dict | None,
    resources: list[dict],
    path: dict | None,
    last_quiz: dict | None,
) -> str:
    profile_data = profile or {}
    profile_marker = tuple(
        str(profile_data.get(key) or "")
        for key in (*_PROFILE_DEFAULTS.keys(), "updated_at")
    )
    resource_marker = tuple(
        sorted(
            (
                str(resource.get("id") or ""),
                str(resource.get("status") or ""),
                str(resource.get("updated_at") or resource.get("created_at") or ""),
            )
            for resource in resources
        )
    )
    path_marker = tuple(
        (
            str(step.get("id") or step.get("order") or ""),
            str(step.get("title") or ""),
            str(step.get("status") or ""),
        )
        for step in (path or {}).get("steps", [])
    )
    quiz_marker = (
        str((last_quiz or {}).get("id") or ""),
        str((last_quiz or {}).get("score") or ""),
        str((last_quiz or {}).get("total") or ""),
        str((last_quiz or {}).get("created_at") or ""),
    )
    raw = repr((profile_marker, resource_marker, path_marker, quiz_marker))
    return uuid.uuid5(uuid.NAMESPACE_URL, raw).hex


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
        content_map = {
            "resource_view": "浏览学习资源",
            "resource_complete": "完成学习资源",
            "chat": "与智能学习助手对话",
            "quiz_submit": "提交学习测验",
            "review_card_generate": "生成复习卡",
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
            content = meta.get("title") or content_map.get(e.get("event_type", ""), "记录学习行为")
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


def _rule_based_advice(
    stats: EvalStats,
    profile: dict | None,
    path: dict | None,
) -> tuple[str, str, str]:
    p = profile or {}
    if stats.total_resources == 0:
        summary = "你尚未生成任何学习资源。建议先与 AI 助手对话，构建学习画像并生成首批资源。"
    elif stats.profile_completeness < 50:
        summary = (
            f"当前画像字段覆盖率为 {stats.profile_completeness}%，"
            "建议继续补充学习目标、认知风格与时间投入等信息，以便获得更精准的评估。"
        )
    else:
        summary = (
            f"整体表现良好，已生成 {stats.total_resources} 个学习资源，"
            f"画像字段覆盖率 {stats.profile_completeness}%，累计学习 {stats.study_days} 天。"
        )

    strengths = (
        "学习画像字段覆盖较完整，已具备个性化推荐的数据基础。"
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

    path_summary = _path_progress_summary(path)
    if path_summary:
        summary += f" {path_summary}"

    return summary, strengths, improvements


async def _generate_ai_advice(
    profile: dict,
    last_quiz: dict | None,
    path: dict | None,
) -> str:
    llm = get_primary_llm()
    if llm.use_mock:
        return ""
    try:
        advice_profile = dict(profile)
        path_summary = _path_progress_summary(path)
        if path_summary:
            advice_profile["recent_progress"] = path_summary
        advice = await llm.chat(
            [
                {"role": "system", "content": eval_advice_system(deep=False)},
                {
                    "role": "user",
                    "content": eval_advice_user_payload(profile=advice_profile, last_quiz=last_quiz),
                },
            ],
            temperature=0.55,
            task="eval",
        )
        return advice.strip()
    except Exception:
        return ""


def _attach_cached_advice(
    stats: EvalStats,
    cache: dict | None,
    context_key: str,
) -> EvalStats:
    if not cache or cache.get("context_key") != context_key:
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
    context_key = _advice_context_key(profile, resources, path, last_quiz)
    radar = _compute_radar(profile or {}, resources, path, last_quiz, events)
    recent_events = _compute_events(resources, profile, last_quiz, events)
    forgetting_risk, review_pressure, retention_curve, pressure_balance = _build_review_trends(
        resources,
        prefs,
    )

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
        forgetting_risk=forgetting_risk,
        review_pressure=review_pressure,
        retention_curve=retention_curve,
        pressure_balance=pressure_balance,
    )
    summary, strengths, improvements = _rule_based_advice(stats, profile, path)
    stats = stats.model_copy(
        update={
            "ai_advice": summary,
            "strengths": strengths,
            "improvements": improvements,
        }
    )
    return _attach_cached_advice(stats, cache, context_key)


async def refresh_eval_stats(user_id: str) -> EvalStats:
    profile = await get_profile(user_id) or {"user_id": user_id}
    resources = list_resources_with_meta(user_id)
    path = await get_path(user_id)
    prefs = await get_preferences(user_id)

    total = len(resources)
    by_type: dict[str, int] = {}
    for r in resources:
        t = r.get("type", "doc")
        by_type[t] = by_type.get(t, 0) + 1

    completeness = _profile_completeness(profile)
    events = list_events(user_id, limit=100)
    study_days, study_streak, studied_today = _study_metrics(events, resources)

    last_quiz = await get_last_quiz_attempt(user_id)
    context_key = _advice_context_key(profile, resources, path, last_quiz)
    radar = _compute_radar(profile, resources, path, last_quiz, events)
    recent_events = _compute_events(resources, profile, last_quiz, events)
    forgetting_risk, review_pressure, retention_curve, pressure_balance = _build_review_trends(
        resources,
        prefs,
    )

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
        forgetting_risk=forgetting_risk,
        review_pressure=review_pressure,
        retention_curve=retention_curve,
        pressure_balance=pressure_balance,
    )

    summary, strengths, improvements = _rule_based_advice(stats, profile, path)
    ai_advice = await _generate_ai_advice(profile, last_quiz, path)
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
                "context_key": context_key,
            }
        },
    )
    await record_event(
        user_id,
        "eval_refresh",
        meta={
            "summary": f"画像字段覆盖率 {completeness}% · 资源 {total} 个",
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


def _flatten_steps(steps: list[dict]) -> list[dict]:
    out: list[dict] = []
    for step in steps:
        out.append(step)
        out.extend(_flatten_steps(step.get("substeps") or []))
    return out


def _weekly_review_markdown(
    *,
    user_id: str,
    stats: EvalStats,
    profile: dict,
    path: dict | None,
    resources: list[dict],
    events: list[dict],
) -> str:
    today = datetime.now(timezone.utc)
    week_start = (today - timedelta(days=6)).date().isoformat()
    week_end = today.date().isoformat()
    flat_steps = _flatten_steps((path or {}).get("steps") or [])
    done_steps = [step for step in flat_steps if step.get("status") == "done"]
    in_progress = [step for step in flat_steps if step.get("status") == "in_progress"]
    recent_resources = resources[-5:] if len(resources) > 5 else resources
    recent_resources = list(reversed(recent_resources))
    weak_topics = list(profile.get("error_prone_topics") or [])[:5]
    quiz_topics: list[str] = []
    for event in events:
        meta = event.get("meta") or {}
        if event.get("event_type") == "quiz_submit":
            quiz_topics.extend(meta.get("wrong_topics") or meta.get("knowledge_points") or [])
    wrong_topics = list(dict.fromkeys([*quiz_topics, *weak_topics]))[:5]

    progress_line = (
        f"- 路径状态：已完成 {len(done_steps)} / {len(flat_steps)} 个学习节点"
        if flat_steps
        else "- 路径状态：本周尚未生成正式学习路径"
    )
    active_line = (
        f"- 当前进行中：{'、'.join(str(step.get('title') or '未命名节点') for step in in_progress[:3])}"
        if in_progress
        else "- 当前进行中：暂无明确进行中的节点"
    )

    resource_lines = (
        "\n".join(
            f"- {row.get('title', '未命名资源')}（{row.get('type', 'doc')} · {str(row.get('created_at') or '')[:10]}）"
            for row in recent_resources
        )
        if recent_resources
        else "- 本周暂无新增学习资源"
    )
    event_lines = (
        "\n".join(
            f"- {event.get('event_type', 'study')}：{(event.get('meta') or {}).get('title') or (event.get('meta') or {}).get('summary') or '已记录学习行为'}"
            for event in events[:6]
        )
        if events
        else "- 本周暂无可汇总的学习记录"
    )
    wrong_topic_line = "、".join(wrong_topics) if wrong_topics else "暂无明显错题主题，建议继续通过测验暴露薄弱点"
    next_week = [
        f"继续保持连续学习，目标至少完成 {max(1, min(3, len(in_progress) or 2))} 个节点。",
        f"优先回看：{wrong_topics[0]}" if wrong_topics else "优先完成 1 次讲解 + 1 次小测 + 1 次复习卡回顾。",
        "每次学习后记录掌握度，确保待复习队列能形成闭环。",
    ]

    return (
        f"# 本周学习复盘\n\n"
        f"> 用户：{user_id}  \n"
        f"> 周期：{week_start} ~ {week_end}\n\n"
        f"## 路径进度\n"
        f"{progress_line}\n"
        f"{active_line}\n"
        f"- 累计学习天数：{stats.study_days} 天\n"
        f"- 当前连续学习：{stats.study_streak} 天\n\n"
        f"## 本周完成资源\n"
        f"{resource_lines}\n\n"
        f"## 学习行为摘要\n"
        f"{event_lines}\n\n"
        f"## 错题与薄弱主题\n"
        f"- 优先关注：{wrong_topic_line}\n"
        f"- 画像提示：{profile.get('recent_progress') or '继续保持学习输入，让画像变得更准确。'}\n\n"
        f"## AI 建议\n"
        f"- 总结：{stats.ai_advice or '继续沿路径推进，并通过测验检验掌握度。'}\n"
        f"- 优势：{stats.strengths or '学习数据正在积累。'}\n"
        f"- 待提升：{stats.improvements or '建议补充更多练习与复习反馈。'}\n\n"
        f"## 下周建议\n"
        + "\n".join(f"- {item}" for item in next_week)
        + "\n"
    )


async def generate_weekly_review(user_id: str) -> dict:
    profile = await get_profile(user_id) or {"user_id": user_id}
    path = await get_path(user_id)
    resources = list_resources_with_meta(user_id)
    events = list_events(user_id, limit=30)
    stats = await build_eval_stats(user_id)
    markdown = _weekly_review_markdown(
        user_id=user_id,
        stats=stats,
        profile=profile,
        path=path,
        resources=resources,
        events=events,
    )
    title = f"本周学习复盘 · {datetime.now(timezone.utc).date().isoformat()}"
    row = {
        "id": uuid.uuid4().hex[:12],
        "type": "doc",
        "title": title,
        "topic": "学习复盘",
        "content": markdown,
        "sources": ["评估页自动生成"],
        "generation_mode": "weekly_review",
        "status": "published",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "metadata": {
            "learning_purpose": "review",
            "used_for": ["weekly_review", "reflection"],
            "recommended_stage": "每周复盘",
            "estimated_minutes": 8,
            "knowledge_points": list(profile.get("error_prone_topics") or [])[:5],
            "quality_tags": ["周复盘", "学习总结"],
            "quality_score": 8.4,
            "summary": "汇总本周路径进度、完成资源、薄弱点和下周建议。",
            "learning_before_tip": "先回看这周学过什么，再阅读 AI 总结。",
            "learning_after_check": "根据下周建议补 1 个薄弱点。",
            "next_step": "从复盘里的薄弱点生成补弱路径或复习卡。",
        },
    }
    row["metadata"] = build_resource_metadata(
        row,
        generation_context={
            "requirements": "生成本周学习复盘 Markdown 文档",
            "topic": "学习复盘",
        },
    )
    await save_resources(user_id, [row])
    await record_event(
        user_id,
        "weekly_review_generate",
        resource_id=row["id"],
        meta={"title": title, "study_streak": stats.study_streak, "study_days": stats.study_days},
    )
    return {"resource": row, "markdown": markdown, "message": "已生成本周学习复盘"}
