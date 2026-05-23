import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.agents.nodes.tutor_llm import (
    build_tutor_messages,
    postprocess_tutor_answer,
    run_tutor_llm,
)
from app.api.deps import ensure_same_user, get_current_user_id
from app.core.llm import get_primary_llm
from app.core.prompts import tutor_temperature
from app.models.schemas import TutorRequest

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
    reply = await run_tutor_llm(
        req.question,
        req.topic or "机器学习导论",
        deep_thinking=req.deep_thinking,
    )
    return {"reply": reply}


@router.post("/stream")
async def ask_stream(
    req: TutorStreamRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(req.user_id, current_user_id)
    topic = req.topic or "机器学习导论"

    async def event_generator():
        yield {"event": "intent", "data": "tutor"}
        if req.deep_thinking:
            yield {
                "event": "progress",
                "data": json.dumps({"stage": "deep_thinking"}, ensure_ascii=False),
            }
        yield {"event": "progress", "data": json.dumps({"stage": "tutor"}, ensure_ascii=False)}
        try:
            messages, chunks, _ctx = await build_tutor_messages(
                req.question, topic, deep_thinking=req.deep_thinking
            )
            llm = get_primary_llm()
            acc = ""
            if llm.use_mock:
                reply = await run_tutor_llm(
                    req.question, topic, deep_thinking=req.deep_thinking
                )
                chunk_size = max(1, min(req.chunk_size, 64))
                for i in range(0, len(reply), chunk_size):
                    yield {"event": "token", "data": reply[i : i + chunk_size]}
                yield {"event": "done", "data": reply}
                return

            async for token in llm.stream_chat(
                messages,
                temperature=tutor_temperature(req.deep_thinking),
                deep_thinking=req.deep_thinking,
            ):
                acc += token
                yield {"event": "token", "data": token}
            reply = postprocess_tutor_answer(acc, chunks, topic)
            yield {"event": "done", "data": reply}
        except Exception as exc:
            yield {"event": "error", "data": str(exc)}

    return EventSourceResponse(event_generator())
