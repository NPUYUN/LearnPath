# 学径（LearnPath）

> 基于大模型的个性化资源生成与学习多智能体系统  
> 第十五届「中国软件杯」大赛 **A3** 参赛作品

[![Python](https://img.shields.io/badge/Python-3.10+-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.2+-orange)](https://github.com/langchain-ai/langgraph)
[![React](https://img.shields.io/badge/React-18-blue)](https://react.dev)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 🗂️ 项目结构与各模块职责

```
LearnPath/
├── 📁 backend/                    # Python 后端（FastAPI + LangGraph）
│   ├── main.py                   # 应用入口，注册路由
│   ├── requirements.txt          # Python 依赖
│   ├── 📁 agents/                # 🤖 多智能体系统核心
│   │   ├── graph.py             # LangGraph 图编排（节点/路由/编译）
│   │   ├── base_agent.py        # 智能体基类（LLM调用/RAG检索公共方法）
│   │   ├── orchestrator.py      # 协调智能体：意图识别 + 任务分发
│   │   ├── profile_agent.py     # 画像智能体：对话提取6+维度学生画像
│   │   ├── curriculum_agent.py  # 路径智能体：生成个性化3阶段学习路径
│   │   └── 📁 resource_agents/  # 资源生成智能体集合（5类）
│   │       └── __init__.py      # DocumentAgent/MindMapAgent/QuizAgent/
│   │                            #   VideoAgent/CodeAgent
│   ├── 📁 api/                   # FastAPI 路由层
│   │   ├── chat.py              # POST /api/chat/stream（SSE流式对话）
│   │   ├── profile.py           # GET/PUT /api/profile（学生画像CRUD）
│   │   ├── resources.py         # POST /api/resources/generate（资源生成）
│   │   ├── learning_path.py     # POST /api/path/generate（路径规划）
│   │   └── evaluation.py        # GET /api/evaluation（学习评估，加分项）
│   ├── 📁 core/                  # 基础设施
│   │   ├── config.py            # 全局配置（从.env读取讯飞API Key等）
│   │   ├── llm.py               # 讯飞星火API客户端（WebSocket封装）
│   │   └── rag.py               # RAG管道（ChromaDB检索 + 上下文注入）
│   └── 📁 models/               # 数据模型
│       └── state.py             # AgentState / StudentProfile 类型定义
│
├── 📁 frontend/                   # React + TypeScript 前端
│   ├── src/
│   │   ├── App.tsx              # 路由配置（5个页面）
│   │   ├── main.tsx             # 应用入口
│   │   ├── 📁 pages/            # 页面组件
│   │   │   ├── ChatPage.tsx     # 主对话页（核心入口，SSE流式输出）
│   │   │   ├── ProfilePage.tsx  # 学生画像页（雷达图展示6维度）
│   │   │   ├── LearningPathPage.tsx # 学习路径页（时间线可视化）
│   │   │   ├── ResourcesPage.tsx    # 资源库页（5类资源卡片）
│   │   │   └── EvaluationPage.tsx   # 评估报告页（加分项）
│   │   ├── 📁 store/            # Zustand 全局状态
│   │   │   └── appStore.ts      # 画像/资源/路径全局状态管理
│   │   └── 📁 components/       # 待实现的复用组件
│   │       ├── Chat/            # TODO: 流式消息列表、资源卡片
│   │       ├── Profile/         # TODO: 雷达图、维度卡片
│   │       ├── LearningPath/    # TODO: 路径时间线、阶段卡片
│   │       ├── Resources/       # TODO: 文档预览、思维导图渲染、代码高亮
│   │       └── Evaluation/      # TODO: 评估报告、学习行为统计
│   ├── package.json             # 前端依赖（React/AntD/ECharts/markmap）
│   └── vite.config.ts           # Vite配置（开发代理/构建）
│
├── 📁 knowledge_base/             # 📚 知识库文档（RAG数据源）
│   └── ai_course/
│       ├── metadata.json        # 课程元信息（8章节目录）
│       ├── chapters/            # 章节 Markdown 文档
│       │   ├── 01_intro_to_ai.md      # ✅ 已完成
│       │   ├── 02_machine_learning.md  # ✅ 已完成
│       │   └── 03~08_*.md             # TODO: 待补充6章内容
│       └── exercises/           # TODO: 各章节练习题 JSON
│
├── 📁 docs/                       # 📄 项目文档
│   ├── requirements.md          # 需求规格说明书（功能/非功能/用例）
│   └── development-guide.md     # 开发指南（环境搭建/架构/规范）
│
├── .env.example                  # 环境变量模板（填写后复制为 .env）
├── docker-compose.yml            # Docker一键部署（backend+frontend+chromadb）
└── README.md                     # 本文件
```

---

## ⚡ 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填写讯飞星火 API Key（必填）
```

### 2. 启动后端

```bash
cd backend
python -m venv venv && venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

### 4. 或使用 Docker 一键启动

```bash
docker-compose up --build
```

访问 http://localhost:5173

---

## 🤖 多智能体架构

```
用户输入
    │
    ▼
OrchestratorAgent（意图识别 → 路由）
    ├── build_profile ──→ ProfileAgent（对话提取6维度画像）
    ├── generate_resources ──→ DocumentAgent → MindMapAgent
    │                          → QuizAgent → VideoAgent → CodeAgent
    ├── plan_path ──→ CurriculumAgent（3阶段路径规划）
    ├── tutor ──→ TutorAgent（RAG增强答疑，加分项）
    └── evaluate ──→ EvaluatorAgent（多维度评估，加分项）
```

所有智能体通过 `AgentState` 共享状态，使用 **LangGraph** 编排，支持持久化多轮对话。

---

## 📋 开发任务清单

以下是框架中标注了 `TODO` 的待实现模块，按优先级排序：

### P0 — 必须实现（影响核心功能）

| 模块 | 文件 | 任务描述 |
|------|------|----------|
| LLM客户端 | `backend/core/llm.py` | 完善讯飞Spark WebSocket鉴权和流式调用 |
| 画像智能体 | `backend/agents/profile_agent.py` | 实现多轮对话提取+合并6维度画像 |
| 资源智能体 | `backend/agents/resource_agents/__init__.py` | 5个Agent各自调用LLM生成对应资源 |
| RAG管道 | `backend/core/rag.py` | 接入讯飞Embedding API完成文档向量化 |
| 知识库文档 | `knowledge_base/ai_course/chapters/` | 补充03-08章节Markdown内容 |
| 对话接口 | `backend/api/chat.py` | 接入LangGraph图，实现SSE流式推送 |
| 聊天页面 | `frontend/src/pages/ChatPage.tsx` | 接入SSE接口，实现流式打字效果 |

### P1 — 重要功能

| 模块 | 文件 | 任务描述 |
|------|------|----------|
| 路径规划 | `backend/agents/curriculum_agent.py` | 实现LLM生成结构化学习路径JSON |
| 画像展示 | `frontend/src/pages/ProfilePage.tsx` | ECharts雷达图 + 6维度卡片 |
| 路径展示 | `frontend/src/pages/LearningPathPage.tsx` | Ant Design Steps时间线 |
| 资源展示 | `frontend/src/pages/ResourcesPage.tsx` | 5类资源专属渲染组件 |
| 应用导航 | `frontend/src/App.tsx` | 侧边栏导航 + 路由守卫 |

### P2 — 加分项

| 模块 | 文件 | 任务描述 |
|------|------|----------|
| 智能辅导 | `backend/agents/` (新建) | TutorAgent：RAG增强多模态答疑 |
| 学习评估 | `backend/agents/` (新建) | EvaluatorAgent：行为追踪+评估报告 |
| 评估页面 | `frontend/src/pages/EvaluationPage.tsx` | 评估报告可视化 |

---

## 🛠️ 技术栈

| 层次 | 技术 |
|------|------|
| LLM | 讯飞星火 Spark 4.0 Ultra |
| 多智能体框架 | LangGraph (MIT) |
| 后端 | FastAPI + Python 3.10+ |
| 向量数据库 | ChromaDB (Apache 2.0) |
| 前端 | React 18 + TypeScript + Ant Design |
| 状态管理 | Zustand |
| 思维导图渲染 | markmap-lib (MIT) |
| 图表 | ECharts + echarts-for-react |
| 容器化 | Docker + Docker Compose |

---

## 📄 相关文档

- [需求规格说明书](docs/requirements.md)
- [开发指南](docs/development-guide.md)
- [赛题原文](A3赛题内容.md)

---

## 基本信息

| 项目 | 内容 |
|------|------|
| 项目名称 | **学径（LearnPath）** — 寓意为每位学习者规划可演进的个性化学习路径 |
| 赛题编号与名称 | A3：基于大模型的个性化资源生成与学习多智能体系统开发 |
| 组别 | A组（本科、研究生、高职） |
| 出题企业 | 科大讯飞股份有限公司 |
| 答疑 QQ 群 | 1072584310 |

---

## 赛题简介

在数字化与智能化深度融合的时代，高等教育的个性化变革成为核心发展方向，同时也面临传统教学模式适配性不足的挑战。不同学生在知识基础、学习能力、兴趣方向上的显著差异，使得标准化教学难以满足个性化学习需求，部分学生存在知识吸收效率低的问题。

当前大模型技术迎来高速发展新阶段，以通用大模型、多模态生成大模型（如 SeeDance 等）、AI 辅助编程工具（如 Claude Code 等）为代表的技术体系，具备强大的自然语言理解、多模态内容生成、代码辅助开发及实时推理能力，为高等教育领域的创新升级带来全新契机。

本赛题旨在借助大模型技术体系，融合前沿 AI 技术，突破传统教育的技术与模式局限，要求参赛团队构建高等教育个性化学习资源体系，开发智能学习智能体系统，切实满足学生的个性化、多模态学习需求。

---

## 赛题业务场景

在高等教育学习过程中，学生普遍面临学习资源繁杂无序、难以精准匹配自身需求且缺乏智能化、个性化学习指导的核心问题。不同专业、不同学历水平的学生在面对海量课程资料、学术文献、学习辅助工具时，难以快速筛选出契合自身学习进度和能力的资源；同时课堂集体讲授模式无法兼顾每位学生的学习节奏与特点，导致学生在知识掌握和能力提升上存在明显差距。

传统学习模式及基础的智能辅助系统，因缺乏多模态生成、多智能体协同等前沿 AI 技术的支撑，难以满足现代高等教育对培养创新型、个性化人才的要求。

基于此，本赛题要求参赛团队构建多智能体系统，为学生打造专属的个性化资源学习智能体，并借助多智能体协作实现智能化、精准化的学习引导。系统需依托各类高等教育资源，融合多模态生成、代码辅助开发等技术，以某一具体专业课程（如人工智能、计算机、电子信息相关等）为切入点，实现个性化资源的自动化生成与建设，根据学生个体情况提供定制化、多模态的学习内容，全方位辅助学生开展自主学习，真正实现“因材施教”的数字化落地。

---

## 基本功能需求

参赛团队需深入调研和研究新时代大学生的学习需求和痛点，融合前沿 AI 技术和工具，开发出能够高效生成个性化、多模态学习资源（如资源设计方案、PPT、题库、多模态视频/动画、实操案例、实践项目学习材料等）的智能体系统，实现提升学生学习效率、优化学习资源利用、增强学习效果的核心目标。该系统应包含以下核心功能：

### 1. 对话式学习画像自主构建

摒弃传统繁琐表单，支持通过自然语言对话（结合学生的专业、学习目标、学习历史等）自动抽取特征，构建包含不少于 6 个维度（如知识基础、认知风格、易错点偏好等）的动态学生画像，并支持画像的随学随新。

### 2. 多智能体协同的资源生成

系统须体现“多智能体”架构设计；通过与学生的智能交互，大模型结合 AI 前沿技术和工具，依据学生提供的专业、课程内容、知识短板、学习需求等信息，生成针对性的多模态学习资料，须由不同角色的智能体协作完成至少 5 种类型的个性化资源生成，例如：

- 专业课程讲解文档  
- 知识点思维导图  
- 不同类型练习题目  
- 拓展阅读材料  
- 多模态教学视频/动画  
- 代码类实操案例  

为学生提供全方位学习参考。

### 3. 个性化学习路径规划和资源推送

依托多智能体协同工作机制，整合系统生成的个性化资源，结合大模型对学生专业、学习进度、知识掌握情况及学习偏好的深度分析，为学生规划科学、动态的个性化学习路径，明确学习步骤和顺序；同时基于画像实现学习资源的精准推送，涵盖文档、视频、题库、实操案例等多类型内容。

### 4. 智能辅导（可选加分项）

当学生在学习过程中遇到问题时，系统提供即时、多模态的答疑解惑服务，通过智能体的数据分析、大模型的知识支持，结合多模态生成技术，为学生提供详细的文字解答、图解说明、短视频讲解等多样化解答形式，实现针对性学习引导。

### 5. 学习效果评估（可选加分项）

通过实时跟踪学生的学习行为、练习测试情况、资源使用反馈等数据，依托大模型的数据分析能力实现对学生学习效果的多维度、精准评估；并根据评估结果及时动态调整学习资源推送策略和学习计划，实现学习方案的持续优化。

---

## 非功能性需求

1. 系统界面美观大方、简洁明了，交互逻辑清晰，符合现代 AI 产品交互规范（如流式输出、Markdown 渲染、多模态内容卡片化展示），无明显功能与界面错误，可结合 AI 技术实现交互体验的智能优化。  
2. 若开发过程中使用开源项目、前沿 AI 工具/框架，需在提交文档的显著位置标注名称、来源及相关协议要求。  
3. 系统需具备完善的“防幻觉”与内容安全过滤机制，确保生成的学术内容无事实性错误、无敏感违规信息。  
4. 智能体核心功能的响应时间控制在合理范围内，保障学生的日常使用体验，多模态资源生成的响应效率需满足实际学习场景需求，如提供“生成进度追踪”或“流式呈现”机制，避免长时间白屏等待。

---

## 实现条件

本赛题对开发环境、编程语言、数据库、编辑器、硬件平台等均不做限制，参赛团队可结合前沿 AI 技术/工具，借助各类开源工具完成开发工作，需明确系统中“多智能体协同框架”，但须严格遵循开源协议及相关工具的使用要求，确保智能体程序可稳定、正常运行；智能体开发框架不做限制；开发过程中使用的其他 AI 辅助工具，需选用科大讯飞相关工具。

---

## 测试数据或平台

参赛团队需自行构造至少一门完整高校专业课程（如人工智能、计算机、电子信息相关等）的初始知识库/文档集作为系统输入。

---

## 开发所需设备及设备指标需求说明

无。

---

## 文档及其他要求

参赛团队提交的文档需参考软件系统的标准文档规范，包括但不限于系统开发说明书、测试说明书等，且须满足以下核心要求：

1. **需求层面**：需深入了解和研究新时代大学生的学习需求，结合前沿 AI 技术的应用场景完成系统性的需求分析，明确技术与需求的结合点。  
2. **技术开发层面**：详细阐述智能体的设计、开发、测试、部署全流程，包括用户界面设计、功能实现、系统集成及优化等方面的工作；重点说明前沿 AI 技术在系统中的融合应用思路、实现方法，同时指出系统开发过程中采纳的创新实践和用户体验提升策略。

参赛团队须确保以上两个层面的内容在文档中条理清晰、逻辑连贯，并且有充分的数据与案例支撑，以便能够全面体现系统的深度与广度。此外，鼓励参赛团队通过图表、流程图、架构图等视觉工具增强文档的可读性和说服力。

---

## 各评分项及大致占比

| 评分项 | 占比 |
|--------|------|
| 创新价值与实用性 | 35% |
| 功能实现及技术要求 | 45% |
| 配套文档的丰富度 | 10% |
| 演示视频、PPT 效果 | 10% |

---

## 初赛作品提交要求

1. **演示 PPT**：须清晰展示智能体应用价值、前沿 AI 技术融合思路与实现方法、创新价值、核心功能等内容，逻辑清晰、重点突出。  
2. **可完整运行的多智能体相关文件**：包含但不限于项目源码、数据集、模型部署配置文件等，文件整理规范，可在常规环境下正常运行。  
3. **智能体演示视频**：时长控制在 7 分钟之内，须清晰展示系统的操作流程、核心功能、多模态资源生成效果及前沿 AI 技术的应用成果。  
4. **智能体开发类型**：不限，包括但不限于 Web 应用、移动端开发、小程序端开发等。  
5. **配套文档**：需满足上文“文档及其他要求”中的所有规范，文档格式统一、内容完整。  
6. 如若使用 AI Coding 工具，给出相关说明。

---

## 著作权与商业合作说明

参赛团队作品中团队自主开发部分的软件作品著作权归参赛团队所有，其中具有市场应用及拓展的优秀作品，出题企业具有优先权，可以优先合作开发或者优先购买。另如基于该作品的任何合作升级开发、市场拓展等活动，以及在这一过程中所获得的任何商业费用，出题企业应与参赛团队协商解决。

---

## 大赛官方联系方式（官网页脚摘录）

- 咨询时间：工作日 9 点–11 点、14 点–17 点  
- 大赛邮箱：cnsoftbei@qq.com  
- 邮编：100048  
- 联系地址：北京市海淀区紫竹院路 66 号赛迪大厦 18 层  
