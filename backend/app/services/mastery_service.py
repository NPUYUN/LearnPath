"""掌握度反馈：间隔复习调度 + 学习事件（不联动路径完成状态）。"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.db.repository import get_preferences, get_resource, record_event, set_preferences

MasteryLevel = str  # "forgot" | "fuzzy" | "mastered"

BASE_INTERVAL_DAYS: dict[str, int] = {
    "forgot": 1,
    "fuzzy": 3,
    "mastered": 7,
}

LEVEL_LABELS: dict[str, str] = {
    "forgot": "一般",
    "fuzzy": "较好",
    "mastered": "很好",
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _format_review_label(dt: datetime) -> str:
    local = dt.astimezone()
    return local.strftime("%m月%d日")


def _record_key(resource_id: str, step_key: str) -> str:
    if resource_id:
        return resource_id
    return f"step:{step_key}"


def compute_next_review(level: str, previous: dict | None) -> tuple[int, int, datetime]:
    """返回 (interval_days, streak, next_review_at)。"""
    base = BASE_INTERVAL_DAYS.get(level, 3)
    prev_level = (previous or {}).get("level")
    prev_streak = int((previous or {}).get("streak") or 0)

    if level == "mastered":
        streak = prev_streak + 1 if prev_level == "mastered" else 1
        interval = min(30, base * max(1, streak))
    elif level == "fuzzy":
        streak = max(0, prev_streak - 1)
        interval = 2 if prev_level == "mastered" else base
    else:
        streak = 0
        interval = base

    next_at = _utc_now() + timedelta(days=interval)
    return interval, streak, next_at


async def submit_mastery_feedback(
    user_id: str,
    mastery_level: str,
    *,
    resource_id: str = "",
    step_key: str = "",
) -> dict:
    if mastery_level not in BASE_INTERVAL_DAYS:
        raise ValueError("无效的掌握度等级")

    if not resource_id and not step_key:
        raise ValueError("请提供 resource_id 或 step_key")

    title = ""
    if resource_id:
        resource = await get_resource(user_id, resource_id)
        if not resource:
            # 路径步骤上的 resource_id 可能已过期，降级为仅按 step_key 记录
            resource_id = ""
        else:
            title = str(resource.get("title") or "")
            if not step_key:
                meta = resource.get("metadata") or {}
                if isinstance(meta, dict):
                    step_key = str(meta.get("path_step_key") or "")

    if not resource_id and not step_key:
        raise ValueError("请提供有效的 resource_id 或 step_key")

    prefs = await get_preferences(user_id)
    records: dict = dict(prefs.get("mastery_records") or {})
    key = _record_key(resource_id, step_key)
    previous = records.get(key)

    interval_days, streak, next_review_at = compute_next_review(mastery_level, previous)
    now_iso = _utc_now().isoformat()
    record = {
        "level": mastery_level,
        "next_review_at": next_review_at.isoformat(),
        "interval_days": interval_days,
        "streak": streak,
        "step_key": step_key,
        "resource_id": resource_id,
        "title": title,
        "updated_at": now_iso,
    }
    records[key] = record
    await set_preferences(user_id, {"mastery_records": records})

    await record_event(
        user_id,
        "mastery_feedback",
        resource_id=resource_id,
        meta={
            "mastery_level": mastery_level,
            "mastery_label": LEVEL_LABELS.get(mastery_level, mastery_level),
            "step_key": step_key,
            "next_review_at": record["next_review_at"],
            "interval_days": interval_days,
            "title": title or step_key,
        },
    )

    return {
        "ok": True,
        "record": record,
        "path_updated": False,
        "next_review_label": _format_review_label(next_review_at),
    }


async def list_mastery_records(user_id: str) -> dict[str, dict]:
    prefs = await get_preferences(user_id)
    return dict(prefs.get("mastery_records") or {})
