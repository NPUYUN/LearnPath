"""演示账号示例数据：仅在 user_id=demo 时写入，真实用户不受影响。"""

from __future__ import annotations

from datetime import datetime, timedelta

from app.core.demo_user import DEMO_USER_ID
from app.db.repository import (
    append_chat_message,
    get_profile,
    list_resources,
    record_event,
    save_path,
    save_profile,
    save_quiz_attempt,
    save_resources,
)
from app.services.demo_state_service import get_demo_state, set_demo_state
from app.services.media_visual_service import enrich_media_content
from app.services.path_utils import finalize_path_steps


def _ts(days_ago: int = 0) -> str:
    return (datetime.utcnow() - timedelta(days=days_ago)).isoformat()


def _demo_profile() -> dict:
    return {
        "user_id": DEMO_USER_ID,
        "knowledge_level": "入门（已掌握高等数学基础）",
        "learning_goal": "掌握机器学习导论，能独立完成小型回归项目",
        "cognitive_style": "偏实践，先例子后公式",
        "error_prone_topics": ["线性回归", "梯度下降", "过拟合"],
        "preferred_modality": "文档+练习+思维导图",
        "pace_and_time": "每周约 5 小时，工作日晚上学习",
        "recent_progress": "已完成导论与线性回归文档，测验 4/5，路径第 2 阶段进行中",
        "updated_at": _ts(1),
    }


def _demo_resources() -> list[dict]:
    topic = "线性回归"
    media_script = (
        "## 短视频分镜脚本：梯度下降\n\n"
        "### 学习目标\n"
        "- 建立损失曲面与下降方向的直觉\n"
        "- 理解学习率对收敛的影响\n\n"
        "| 镜号 | 画面 | 旁白 | 屏幕文字 | 时长 |\n"
        "|------|------|------|----------|------|\n"
        "| 1 | 3D 损失曲面 · 紫蓝渐变标题卡 | 想象在山谷中寻找最低点 | 梯度下降 | 15s |\n"
        "| 2 | 学习率过大/过小对比动画 | 步长决定能否稳定收敛 | η 的选择 | 20s |\n"
        "| 3 | 批量 vs 随机下降示意 | 权衡噪声与计算成本 | BGD / SGD | 15s |\n"
        "| 4 | 小结卡片 + 练习入口 | 回顾要点并完成自测 | 今日要点 | 10s |"
    )
    return [
        {
            "id": "demo-res-doc-01",
            "type": "doc",
            "title": "线性回归 · 个性化讲解文档",
            "topic": topic,
            "content": (
                "# 线性回归讲解\n\n"
                "## 学习目标\n理解假设函数、损失函数与最小二乘直觉。\n\n"
                "## 正文\n线性回归用于建模连续型标签与特征之间的线性关系……\n\n"
                "## 小结\n结合下方思维导图与题库巩固。"
            ),
            "sources": ["内置知识库"],
            "created_at": _ts(12),
        },
        {
            "id": "demo-res-map-01",
            "type": "mindmap",
            "title": "线性回归 · 思维导图",
            "topic": topic,
            "content": (
                "```mermaid\nmindmap\n  root((线性回归))\n"
                "    模型\n      假设函数\n      损失函数\n"
                "    求解\n      正规方程\n      梯度下降\n"
                "    评估\n      MSE\n      R²\n```"
            ),
            "sources": [],
            "created_at": _ts(11),
        },
        {
            "id": "demo-res-quiz-01",
            "type": "quiz",
            "title": "线性回归 · 练习测验",
            "topic": topic,
            "content": (
                '{"questions":[{"id":"q1","stem":"线性回归主要适用于哪类问题？",'
                '"options":["分类","回归","聚类","降维"],"answer":1},'
                '{"id":"q2","stem":"MSE 衡量的是？","options":["分类错误率",'
                '"预测与真值的平方误差均值","召回率","F1"],"answer":1},'
                '{"id":"q3","stem":"梯度下降中 learning rate 过大可能导致？",'
                '"options":["收敛更快且一定更准","震荡或不收敛","无法计算梯度","过拟合消失"],"answer":1},'
                '{"id":"q4","stem":"正规方程适用于？",'
                '"options":["特征数量极大","特征矩阵可逆且规模适中","只能在线学习","非线性模型"],"answer":1},'
                '{"id":"q5","stem":"过拟合的典型表现是？",'
                '"options":["训练与测试误差都高","训练误差低测试误差高","训练误差高测试误差低","无影响"],"answer":1}]}'
            ),
            "sources": [],
            "created_at": _ts(10),
        },
        {
            "id": "demo-res-read-01",
            "type": "reading",
            "title": "拓展阅读 · 统计学习导论选读",
            "topic": topic,
            "content": (
                "## 拓展阅读\n\n"
                "1. **《统计学习导论》第 3 章** — 线性回归与分类扩展\n"
                "2. **Andrew Ng ML 课程 Week 1-2** — 单变量与多变量回归\n"
                "3. **sklearn LinearRegression 文档** — API 与评估指标"
            ),
            "sources": [],
            "created_at": _ts(9),
        },
        {
            "id": "demo-res-code-01",
            "type": "code",
            "title": "Python · 线性回归从零实现",
            "topic": topic,
            "content": (
                "## 代码案例\n\n```python\nimport numpy as np\n"
                "X = np.c_[np.ones(100), np.random.randn(100, 1)]\n"
                "y = 2 + 3 * X[:, 1] + np.random.randn(100) * 0.5\n"
                "theta = np.linalg.inv(X.T @ X) @ X.T @ y\nprint('theta:', theta)\n```"
            ),
            "sources": [],
            "created_at": _ts(8),
        },
        {
            "id": "demo-res-media-01",
            "type": "media",
            "title": "多模态讲解 · 梯度下降直觉",
            "topic": "梯度下降",
            "content": enrich_media_content(media_script, "梯度下降"),
            "sources": [],
            "created_at": _ts(7),
        },
        {
            "id": "demo-res-doc-02",
            "type": "doc",
            "title": "机器学习导论 · 开篇",
            "topic": "机器学习导论",
            "content": "# 机器学习导论\n\n监督学习、无监督学习与强化学习的基本划分……",
            "sources": ["内置知识库"],
            "created_at": _ts(14),
        },
    ]


def _demo_path(resource_ids: list[str]) -> dict:
    ids = resource_ids
    steps = [
        {
            "order": 1,
            "title": "导论与数学基础",
            "objective": "理解 ML 问题定义与线性模型基础",
            "resource_ids": [],
            "estimated_minutes": 45,
            "status": "done",
            "substeps": [
                {
                    "order": 1,
                    "title": "机器学习导论开篇",
                    "objective": "建立学科整体框架",
                    "resource_ids": [ids[6]] if len(ids) > 6 else [],
                    "estimated_minutes": 20,
                    "status": "done",
                    "substeps": [],
                },
                {
                    "order": 2,
                    "title": "线性回归讲解",
                    "objective": "掌握假设函数与损失函数",
                    "resource_ids": [ids[0]] if ids else [],
                    "estimated_minutes": 25,
                    "status": "done",
                    "substeps": [],
                },
            ],
        },
        {
            "order": 2,
            "title": "薄弱点强化：线性回归、梯度下降",
            "objective": "针对薄弱点完成文档、导图与测验",
            "resource_ids": [],
            "estimated_minutes": 60,
            "status": "in_progress",
            "substeps": [
                {
                    "order": 1,
                    "title": "思维导图梳理",
                    "objective": "建立线性回归知识网络",
                    "resource_ids": [ids[1]] if len(ids) > 1 else [],
                    "estimated_minutes": 15,
                    "status": "in_progress",
                    "substeps": [],
                },
                {
                    "order": 2,
                    "title": "梯度下降多模态讲解",
                    "objective": "理解优化过程与学习率",
                    "resource_ids": [ids[5]] if len(ids) > 5 else [],
                    "estimated_minutes": 20,
                    "status": "pending",
                    "substeps": [],
                },
                {
                    "order": 3,
                    "title": "线性回归测验",
                    "objective": "完成 5 题自测并复盘",
                    "resource_ids": [ids[2]] if len(ids) > 2 else [],
                    "estimated_minutes": 25,
                    "status": "pending",
                    "substeps": [],
                },
            ],
        },
        {
            "order": 3,
            "title": "拓展实践与巩固",
            "objective": "阅读拓展材料并完成代码实践",
            "resource_ids": ids[3:5] if len(ids) > 3 else [],
            "estimated_minutes": 40,
            "status": "pending",
            "substeps": [],
        },
    ]
    return {
        "user_id": DEMO_USER_ID,
        "version": 2,
        "steps": finalize_path_steps(steps),
    }


async def _seed_demo_events(resources: list[dict]) -> None:
    for r in resources[:4]:
        await record_event(
            DEMO_USER_ID,
            "resource_view",
            resource_id=r["id"],
            meta={"title": r.get("title", "")},
        )
    if resources:
        await record_event(
            DEMO_USER_ID,
            "resource_complete",
            resource_id=resources[0]["id"],
            meta={"title": resources[0].get("title", "")},
        )
    quiz = next((r for r in resources if r.get("type") == "quiz"), None)
    if quiz:
        await save_quiz_attempt(DEMO_USER_ID, quiz["id"], [1, 1, 1, 1, 0], 4, 5)


async def _seed_demo_chat() -> None:
    await append_chat_message(
        DEMO_USER_ID,
        "user",
        "我是计算机专业大二学生，想系统学习机器学习导论，每周大约 5 小时。",
    )
    await append_chat_message(
        DEMO_USER_ID,
        "assistant",
        "【学习画像已更新】已记录你的基础、目标与时间投入。建议下一步生成线性回归相关资源。",
    )


async def ensure_demo_sample_data(*, force: bool = False) -> bool:
    """
    为演示账号写入示例数据（幂等）。
    用户执行「清空」后不会自动回填，除非 force=True（重置）。
    返回 True 表示本次执行了写入。
    """
    if not force and get_demo_state() == "cleared":
        return False

    existing_profile = await get_profile(DEMO_USER_ID)
    existing_resources = await list_resources(DEMO_USER_ID)
    if not force and existing_profile and len(existing_resources) >= 5:
        return False

    profile = _demo_profile()
    resources = _demo_resources()
    path = _demo_path([r["id"] for r in resources])

    await save_profile(profile)
    await save_resources(DEMO_USER_ID, resources)
    await save_path(path)
    await _seed_demo_events(resources)
    await _seed_demo_chat()
    set_demo_state("sample")
    return True


async def clear_demo_user_data() -> None:
    """清空演示账号全部学习数据，不写入示例内容。"""
    from app.db.admin_repository import purge_demo_user_data

    purge_demo_user_data()
    set_demo_state("cleared")


async def reset_demo_user_data() -> None:
    """用默认示例数据覆盖演示账号当前全部数据。"""
    from app.db.admin_repository import purge_demo_user_data

    purge_demo_user_data()
    await ensure_demo_sample_data(force=True)
