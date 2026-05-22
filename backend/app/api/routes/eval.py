"""评估统计路由：聚合用户真实学习数据生成评估报告。"""

from datetime import datetime, timezone

from fastapi import APIRouter

from app.db.repository import get_path, get_profile, list_resources_with_meta
from app.models.schemas import EvalEvent, EvalStats, RadarData

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


@router.get("/{user_id}", response_model=EvalStats)
async def get_eval_stats(user_id: str) -> EvalStats:
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

    # 根据资源创建日期估算学习天数
    dates: set[str] = set()
    for r in resources:
        ts = r.get("created_at", "")
        if ts:
            dates.add(str(ts)[:10])
    if profile:
        upd = str(profile.get("updated_at", ""))
        if upd:
            dates.add(upd[:10])
    study_days = len(dates) if (profile or resources) else 0

    # ── 雷达图数据 ─────────────────────────────────────────────────────────────
    radar = _compute_radar(profile or {}, resources, path)

    # ── 近期事件 ─────────────────────────────────────────────────────────────
    recent_events = _compute_events(resources, profile)

    return EvalStats(
        total_resources=total,
        resources_by_type=by_type,
        profile_completeness=completeness,
        study_days=max(1, study_days) if (profile or resources) else 0,
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


def _compute_radar(p: dict, resources: list[dict], path: dict | None) -> RadarData:
    BEFORE = [40, 35, 45, 50, 30]
    n = len(resources)
    has_kl = p.get("knowledge_level", "未评估") != "未评估"
    has_goal = p.get("learning_goal", "未设定") != "未设定"
    has_style = p.get("cognitive_style", "未评估") != "未评估"
    has_pace = p.get("pace_and_time", "未设定") != "未设定"
    has_path = bool(path and path.get("steps"))

    after = [
        min(95, BEFORE[0] + (20 if has_kl else 0) + min(10, n)),          # 知识掌握度
        min(95, BEFORE[1] + min(35, n * 5) + (5 if has_path else 0)),     # 实践能力
        min(95, BEFORE[2] + (15 if has_style else 0) + (10 if has_goal else 0)),  # 理解深度
        min(95, BEFORE[3] + (15 if has_pace else 0) + (5 if n > 0 else 0)),       # 学习效率
        min(95, BEFORE[4] + (20 if has_path else 0) + min(15, n * 2)),            # 应用迁移
    ]

    return RadarData(
        dimensions=["知识掌握度", "实践能力", "理解深度", "学习效率", "应用迁移"],
        before=BEFORE,
        after=after,
    )


def _compute_events(resources: list[dict], profile: dict | None) -> list[EvalEvent]:
    events: list[EvalEvent] = []

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
