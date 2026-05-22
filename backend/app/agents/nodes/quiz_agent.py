import json

from app.agents.nodes._resource_base import _build_resource
from app.agents.state import AgentState


async def quiz_node(state: AgentState) -> dict:
    topic = state.get("topic") or "机器学习导论"
    quiz = {
        "questions": [
            {
                "id": "q1",
                "stem": f"关于{topic}，下列哪项属于监督学习？",
                "options": ["K-Means", "线性回归", "PCA", "DBSCAN"],
                "answer": 1,
                "explanation": "线性回归利用标注数据拟合映射关系。",
            },
            {
                "id": "q2",
                "stem": "梯度下降的主要作用是？",
                "options": ["特征选择", "参数优化", "数据清洗", "可视化"],
                "answer": 1,
                "explanation": "通过迭代更新参数以最小化损失函数。",
            },
            {
                "id": "q3",
                "stem": "过拟合的常见应对方法是？",
                "options": ["减少训练数据", "正则化", "去掉验证集", "增大学习率"],
                "answer": 1,
                "explanation": "正则化约束模型复杂度，提升泛化。",
            },
        ]
    }
    resource = await _build_resource(
        state,
        resource_type="quiz",
        title=f"{topic} 练习题",
        content_template="练习题 JSON：\n" + json.dumps(quiz, ensure_ascii=False, indent=2) + "\n\n{context}",
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
