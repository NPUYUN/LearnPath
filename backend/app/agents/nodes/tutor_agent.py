"""辅导节点：委托智能对话服务（资源库优先 + 多模态）。"""

from app.agents.nodes.chat_agent import chat_node
from app.agents.state import AgentState


async def tutor_node(state: AgentState) -> dict:
    return await chat_node(state)
