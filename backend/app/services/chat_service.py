import asyncio
import json
from typing import AsyncIterator

from app.agents.graph import build_graph
from app.agents.supervisor import classify_intent
from app.core.config import get_settings
from app.db.repository import get_profile, list_resources, save_path, save_resources
from app.models.schemas import ChatResponse, RealtimeLearningState, StudentProfile
from app.core.llm.deep_thinking import graph_stream_chunk_size
from app.services.chat_intelligence_service import (
    build_chitchat_reply,
    classify_question_type,
    stream_local_text,
    stream_intelligent_chat,
)
from app.services.graph_state import build_graph_state
from app.services.realtime_state_service import analyze_realtime_state


async def run_chat(
    user_id: str,
    message: str,
    *,
    deep_thinking: bool = False,
    web_search: bool = False,
    attachment_context: str = "",
    attachments: list[dict] | None = None,
) -> ChatResponse:
    attachment_context = await _resolve_attachment_context(
        user_id, message, attachment_context, attachments
    )
    intent = classify_intent(message)
    existing_profile = await get_profile(user_id)
    realtime_state = await analyze_realtime_state(
        user_id,
        message,
        profile=existing_profile,
        question_type=classify_question_type(message),
        deep_thinking=deep_thinking,
    )
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
        profile_obj = StudentProfile(**existing_profile) if existing_profile else None
    realtime_state = result.get("realtime_state") or realtime_state
    realtime_state_obj = (
        RealtimeLearningState(
            **{k: v for k, v in realtime_state.items() if k in RealtimeLearningState.model_fields}
        )
        if realtime_state
        else None
    )

    reply = (result.get("reply") or "").strip()
    return ChatResponse(
        reply=reply or "暂时无法生成回复，请稍后重试。",
        profile=profile_obj,
        realtime_state=realtime_state_obj,
        intent=result.get("intent", intent),
        resources=_resource_summaries(saved_resources),
        path=path_data,
    )


async def _yield_text_tokens(text: str, chunk_size: int = 1) -> AsyncIterator[dict]:
    """将完整文本按行伪流式推送（智能体非 chat 意图回退路径）。"""
    from app.core.llm.resilience import yield_text_stream

    async for piece in yield_text_stream(text, atomic_lines=True):
        yield {"event": "token", "data": piece}


async def _resolve_attachment_context(
    user_id: str,
    message: str,
    attachment_context: str,
    attachments: list[dict] | None,
) -> str:
    if attachments:
        from app.services.chat_attachment_text import build_attachment_context_async

        return await build_attachment_context_async(
            attachments,
            user_id,
            user_question=message,
        )
    return (attachment_context or "").strip()


def _is_meta_chat_message(message: str) -> bool:
    text = (message or "").strip().lower()
    return any(
        key in text
        for key in (
            "你好",
            "您好",
            "hello",
            "hi",
            "你是谁",
            "你叫什么",
            "你能做什么",
            "你有什么功能",
            "你能怎么帮",
            "你可以怎么帮",
            "怎么帮我",
            "能帮我",
            "介绍一下你自己",
            "学径是什么",
            "learnpath",
        )
    )


async def stream_chat(
    user_id: str,
    message: str,
    chunk_size: int = 8,
    *,
    deep_thinking: bool = False,
    web_search: bool = False,
    attachment_context: str = "",
    attachments: list[dict] | None = None,
) -> AsyncIterator[dict]:
    """SSE：intent / progress / token（LLM 真流式或逐字输出）/ profile / resources / path / done"""
    has_images = bool(
        attachments and any((a.get("kind") or "file") == "image" for a in attachments)
    )
    if has_images:
        yield {
            "event": "progress",
            "data": json.dumps({"stage": "vision_analysis"}, ensure_ascii=False),
        }
    attachment_context = await _resolve_attachment_context(
        user_id, message, attachment_context, attachments
    )
    question_type = classify_question_type(message)
    if (question_type == "chitchat" or _is_meta_chat_message(message)) and not attachment_context.strip():
        existing_profile = await get_profile(user_id)
        reply = build_chitchat_reply(message, existing_profile)
        yield {"event": "intent", "data": "chat"}
        yield {
            "event": "progress",
            "data": json.dumps({"stage": "fast_reply"}, ensure_ascii=False),
        }
        async for item in stream_local_text(reply, chunk_size):
            yield {"event": "token", "data": item.get("data", "")}
        yield {"event": "done", "data": reply}
        return

    intent = classify_intent(message)
    topic = _extract_topic(message)
    yield {
        "event": "progress",
        "data": json.dumps({"stage": "realtime_state"}, ensure_ascii=False),
    }
    existing_profile = await get_profile(user_id)

    async def _analyze_state() -> dict:
        return await analyze_realtime_state(
            user_id,
            message,
            profile=existing_profile,
            question_type=question_type,
            deep_thinking=deep_thinking,
        )

    async def _preload_chat_base() -> dict:
        return await build_graph_state(
            user_id,
            {
                "messages": [{"role": "user", "content": message}],
                "intent": "chat",
                "topic": topic,
                "deep_thinking": deep_thinking,
            },
        )

    if intent == "chat":
        realtime_state, chat_base = await asyncio.gather(_analyze_state(), _preload_chat_base())
    else:
        realtime_state = await _analyze_state()
        chat_base = None

    yield {"event": "intent", "data": intent}
    yield {"event": "realtime_state", "data": json.dumps(realtime_state, ensure_ascii=False, default=str)}
    if deep_thinking:
        yield {
            "event": "progress",
            "data": json.dumps({"stage": "deep_thinking"}, ensure_ascii=False),
        }
    else:
        yield {
            "event": "progress",
            "data": json.dumps({"stage": "fast_reply"}, ensure_ascii=False),
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
            base = chat_base or await build_graph_state(
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
                realtime_state=realtime_state,
                resources=base.get("resources"),
                deep_thinking=deep_thinking,
                web_search=web_search,
                attachment_context=attachment_context,
                chunk_size=chunk_size,
                update_profile=deep_thinking,
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
                elif item["type"] == "realtime_state":
                    state_data = item.get("data")
                    if state_data:
                        yield {
                            "event": "realtime_state",
                            "data": json.dumps(state_data, ensure_ascii=False, default=str),
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

        if intent == "path":
            from app.agents.nodes.path_agent import path_node

            base = await build_graph_state(
                user_id,
                {
                    "messages": [{"role": "user", "content": message}],
                    "intent": intent,
                    "topic": topic,
                    "deep_thinking": deep_thinking,
                },
            )
            yield {"event": "progress", "data": json.dumps({"stage": "path"}, ensure_ascii=False)}
            result = await path_node({**base, "deep_thinking": deep_thinking})
            path_data = result.get("path")
            if path_data:
                await save_path(path_data)
                yield {
                    "event": "path",
                    "data": json.dumps(
                        {"steps": len(path_data.get("steps", [])), "version": path_data.get("version", 1)},
                        ensure_ascii=False,
                    ),
                }
            reply = (result.get("reply") or "").strip()
            stream_step = graph_stream_chunk_size(deep_thinking=deep_thinking, chunk_size=chunk_size)
            if not reply:
                reply = "⚠️ 路径规划未返回内容，请稍后重试。"
            async for tok in _yield_text_tokens(reply, stream_step):
                yield tok
            yield {"event": "done", "data": reply}
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
        stream_step = graph_stream_chunk_size(
            deep_thinking=deep_thinking, chunk_size=chunk_size
        )
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
    text = message.strip()
    for noise in (
        "请帮我",
        "帮我",
        "请",
        "规划",
        "复习计划",
        "学习计划",
        "学习路径",
        "路径",
        "计划",
    ):
        text = text.replace(noise, "")
    text = text.strip("，。！？,.!? \t\n")
    if len(text) >= 2:
        return text[:48]
    for kw in [
        "计算机网络",
        "操作系统",
        "数据结构",
        "线性回归",
        "逻辑回归",
        "梯度下降",
        "过拟合",
        "机器学习",
        "深度学习",
    ]:
        if kw in message:
            return kw
    return "综合学习"
