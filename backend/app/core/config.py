from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# 项目根目录 A3/
ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    llm_mock: bool = False

    # Kimi / Moonshot（测试与生产均可；配置后优先于星火与辅助通道）
    kimi_api_key: str = ""
    kimi_base_url: str = "https://api.moonshot.cn/v1"
    kimi_model: str = "moonshot-v1-32k"

    spark_api_key: str = ""
    spark_base_url: str = "https://spark-api-open.xf-yun.com/v1"
    spark_model: str = "generalv3.5"

    # 辅助云端 LLM（OpenAI 兼容：硅基流动 / DeepSeek / Groq / OpenRouter 等，无需本地权重）
    aux_llm_api_key: str = ""
    aux_llm_base_url: str = "https://api.siliconflow.cn/v1"
    aux_llm_model: str = "Qwen/Qwen2.5-7B-Instruct"

    database_url: str = f"sqlite:///{(ROOT_DIR / 'storage' / 'learnpath.db').as_posix()}"
    chroma_persist_dir: str = str(ROOT_DIR / "storage" / "chroma")
    knowledge_base_dir: str = str(ROOT_DIR / "data" / "knowledge_base" / "ml_intro")

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    # ── SMTP / OTP ──────────────────────────────────────────────────────────
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    # 当 smtp_host 未配置时，将验证码打印到日志并在响应中返回（仅用于演示）
    otp_debug: bool = True

    # ── JWT ─────────────────────────────────────────────────────────────────
    jwt_secret: str = "learnpath-dev-secret-change-in-production"
    jwt_expire_hours: int = 72
    auto_path_after_generate: bool = True
    dev_reload: bool = True

    spark_tts_url: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def has_kimi(self) -> bool:
        return bool(self.kimi_api_key.strip())

    @property
    def has_spark(self) -> bool:
        return bool(self.spark_api_key.strip())

    @property
    def has_aux(self) -> bool:
        return bool(self.aux_llm_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
