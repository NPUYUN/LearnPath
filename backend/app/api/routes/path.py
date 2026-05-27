from fastapi import APIRouter, Depends, HTTPException

from app.agents.graph import build_graph
from app.api.deps import assert_user_access
from app.db.repository import get_path, save_path
from app.models.schemas import LearningPath, PathStepStatusUpdate
from app.services.graph_state import build_graph_state

router = APIRouter(prefix="/path", tags=["path"])


@router.get("/{user_id}", response_model=LearningPath)
async def read_path(user_id: str = Depends(assert_user_access)):
    data = await get_path(user_id)
    if data:
        return LearningPath(**data)
    raise HTTPException(404, "学习路径不存在，请先生成资源或对话规划")


@router.post("/{user_id}/refresh", response_model=LearningPath)
async def refresh_path(user_id: str = Depends(assert_user_access)):
    graph = build_graph()
    state = await build_graph_state(
        user_id,
        {
            "intent": "path",
            "messages": [{"role": "user", "content": "请更新我的学习路径"}],
        },
    )
    result = await graph.ainvoke(state)
    path = result.get("path")
    if path:
        await save_path(path)
        return LearningPath(**path)
    raise HTTPException(500, "路径生成失败")


@router.patch("/{user_id}/steps/{order}", response_model=LearningPath)
async def update_step_status(
    order: int,
    body: PathStepStatusUpdate,
    user_id: str = Depends(assert_user_access),
):
    data = await get_path(user_id)
    if not data:
        raise HTTPException(404, "学习路径不存在")
    steps = data.get("steps") or []
    found = False
    for step in steps:
        if step.get("order") == order:
            step["status"] = body.status
            found = True
            break
    if not found:
        raise HTTPException(404, "步骤不存在")
    if body.status == "done":
        for step in steps:
            if step.get("order") == order + 1 and step.get("status") == "pending":
                step["status"] = "in_progress"
                break
    elif body.status == "in_progress":
        for step in steps:
            if step.get("order") != order and step.get("status") == "in_progress":
                step["status"] = "pending"
    await save_path(data)
    return LearningPath(**data)
