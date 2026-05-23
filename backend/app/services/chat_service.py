import json
from typing import AsyncIterator

from app.agents.graph import build_graph
from app.agents.supervisor import classify_intent
from app.core.config import get_settings
from app.db.repository import get_profile, list_resources, save_path, save_resources
from app.models.schemas import ChatResponse, StudentProfile
from app.services.graph_state import build_graph_state


async def run_chat(
    user_id: str, message: str, *, deep_thinking: bool = False
) -> ChatResponse:
    intent = classify_intent(message)
    base = await build_graph_state(
        user_id,
        {
            "messages": [{"role": "user", "content": message}],
            "intent": intent,
            "topic": _extract_topic(message),
            "deep_thinking": deep_thinking,
        },
    )
    graph = build_graph()
    result = await graph.ainvoke(base)

    prior_ids = {r.get("id") for r in base.get("resources") or [] if r.get("id")}
    saved_resources = _new_resources_from_result(result, prior_ids)
    if saved_resources:
        await save_resources(user_id, saved_resources)

    path_data = result.get("path")
    settings = get_settings()
    if intent == "generate" and settings.auto_path_after_generate and saved_resources and not path_data:
        path_state = await build_graph_state(
            user_id,
            {
                "intent": "path",
                "messages": [{"role": "user", "content": "请根据已生成资源规划学习路径"}],
                "deep_thinking": deep_thinking,
            },
        )
        path_result = await graph.ainvoke(path_state)
        path_data = path_result.get("path")
        if path_data:
            await save_path(path_data)
            if path_result.get("reply"):
                result["reply"] = (result.get("reply") or "") + "\n\n" + path_result["reply"]

    profile = result.get("profile")
    if profile:
        profile_obj = StudentProfile(**{k: v for k, v in profile.items() if k in StudentProfile.model_fields})
    else:
        existing = await get_profile(user_id)
        profile_obj = StudentProfile(**existing) if existing else None

    return ChatResponse(
        reply=result.get("reply", "处理完成"),
        profile=profile_obj,
        intent=result.get("intent", intent),
        resources=_resource_summaries(saved_resources),
        path=path_data,
    )


async def stream_chat(
    user_id: str, message: str, chunk_size: int = 8, *, deep_thinking: bool = False
) -> AsyncIterator[dict]:
    """SSE 事件：intent / progress / token / profile / resources / path / done / error"""
    intent = classify_intent(message)
    yield {"event": "intent", "data": intent}
    if deep_thinking:
        yield {
            "event": "progress",
            "data": json.dumps({"stage": "deep_thinking"}, ensure_ascii=False),
        }
    yield {"event": "progress", "data": json.dumps({"stage": intent}, ensure_ascii=False)}

    try:
        base = await build_graph_state(
            user_id,
            {
                "messages": [{"role": "user", "content": message}],
                "intent": intent,
                "topic": _extract_topic(message),
                "deep_thinking": deep_thinking,
            },
        )
        graph = build_graph()
        yield {"event": "progress", "data": json.dumps({"stage": "running"}, ensure_ascii=False)}
        result = await graph.ainvoke(base)

        prior_ids = {r.get("id") for r in base.get("resources") or [] if r.get("id")}
        saved_resources = _new_resources_from_result(result, prior_ids)
        if saved_resources:
            await save_resources(user_id, saved_resources)
            summaries = _resource_summaries(saved_resources)
            yield {"event": "resources", "data": json.dumps(summaries, ensure_ascii=False)}

        path_data = result.get("path")
        settings = get_settings()
        if intent == "generate" and settings.auto_path_after_generate and saved_resources and not path_data:
            yield {"event": "progress", "data": json.dumps({"stage": "path"}, ensure_ascii=False)}
            path_state = await build_graph_state(
                user_id,
                {
                    "intent": "path",
                    "messages": [{"role": "user", "content": "请根据已生成资源规划学习路径"}],
                    "deep_thinking": deep_thinking,
                },
            )
            path_result = await graph.ainvoke(path_state)
            path_data = path_result.get("path")
            if path_data:
                await save_path(path_data)
                if path_result.get("reply"):
                    result["reply"] = (result.get("reply") or "") + "\n\n" + path_result["reply"]

        if path_data:
            yield {
                "event": "path",
                "data": json.dumps(
                    {"steps": len(path_data.get("steps", [])), "version": path_data.get("version", 1)},
                    ensure_ascii=False,
                ),
            }

        profile = result.get("profile")
        if profile:
            yield {"event": "profile", "data": json.dumps(profile, ensure_ascii=False, default=str)}

        reply = result.get("reply", "处理完成")
        chunk_size = max(1, min(chunk_size, 64))
        for i in range(0, len(reply), chunk_size):
            yield {"event": "token", "data": reply[i : i + chunk_size]}
        yield {"event": "done", "data": reply}
    except Exception as exc:
        yield {"event": "error", "data": str(exc)}


def _new_resources_from_result(result: dict, prior_ids: set[str]) -> list[dict]:
    explicit = result.get("new_resources")
    if explicit is not None:
        return list(explicit)
    return [
        r
        for r in (result.get("resources") or [])
        if r.get("id") and r.get("id") not in prior_ids
    ]


def _resource_summaries(resources: list[dict]) -> list[dict]:
    return [
        {"id": r.get("id", ""), "type": r.get("type", ""), "title": r.get("title", "")}
        for r in resources
        if r.get("id")
    ]


def _extract_topic(message: str) -> str:
    for kw in ["线性回归", "逻辑回归", "梯度下降", "过拟合", "机器学习"]:
        if kw in message:
            return kw
    return "机器学习导论"
