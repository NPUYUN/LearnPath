"""
FastAPI 路由 — 对话接口
支持流式 SSE 输出

TODO（开发者任务）：
1. 实现 /api/chat 接口的 LangGraph 图调用
2. 实现 SSE 流式响应推送
3. 添加请求参数校验
4. 添加用户认证（JWT）
"""
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from backend.agents.graph import agent_graph

router = APIRouter()


class ChatRequest(BaseModel):
    student_id: str
    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    student_id: str
    reply: str
    intent: Optional[str] = None
    profile_updated: bool = False


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    流式对话接口（SSE）
    
    前端使用方式：
    ```javascript
    const response = await fetch('/api/chat/stream', {...})
    const reader = response.body.getReader()
    // 逐步读取 SSE 数据
    ```
    
    TODO:
    1. 初始化或加载 AgentState（从数据库恢复会话）
    2. 调用 agent_graph.astream() 获取流式输出
    3. 将每个事件格式化为 SSE 格式推送给前端
    4. 在会话结束后持久化 state 到数据库
    """
    async def event_generator():
        # 构建初始状态
        initial_state = {
            "student_id": request.student_id,
            "messages": [{"role": "user", "content": request.message}],
            "generated_resources": [],
            "profile_build_turns": 0,
        }

        config = {"configurable": {"thread_id": request.session_id or request.student_id}}

        try:
            # TODO: 替换为真实的 agent_graph.astream() 调用
            # async for event in agent_graph.astream(initial_state, config=config):
            #     yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

            # 占位示例
            yield f"data: {json.dumps({'type': 'thinking', 'content': '正在分析您的请求...'}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'reply', 'content': 'TODO: 接入 LangGraph 多智能体图后，这里将输出真实回复'}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    非流式对话接口（适用于不支持 SSE 的场景）
    
    TODO: 实现非流式调用
    """
    # TODO: 实现完整逻辑
    return ChatResponse(
        student_id=request.student_id,
        reply="TODO: 接入 LangGraph 后实现真实回复",
        intent="unknown",
    )
