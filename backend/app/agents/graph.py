from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from app.agents.state import AgentState
from app.agents.supervisor import supervisor_node
from app.agents.nodes.profile_agent import profile_node
from app.agents.nodes.generate_router import generate_router_node
from app.agents.nodes.path_agent import path_node
from app.agents.nodes.tutor_agent import tutor_node
from app.agents.nodes.eval_agent import eval_node


def _route_after_supervisor(state: AgentState) -> str:
    intent = state.get("intent", "profile")
    return intent if intent in {"profile", "generate", "path", "tutor", "eval"} else "profile"


@lru_cache
def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("supervisor", supervisor_node)
    graph.add_node("profile", profile_node)
    graph.add_node("generate", generate_router_node)
    graph.add_node("path", path_node)
    graph.add_node("tutor", tutor_node)
    graph.add_node("eval", eval_node)

    graph.add_edge(START, "supervisor")
    graph.add_conditional_edges(
        "supervisor",
        _route_after_supervisor,
        {
            "profile": "profile",
            "generate": "generate",
            "path": "path",
            "tutor": "tutor",
            "eval": "eval",
        },
    )
    graph.add_edge("profile", END)
    graph.add_edge("generate", END)
    graph.add_edge("path", END)
    graph.add_edge("tutor", END)
    graph.add_edge("eval", END)

    return graph.compile()
