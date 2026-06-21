"""评估统计路由：聚合用户真实学习数据生成评估报告。"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import assert_user_access, ensure_same_user, get_current_user_id
from app.models.schemas import EvalStats, EvalSubmitRequest, EvalSubmitResponse
from app.services.eval_service import submit_quiz
from app.services.eval_stats_service import build_eval_stats, refresh_eval_stats

router = APIRouter(prefix="/eval", tags=["eval"])


@router.post("/submit", response_model=EvalSubmitResponse)
async def submit_eval(
    req: EvalSubmitRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(req.user_id, current_user_id)
    try:
        return await submit_quiz(req.user_id, req.quiz_id, req.answers)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/{user_id}/refresh", response_model=EvalStats)
async def refresh_eval(user_id: str = Depends(assert_user_access)) -> EvalStats:
    """重新聚合学习数据并生成 AI 学习建议，更新评估页内容。"""
    return await refresh_eval_stats(user_id)


@router.get("/{user_id}", response_model=EvalStats)
async def get_eval_stats(
    user_id: str = Depends(assert_user_access),
    refresh: bool = Query(False, description="为 true 时重新生成 AI 建议并刷新评估"),
) -> EvalStats:
    """根据数据库中的画像、资源、学习路径，计算真实评估统计数据。"""
    if refresh:
        return await refresh_eval_stats(user_id)
    return await build_eval_stats(user_id)
