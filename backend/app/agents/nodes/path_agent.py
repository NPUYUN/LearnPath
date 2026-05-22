from app.agents.state import AgentState
from app.db.repository import save_path


async def path_node(state: AgentState) -> dict:
    user_id = state.get("user_id", "demo")
    profile = state.get("profile") or {}
    resources = state.get("resources") or []
    resource_ids = [r.get("id", "") for r in resources if r.get("id")]

    steps = [
        {
            "order": 1,
            "title": "导论与数学基础",
            "objective": "理解机器学习问题定义与基本术语",
            "resource_ids": resource_ids[:1],
            "estimated_minutes": 45,
            "status": "pending",
        },
        {
            "order": 2,
            "title": "监督学习：回归与分类",
            "objective": f"针对薄弱点：{profile.get('error_prone_topics', ['线性回归'])}",
            "resource_ids": resource_ids[1:3],
            "estimated_minutes": 60,
            "status": "pending",
        },
        {
            "order": 3,
            "title": "模型评估与巩固",
            "objective": "完成练习并复盘",
            "resource_ids": resource_ids[3:],
            "estimated_minutes": 40,
            "status": "pending",
        },
    ]
    path = {"user_id": user_id, "steps": steps, "version": 1}
    await save_path(path)
    reply = "已为你生成 3 步个性化学习路径，可在「学习路径」页查看。"
    return {"path": path, "reply": reply}
