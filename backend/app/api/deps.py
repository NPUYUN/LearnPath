from fastapi import Depends, Header, HTTPException

from app.core.security import decode_token


async def get_current_user_id(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="未登录，请先获取访问令牌")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="令牌无效")
    return str(user_id)


def ensure_same_user(requested_user_id: str, current_user_id: str) -> None:
    if requested_user_id != current_user_id:
        raise HTTPException(status_code=403, detail="无权访问该用户数据")


def assert_user_access(
    user_id: str,
    current_user_id: str = Depends(get_current_user_id),
) -> str:
    ensure_same_user(user_id, current_user_id)
    return user_id
