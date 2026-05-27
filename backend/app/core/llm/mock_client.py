"""无可用 API Key 时的本地 Mock 回复（不下载模型）。"""

from __future__ import annotations

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
        return (
            f"# {snippet}\n\n"
            "## 学习目标\n"
            "掌握主题核心概念（Mock 模式示例输出）。\n\n"
            "## 正文\n"
            "基于资料库/全网摘要生成的占位内容。配置星火 API 后将输出完整 LLM 生成结果。\n\n"
            "## 小结\n"
            "请完成配套练习巩固理解。"
        )

    if quick:
        return f"[辅助模型 Mock] {snippet[:60]} — 已记录推荐上下文。"

    if deep:
        is_profile = "画像" in system_msg or "JSON" in system_msg
        if is_profile:
            return (
                "### 分析要点\n"
                f"- 从对话「{snippet}」推断知识基础与学习偏好。\n"
                "- 薄弱点需结合学科关键词更新 error_prone_topics。\n\n"
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
            "- 推理：先建立概念框架，再给出例题与易错点。\n\n"
            "### 结论\n"
            f"针对「{snippet}」：建议先回顾定义与直觉，再结合练习巩固。"
        )

    return (
        f"[Mock] 已收到：{snippet} "
        "学径将基于机器学习导论知识库为你生成个性化学习内容。"
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
    ) -> str:
        return mock_chat_response(messages, deep=deep_thinking, quick=self.quick)

    async def stream_chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.7,
        deep_thinking: bool = False,
    ) -> AsyncIterator[str]:
        content = await self.chat(
            messages, temperature=temperature, deep_thinking=deep_thinking
        )
        step = 2 if self.quick else 1
        for i in range(0, len(content), step):
            yield content[i : i + step]
