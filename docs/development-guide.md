# 开发指南

> LearnPath — 基于大模型的个性化资源生成与学习多智能体系统  
> 版本：v1.0

---

## 1. 技术选型说明

| 层次 | 技术 | 版本要求 | 理由 |
|------|------|----------|------|
| LLM | 讯飞星火 Spark API | 4.0 Ultra | 赛题要求使用讯飞工具 |
| 多智能体框架 | LangGraph | ≥0.2 | 有状态图编排，适合复杂多智能体流 |
| 向量数据库 | ChromaDB | ≥0.5 | 轻量易部署，适合本地 RAG |
| 后端框架 | FastAPI | ≥0.110 | 异步支持，SSE流式响应 |
| ORM | SQLAlchemy + Alembic | ≥2.0 | 数据库迁移管理 |
| 数据库 | SQLite (dev) / PostgreSQL (prod) | — | 开发轻量，生产稳定 |
| 前端框架 | React + TypeScript | React 18 | 生态成熟，组件化 |
| UI 组件库 | Ant Design | ≥5.0 | 中文友好，功能丰富 |
| 构建工具 | Vite | ≥5.0 | 极速构建 |
| 状态管理 | Zustand | ≥4.0 | 轻量直观 |
| 容器化 | Docker + Docker Compose | — | 一键部署 |

**开源协议声明：**
- LangGraph：MIT License — https://github.com/langchain-ai/langgraph
- LangChain：MIT License — https://github.com/langchain-ai/langchain
- ChromaDB：Apache 2.0 — https://github.com/chroma-core/chroma
- FastAPI：MIT License — https://github.com/tiangolo/fastapi
- React：MIT License — https://github.com/facebook/react
- Ant Design：MIT License — https://github.com/ant-design/ant-design

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (React)                          │
│  Chat界面 │ 画像展示 │ 学习路径 │ 资源卡片 │ 评估报告        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / SSE
┌──────────────────────────▼──────────────────────────────────┐
│                   FastAPI 后端                               │
│  /api/chat  /api/profile  /api/resources  /api/path         │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              LangGraph 多智能体编排层                        │
│                                                             │
│   OrchestratorAgent                                         │
│        ├── ProfileAgent（画像构建）                          │
│        ├── CurriculumAgent（路径规划）                       │
│        └── ResourceAgents（资源生成）                        │
│             ├── DocumentAgent   → Markdown/PDF 讲解文档     │
│             ├── MindMapAgent    → 思维导图 JSON             │
│             ├── QuizAgent       → 题库 JSON                 │
│             ├── VideoAgent      → 视频脚本/动画提示词        │
│             └── CodeAgent       → 代码案例 + 注释           │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    基础设施层                                │
│  讯飞 Spark API │ ChromaDB (RAG) │ SQLite/PostgreSQL        │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 环境搭建

### 3.1 前置要求

- Python 3.10+
- Node.js 18+
- Docker & Docker Compose（可选，推荐）

### 3.2 克隆与配置

```bash
# 克隆仓库
git clone <repo_url>
cd LearnPath

# 复制环境变量模板
cp .env.example .env
```

编辑 `.env`：
```env
# 讯飞星火 API（必填）
SPARK_APP_ID=your_app_id
SPARK_API_KEY=your_api_key
SPARK_API_SECRET=your_api_secret
SPARK_DOMAIN=4.0Ultra

# 数据库
DATABASE_URL=sqlite:///./learnpath.db

# 后端
BACKEND_PORT=8000
SECRET_KEY=your_secret_key_here

# 前端
VITE_API_BASE_URL=http://localhost:8000
```

### 3.3 后端安装

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 初始化数据库
alembic upgrade head

# 初始化向量知识库
python scripts/init_knowledge_base.py

# 启动后端
uvicorn main:app --reload --port 8000
```

### 3.4 前端安装

```bash
cd frontend

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build
```

### 3.5 Docker 一键启动（推荐）

```bash
docker-compose up --build
```

访问：
- 前端：http://localhost:5173
- 后端 API 文档：http://localhost:8000/docs

---

## 4. 多智能体开发规范

### 4.1 新增智能体的步骤

1. 在 `backend/agents/` 下创建新文件，继承 `BaseAgent`
2. 实现 `run(state: AgentState) -> AgentState` 方法
3. 在 `backend/agents/graph.py` 中注册节点和边
4. 在 `backend/api/` 中暴露对应接口（如需要）

### 4.2 智能体基类接口

```python
# backend/agents/base_agent.py
from abc import ABC, abstractmethod
from backend.models.state import AgentState

class BaseAgent(ABC):
    def __init__(self, llm_client, tools=None):
        self.llm = llm_client
        self.tools = tools or []

    @abstractmethod
    def run(self, state: AgentState) -> AgentState:
        """处理当前状态并返回更新后的状态"""
        pass

    def _call_llm(self, messages: list, stream: bool = False):
        """调用讯飞 Spark API"""
        return self.llm.chat(messages, stream=stream)
```

### 4.3 状态对象规范

所有智能体共享同一个 `AgentState` 对象：

```python
from typing import TypedDict, List, Optional

class AgentState(TypedDict):
    student_id: str
    messages: List[dict]          # 对话历史
    student_profile: dict          # 学生画像（6+维度）
    current_topic: str             # 当前学习主题
    learning_path: dict            # 学习路径
    generated_resources: List[dict] # 生成的资源列表
    rag_context: str               # RAG 检索到的上下文
    next_agent: Optional[str]      # 下一步路由
```

### 4.4 LangGraph 流程图规范

```python
# backend/agents/graph.py
from langgraph.graph import StateGraph, END
from backend.agents.orchestrator import OrchestratorAgent
from backend.agents.profile_agent import ProfileAgent
# ...

def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("orchestrator", orchestrator.run)
    graph.add_node("profile", profile_agent.run)
    graph.add_node("curriculum", curriculum_agent.run)
    graph.add_node("document", document_agent.run)
    # ...

    graph.set_entry_point("orchestrator")
    graph.add_conditional_edges(
        "orchestrator",
        route_next,  # 根据 state["next_agent"] 路由
        {
            "profile": "profile",
            "curriculum": "curriculum",
            "resources": "document",
            END: END,
        }
    )
    return graph.compile()
```

---

## 5. RAG 知识库规范

### 5.1 文档组织结构

```
knowledge_base/
└── ai_course/
    ├── chapters/
    │   ├── 01_intro_to_ai.md
    │   ├── 02_machine_learning.md
    │   └── ...
    ├── exercises/
    │   ├── chapter01_quiz.json
    │   └── ...
    └── metadata.json     # 课程元数据
```

### 5.2 文档格式规范

每个知识库文档须包含 frontmatter：
```markdown
---
chapter: 2
title: 机器学习基础
difficulty: beginner
keywords: [监督学习, 无监督学习, 梯度下降]
prerequisites: [人工智能概述]
estimated_time: 120min
---

# 机器学习基础
...
```

### 5.3 初始化知识库

```bash
python backend/scripts/init_knowledge_base.py
```

该脚本会：
1. 读取 `knowledge_base/` 下所有 `.md` 文档
2. 按段落切分（chunk_size=500，overlap=50）
3. 调用 Spark Embedding API 向量化
4. 存入 ChromaDB

---

## 6. API 设计规范

### 6.1 流式响应（SSE）

资源生成类接口必须使用 SSE 流式推送，避免长时间白屏：

```python
from fastapi.responses import StreamingResponse

@router.post("/api/resources/generate")
async def generate_resources(request: ResourceRequest):
    async def event_stream():
        async for chunk in agent_graph.astream(state):
            yield f"data: {json.dumps(chunk)}\n\n"
    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

### 6.2 错误处理规范

```python
# 统一错误响应格式
{
    "code": 4001,
    "message": "学生画像不存在，请先完成画像构建",
    "data": null
}
```

错误码规范：
- `2000`：成功
- `4001`：业务逻辑错误
- `4004`：资源不存在
- `5001`：LLM 调用失败
- `5002`：向量库检索失败

---

## 7. 前端开发规范

### 7.1 组件职责

| 组件 | 职责 |
|------|------|
| `Chat/` | 对话界面，支持流式输出和 Markdown 渲染 |
| `Profile/` | 学生画像展示（雷达图 + 维度卡片） |
| `LearningPath/` | 学习路径可视化（时间线/树形图） |
| `Resources/` | 资源卡片展示（文档/思维导图/题库/视频/代码） |
| `Evaluation/` | 学习效果评估报告 |

### 7.2 流式输出处理

```typescript
// frontend/src/utils/sse.ts
export async function streamChat(
  request: ChatRequest,
  onChunk: (chunk: string) => void
) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    // 解析 SSE data 字段
    text.split('\n').forEach(line => {
      if (line.startsWith('data: ')) {
        onChunk(JSON.parse(line.slice(6)).content);
      }
    });
  }
}
```

---

## 8. 测试规范

### 8.1 后端测试

```bash
cd backend
pytest tests/ -v --cov=. --cov-report=html
```

- `tests/agents/` — 各智能体单元测试
- `tests/api/` — API 接口测试
- `tests/integration/` — 端到端流程测试

### 8.2 关键测试用例

| 测试场景 | 期望结果 |
|----------|----------|
| 5轮对话后构建画像 | 画像包含≥6维度，各维度有值 |
| 请求生成资源包 | 返回≥5种类型资源，各类型格式正确 |
| RAG 检索 | 答案与知识库内容一致（无幻觉） |
| 流式响应 | 首字节响应时间 < 2s |

---

## 9. 部署说明

### 9.1 Docker Compose 配置

参见 `docker-compose.yml`，包含以下服务：
- `backend`：FastAPI 应用
- `frontend`：Nginx + 静态文件
- `chromadb`：向量数据库

### 9.2 生产环境建议

- 替换 SQLite 为 PostgreSQL
- 配置 Nginx 反向代理
- 设置 API Key 环境变量加密存储
- 开启 HTTPS

---

## 10. 常见问题

**Q: 讯飞 Spark API 调用失败？**  
A: 检查 `.env` 中的 `SPARK_APP_ID/API_KEY/API_SECRET` 是否正确；注意 API 使用了 WebSocket 协议（wss://）。

**Q: ChromaDB 向量化很慢？**  
A: 首次初始化知识库时需要调用嵌入接口，建议使用讯飞的 Embedding API 或 sentence-transformers 本地模型。

**Q: 前端 SSE 流式输出断开？**  
A: 检查 Nginx 配置是否关闭了缓冲（`proxy_buffering off`）。
