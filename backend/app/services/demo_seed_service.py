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
            "content": (
                "## 分镜脚本\n\n"
                "1. **镜头 1（15s）**：损失曲面 3D 动画，旁白：「想象在山谷中寻找最低点」\n"
                "2. **镜头 2（20s）**：学习率过大/过小对比\n"
                "3. **镜头 3（15s）**：小结：批量 vs 随机梯度下降"
            ),
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
    return {
        "user_id": DEMO_USER_ID,
        "version": 2,
        "steps": [
            {
                "order": 1,
                "title": "导论与数学基础",
                "objective": "理解 ML 问题定义与线性模型基础",
                "resource_ids": [ids[6], ids[0]] if len(ids) > 6 else ids[:2],
                "estimated_minutes": 45,
                "status": "done",
            },
            {
                "order": 2,
                "title": "薄弱点强化：线性回归、梯度下降",
                "objective": "针对薄弱点完成文档、导图与测验",
                "resource_ids": ids[:5],
                "estimated_minutes": 60,
                "status": "in_progress",
            },
            {
                "order": 3,
                "title": "模型评估与巩固",
                "objective": "复盘测验并完成拓展阅读与代码实践",
                "resource_ids": ids[3:6],
                "estimated_minutes": 40,
                "status": "pending",
            },
        ],
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
    返回 True 表示本次执行了写入。
    """
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
    return True
