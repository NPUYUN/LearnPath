from datetime import datetime

from app.agents.state import AgentState
from app.core.guardrails import filter_sensitive
from app.core.llm import get_primary_llm
from app.core.prompts import chat_reply_hint, profile_system, profile_temperature
from app.db.repository import save_profile


async def profile_node(state: AgentState) -> dict:
    user_id = state.get("user_id", "demo")
    messages = state.get("messages") or []
    deep = bool(state.get("deep_thinking"))
    llm = get_primary_llm()

    user_text = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            user_text = m.get("content", "")
            break

    prompt = [
        {"role": "system", "content": profile_system(deep)},
        {"role": "user", "content": user_text},
    ]
    raw = await llm.chat(prompt, temperature=profile_temperature(deep), deep_thinking=deep)
    raw = filter_sensitive(raw)

    existing = dict(state.get("profile") or {})
    incoming = {
        "user_id": user_id,
        "knowledge_level": _extract_or_default(raw, "knowledge_level", existing.get("knowledge_level", "入门")),
        "learning_goal": _extract_or_default(
            raw, "learning_goal", existing.get("learning_goal", "掌握机器学习导论核心概念")
        ),
        "cognitive_style": _extract_or_default(raw, "cognitive_style", existing.get("cognitive_style", "偏实践")),
        "error_prone_topics": (
            ["线性回归", "梯度下降"]
            if "回归" in user_text
            else list(existing.get("error_prone_topics") or [])
        ),
        "preferred_modality": _extract_or_default(
            raw, "preferred_modality", existing.get("preferred_modality", "文档+练习")
        ),
        "pace_and_time": _extract_or_default(raw, "pace_and_time", existing.get("pace_and_time", "每周约5小时")),
        "recent_progress": _extract_or_default(
            raw, "recent_progress", existing.get("recent_progress", "已完成导论预习")
        ),
        "updated_at": datetime.utcnow().isoformat(),
    }
    profile = {**existing, **incoming}
    await save_profile(profile)

    reply = filter_sensitive(
        chat_reply_hint("profile", deep)
        + f"\n\n当前基础：{profile['knowledge_level']}；学习目标：{profile['learning_goal']}。"
    )
    return {"profile": profile, "reply": reply}


def _extract_or_default(text: str, key: str, default: str) -> str:
    if key in text and ":" in text:
        for line in text.splitlines():
            if key in line:
                return line.split(":", 1)[-1].strip().strip('"').strip("'")[:200]
    return default
