"""基于画像与薄弱点的资源推荐；理由可由辅助云端 LLM 润色。"""

from __future__ import annotations

import json
import re

from app.core.llm import get_aux_llm
from app.core.prompts import recommendation_polish_system
from app.db.repository import get_profile, list_events, list_resources
from app.models.schemas import ResourceRecommendation


def _score_resource(r: dict, profile: dict, completed_ids: set[str]) -> tuple[float, str]:
    if r.get("id") in completed_ids:
        return -1.0, ""
    score = 1.0
    reasons: list[str] = []
    topic = (r.get("topic") or "").lower()
    title = (r.get("title") or "").lower()
    weak = profile.get("error_prone_topics") or []
    for w in weak:
        if w and (w in topic or w in title or w in (r.get("content") or "")[:200]):
            score += 3.0
            reasons.append(f"薄弱点「{w}」")
            break
    modality = profile.get("preferred_modality") or ""
    rtype = r.get("type", "")
    modality_map = {
        "doc": "文档",
        "mindmap": "导图",
        "quiz": "练习",
        "reading": "阅读",
        "media": "视频",
        "code": "代码",
    }
    label = modality_map.get(rtype, rtype)
    if label and label in modality:
        score += 1.5
        reasons.append(f"偏好{label}")
    if rtype == "quiz" and weak:
        score += 0.5
    reason = "、".join(reasons) if reasons else "综合推荐"
    return score, reason


async def _llm_polish_reasons(
    profile: dict, candidates: list[tuple[float, str, dict]]
) -> dict[str, str]:
    aux = get_aux_llm()
    if aux.use_mock or not candidates:
        return {}
    lines = []
    for _s, base_reason, r in candidates[:5]:
        lines.append(
            f"- id={r.get('id')}; 标题={r.get('title')}; 类型={r.get('type')}; 规则理由={base_reason}"
        )
    weak = "、".join(profile.get("error_prone_topics") or []) or "无"
    goal = profile.get("learning_goal") or "掌握课程核心"
    prompt = [
        {"role": "system", "content": recommendation_polish_system()},
        {
            "role": "user",
            "content": (
                f"学习目标：{goal}\n薄弱点：{weak}\n资源列表：\n"
                + "\n".join(lines)
            ),
        },
    ]
    try:
        raw = await aux.chat(prompt, temperature=0.4)
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            return {}
        data = json.loads(match.group())
        if isinstance(data, dict):
            return {str(k): str(v)[:40] for k, v in data.items()}
    except Exception:
        return {}
    return {}


async def get_recommendations(user_id: str, limit: int = 5) -> list[ResourceRecommendation]:
    profile = await get_profile(user_id) or {}
    resources = await list_resources(user_id)
    completed_ids = {
        e["resource_id"]
        for e in list_events(user_id, limit=200)
        if e.get("event_type") == "resource_complete" and e.get("resource_id")
    }
    scored: list[tuple[float, str, dict]] = []
    for r in resources:
        s, reason = _score_resource(r, profile, completed_ids)
        if s >= 0:
            scored.append((s, reason, r))
    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:limit]
    polished = await _llm_polish_reasons(profile, top)

    out: list[ResourceRecommendation] = []
    for s, reason, r in top:
        rid = r.get("id", "")
        out.append(
            ResourceRecommendation(
                id=rid,
                type=r.get("type", "doc"),
                title=r.get("title", ""),
                topic=r.get("topic", ""),
                score=round(s, 2),
                reason=polished.get(rid) or reason,
            )
        )
    return out
