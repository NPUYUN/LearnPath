"""
FastAPI 路由 — 学生画像接口

TODO（开发者任务）：
1. 实现 GET /api/profile/{student_id} — 获取学生画像
2. 实现 PUT /api/profile/{student_id} — 更新学生画像
3. 添加画像可视化数据接口（雷达图数据）
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()


class ProfileResponse(BaseModel):
    student_id: str
    knowledge_level: dict
    cognitive_style: str
    learning_goal: str
    error_prone_topics: List[str]
    available_time_per_day: float
    interest_direction: List[str]
    completeness: float  # 画像完整度 0-100


@router.get("/profile/{student_id}", response_model=ProfileResponse)
async def get_profile(student_id: str):
    """
    获取学生学习画像
    
    TODO:
    1. 从数据库查询学生画像
    2. 返回完整画像数据
    """
    # TODO: 从数据库查询
    raise HTTPException(status_code=404, detail="学生画像未找到，请先通过对话构建画像")


@router.get("/profile/{student_id}/radar")
async def get_profile_radar(student_id: str):
    """
    获取画像雷达图数据（供前端 ECharts 使用）
    
    TODO: 将画像各维度数值转换为雷达图格式
    """
    # TODO: 实现
    return {
        "indicators": [
            {"name": "知识基础", "max": 10},
            {"name": "学习积极性", "max": 10},
            {"name": "理解能力", "max": 10},
            {"name": "实践能力", "max": 10},
            {"name": "自主学习", "max": 10},
            {"name": "知识广度", "max": 10},
        ],
        "values": [0, 0, 0, 0, 0, 0],  # TODO: 从画像中填充
    }
