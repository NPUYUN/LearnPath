from datetime import datetime

from app.agents.state import AgentState
from app.core.guardrails import filter_sensitive
from app.core.llm import get_llm_client
from app.db.repository import save_profile


async def profile_node(state: AgentState) -> dict:
    user_id = state.get("user_id", "demo")
    messages = state.get("messages") or []
    llm = get_llm_client()

    user_text = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            user_text = m.get("content", "")
            break

    prompt = [
        {
            "role": "system",
            "content": (
                "你是学径画像助手。根据学生对话更新学习画像，输出 JSON 字段："
                "knowledge_level, learning_goal, cognitive_style, error_prone_topics(数组), "
                "preferred_modality, pace_and_time, recent_progress。"
            ),
        },
        {"role": "user", "content": user_text},
    ]
    raw = await llm.chat(prompt)
    raw = filter_sensitive(raw)

    profile = {
        "user_id": user_id,
        "knowledge_level": _extract_or_default(raw, "knowledge_level", "入门"),
        "learning_goal": _extract_or_default(raw, "learning_goal", "掌握机器学习导论核心概念"),
        "cognitive_style": _extract_or_default(raw, "cognitive_style", "偏实践"),
        "error_prone_topics": ["线性回归", "梯度下降"] if "回归" in user_text else [],
        "preferred_modality": _extract_or_default(raw, "preferred_modality", "文档+练习"),
        "pace_and_time": _extract_or_default(raw, "pace_and_time", "每周约5小时"),
        "recent_progress": _extract_or_default(raw, "recent_progress", "已完成导论预习"),
        "updated_at": datetime.utcnow().isoformat(),
    }
    await save_profile(profile)

    reply = filter_sensitive(
        f"已更新你的学习画像（6+ 维）。当前基础：{profile['knowledge_level']}，"
        f"目标：{profile['learning_goal']}。"
    )
    return {"profile": profile, "reply": reply}


def _extract_or_default(text: str, key: str, default: str) -> str:
    if key in text and ":" in text:
        for line in text.splitlines():
            if key in line:
                return line.split(":", 1)[-1].strip().strip('"').strip("'")[:200]
    return default
