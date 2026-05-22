"""
LangGraph 多智能体编排图
定义各智能体节点和路由逻辑

TODO（开发者任务）：
1. 完善 route_after_orchestrator() 路由逻辑
2. 添加错误处理节点（agent 执行失败时的回退）
3. 实现并行资源生成（LangGraph 支持并行节点）
4. 添加 checkpointer 实现对话持久化
"""
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from backend.models.state import AgentState
from backend.agents.orchestrator import OrchestratorAgent
from backend.agents.profile_agent import ProfileAgent
from backend.agents.curriculum_agent import CurriculumAgent
from backend.agents.resource_agents import (
    DocumentAgent, MindMapAgent, QuizAgent, VideoAgent, CodeAgent
)


# 实例化所有智能体
orchestrator = OrchestratorAgent()
profile_agent = ProfileAgent()
curriculum_agent = CurriculumAgent()
document_agent = DocumentAgent()
mindmap_agent = MindMapAgent()
quiz_agent = QuizAgent()
video_agent = VideoAgent()
code_agent = CodeAgent()


def route_after_orchestrator(state: AgentState) -> str:
    """根据 Orchestrator 设置的 next_agent 进行路由"""
    next_agent = state.get("next_agent", "general_chat")
    
    routing_map = {
        "profile": "profile",
        "curriculum": "curriculum",
        "resource_generator": "document",  # 资源生成入口
        "tutor": END,      # TODO: 添加 tutor_agent 后替换
        "evaluator": END,  # TODO: 添加 evaluator_agent 后替换
        "general_chat": END,
    }
    return routing_map.get(next_agent, END)


def route_after_document(state: AgentState) -> str:
    """文档生成后，路由到思维导图生成"""
    return "mindmap"


def route_after_mindmap(state: AgentState) -> str:
    """思维导图生成后，路由到题库生成"""
    return "quiz"


def route_after_quiz(state: AgentState) -> str:
    """题库生成后，路由到视频脚本生成"""
    return "video"


def route_after_video(state: AgentState) -> str:
    """视频脚本生成后，路由到代码案例生成"""
    return "code"


def build_agent_graph(use_memory: bool = True):
    """
    构建并编译 LangGraph 多智能体图
    
    Args:
        use_memory: 是否启用内存持久化（用于多轮对话）
    
    Returns:
        编译后的 LangGraph CompiledGraph
    
    TODO:
    - 实现并行资源生成（多个 ResourceAgent 同时运行）
    - 添加 Redis checkpointer（生产环境持久化）
    """
    graph = StateGraph(AgentState)

    # 注册节点
    graph.add_node("orchestrator", orchestrator.run)
    graph.add_node("profile", profile_agent.run)
    graph.add_node("curriculum", curriculum_agent.run)
    graph.add_node("document", document_agent.run)
    graph.add_node("mindmap", mindmap_agent.run)
    graph.add_node("quiz", quiz_agent.run)
    graph.add_node("video", video_agent.run)
    graph.add_node("code", code_agent.run)

    # 设置入口
    graph.set_entry_point("orchestrator")

    # 添加路由边
    graph.add_conditional_edges(
        "orchestrator",
        route_after_orchestrator,
        {
            "profile": "profile",
            "curriculum": "curriculum",
            "document": "document",
            END: END,
        },
    )

    # 资源生成流水线：document → mindmap → quiz → video → code → END
    graph.add_edge("document", "mindmap")
    graph.add_edge("mindmap", "quiz")
    graph.add_edge("quiz", "video")
    graph.add_edge("video", "code")
    graph.add_edge("code", END)

    # 其他节点
    graph.add_edge("profile", END)
    graph.add_edge("curriculum", END)

    # 编译（可选内存持久化）
    if use_memory:
        memory = MemorySaver()
        return graph.compile(checkpointer=memory)
    return graph.compile()


# 全局单例图
agent_graph = build_agent_graph()
