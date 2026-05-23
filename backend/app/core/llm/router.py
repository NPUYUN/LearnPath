"""LLM 路由：有星火 Key 时主任务走星火、次要任务走辅助云端模型；无星火时主任务走辅助模型。"""

from __future__ import annotations

from enum import Enum
from functools import lru_cache

from app.core.config import get_settings
from app.core.llm.aux_client import AuxLLMClient, get_aux_client
from app.core.llm.mock_client import MockLLMClient
from app.core.llm.openai_compat import LLMClient, OpenAICompatClient
from app.core.llm.spark_client import SparkLLMClient, get_spark_client


class LLMRole(str, Enum):
    PRIMARY = "primary"
    AUXILIARY = "auxiliary"


@lru_cache
def get_primary_llm() -> LLMClient:
    """画像、辅导、对话等核心生成任务。"""
    settings = get_settings()
    if settings.llm_mock:
        return MockLLMClient()
    if settings.has_spark:
        return get_spark_client()
    if settings.has_aux:
        return get_aux_client()
    return MockLLMClient()


@lru_cache
def get_aux_llm() -> LLMClient:
    """推荐理由润色、资源质检等次要任务（不占用星火配额）。"""
    settings = get_settings()
    if settings.llm_mock:
        return MockLLMClient(quick=True)
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
    return {
        "llm_mock": settings.llm_mock,
        "has_spark_key": settings.has_spark,
        "has_aux_key": settings.has_aux,
        "primary_provider": primary.provider,
        "primary_mock": primary.use_mock,
        "aux_provider": aux.provider,
        "aux_mock": aux.use_mock,
        "routing": (
            "spark_primary+aux_secondary"
            if settings.has_spark and settings.has_aux and not settings.llm_mock
            else "aux_only"
            if settings.has_aux and not settings.has_spark and not settings.llm_mock
            else "spark_only"
            if settings.has_spark and not settings.llm_mock
            else "mock"
        ),
    }


# 向后兼容
def get_llm_client() -> LLMClient:
    return get_primary_llm()


__all__ = [
    "LLMRole",
    "get_primary_llm",
    "get_aux_llm",
    "get_llm_for_role",
    "get_llm_client",
    "llm_runtime_status",
]
