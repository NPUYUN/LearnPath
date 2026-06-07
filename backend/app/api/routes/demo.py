"""演示账号自助：清空 / 重置数据。"""

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user_id
from app.core.demo_user import DEMO_USER_ID
from app.services.demo_seed_service import clear_demo_user_data, reset_demo_user_data

router = APIRouter(prefix="/demo", tags=["demo"])


def _require_demo_user(current_user_id: str = Depends(get_current_user_id)) -> str:
    if current_user_id != DEMO_USER_ID:
        raise HTTPException(status_code=403, detail="仅演示学生账号可用")
    return current_user_id


@router.post("/clear")
async def demo_clear(_user_id: str = Depends(_require_demo_user)):
    """清空全部学习数据，不写入示例内容；偏好标记为已清空。"""
    await clear_demo_user_data()
    return {"cleared": True, "user_id": DEMO_USER_ID}


@router.post("/reset")
async def demo_reset(_user_id: str = Depends(_require_demo_user)):
    """用默认示例数据覆盖当前全部学习数据。"""
    await reset_demo_user_data()
    return {"reset": True, "user_id": DEMO_USER_ID}
