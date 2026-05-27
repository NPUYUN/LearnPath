"""讯飞星火（OpenAI 兼容）— 有 Key 时承担主任务。"""

from functools import lru_cache

from app.core.config import get_settings
from app.core.llm.openai_compat import OpenAICompatClient


class SparkLLMClient(OpenAICompatClient):
    def __init__(self) -> None:
        s = get_settings()
        super().__init__(
            provider="spark",
            base_url=s.spark_base_url,
            api_key=s.spark_api_key,
            model=s.spark_model,
            mock_quick=False,
        )


# 兼容旧名称
SparkClient = SparkLLMClient


@lru_cache
def get_spark_client() -> SparkLLMClient:
    return SparkLLMClient()
