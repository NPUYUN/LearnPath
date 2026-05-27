"""演示账号标识（与前端 DEMO_USER_ID 一致）。"""

DEMO_USER_ID = "demo"


def is_demo_user(user_id: str | None) -> bool:
    return (user_id or "").strip() == DEMO_USER_ID
