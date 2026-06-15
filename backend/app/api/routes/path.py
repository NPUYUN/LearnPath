from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import assert_user_access, ensure_same_user, get_current_user_id
from app.db.repository import delete_path, get_path, save_path
from app.models.schemas import (
    LearningPath,
    LearningResource,
    PathConfirmMeta,
    PathConfirmResponse,
    PathReplanJob,
    PathReplanJobCreateRequest,
    PathReplanMeta,
    PathReplanResponse,
    PathStepStatusUpdate,
)
from app.services.path_confirm_service import confirm_replan
from app.services.path_replan_job_service import create_path_replan_job, get_path_replan_job
from app.services.path_replan_service import replan_learning_path
from app.services.path_utils import (
    apply_step_status_update,
    assign_step_ids,
    find_step_by_id,
    flatten_steps,
)

router = APIRouter(prefix="/path", tags=["path"])


@router.get("/replan-jobs/{job_id}", response_model=PathReplanJob)
async def get_path_replan_job_route(
    job_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    job = get_path_replan_job(job_id)
    if not job:
        raise HTTPException(404, "重规划任务不存在或已过期")
    ensure_same_user(job.user_id, current_user_id)
    return job


@router.post("/{user_id}/replan-jobs", response_model=PathReplanJob)
async def create_path_replan_job_route(
    body: PathReplanJobCreateRequest,
    user_id: str = Depends(assert_user_access),
):
    """提交六步重规划后台任务，立即返回 jobId。"""
    try:
        return await create_path_replan_job(
            user_id,
            library_id=body.library_id,
            conversation_id=body.conversation_id,
            learning_goal=body.learning_goal,
            planning_mode=body.planning_mode,
            planning_requirement=body.planning_requirement,
        )
    except ValueError as exc:
        msg = str(exc)
        status = 422 if "缺少规划依据" in msg else 409
        raise HTTPException(status, msg) from exc


def _ensure_step_ids(data: dict) -> None:
    steps = data.get("steps") or []
    if steps and not steps[0].get("id"):
        assign_step_ids(steps)


@router.get("/{user_id}", response_model=LearningPath)
async def read_path(user_id: str = Depends(assert_user_access)):
    data = await get_path(user_id)
    if data:
        _ensure_step_ids(data)
        return LearningPath(**data)
    raise HTTPException(404, "学习路径不存在，请先生成资源或对话规划")


@router.post("/{user_id}/clear")
async def clear_path(user_id: str = Depends(assert_user_access)):
    had_path = await delete_path(user_id)
    return {"ok": True, "had_path": had_path}


@router.post("/{user_id}/replan", response_model=PathReplanResponse)
async def replan_path(user_id: str = Depends(assert_user_access)):
    """第四步：高质量路径重规划（深度思考 + 双轮质检）。"""
    try:
        result = await replan_learning_path(user_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, f"路径规划失败：{exc}") from exc

    path = result["path"]
    meta = result.get("meta") or {}
    return PathReplanResponse(
        path=LearningPath(**path),
        meta=PathReplanMeta(**meta),
    )


@router.post("/{user_id}/confirm", response_model=PathConfirmResponse)
async def confirm_path_replan(user_id: str = Depends(assert_user_access)):
    """第六步：校验路径与资源库一致性，修复无效引用并确认落库。"""
    try:
        result = await confirm_replan(user_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, f"最终确认失败：{exc}") from exc

    path = result["path"]
    meta = result.get("meta") or {}
    raw_resources = result.get("resources") or []
    resources = [
        LearningResource(
            id=r.get("id", ""),
            type=r.get("type", "doc"),
            title=r.get("title", ""),
            content=r.get("content", ""),
            sources=r.get("sources", []),
            topic=r.get("topic", ""),
            generation_mode=r.get("generation_mode", ""),
            library_id=r.get("library_id", ""),
            library_name=r.get("library_name", ""),
        )
        for r in raw_resources
        if r.get("id")
    ]
    return PathConfirmResponse(
        path=LearningPath(**path),
        resources=resources,
        meta=PathConfirmMeta(**meta),
    )


@router.post("/{user_id}/refresh", response_model=LearningPath)
async def refresh_path(user_id: str = Depends(assert_user_access)):
    """兼容旧接口：仅执行第四步高质量重规划（清除请走分步接口）。"""
    try:
        result = await replan_learning_path(user_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, f"路径生成失败：{exc}") from exc
    path = result["path"]
    return LearningPath(**path)


@router.patch("/{user_id}/steps/{step_key}", response_model=LearningPath)
async def update_step_status(
    step_key: str,
    body: PathStepStatusUpdate,
    user_id: str = Depends(assert_user_access),
):
    data = await get_path(user_id)
    if not data:
        raise HTTPException(404, "学习路径不存在")
    steps = data.get("steps") or []
    _ensure_step_ids(data)

    step_id = step_key
    if step_key.isdigit() and not find_step_by_id(steps, step_key):
        order = int(step_key)
        legacy = next((s for s in steps if s.get("order") == order), None)
        if legacy:
            step_id = legacy.get("id") or step_key

    if not apply_step_status_update(steps, step_id, body.status):
        raise HTTPException(404, "步骤不存在")

    await save_path(data)
    return LearningPath(**data)
