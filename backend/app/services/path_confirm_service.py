"""第六步：校验路径与资源库一致性，修复引用并确认落库。"""

from __future__ import annotations

from datetime import datetime

from app.db.repository import (
    get_learner_analysis,
    get_path,
    get_preferences,
    get_profile,
    list_resources,
    save_learner_analysis,
    save_path,
    set_preferences,
)
from app.services.path_utils import all_resource_ids, flatten_steps, remove_resource_from_steps


def _step_has_resources(step: dict) -> bool:
    if step.get("resource_ids"):
        return True
    for sub in step.get("substeps") or []:
        if _step_has_resources(sub):
            return True
    return False


async def confirm_replan(user_id: str) -> dict:
    """最终确认：交叉校验路径、资源库、画像快照，清理无效引用并写入确认标记。"""
    path_data = await get_path(user_id)
    if not path_data or not path_data.get("steps"):
        raise ValueError("学习路径不存在，请先完成路径规划")

    resources = await list_resources(user_id)
    analysis = await get_learner_analysis(user_id)
    profile = await get_profile(user_id)
    prefs = await get_preferences(user_id)

    resource_ids = {r.get("id", "") for r in resources if r.get("id")}
    steps = list(path_data.get("steps") or [])
    flat = flatten_steps(steps)
    path_linked_ids = all_resource_ids(steps)

    issues: list[str] = []
    fixes: list[str] = []

    if not flat:
        issues.append("路径没有任何学习节点")
    if not analysis:
        issues.append("缺少学习者画像分析快照（第三步）")
    if not profile:
        issues.append("缺少长期学习画像")

    orphan_refs = sorted(rid for rid in path_linked_ids if rid not in resource_ids)
    if orphan_refs:
        removed = 0
        for rid in orphan_refs:
            if remove_resource_from_steps(steps, rid):
                removed += 1
        path_data["steps"] = steps
        fixes.append(f"已清理 {removed} 处指向已删除资源的无效路径引用")
        path_linked_ids = all_resource_ids(steps)

    stages_missing_objective = [
        str(s.get("title") or s.get("id") or "")
        for s in flat
        if len(str(s.get("objective") or "").strip()) < 6
    ]
    if stages_missing_objective:
        issues.append(f"以下节点目标描述过简：{'、'.join(stages_missing_objective[:4])}")

    top_stages = steps
    bare_stages = [
        str(s.get("title") or s.get("id") or "")
        for s in top_stages
        if not _step_has_resources(s)
    ]
    if bare_stages and not resources:
        issues.append("路径阶段未关联资源且资源库为空")
    elif bare_stages:
        issues.append(f"以下主阶段尚未关联资源：{'、'.join(bare_stages[:4])}")

    starred = set(prefs.get("starred_resource_ids") or [])
    missing_starred = sorted(rid for rid in starred if rid not in resource_ids)
    if missing_starred:
        pruned_starred = [rid for rid in starred if rid in resource_ids]
        await set_preferences(user_id, {"starred_resource_ids": pruned_starred})
        starred = set(pruned_starred)
        fixes.append(f"已从收藏列表移除 {len(missing_starred)} 个已不存在的资源 ID")

    linked_count = len(path_linked_ids & resource_ids)
    ok = len([x for x in issues if "路径没有任何" in x or "缺少" in x]) == 0 and bool(flat)

    now = datetime.utcnow().isoformat()
    path_data["replan_confirmed"] = True
    path_data["replan_confirmed_at"] = now
    path_data["steps"] = steps
    await save_path(path_data)

    if analysis:
        analysis["replan_confirmed_at"] = now
        analysis["replan_summary"] = {
            "stage_count": len(top_stages),
            "node_count": len(flat),
            "resource_count": len(resources),
            "linked_resource_count": linked_count,
            "issues": issues,
            "fixes": fixes,
        }
        await save_learner_analysis(analysis)

    return {
        "path": path_data,
        "resources": resources,
        "meta": {
            "ok": ok,
            "issues": issues,
            "fixes": fixes,
            "warnings": [x for x in issues if "尚未关联" in x or "过简" in x],
            "stage_count": len(top_stages),
            "node_count": len(flat),
            "resource_count": len(resources),
            "linked_resource_count": linked_count,
            "starred_count": len(starred & resource_ids),
            "analysis_present": bool(analysis),
            "profile_present": bool(profile),
            "confirmed_at": now,
        },
    }
