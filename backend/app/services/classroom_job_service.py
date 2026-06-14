from __future__ import annotations

import asyncio
import uuid
from datetime import datetime

from app.db.classroom_library_repository import create_library_entry_for_job, sync_library_from_job
from app.models.schemas import ClassroomGenerateRequest, ClassroomGenerationJob
from app.services.classroom_service import generate_classroom_session

_JOBS: dict[str, ClassroomGenerationJob] = {}

_STAGES: list[tuple[str, int]] = [
    ("整理参考材料", 12),
    ("分析学习画像", 24),
    ("规划课堂结构", 38),
    ("生成讲义主线", 54),
    ("生成课件页面", 64),
    ("生成教学配图", 76),
    ("设计互动检查", 86),
    ("生成课后作业", 93),
    ("检查内容一致性", 96),
]


def _touch(job: ClassroomGenerationJob) -> None:
    job.updated_at = datetime.utcnow()
    _JOBS[job.id] = job
    sync_library_from_job(job)


async def _run_generation(job_id: str, req: ClassroomGenerateRequest) -> None:
    job = _JOBS[job_id]
    job.status = "running"
    _touch(job)
    try:
        for stage, progress in _STAGES[:3]:
            job.stage = stage
            job.progress = progress
            _touch(job)
            await asyncio.sleep(0.65)

        generation_task = asyncio.create_task(generate_classroom_session(req))
        stage_index = 3
        while not generation_task.done():
            stage, progress = _STAGES[min(stage_index, len(_STAGES) - 1)]
            job.stage = stage
            job.progress = max(job.progress, min(progress, 94))
            _touch(job)
            stage_index = min(stage_index + 1, len(_STAGES) - 1)
            await asyncio.sleep(1.4)

        job.result = await generation_task
        job.status = "done"
        job.stage = "生成完成"
        job.progress = 100
        _touch(job)
    except Exception as exc:
        job.status = "error"
        job.stage = "生成失败"
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
        progress=4,
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
