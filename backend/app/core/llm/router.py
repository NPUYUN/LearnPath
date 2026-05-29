"""LLM 路由：Kimi 优先；否则星火主 + 辅助云端；无 Key 时 Mock。"""

from __future__ import annotations

from enum import Enum
from functools import lru_cache

from app.core.config import get_settings
from app.core.llm.aux_client import get_aux_client
from app.core.llm.kimi_client import get_kimi_client
from app.core.llm.mock_client import MockLLMClient
from app.core.llm.openai_compat import LLMClient
from app.core.llm.spark_client import get_spark_client


class LLMRole(str, Enum):
    PRIMARY = "primary"
    AUXILIARY = "auxiliary"


@lru_cache
def get_primary_llm() -> LLMClient:
    """画像、辅导、对话、资源生成等核心任务。"""
    settings = get_settings()
    if settings.llm_mock:
        return MockLLMClient()
    if settings.has_kimi:
        return get_kimi_client()
    if settings.has_spark:
        return get_spark_client()
    if settings.has_aux:
        return get_aux_client()
    return MockLLMClient()


@lru_cache
def get_aux_llm() -> LLMClient:
    """推荐润色、质检等次要任务；Kimi 模式下与主通道相同。"""
    settings = get_settings()
    if settings.llm_mock:
        return MockLLMClient(quick=True)
    if settings.has_kimi:
        return get_kimi_client()
    if settings.has_aux:
        return get_aux_client()
    return MockLLMClient(quick=True)


def get_llm_for_role(role: LLMRole) -> LLMClient:
    if role == LLMRole.AUXILIARY:
        return get_aux_llm()
    return get_primary_llm()


def llm_runtime_status() -> dict:
    settings = get_settings()
    primary = get_primary_llm()
    aux = get_aux_llm()
    if settings.llm_mock:
        routing = "mock"
    elif settings.has_kimi:
        routing = "kimi_all"
    elif settings.has_spark and settings.has_aux:
        routing = "spark_primary+aux_secondary"
    elif settings.has_aux and not settings.has_spark:
        routing = "aux_only"
    elif settings.has_spark:
        routing = "spark_only"
    else:
        routing = "mock"
    return {
        "llm_mock": settings.llm_mock,
        "has_kimi_key": settings.has_kimi,
        "has_spark_key": settings.has_spark,
        "has_aux_key": settings.has_aux,
        "primary_provider": primary.provider,
        "primary_mock": primary.use_mock,
        "aux_provider": aux.provider,
        "aux_mock": aux.use_mock,
        "kimi_model": settings.kimi_model if settings.has_kimi else None,
        "routing": routing,
    }


def get_llm_client() -> LLMClient:
    return get_primary_llm()


def get_chat_llm_fallback_chain() -> list[LLMClient]:
    """智能对话流式调用：主通道失败后依次尝试其它已配置通道。"""
    settings = get_settings()
    seen: set[str] = set()
    chain: list[LLMClient] = []

    def add(client: LLMClient) -> None:
        if client.provider in seen:
            return
        seen.add(client.provider)
        chain.append(client)

    add(get_primary_llm())
    if settings.has_aux:
        add(get_aux_client())
    if settings.has_spark:
        add(get_spark_client())
    if not chain or all(getattr(c, "use_mock", False) for c in chain):
        chain.append(MockLLMClient())
    return chain


__all__ = [
    "LLMRole",
    "get_primary_llm",
    "get_aux_llm",
    "get_llm_for_role",
    "get_llm_client",
    "get_chat_llm_fallback_chain",
    "llm_runtime_status",
]
