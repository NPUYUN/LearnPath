"""真实用户与演示用户的画像默认值。"""

from __future__ import annotations

from app.core.demo_user import is_demo_user


def empty_profile_fields(user_id: str, existing: dict | None = None) -> dict:
    """新注册用户 / 尚无画像时的空状态（非演示账号）。"""
    ex = existing or {}
    return {
        "knowledge_level": ex.get("knowledge_level") or "未评估",
        "learning_goal": ex.get("learning_goal") or "未设定",
        "cognitive_style": ex.get("cognitive_style") or "未评估",
        "error_prone_topics": list(ex.get("error_prone_topics") or []),
        "preferred_modality": ex.get("preferred_modality") or "未设定",
        "pace_and_time": ex.get("pace_and_time") or "未设定",
        "recent_progress": ex.get("recent_progress") or "尚未开始学习",
    }


def profile_fallback_fields(user_id: str, existing: dict | None = None) -> dict:
    """LLM 解析失败时的回退；演示账号保留丰富示例，真实用户保持空状态。"""
    ex = existing or {}
    if is_demo_user(user_id):
        return {
            "knowledge_level": ex.get("knowledge_level") or "入门",
            "learning_goal": ex.get("learning_goal") or "掌握机器学习导论核心概念",
            "cognitive_style": ex.get("cognitive_style") or "偏实践",
            "error_prone_topics": list(ex.get("error_prone_topics") or ["线性回归", "梯度下降"]),
            "preferred_modality": ex.get("preferred_modality") or "文档+练习",
            "pace_and_time": ex.get("pace_and_time") or "每周约 5 小时",
            "recent_progress": ex.get("recent_progress") or "已完成导论预习，正在学习线性回归",
        }
    return empty_profile_fields(user_id, ex)
