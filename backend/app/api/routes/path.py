from fastapi import APIRouter, HTTPException

from app.agents.graph import build_graph
from app.db.repository import get_path, save_path
from app.models.schemas import LearningPath

router = APIRouter(prefix="/path", tags=["path"])


@router.get("/{user_id}", response_model=LearningPath)
async def read_path(user_id: str):
    data = await get_path(user_id)
    if data:
        return LearningPath(**data)
    raise HTTPException(404, "学习路径不存在，请先生成资源或对话规划")


@router.post("/{user_id}/refresh", response_model=LearningPath)
async def refresh_path(user_id: str):
    graph = build_graph()
    result = await graph.ainvoke(
        {
            "user_id": user_id,
            "intent": "path",
            "messages": [{"role": "user", "content": "请更新我的学习路径"}],
        }
    )
    path = result.get("path")
    if path:
        await save_path(path)
        return LearningPath(**path)
    raise HTTPException(500, "路径生成失败")
