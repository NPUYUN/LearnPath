"""
FastAPI 路由 — 学习路径接口

TODO（开发者任务）：
1. GET /api/path/{student_id} — 获取学习路径
2. POST /api/path/{student_id}/generate — 生成新路径
3. PUT /api/path/{student_id}/stage/{stage_id}/complete — 标记阶段完成
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class PathGenerateRequest(BaseModel):
    student_id: str
    subject: str = "人工智能基础"
    duration_weeks: int = 4


@router.post("/path/generate")
async def generate_path(request: PathGenerateRequest):
    """
    调用 CurriculumAgent 生成个性化学习路径
    
    TODO: 接入 LangGraph CurriculumAgent
    """
    return {
        "student_id": request.student_id,
        "learning_path": [],  # TODO: 返回真实路径
        "message": "TODO: 接入 CurriculumAgent 后生成真实路径",
    }


@router.get("/path/{student_id}")
async def get_path(student_id: str):
    """获取学生当前学习路径"""
    # TODO: 从数据库查询
    raise HTTPException(status_code=404, detail="学习路径未找到")


@router.put("/path/{student_id}/stage/{stage_id}/complete")
async def complete_stage(student_id: str, stage_id: str):
    """
    标记某阶段为已完成，并触发路径动态调整
    
    TODO:
    1. 更新数据库中阶段状态
    2. 调用 CurriculumAgent 调整后续路径
    3. 返回更新后的路径
    """
    return {"message": f"TODO: 实现阶段 {stage_id} 完成逻辑"}
