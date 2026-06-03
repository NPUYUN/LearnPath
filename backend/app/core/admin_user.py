"""平台管理员标识（测试阶段一键登录）。"""

ADMIN_USER_ID = "admin"
ADMIN_EMAIL = "admin@learnpath.local"
ADMIN_DISPLAY_NAME = "系统管理员"


def is_admin_user(user_id: str) -> bool:
    return user_id == ADMIN_USER_ID


def is_admin_token(payload: dict) -> bool:
    if payload.get("role") == "admin":
        return True
    return is_admin_user(str(payload.get("sub") or ""))
