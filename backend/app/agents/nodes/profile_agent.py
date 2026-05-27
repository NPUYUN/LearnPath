from datetime import datetime
import json
import re

from app.agents.state import AgentState
from app.core.guardrails import filter_sensitive
from app.core.llm import get_primary_llm
from app.core.prompts import chat_reply_hint, profile_system, profile_temperature
from app.db.repository import save_profile
from app.services.chat_intelligence_service import classify_question_type, patch_profile_from_chat
from app.services.user_defaults import profile_fallback_fields


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
    parsed = _parse_profile_json(raw)
    fallbacks = profile_fallback_fields(user_id, existing)

    incoming = {
        "user_id": user_id,
        "knowledge_level": parsed.get("knowledge_level")
        or _extract_or_default(raw, "knowledge_level", fallbacks["knowledge_level"]),
        "learning_goal": parsed.get("learning_goal")
        or _extract_or_default(raw, "learning_goal", fallbacks["learning_goal"]),
        "cognitive_style": parsed.get("cognitive_style")
        or _extract_or_default(raw, "cognitive_style", fallbacks["cognitive_style"]),
        "error_prone_topics": (
            parsed["error_prone_topics"]
            if "error_prone_topics" in parsed
            else list(fallbacks.get("error_prone_topics") or [])
        ),
        "preferred_modality": parsed.get("preferred_modality")
        or _extract_or_default(raw, "preferred_modality", fallbacks["preferred_modality"]),
        "pace_and_time": parsed.get("pace_and_time")
        or _extract_or_default(raw, "pace_and_time", fallbacks["pace_and_time"]),
        "recent_progress": parsed.get("recent_progress")
        or _extract_or_default(raw, "recent_progress", fallbacks["recent_progress"]),
        "updated_at": datetime.utcnow().isoformat(),
    }
    profile = {**existing, **incoming}
    await save_profile(profile)

    qtype = classify_question_type(user_text)
    topic = user_text[:24] if user_text else "学习"
    patched = await patch_profile_from_chat(user_id, user_text, qtype, topic, profile)
    if patched:
        profile = patched

    reply = filter_sensitive(
        chat_reply_hint("profile", deep)
        + f"\n\n当前基础：{profile['knowledge_level']}；学习目标：{profile['learning_goal']}。"
    )
    return {"profile": profile, "reply": reply}


def _parse_profile_json(text: str) -> dict:
    try:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return {}
        data = json.loads(match.group())
        if not isinstance(data, dict):
            return {}
        out: dict = {}
        for key in (
            "knowledge_level",
            "learning_goal",
            "cognitive_style",
            "preferred_modality",
            "pace_and_time",
            "recent_progress",
        ):
            if key in data and data[key]:
                out[key] = str(data[key])[:200]
        if isinstance(data.get("error_prone_topics"), list):
            out["error_prone_topics"] = [str(x)[:80] for x in data["error_prone_topics"][:8]]
        return out
    except Exception:
        return {}


def _extract_or_default(text: str, key: str, default: str) -> str:
    if key in text and ":" in text:
        for line in text.splitlines():
            if key in line:
                return line.split(":", 1)[-1].strip().strip('"').strip("'")[:200]
    return default
