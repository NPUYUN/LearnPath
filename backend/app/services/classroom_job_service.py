from __future__ import annotations

import asyncio
import uuid
from datetime import datetime

from app.db.classroom_library_repository import create_library_entry_for_job, sync_library_from_job
from app.models.schemas import ClassroomGenerateRequest, ClassroomGenerationJob
from app.services.classroom_service import generate_classroom_session

_JOBS: dict[str, ClassroomGenerationJob] = {}

_START_PROGRESS = 3
_MAX_RUNNING_PROGRESS = 99

_STAGE_FLOORS: dict[str, int] = {
    "整理参考材料": 8,
    "读取学习画像": 16,
    "规划课堂结构": 25,
    "生成讲义主线": 36,
    "生成课件页面": 52,
    "生成教学配图": 66,
    "设计互动检查": 76,
    "生成课后作业": 84,
    "检查内容一致性": 88,
    "写入课堂库": 98,
}

_CONSISTENCY_SUB_STAGES = [
    ("检查知识点覆盖", 89),
    ("检查幻灯片与讲稿一致性", 91),
    ("检查小测验与知识点对应关系", 93),
    ("修复不一致内容", 95),
    ("写入课堂库", 98),
]


def _touch(job: ClassroomGenerationJob) -> None:
    now = datetime.utcnow()
    job.elapsed_seconds = max(0, int((now - job.created_at).total_seconds()))
    job.heartbeat_at = now
    job.updated_at = now
    _JOBS[job.id] = job
    sync_library_from_job(job)


def _update_progress(
    job: ClassroomGenerationJob,
    stage: str,
    sub_stage: str = "",
    progress: int | None = None,
) -> None:
    next_progress = progress if progress is not None else _STAGE_FLOORS.get(stage, job.progress)
    job.stage = stage
    job.sub_stage = sub_stage
    job.progress = max(job.progress, min(int(next_progress), _MAX_RUNNING_PROGRESS))
    _touch(job)


async def _run_generation(job_id: str, req: ClassroomGenerateRequest) -> None:
    job = _JOBS[job_id]
    job.status = "running"
    _update_progress(job, "整理参考材料", "任务已启动", _START_PROGRESS)
    try:
        def report(stage: str, sub_stage: str = "", progress: int | None = None) -> None:
            _update_progress(job, stage, sub_stage, progress)

        generation_task = asyncio.create_task(generate_classroom_session(req, progress_cb=report))
        heartbeat_tick = 0
        while not generation_task.done():
            heartbeat_tick += 1
            if heartbeat_tick % 2 == 0:
                job.sub_stage = job.sub_stage or "仍在生成，请稍候"
                _touch(job)
            await asyncio.sleep(1.0)

        job.result = await generation_task
        for sub_stage, progress in _CONSISTENCY_SUB_STAGES:
            _update_progress(job, "检查内容一致性", sub_stage, progress)
            await asyncio.sleep(0.15)
        job.status = "done"
        job.stage = "生成完成"
        job.sub_stage = "课堂内容已写入课堂库"
        job.progress = 100
        _touch(job)
    except Exception as exc:
        job.status = "error"
        job.stage = "生成失败"
        job.sub_stage = "请重试或调整参考材料"
        job.error = str(exc)
        job.progress = max(job.progress, 8)
        _touch(job)


def _start_classroom_generation_job(req: ClassroomGenerateRequest) -> ClassroomGenerationJob:
    job = ClassroomGenerationJob(
        id=str(uuid.uuid4()),
        user_id=req.user_id,
        title=req.title or "AI 课堂",
        status="queued",
        stage="已加入生成队列",
        sub_stage="等待后端开始处理",
        progress=_START_PROGRESS,
    )
    _touch(job)
    asyncio.create_task(_run_generation(job.id, req))
    return job


def create_classroom_generation_job(req: ClassroomGenerateRequest) -> ClassroomGenerationJob:
    job = _start_classroom_generation_job(req)
    create_library_entry_for_job(req, job)
    return job


def restart_classroom_generation_job(req: ClassroomGenerateRequest) -> ClassroomGenerationJob:
    return _start_classroom_generation_job(req)


def get_classroom_generation_job(job_id: str) -> ClassroomGenerationJob | None:
    return _JOBS.get(job_id)


def delete_classroom_generation_job(job_id: str) -> None:
    _JOBS.pop(job_id, None)
