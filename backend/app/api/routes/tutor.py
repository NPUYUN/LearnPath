import json

from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse

from app.agents.nodes.tutor_llm import (
    build_tutor_messages,
    postprocess_tutor_answer,
    run_tutor_llm,
)
from app.api.deps import ensure_same_user, get_current_user_id
from app.core.llm import get_primary_llm
from app.core.prompts import chat_temperature
from app.db.repository import get_profile, list_resources
from app.models.schemas import TutorRequest
from app.services.chat_intelligence_service import classify_question_type

router = APIRouter(prefix="/tutor", tags=["tutor"])


class TutorStreamRequest(TutorRequest):
    chunk_size: int = 8
    deep_thinking: bool = False


@router.post("/ask")
async def ask(
    req: TutorRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(req.user_id, current_user_id)
    profile = await get_profile(req.user_id)
    resources = await list_resources(req.user_id)
    reply = await run_tutor_llm(
        req.question,
        req.topic or "综合学习",
        user_id=req.user_id,
        profile=profile,
        resources=resources,
        deep_thinking=req.deep_thinking,
    )
    return {"reply": reply}


@router.post("/stream")
async def ask_stream(
    req: TutorStreamRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(req.user_id, current_user_id)
    topic = req.topic or "综合学习"
    profile = await get_profile(req.user_id)
    resources = await list_resources(req.user_id)
    qtype = classify_question_type(req.question)

    async def event_generator():
        yield {"event": "intent", "data": "chat"}
        if req.deep_thinking:
            yield {
                "event": "progress",
                "data": json.dumps({"stage": "deep_thinking"}, ensure_ascii=False),
            }
        yield {
            "event": "progress",
            "data": json.dumps({"stage": "retrieval"}, ensure_ascii=False),
        }
        try:
            messages, chunks, mode = await build_tutor_messages(
                req.question,
                topic,
                user_id=req.user_id,
                profile=profile,
                resources=resources,
                deep_thinking=req.deep_thinking,
            )
            llm = get_primary_llm()
            acc = ""
            if llm.use_mock:
                reply = await run_tutor_llm(
                    req.question,
                    topic,
                    user_id=req.user_id,
                    profile=profile,
                    resources=resources,
                    deep_thinking=req.deep_thinking,
                )
                chunk_size = max(1, min(req.chunk_size, 64))
                for i in range(0, len(reply), chunk_size):
                    yield {"event": "token", "data": reply[i : i + chunk_size]}
                yield {"event": "done", "data": reply}
                return

            async for token in llm.stream_chat(
                messages,
                temperature=chat_temperature(req.deep_thinking),
                deep_thinking=req.deep_thinking,
            ):
                acc += token
                yield {"event": "token", "data": token}
            reply = postprocess_tutor_answer(
                acc, chunks, topic, question_type=qtype, mode=mode
            )
            yield {"event": "done", "data": reply}
        except Exception as exc:
            yield {"event": "error", "data": str(exc)}

    return EventSourceResponse(event_generator())
