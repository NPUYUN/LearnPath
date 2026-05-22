from app.agents.state import AgentState


async def eval_node(state: AgentState) -> dict:
    profile = state.get("profile") or {}
    reply = (
        "【学习效果评估 · 框架占位】\n"
        f"- 当前基础：{profile.get('knowledge_level', '未评估')}\n"
        "- 练习完成度：待接入测验提交数据\n"
        "- 建议：加强薄弱知识点相关资源推送（PathAgent 将据此调整）\n"
    )
    return {"reply": reply}
