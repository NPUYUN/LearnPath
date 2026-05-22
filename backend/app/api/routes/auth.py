"""认证路由：发送 OTP 邮件、验证 OTP 登录/注册。"""

import asyncio
import smtplib
from email.mime.text import MIMEText

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.db.repository import create_otp, get_or_create_user, verify_otp_code
from app.models.schemas import AuthUser, SendOtpRequest, VerifyOtpRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/send-otp")
async def send_otp(req: SendOtpRequest) -> dict:
    """向指定邮箱发送 6 位验证码。未配置 SMTP 时以 Debug 模式返回验证码。"""
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "邮箱格式不正确")

    settings = get_settings()
    code = create_otp(email)

    if settings.smtp_host:
        try:
            await asyncio.to_thread(_send_email_sync, email, code, settings)
        except Exception as exc:
            raise HTTPException(500, f"邮件发送失败：{exc}") from exc
        return {"sent": True}
    else:
        # Demo / 本地开发：打印到控制台并在响应中返回
        print(f"[OTP DEBUG] {email} -> {code}")
        return {"sent": True, "debug_code": code}


@router.post("/verify-otp", response_model=AuthUser)
async def verify_otp(req: VerifyOtpRequest) -> AuthUser:
    """验证 OTP，成功后返回用户信息（自动注册新用户）。"""
    email = req.email.strip().lower()
    if not verify_otp_code(email, req.code.strip()):
        raise HTTPException(400, "验证码无效或已过期，请重新获取")

    user = get_or_create_user(email)
    return AuthUser(
        user_id=user["id"],
        email=user["email"],
        display_name=user["display_name"],
    )


# ── 私有辅助函数 ──────────────────────────────────────────────────────────────

def _send_email_sync(to_email: str, code: str, settings) -> None:
    body = (
        f"您好！\n\n"
        f"您正在登录/注册「学径 LearnPath」，验证码为：\n\n"
        f"    {code}\n\n"
        f"验证码 5 分钟内有效，请勿泄露给他人。\n\n"
        f"— 学径团队"
    )
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = "【学径 LearnPath】邮箱验证码"
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to_email

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)
