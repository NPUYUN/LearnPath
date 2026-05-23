"""辅导节点与流式接口共用的 LLM 消息构建与回复后处理。"""

from app.core.guardrails import attach_sources, filter_sensitive
from app.core.prompts import tutor_system, tutor_temperature
from app.rag.retriever import retrieve


async def build_tutor_messages(
    question: str,
    topic: str,
    *,
    deep_thinking: bool = False,
) -> tuple[list[dict[str, str]], list[dict], str]:
    chunks = await retrieve(question or topic, k=4)
    context = "\n".join(c["text"] for c in chunks)
    messages = [
        {"role": "system", "content": tutor_system(deep_thinking)},
        {
            "role": "user",
            "content": f"主题：{topic}\n问题：{question}\n\n知识库：{context}",
        },
    ]
    return messages, chunks, context


def postprocess_tutor_answer(answer: str, chunks: list[dict], topic: str) -> str:
    answer = filter_sensitive(answer)
    if "```mermaid" not in answer:
        answer += (
            "\n\n### 知识关系图解\n\n```mermaid\nflowchart LR\n"
            f"  A[{topic}] --> B[核心概念]\n  B --> C[练习巩固]\n```\n"
        )
    if "分镜" not in answer:
        answer += (
            "\n\n### 短视频分镜脚本\n"
            "1. 开场：学习目标\n2. 讲解：关键公式/直觉\n3. 例题：一步推导\n4. 小结：易错点\n"
        )
    return attach_sources(answer, chunks)


async def run_tutor_llm(
    question: str,
    topic: str,
    *,
    deep_thinking: bool = False,
) -> str:
    from app.core.llm import get_primary_llm

    messages, chunks, _ctx = await build_tutor_messages(
        question, topic, deep_thinking=deep_thinking
    )
    llm = get_primary_llm()
    raw = await llm.chat(
        messages,
        temperature=tutor_temperature(deep_thinking),
        deep_thinking=deep_thinking,
    )
    return postprocess_tutor_answer(raw, chunks, topic)
