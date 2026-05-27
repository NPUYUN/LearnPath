"""辅导 LLM：与 /api/tutor 及流式接口共用，走智能对话管线。"""

from app.services.chat_intelligence_service import (
    build_intelligent_chat_messages,
    postprocess_multimodal_answer,
    retrieve_resource_library_context,
    run_intelligent_chat,
)


async def build_tutor_messages(
    question: str,
    topic: str,
    *,
    user_id: str = "demo",
    profile: dict | None = None,
    resources: list[dict] | None = None,
    deep_thinking: bool = False,
) -> tuple[list[dict[str, str]], list[dict], str]:
    from app.services.chat_intelligence_service import classify_question_type

    qtype = classify_question_type(question)
    retrieval = await retrieve_resource_library_context(user_id, question, resources)
    messages, chunks, mode = build_intelligent_chat_messages(
        question=question,
        topic=topic,
        question_type=qtype,
        profile=profile,
        retrieval=retrieval,
        deep_thinking=deep_thinking,
    )
    return messages, chunks, mode


def postprocess_tutor_answer(
    answer: str,
    chunks: list[dict],
    topic: str,
    *,
    question_type: str = "concept",
    mode: str = "direct",
) -> str:
    return postprocess_multimodal_answer(
        answer, question_type, chunks, topic, mode=mode
    )


async def run_tutor_llm(
    question: str,
    topic: str,
    *,
    user_id: str = "demo",
    profile: dict | None = None,
    resources: list[dict] | None = None,
    deep_thinking: bool = False,
) -> str:
    result = await run_intelligent_chat(
        user_id,
        question,
        topic,
        profile=profile,
        resources=resources,
        deep_thinking=deep_thinking,
        update_profile=False,
    )
    return result.get("reply", "")
