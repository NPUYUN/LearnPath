"""讯飞 TTS 代理；无 Key 时返回空音频由前端回退浏览器朗读。"""

import base64

import httpx
from fastapi import APIRouter, Depends

from app.api.deps import get_current_user_id
from app.core.config import get_settings
from app.models.schemas import TtsSpeakRequest, TtsSpeakResponse

router = APIRouter(prefix="/tts", tags=["tts"])


@router.post("/speak", response_model=TtsSpeakResponse)
async def speak(
    body: TtsSpeakRequest,
    _user: str = Depends(get_current_user_id),
):
    settings = get_settings()
    text = (body.text or "").strip()[:2000]
    if not text or body.voice == "off":
        return TtsSpeakResponse(provider="mock")

    if settings.llm_mock or not settings.has_spark:
        return TtsSpeakResponse(provider="mock")

    tts_url = settings.spark_tts_url or ""
    if not tts_url:
        return TtsSpeakResponse(provider="mock")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                tts_url,
                headers={"Authorization": f"Bearer {settings.spark_api_key}"},
                json={"text": text, "voice": body.voice},
            )
            resp.raise_for_status()
            data = resp.json()
            audio_b64 = data.get("audio") or data.get("audio_base64") or ""
            if isinstance(audio_b64, bytes):
                audio_b64 = base64.b64encode(audio_b64).decode()
            return TtsSpeakResponse(audio_base64=audio_b64, format="mp3", provider="spark")
    except Exception:
        return TtsSpeakResponse(provider="mock")
