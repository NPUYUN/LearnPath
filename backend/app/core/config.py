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
    # 讯飞文生图 TTI（控制台 https://console.xfyun.cn/services/tti 获取三要素）
    spark_app_id: str = ""
    spark_api_secret: str = ""
    spark_tti_api_key: str = ""  # 文生图 APIKey；留空则回退 SPARK_API_KEY（可能与 APIPassword 不同）
    spark_tti_max_images: int = 4

    # 阿里云百炼 · 千问 / 通义万相（文生图等多模态；配置后优先于星火 TTI）
    # 控制台：https://bailian.console.aliyun.com/ → API Key（sk- 开头）
    qwen_api_key: str = ""
    qwen_base_url: str = "https://dashscope.aliyuncs.com/api/v1"
    qwen_image_model: str = "qwen-image-2.0-pro"
    qwen_image_max_images: int = 4
    # 通义万相 · 图生/文生视频（video-synthesis）
    qwen_video_enabled: bool = True
    qwen_video_model: str = "wan2.6-i2v-flash"
    qwen_video_t2v_model: str = "wan2.6-t2v"
    qwen_video_duration: int = 5
    qwen_video_resolution: str = "720P"
    qwen_video_t2v_size: str = "1280*720"
    qwen_video_timeout_sec: int = 300
    qwen_video_max_per_resource: int = 1
    qwen_vl_model: str = "qwen-vl-plus"

    # 火山方舟 · 豆包 Seedream（课堂 PPT 教学插图）
    ark_api_key: str = ""
    ark_image_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    ark_image_model: str = "doubao-seedream-5-0-260128"
    ark_image_enabled: bool = True
    ark_image_max_per_classroom: int = 4

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
    def spark_tti_key(self) -> str:
        return (self.spark_tti_api_key or self.spark_api_key).strip()

    @property
    def has_spark_tti(self) -> bool:
        return bool(
            self.spark_app_id.strip()
            and self.spark_tti_key
            and self.spark_api_secret.strip()
        )

    @property
    def has_qwen(self) -> bool:
        return bool(self.qwen_api_key.strip())

    @property
    def has_qwen_image(self) -> bool:
        return self.has_qwen

    @property
    def has_ark_image(self) -> bool:
        return self.ark_image_enabled and bool(self.ark_api_key.strip())

    @property
    def has_qwen_video(self) -> bool:
        return self.has_qwen and self.qwen_video_enabled

    @property
    def has_qwen_vision(self) -> bool:
        return self.has_qwen

    @property
    def has_ai_image(self) -> bool:
        return self.has_ark_image or self.has_qwen_image or self.has_spark_tti

    @property
    def ai_image_max_count(self) -> int:
        if self.has_ark_image:
            return max(1, self.ark_image_max_per_classroom)
        if self.has_qwen_image:
            return max(1, self.qwen_image_max_images)
        return max(1, self.spark_tti_max_images)

    @property
    def has_aux(self) -> bool:
        return bool(self.aux_llm_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
