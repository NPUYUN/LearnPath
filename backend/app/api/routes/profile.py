from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import assert_user_access, ensure_same_user, get_current_user_id
from app.db.repository import get_library, get_profile, get_realtime_state
from app.db.repository import get_learner_analysis
from app.models.schemas import (
    LearnerProfileAnalysis,
    ProfileAnalysisResponse,
    ProfileRefreshResponse,
    RealtimeLearningState,
    ReplanContextResponse,
    StudentProfile,
)
from app.services.realtime_state_service import default_realtime_state
from app.services.profile_refresh_service import (
    _gather_learning_signals,
    refresh_profile_from_activity,
)
from app.services.profile_analysis_service import analyze_learner_profile
from app.services.replan_context_service import get_replan_context

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/{user_id}", response_model=StudentProfile)
async def read_profile(user_id: str = Depends(assert_user_access)):
    data = await get_profile(user_id)
    if not data:
        raise HTTPException(404, "画像不存在，请先进行对话构建")
    return StudentProfile(**{k: v for k, v in data.items() if k in StudentProfile.model_fields})


@router.get("/{user_id}/replan-context", response_model=ReplanContextResponse)
async def read_replan_context(
    user_id: str = Depends(assert_user_access),
    conversation_id: str | None = Query(None),
    learning_goal: str | None = Query(None),
    library_id: str | None = Query(None),
    planning_mode: str = Query("auto"),
    planning_requirement: str | None = Query(None),
):
    library_name = ""
    if library_id:
        lib = await get_library(library_id, user_id)
        library_name = str((lib or {}).get("name") or "")
    ctx = await get_replan_context(
        user_id,
        conversation_id=conversation_id,
        learning_goal=learning_goal,
        library_id=library_id,
        library_name=library_name,
        planning_mode=planning_mode,
        planning_requirement=planning_requirement,
    )
    return ReplanContextResponse(**ctx)


@router.get("/{user_id}/signals")
async def profile_signals(user_id: str = Depends(assert_user_access)):
    signals = await _gather_learning_signals(user_id)
    return {
        "chat_turns": signals["chat_turn_count"],
        "resource_views": signals["resource_view_count"],
        "resources_owned": signals["owned_resource_count"],
        "topics": signals["topics"],
    }


@router.get("/{user_id}/realtime", response_model=RealtimeLearningState)
async def read_realtime_state(user_id: str = Depends(assert_user_access)):
    data = await get_realtime_state(user_id)
    if not data:
        data = default_realtime_state(user_id)
    return RealtimeLearningState(
        **{k: v for k, v in data.items() if k in RealtimeLearningState.model_fields}
    )


@router.post("/{user_id}/refresh", response_model=ProfileRefreshResponse)
async def refresh_profile(
    user_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    result = await refresh_profile_from_activity(user_id)
    prof = result["profile"]
    return ProfileRefreshResponse(
        profile=StudentProfile(**{k: v for k, v in prof.items() if k in StudentProfile.model_fields}),
        message=result.get("message", "画像已更新"),
        sources=result.get("sources") or {},
    )


@router.get("/{user_id}/analysis", response_model=LearnerProfileAnalysis)
async def read_profile_analysis(user_id: str = Depends(assert_user_access)):
    data = await get_learner_analysis(user_id)
    if not data:
        raise HTTPException(404, "尚无画像分析快照，请先执行分析")
    return LearnerProfileAnalysis(
        **{k: v for k, v in data.items() if k in LearnerProfileAnalysis.model_fields}
    )


@router.post("/{user_id}/analyze", response_model=ProfileAnalysisResponse)
async def analyze_profile(
    user_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    ensure_same_user(user_id, current_user_id)
    result = await analyze_learner_profile(user_id)
    analysis = result["analysis"]
    prof = result["profile"]
    return ProfileAnalysisResponse(
        analysis=LearnerProfileAnalysis(
            **{k: v for k, v in analysis.items() if k in LearnerProfileAnalysis.model_fields}
        ),
        profile=StudentProfile(**{k: v for k, v in prof.items() if k in StudentProfile.model_fields}),
        message=result.get("message", "画像分析已完成"),
    )
