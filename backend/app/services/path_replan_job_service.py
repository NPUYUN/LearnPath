"""六步重规划后台 Job：服务端异步执行，前端轮询进度。"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any

from app.db.repository import delete_path, get_library, list_resources
from app.models.schemas import PathReplanJob, PathReplanJobResult, PathReplanSubPhase
from app.services.path_confirm_service import confirm_replan
from app.services.path_replan_service import replan_learning_path
from app.services.path_resource_regen_service import regen_path_resources
from app.services.profile_analysis_service import analyze_learner_profile
from app.services.replan_context_service import get_replan_context

logger = logging.getLogger(__name__)

_JOBS: dict[str, PathReplanJob] = {}

STEP_LABELS = [
    "清除当前规划",
    "保留历史资源",
    "分析画像",
    "重新规划路线",
    "重新生成配套资源",
    "最终确认",
]

REPLAN_SUB_LABELS = [
    "读取学习者画像分析",
    "提取学习目标与薄弱点",
    "规划主阶段结构",
    "设计子步骤层级",
    "质检与优化路径",
    "写入新学习路径",
]

CONFIRM_SUB_LABELS = [
    "读取路径与资源库",
    "校验资源引用完整性",
    "清理无效路径关联",
    "写入确认标记",
]

RegenProgressCallback = Callable[[int, int, str], Awaitable[None] | None]


def _sub_phases(labels: list[str], active_index: int, *, all_done: bool = False) -> list[PathReplanSubPhase]:
    cap = len(labels) if all_done else min(active_index, max(0, len(labels) - 1))
    return [
        PathReplanSubPhase(
            label=label,
            status="done" if all_done or i < cap else ("active" if i == cap else "pending"),
        )
        for i, label in enumerate(labels)
    ]


def _calc_progress(step_index: int, *, in_step: float = 0.4) -> int:
    return min(99, round(((step_index + in_step) / len(STEP_LABELS)) * 100))


def _touch(job: PathReplanJob) -> None:
    now = datetime.utcnow()
    job.updated_at = now
    if job.status == "running" and job.started_at:
        job.elapsed_sec = max(0, int((now - job.started_at).total_seconds()))
    _JOBS[job.id] = job


def _set_step(
    job: PathReplanJob,
    step_index: int,
    *,
    stage: str = "",
    sub_phases: list[PathReplanSubPhase] | None = None,
    progress: int | None = None,
) -> None:
    job.step_index = step_index
    job.step_label = STEP_LABELS[step_index] if 0 <= step_index < len(STEP_LABELS) else ""
    if stage:
        job.stage = stage
    if sub_phases is not None:
        job.sub_phases = sub_phases
    job.progress = progress if progress is not None else _calc_progress(step_index)
    _touch(job)


def find_running_job_for_user(user_id: str) -> PathReplanJob | None:
    for job in _JOBS.values():
        if job.user_id == user_id and job.status in ("queued", "running"):
            return job
    return None


def get_path_replan_job(job_id: str) -> PathReplanJob | None:
    return _JOBS.get(job_id)


def _stage_title_list(replan_meta: dict[str, Any]) -> list[str]:
    """_stage_titles 存的是标题字符串列表；兼容误存为 step dict 的旧数据。"""
    raw = replan_meta.get("_stage_titles") or []
    out: list[str] = []
    for item in raw:
        if isinstance(item, str):
            title = item.strip()
        elif isinstance(item, dict):
            title = str(item.get("title") or "").strip()
        else:
            title = str(item).strip()
        if title:
            out.append(title)
    return out


def _build_regen_sub_labels(stage_titles: list[str], library_name: str = "") -> list[str]:
    prep = f"检索资料库「{library_name}」" if library_name else "准备全网检索上下文"
    stages = [
        f"阶段 {i + 1}：{(t[:18] + '…') if len(t) > 18 else t}"
        for i, t in enumerate(stage_titles[:6])
    ]
    return [prep, *stages, "分配资源到子步骤", "更新路径关联"]


async def _run_full_replan(
    job_id: str,
    user_id: str,
    library_id: str | None,
    *,
    conversation_id: str | None = None,
    learning_goal: str | None = None,
    replan_context: dict[str, Any] | None = None,
) -> None:
    job = _JOBS[job_id]
    job.status = "running"
    job.started_at = datetime.utcnow()
    job.elapsed_sec = 0
    _touch(job)

    cleared_count = 0
    kept_count = 0
    regen_meta: dict[str, Any] = {}
    confirm_meta: dict[str, Any] = {}
    replan_meta: dict[str, Any] = {}
    planning_context = replan_context or {}

    async def on_regen_stage(idx: int, total: int, title: str) -> None:
        labels = _build_regen_sub_labels(
            _stage_title_list(replan_meta),
            regen_meta.get("library_name", ""),
        )
        phase_idx = min(idx + 1, max(0, len(labels) - 1))
        _set_step(
            job,
            4,
            stage=f"第 {idx + 1}/{total} 阶段「{title[:20]}」：生成配套资源…",
            sub_phases=_sub_phases(labels, phase_idx),
            progress=_calc_progress(4, in_step=(idx + 0.6) / max(total, 1)),
        )

    try:
        _set_step(job, 0, stage="正在清空旧版学习路径与步骤进度…")
        had = await delete_path(user_id)
        if not had:
            logger.info("path replan job %s: no prior path", job_id)
        _set_step(job, 0, stage="已清除当前规划", progress=_calc_progress(0, in_step=0.9))

        _set_step(job, 1, stage="正在保留旧资源并解除当前路径引用…")
        kept_count = len(await list_resources(user_id))
        cleared_count = 0
        _set_step(job, 1, stage=f"已保留 {kept_count} 项历史资源，后续只重建当前路径引用")

        _set_step(job, 2, stage="正在综合画像与学习行为生成分析报告…")
        await analyze_learner_profile(user_id, conversation_id=conversation_id)
        _set_step(job, 2, stage="学习者画像分析完成")

        _set_step(
            job,
            3,
            stage="正在调用路径规划模型…",
            sub_phases=_sub_phases(REPLAN_SUB_LABELS, 0),
        )
        replan_result = await replan_learning_path(
            user_id,
            replan_context=planning_context,
        )
        replan_meta = replan_result.get("meta") or {}
        path = replan_result.get("path") or {}
        stage_titles = [str(s.get("title") or "") for s in (path.get("steps") or [])]
        replan_meta["_stage_titles"] = stage_titles
        sc = int(replan_meta.get("stage_count") or 0)
        nc = int(replan_meta.get("node_count") or 0)
        _set_step(
            job,
            3,
            stage=f"已生成 {sc} 个主阶段、{nc} 个学习节点",
            sub_phases=_sub_phases(REPLAN_SUB_LABELS, len(REPLAN_SUB_LABELS), all_done=True),
            progress=_calc_progress(3, in_step=0.95),
        )

        regen_labels = _build_regen_sub_labels(stage_titles, "")
        _set_step(
            job,
            4,
            stage="正在按阶段生成配套资源…",
            sub_phases=_sub_phases(regen_labels, 0),
        )

        async def regen_progress(idx: int, total: int, title: str) -> None:
            await on_regen_stage(idx, total, title)

        regen_result = await regen_path_resources(
            user_id,
            library_id=library_id,
            on_stage_progress=regen_progress,
        )
        regen_meta = regen_result.get("meta") or {}
        lib_name = str(regen_meta.get("library_name") or "")
        gen_count = int(regen_meta.get("generated_count") or 0)
        regen_labels = _build_regen_sub_labels(stage_titles, lib_name)
        _set_step(
            job,
            4,
            stage=f"已生成 {gen_count} 项配套资源",
            sub_phases=_sub_phases(regen_labels, len(regen_labels), all_done=True),
            progress=_calc_progress(4, in_step=0.95),
        )

        _set_step(
            job,
            5,
            stage="正在校验路径完整性…",
            sub_phases=_sub_phases(CONFIRM_SUB_LABELS, 0),
        )
        confirm_result = await confirm_replan(user_id)
        confirm_meta = confirm_result.get("meta") or {}
        linked = int(confirm_meta.get("linked_resource_count") or 0)
        stage_count = int(confirm_meta.get("stage_count") or sc)
        _set_step(
            job,
            5,
            stage=f"{stage_count} 个主阶段、{linked} 项资源已关联",
            sub_phases=_sub_phases(CONFIRM_SUB_LABELS, len(CONFIRM_SUB_LABELS), all_done=True),
            progress=99,
        )

        warnings = list(confirm_meta.get("warnings") or [])[:4]
        fallback = int(regen_meta.get("fallback_count") or 0)
        job.status = "done"
        job.progress = 100
        job.result_summary = (
            f"重新规划完成：{stage_count} 个主阶段，{linked} 项资源已关联；"
            f"新生成 {gen_count} 项配套资源"
        )
        job.result = PathReplanJobResult(
            stage_count=stage_count,
            node_count=int(confirm_meta.get("node_count") or nc),
            linked_resource_count=linked,
            generated_count=gen_count,
            deleted_resource_count=cleared_count,
            kept_resource_count=kept_count,
            starred_count=int(confirm_meta.get("starred_count") or 0),
            fallback_count=fallback,
            warnings=warnings,
            library_name=lib_name,
            planning_sources={
                "learning_goal": planning_context.get("learning_goal", ""),
                "goal_source": planning_context.get("goal_source", ""),
                "chat_basis": planning_context.get("chat_basis", ""),
                "starred_count": planning_context.get("starred_count", 0),
                "resource_view_count": planning_context.get("resource_view_count", 0),
                "quiz_summary": planning_context.get("quiz_summary", ""),
                "library_name": lib_name or planning_context.get("library_name", ""),
            },
        )
        _touch(job)
        logger.info("path replan job %s done user=%s", job_id, user_id)
    except Exception as exc:
        logger.exception("path replan job %s failed", job_id)
        job.status = "error"
        job.error = str(exc) or "重新规划失败"
        job.stage = "执行失败"
        job.progress = max(job.progress, 8)
        _touch(job)


async def create_path_replan_job(
    user_id: str,
    *,
    library_id: str | None = None,
    conversation_id: str | None = None,
    learning_goal: str | None = None,
) -> PathReplanJob:
    existing = find_running_job_for_user(user_id)
    if existing:
        raise ValueError("已有进行中的重规划任务，请等待完成")

    library_name = ""
    if library_id:
        lib = await get_library(library_id, user_id)
        library_name = str((lib or {}).get("name") or "")

    replan_context = await get_replan_context(
        user_id,
        conversation_id=conversation_id,
        learning_goal=learning_goal,
        library_id=library_id,
        library_name=library_name,
    )
    if not replan_context.get("can_start"):
        raise ValueError(replan_context.get("block_reason") or "缺少规划依据，无法开始重规划")

    job = PathReplanJob(
        id=str(uuid.uuid4()),
        user_id=user_id,
        status="queued",
        step_index=0,
        step_label=STEP_LABELS[0],
        stage="已加入队列，准备开始…",
        progress=2,
        library_id=library_id or "",
    )
    _touch(job)
    asyncio.create_task(
        _run_full_replan(
            job.id,
            user_id,
            library_id,
            conversation_id=conversation_id,
            learning_goal=learning_goal,
            replan_context=replan_context,
        )
    )
    return job
