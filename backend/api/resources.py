"""
FastAPI 路由 — 资源生成接口

TODO（开发者任务）：
1. 实现 POST /api/resources/generate — 触发多智能体资源生成（SSE）
2. 实现 GET /api/resources/{student_id} — 获取已生成资源列表
3. 实现 GET /api/resources/{resource_id}/download — 下载资源
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import json

router = APIRouter()


class ResourceGenerateRequest(BaseModel):
    student_id: str
    topic: str
    resource_types: Optional[List[str]] = None  # 为空则生成全部5种
    session_id: Optional[str] = None


@router.post("/resources/generate")
async def generate_resources(request: ResourceGenerateRequest):
    """
    触发多智能体资源生成（SSE 流式推送进度）
    
    SSE 事件格式：
    - {"type": "start", "total_resources": 5}
    - {"type": "resource_ready", "resource_type": "document", "data": {...}}
    - {"type": "resource_ready", "resource_type": "mindmap", "data": {...}}
    - {"type": "done", "total_generated": 5}
    
    TODO:
    1. 初始化 AgentState（topic + student_profile）
    2. 调用 agent_graph.astream() 串联5个 ResourceAgent
    3. 每个 Agent 完成后立即推送 SSE 事件
    """
    async def event_generator():
        yield f"data: {json.dumps({'type': 'start', 'total_resources': 5}, ensure_ascii=False)}\n\n"

        # TODO: 接入真实 LangGraph 资源生成流程
        resource_types = ["document", "mindmap", "quiz", "video", "code"]
        for rt in resource_types:
            yield f"data: {json.dumps({'type': 'progress', 'message': f'正在生成{rt}...'}, ensure_ascii=False)}\n\n"
            # TODO: yield resource_ready event with actual content

        yield f"data: {json.dumps({'type': 'done', 'total_generated': 5}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/resources/{student_id}")
async def list_resources(student_id: str, resource_type: Optional[str] = None):
    """
    获取学生已生成的资源列表
    
    TODO: 从数据库查询并返回
    """
    return {"student_id": student_id, "resources": [], "total": 0}
