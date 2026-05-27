"""构建 LangGraph 调用前的用户上下文 state。"""

from app.db.repository import get_profile, list_resources


async def build_graph_state(user_id: str, extra: dict | None = None) -> dict:
    profile = await get_profile(user_id)
    resources = await list_resources(user_id)
    state: dict = {
        "user_id": user_id,
        "profile": profile or {},
        "resources": resources,
    }
    if extra:
        state.update(extra)
    return state
