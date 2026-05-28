import json
from typing import AsyncIterator

from app.agents.graph import build_graph
from app.agents.supervisor import classify_intent
from app.core.config import get_settings
from app.db.repository import get_profile, list_resources, save_path, save_resources
from app.models.schemas import ChatResponse, StudentProfile
from app.services.chat_intelligence_service import stream_intelligent_chat
from app.services.graph_state import build_graph_state


async def run_chat(
    user_id: str,
    message: str,
    *,
    deep_thinking: bool = False,
    web_search: bool = False,
    attachment_context: str = "",
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

    reply = (result.get("reply") or "").strip()
    return ChatResponse(
        reply=reply or "暂时无法生成回复，请稍后重试。",
        profile=profile_obj,
        intent=result.get("intent", intent),
        resources=_resource_summaries(saved_resources),
        path=path_data,
    )


async def _yield_text_tokens(text: str, chunk_size: int = 1) -> AsyncIterator[dict]:
    """将完整文本按字符/小片段推送，模拟打字效果。"""
    step = max(1, min(chunk_size, 4))
    for i in range(0, len(text), step):
        yield {"event": "token", "data": text[i : i + step]}


async def stream_chat(
    user_id: str,
    message: str,
    chunk_size: int = 8,
    *,
    deep_thinking: bool = False,
    web_search: bool = False,
    attachment_context: str = "",
) -> AsyncIterator[dict]:
    """SSE：intent / progress / token（LLM 真流式或逐字输出）/ profile / resources / path / done"""
    intent = classify_intent(message)
    topic = _extract_topic(message)
    yield {"event": "intent", "data": intent}
    if deep_thinking:
        yield {
            "event": "progress",
            "data": json.dumps({"stage": "deep_thinking"}, ensure_ascii=False),
        }
    if web_search:
        yield {
            "event": "progress",
            "data": json.dumps({"stage": "web_research"}, ensure_ascii=False),
        }
    yield {"event": "progress", "data": json.dumps({"stage": intent}, ensure_ascii=False)}

    try:
        if intent == "chat":
            yield {"event": "progress", "data": json.dumps({"stage": "retrieval"}, ensure_ascii=False)}
            base = await build_graph_state(
                user_id,
                {
                    "messages": [{"role": "user", "content": message}],
                    "intent": intent,
                    "topic": topic,
                    "deep_thinking": deep_thinking,
                },
            )
            yield {"event": "progress", "data": json.dumps({"stage": "chat"}, ensure_ascii=False)}

            final_reply = ""
            profile_data = None
            async for item in stream_intelligent_chat(
                user_id,
                message,
                topic,
                profile=base.get("profile"),
                resources=base.get("resources"),
                deep_thinking=deep_thinking,
                web_search=web_search,
                attachment_context=attachment_context,
            ):
                if item["type"] == "token":
                    yield {"event": "token", "data": item["data"]}
                elif item["type"] == "error":
                    err = item.get("data") or "LLM error"
                    yield {"event": "token", "data": f"⚠️ {err}"}
                    yield {"event": "done", "data": f"⚠️ {err}"}
                    return
                elif item["type"] == "profile":
                    profile_data = item.get("data")
                    if profile_data:
                        yield {
                            "event": "profile",
                            "data": json.dumps(profile_data, ensure_ascii=False, default=str),
                        }
                elif item["type"] == "done":
                    final_reply = item.get("data") or ""
                    if item.get("profile"):
                        profile_data = item.get("profile")

            if not (final_reply or "").strip():
                fallback = (
                    "⚠️ 对话生成结果为空。Kimi 接口可能不稳定，请稍后重试；"
                    "或在 .env 设置 LLM_MOCK=true 后重启后端。"
                )
                async for tok in _yield_text_tokens(fallback, 1):
                    yield tok
                yield {"event": "done", "data": fallback}
                return

            if profile_data:
                yield {
                    "event": "profile",
                    "data": json.dumps(profile_data, ensure_ascii=False, default=str),
                }
            yield {"event": "done", "data": final_reply}
            return

        base = await build_graph_state(
            user_id,
            {
                "messages": [{"role": "user", "content": message}],
                "intent": intent,
                "topic": topic,
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

        reply = (result.get("reply") or "").strip()
        stream_step = 1 if chunk_size <= 4 else min(chunk_size, 3)
        if not reply:
            reply = (
                "⚠️ 智能体未返回有效内容（可能为 Kimi 接口超时）。"
                "请稍后重试，或检查 .env 中的 API Key / LLM_MOCK 配置。"
            )
        async for tok in _yield_text_tokens(reply, stream_step):
            yield tok
        yield {"event": "done", "data": reply}
    except Exception as exc:
        err = f"⚠️ 智能体调用失败：{exc}"
        async for tok in _yield_text_tokens(err, 1):
            yield tok
        yield {"event": "done", "data": err}


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
    for kw in ["线性回归", "逻辑回归", "梯度下降", "过拟合", "机器学习", "深度学习"]:
        if kw in message:
            return kw
    return "综合学习"
