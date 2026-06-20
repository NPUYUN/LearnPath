from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime

from app.models.schemas import (
    GenerateResourcesRequest,
    ResourceGenerationJob,
    ResourceGenerationResultSummary,
)
from app.services.resource_service import stream_generate_resources

_JOBS: dict[str, ResourceGenerationJob] = {}

_STAGE_LABELS = {
    "context": ("读取资料库说明", "正在加载 library_profile 与生成依据"),
    "web_research": ("提取知识点索引", "正在整理检索摘要与目标知识点"),
    "fast_resource": ("确定资源用途", "正在匹配画像、难度与复用场景"),
    "deep_thinking": ("确定资源用途", "正在深度规划资源结构"),
    "formula_normalize": ("数学公式与 Markdown 规范化", "正在修复转义、定界符和公式块"),
    "quiz_consistency": ("题目答案一致性检查", "正在核对选项、答案、解析与计算过程"),
    "reviewer": ("ResourceReviewer 质检", "正在执行分类型质量检查"),
    "rewrite": ("重写中", "正在局部修题或补写低质量资源"),
    "saving": ("保存到资料库 / 学习资源", "正在写入资源与 resource_manifest"),
    "path_sync": ("同步学习路径", "正在挂载匹配的路径步骤"),
}


def _touch(job: ResourceGenerationJob) -> None:
    now = datetime.now(UTC)
    job.elapsed_seconds = max(0, int((now - job.created_at).total_seconds()))
    job.updated_at = now
    _JOBS[job.id] = job


def _set_progress(job: ResourceGenerationJob, stage_key: str, progress: int, meta: dict | None = None) -> None:
    stage, sub_stage = _STAGE_LABELS.get(stage_key, ("生成资源内容", f"正在生成 {stage_key.split(':', 1)[0]}"))
    job.stage = stage
    job.sub_stage = sub_stage
    resource_type = str((meta or {}).get("resource_type") or "")
    job.current_resource_type = resource_type or (
        stage_key.split(":", 1)[0] if stage_key not in _STAGE_LABELS else ""
    )
    job.progress = max(job.progress, min(99, int(progress)))
    _touch(job)


async def _run_job(job_id: str, req: GenerateResourcesRequest) -> None:
    job = _JOBS[job_id]
    job.status = "running"
    _set_progress(job, "context", 3)
    resource_ids: list[str] = []
    async def heartbeat() -> None:
        while job.status in {"queued", "running"}:
            _touch(job)
            await asyncio.sleep(1)

    heartbeat_task = asyncio.create_task(heartbeat())
    try:
        async for event in stream_generate_resources(req):
            payload = json.loads(event.get("data") or "{}") if isinstance(event.get("data"), str) else dict(event.get("data") or {})
            if event.get("event") == "progress":
                _set_progress(job, str(payload.get("stage") or ""), int(payload.get("progress") or job.progress), payload)
            elif event.get("event") == "resources":
                resource_ids = [str(row.get("id")) for row in payload if isinstance(row, dict) and row.get("id")]
            elif event.get("event") == "error":
                raise RuntimeError(str(payload.get("message") or payload or "资源生成失败"))
            elif event.get("event") == "done":
                job.result = ResourceGenerationResultSummary(
                    generated_count=int(payload.get("count") or len(resource_ids)),
                    published_count=int(payload.get("published_count") or 0),
                    draft_count=int(payload.get("draft_count") or 0),
                    rewritten_count=int(payload.get("rewritten_count") or 0),
                    library_resource_count=(len(resource_ids) if payload.get("library_id") else 0),
                    path_attached_count=int(payload.get("path_attached_count") or 0),
                    path_unmatched_count=int(payload.get("path_unmatched_count") or 0),
                    classroom_ready_count=int(payload.get("classroom_ready_count") or 0),
                    library_id=str(payload.get("library_id") or ""),
                    library_name=str(payload.get("library_name") or ""),
                    resource_ids=resource_ids,
                )
        job.status = "done"
        job.stage = "完成"
        job.sub_stage = "学习资源、资料库与路径同步已完成"
        job.current_resource_type = ""
        job.progress = 100
        _touch(job)
    except Exception as exc:
        job.status = "error"
        job.stage = "生成失败"
        job.sub_stage = "请根据错误信息调整资料来源或生成要求"
        job.error = str(exc)
        _touch(job)
    finally:
        heartbeat_task.cancel()


def create_resource_generation_job(req: GenerateResourcesRequest) -> ResourceGenerationJob:
    job = ResourceGenerationJob(
        id=str(uuid.uuid4()),
        user_id=req.user_id,
        title=req.topic or req.new_library_name or "学习资源",
        stage="已加入生成队列",
        sub_stage="等待后台开始处理",
        progress=1,
    )
    _touch(job)
    asyncio.create_task(_run_job(job.id, req))
    return job


def get_resource_generation_job(job_id: str) -> ResourceGenerationJob | None:
    return _JOBS.get(job_id)
