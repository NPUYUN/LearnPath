"""第四步：基于画像分析的高质量学习路径重规划。"""

from __future__ import annotations

from app.agents.nodes.path_agent import collect_plan_quality_issues, path_node
from app.db.repository import get_learner_analysis, get_path
from app.services.graph_state import build_graph_state
from app.services.path_utils import flatten_steps
from app.services.profile_analysis_service import analyze_learner_profile
from app.services.replan_context_service import DEFAULT_REPLAN_REQUEST, build_replan_user_request


async def replan_learning_path(
    user_id: str,
    *,
    user_request: str | None = None,
    replan_context: dict | None = None,
) -> dict:
    """高质量路径重规划：深度规划 + 双轮质检优化。前置步骤 1-3 应已完成。"""
    if not await get_learner_analysis(user_id):
        await analyze_learner_profile(user_id)

    resolved_request = user_request
    if not resolved_request and replan_context:
        resolved_request = build_replan_user_request(replan_context)

    state = await build_graph_state(
        user_id,
        {
            "intent": "path",
            "fresh_path": True,
            "deep_thinking": True,
            "quality_replan": True,
            "skip_narrative": True,
            "messages": [{"role": "user", "content": resolved_request or DEFAULT_REPLAN_REQUEST}],
        },
    )

    result = await path_node(state)
    path = result.get("path")
    if not path or not path.get("steps"):
        raise ValueError("路径规划失败，请确认已生成画像分析或保留必要学习资源")

    flat = flatten_steps(path.get("steps") or [])
    resource_ids = [r.get("id", "") for r in state.get("resources") or [] if r.get("id")]
    issues = collect_plan_quality_issues(path.get("steps") or [], resource_ids)

    return {
        "path": path,
        "meta": {
            "stage_count": len(path.get("steps") or []),
            "node_count": len(flat),
            "quality_checked": True,
            "remaining_issues": issues,
            "version": path.get("version", 1),
        },
    }


async def get_replan_result(user_id: str) -> dict | None:
    data = await get_path(user_id)
    if not data:
        return None
    flat = flatten_steps(data.get("steps") or [])
    return {
        "path": data,
        "meta": {
            "stage_count": len(data.get("steps") or []),
            "node_count": len(flat),
            "version": data.get("version", 1),
        },
    }
