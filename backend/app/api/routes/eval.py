"""评估统计路由：聚合用户真实学习数据生成评估报告。"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import assert_user_access, ensure_same_user, get_current_user_id
from app.db.repository import get_last_quiz_attempt, get_path, get_profile, list_events, list_resources_with_meta
from app.models.schemas import EvalEvent, EvalStats, EvalSubmitRequest, EvalSubmitResponse, RadarData
from app.services.eval_service import submit_quiz

router = APIRouter(prefix="/eval", tags=["eval"])

# 六大画像字段的"未填写"默认值
_PROFILE_DEFAULTS = {
    "knowledge_level": "未评估",
    "learning_goal": "未设定",
    "cognitive_style": "未评估",
    "preferred_modality": "文档+练习",
    "pace_and_time": "未设定",
    "recent_progress": "尚未开始学习",
}


@router.post("/submit", response_model=EvalSubmitResponse)
async def submit_eval(
    req: EvalSubmitRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(req.user_id, current_user_id)
    try:
        return await submit_quiz(req.user_id, req.quiz_id, req.answers)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/{user_id}", response_model=EvalStats)
async def get_eval_stats(user_id: str = Depends(assert_user_access)) -> EvalStats:
    """根据数据库中的画像、资源、学习路径，计算真实评估统计数据。"""
    profile = await get_profile(user_id)
    resources = list_resources_with_meta(user_id)
    path = await get_path(user_id)

    # ── 基础统计 ──────────────────────────────────────────────────────────────
    total = len(resources)
    by_type: dict[str, int] = {}
    for r in resources:
        t = r.get("type", "doc")
        by_type[t] = by_type.get(t, 0) + 1

    completeness = _profile_completeness(profile or {})

    events = list_events(user_id, limit=100)
    dates: set[str] = set()
    for e in events:
        if e.get("created_at"):
            dates.add(str(e["created_at"])[:10])
    for r in resources:
        ts = r.get("created_at", "")
        if ts:
            dates.add(str(ts)[:10])
    study_days = len(dates) if dates else 0

    last_quiz = await get_last_quiz_attempt(user_id)
    radar = _compute_radar(profile or {}, resources, path, last_quiz, events)

    recent_events = _compute_events(resources, profile, last_quiz, events)

    return EvalStats(
        total_resources=total,
        resources_by_type=by_type,
        profile_completeness=completeness,
        study_days=study_days,
        has_path=bool(path and path.get("steps")),
        radar=radar,
        recent_events=recent_events,
    )


# ── 内部计算函数 ──────────────────────────────────────────────────────────────

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
    BEFORE = [40, 35, 45, 50, 30]
    n = len(resources)
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
        min(95, BEFORE[0] + (20 if has_kl else 0) + min(15, quiz_pct // 10)),
        min(95, BEFORE[1] + min(25, completed * 8) + min(10, done_steps * 5)),
        min(95, BEFORE[2] + (15 if has_style else 0) + (10 if has_goal else 0) + min(10, quiz_pct // 15)),
        min(95, BEFORE[3] + (15 if has_pace else 0) + min(10, len(events))),
        min(95, BEFORE[4] + min(20, done_steps * 8) + min(15, completed * 3)),
    ]

    return RadarData(
        dimensions=["知识掌握度", "实践能力", "理解深度", "学习效率", "应用迁移"],
        before=BEFORE,
        after=after,
    )


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
        }
        lbl, color = label_map.get(e.get("event_type", ""), ("学习", "default"))
        meta = e.get("meta") or {}
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

    # 最近 4 条资源生成记录
    for r in resources[:4]:
        events.append(
            EvalEvent(
                label="生成",
                color="blue",
                content=f"生成资源：{r.get('title', '未命名')}",
                date=_format_date(r.get("created_at", "")),
            )
        )

    # 画像更新记录
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
        elif diff.days == 1:
            return "昨天"
        elif diff.days < 7:
            return f"{diff.days} 天前"
        else:
            return ts[:10]
    except Exception:
        return str(ts)[:10]
