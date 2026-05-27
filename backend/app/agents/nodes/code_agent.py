from app.agents.nodes._resource_base import _build_resource
from app.agents.state import AgentState


async def code_node(state: AgentState) -> dict:
    resource = await _build_resource(
        state,
        resource_type="code",
        title="代码实操案例",
        content_template=(
            "## 实操：{topic} — 线性回归示例\n\n"
            "```python\n"
            "import numpy as np\n"
            "from sklearn.linear_model import LinearRegression\n"
            "X = np.array([[1], [2], [3], [4]])\n"
            "y = np.array([2, 4, 5, 7])\n"
            "model = LinearRegression().fit(X, y)\n"
            "print(model.coef_, model.intercept_)\n"
            "```\n\n"
            "参考知识库：{context}"
        ),
    )
    resources = list(state.get("resources") or [])
    resources.append(resource)
    return {"resources": resources}
