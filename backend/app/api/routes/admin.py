"""平台管理员 API。"""

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_admin
from app.db.admin_repository import (
    delete_platform_user,
    get_daily_activity,
    get_platform_overview,
    get_user_rankings,
    list_all_resources,
    list_platform_users,
    list_recent_events,
)
from app.services.demo_seed_service import clear_demo_user_data, reset_demo_user_data

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/dashboard")
async def admin_dashboard(_admin: str = Depends(get_current_admin)):
    overview = get_platform_overview()
    return {
        "overview": overview,
        "daily_activity": get_daily_activity(14),
        "user_rankings": get_user_rankings(8),
    }


@router.get("/users")
async def admin_users(_admin: str = Depends(get_current_admin)):
    return {"users": list_platform_users(200)}


@router.delete("/users/{user_id}")
async def admin_delete_user(user_id: str, _admin: str = Depends(get_current_admin)):
    try:
        deleted = delete_platform_user(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"deleted": True, "user_id": user_id}


@router.post("/users/demo/reset")
async def admin_reset_demo(_admin: str = Depends(get_current_admin)):
    await reset_demo_user_data()
    return {"reset": True, "user_id": "demo"}


@router.get("/resources")
async def admin_resources(_admin: str = Depends(get_current_admin)):
    overview = get_platform_overview()
    return {
        "overview": overview,
        "resources": list_all_resources(300),
    }


@router.get("/activity")
async def admin_activity(_admin: str = Depends(get_current_admin)):
    return {
        "daily_activity": get_daily_activity(30),
        "recent_events": list_recent_events(100),
        "user_rankings": get_user_rankings(12),
    }
