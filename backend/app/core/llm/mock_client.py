"""无可用 API Key 时的本地 Mock 回复（不下载模型）。"""

from __future__ import annotations

import asyncio
from typing import AsyncIterator


def mock_chat_response(
    messages: list[dict[str, str]],
    *,
    deep: bool = False,
    quick: bool = False,
) -> str:
    user_msg = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
    system_msg = next((m["content"] for m in messages if m.get("role") == "system"), "")
    snippet = user_msg[:80] + ("…" if len(user_msg) > 80 else "")

    if "资源生成 Agent" in system_msg or "资源生成" in system_msg:
        import re

        topic_match = re.search(r"学习主题：(.+)", user_msg)
        title_match = re.search(r"资源标题：(.+)", user_msg)
        topic = (topic_match.group(1).split("\n")[0].strip() if topic_match else "学习主题")
        title = (title_match.group(1).split("\n")[0].strip() if title_match else topic)
        body = (
            f"# {title}\n\n"
            "## 学习目标\n"
            f"- 理解「{topic}」的核心概念、适用场景与常见误区。\n"
            "- 能结合例题说明关键步骤。\n\n"
            "## 正文\n"
            f"本节围绕「{topic}」展开自学讲解（Mock 模式占位正文）。"
            "配置真实 API Key 后将输出完整 LLM 生成结果。\n\n"
        )
        if deep:
            body += (
                "## 分析要点\n"
                "- 对照资料库上下文核对术语。\n"
                "- 补充例题与易错点。\n\n"
                "## 小结\n"
                "请完成配套练习巩固理解，并回顾知识库引用章节。"
            )
        else:
            body += "## 小结\n请完成配套练习巩固理解。"
        return body

    if quick:
        return f"[辅助模型 Mock] {snippet[:60]} — 已记录推荐上下文。"

    if deep:
        is_profile = "画像" in system_msg or "JSON" in system_msg
        if is_profile:
            return (
                "### 分析要点\n"
                f"- 从对话「{snippet}」推断知识基础与学习偏好。\n"
                "- 薄弱点需结合学科关键词更新 error_prone_topics。\n"
                "- 结合 weekly 时间投入校准 pace_and_time。\n\n"
                "### 结论\n"
                '{"knowledge_level":"入门偏上","learning_goal":"掌握机器学习导论核心概念",'
                '"cognitive_style":"偏实践","error_prone_topics":["线性回归"],'
                '"preferred_modality":"文档+练习","pace_and_time":"每周约5小时",'
                '"recent_progress":"对话中已更新画像"}'
            )
        return (
            "### 分析要点\n"
            f"- 问题聚焦：{snippet}\n"
            "- 知识库：机器学习导论相关章节（Mock 模式无真实检索）。\n"
            "- 推理：先建立概念框架，再给出例题与易错点。\n"
            "- 对比：与相邻概念区分，避免混淆。\n\n"
            "### 结论\n"
            f"针对「{snippet}」：建议先回顾定义与直觉，再结合 2–3 道练习巩固；"
            "若涉及公式，请写出关键假设与适用条件。"
        )

    return (
        f"**结论**：关于「{snippet}」，核心是理解定义并能在简单例题中应用。\n\n"
        "- 先记住 1 句直觉解释；\n"
        "- 再看 1 个最小例子；\n"
        "- 有疑问可在对话中继续追问。\n\n"
        "（Mock 快速模式 · 配置 API Key 后可获得完整 LLM 回答）"
    )


class MockLLMClient:
    provider = "mock"

    def __init__(self, *, quick: bool = False) -> None:
        self.quick = quick

    @property
    def is_available(self) -> bool:
        return True

    @property
    def use_mock(self) -> bool:
        return True

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        deep_thinking: bool = False,
        task: str = "chat",
    ) -> str:
        if deep_thinking:
            await asyncio.sleep(0.6)
        return mock_chat_response(messages, deep=deep_thinking, quick=self.quick)

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        deep_thinking: bool = False,
        task: str = "chat",
    ) -> AsyncIterator[str]:
        if deep_thinking:
            await asyncio.sleep(0.5)
        content = await self.chat(
            messages, temperature=temperature, deep_thinking=deep_thinking, task=task
        )
        step = 1 if deep_thinking else 5
        delay = 0.012 if deep_thinking else 0.002
        for i in range(0, len(content), step):
            yield content[i : i + step]
            if delay:
                await asyncio.sleep(delay)
