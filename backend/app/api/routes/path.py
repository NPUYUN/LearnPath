from fastapi import APIRouter, Depends, HTTPException

from app.agents.graph import build_graph
from app.api.deps import assert_user_access
from app.db.repository import get_path, save_path
from app.models.schemas import LearningPath, PathStepStatusUpdate
from app.services.graph_state import build_graph_state
from app.services.path_utils import (
    apply_step_status_update,
    assign_step_ids,
    find_step_by_id,
    flatten_steps,
)

router = APIRouter(prefix="/path", tags=["path"])


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


@router.post("/{user_id}/refresh", response_model=LearningPath)
async def refresh_path(user_id: str = Depends(assert_user_access)):
    graph = build_graph()
    state = await build_graph_state(
        user_id,
        {
            "intent": "path",
            "messages": [{"role": "user", "content": "请根据我的资源与画像重新规划学习路径"}],
        },
    )
    result = await graph.ainvoke(state)
    path = result.get("path")
    if path:
        await save_path(path)
        return LearningPath(**path)
    raise HTTPException(500, "路径生成失败")


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
