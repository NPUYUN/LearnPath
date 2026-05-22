"""
多资源生成智能体集合
包含5种类型的资源生成智能体：
1. DocumentAgent  — 课程讲解文档
2. MindMapAgent   — 知识点思维导图
3. QuizAgent      — 个性化题库
4. VideoAgent     — 多模态视频脚本/动画提示词
5. CodeAgent      — 代码实操案例

TODO（开发者任务）：
每个 Agent 的 run() 方法需要开发者完整实现，
当前提供系统提示词模板和输出格式规范。
"""
import json
from backend.agents.base_agent import BaseAgent
from backend.models.state import AgentState, LearningResource
import uuid
from datetime import datetime


# ─────────────────────────────────────────────────────────────
# 1. 课程讲解文档智能体
# ─────────────────────────────────────────────────────────────

DOCUMENT_SYSTEM_PROMPT = """你是一位专业的大学课程讲师，
请根据学生的个人画像和知识水平，生成一份个性化的课程讲解文档。

要求：
- 使用 Markdown 格式
- 包含：概念讲解、原理分析、类比举例、关键公式/代码
- 根据学生认知风格调整内容呈现方式：
  * 视觉型：多用图表、流程图描述
  * 阅读型：详细文字说明
  * 动手型：多提供实际操作步骤
- 针对学生的易错点重点讲解
- 知识点末尾给出2-3个思考题"""


class DocumentAgent(BaseAgent):
    """
    课程讲解文档生成智能体
    
    输出格式（LearningResource.content）：
    {
        "markdown": "# 标题\n...",
        "summary": "摘要（50字内）",
        "key_concepts": ["概念1", "概念2"],
        "estimated_read_time": 分钟数
    }
    
    TODO:
    1. 调用 RAG 检索知识库上下文，保证内容准确性
    2. 实现流式生成（SSE 推送）
    3. 支持导出为 PDF（使用 reportlab）
    """

    name = "document_agent"
    description = "生成个性化课程讲解文档（Markdown/PDF）"

    def run(self, state: AgentState) -> AgentState:
        topic = state.get("current_topic", "")
        profile_desc = self._build_system_prompt(state)
        rag_context = self._retrieve_context(topic)

        # TODO: 实现 LLM 调用生成文档
        # messages = [
        #     {"role": "system", "content": DOCUMENT_SYSTEM_PROMPT + profile_desc},
        #     {"role": "user", "content": f"请为主题「{topic}」生成讲解文档。\n\n参考资料：\n{rag_context}"},
        # ]
        # markdown_content = await self._call_llm(messages)

        # 占位示例输出
        resource = LearningResource(
            resource_id=str(uuid.uuid4()),
            resource_type="document",
            title=f"{topic} — 课程讲解文档",
            content={
                "markdown": f"# {topic}\n\n> TODO: 调用讯飞 Spark API 生成内容\n\n## 知识点讲解\n\n...",
                "summary": f"关于{topic}的个性化讲解文档",
                "key_concepts": [],
                "estimated_read_time": 15,
            },
            generated_at=datetime.now().isoformat(),
        )

        resources = state.get("generated_resources", [])
        return {**state, "generated_resources": resources + [resource]}


# ─────────────────────────────────────────────────────────────
# 2. 思维导图生成智能体
# ─────────────────────────────────────────────────────────────

MINDMAP_SYSTEM_PROMPT = """你是一位知识结构化专家。
请为给定的学习主题生成一个层级清晰的思维导图数据结构。

返回 JSON 格式（MarkMap 兼容格式）：
{
    "root": {
        "text": "主题名称",
        "children": [
            {
                "text": "一级节点",
                "children": [
                    {"text": "二级节点", "children": []}
                ]
            }
        ]
    }
}

要求：
- 至少3层层级
- 每个一级节点下至少2个二级节点
- 节点文字简洁（≤15字）
- 覆盖该主题的核心知识点"""


class MindMapAgent(BaseAgent):
    """
    思维导图生成智能体
    
    输出格式（LearningResource.content）：
    {
        "tree": { "root": {...} },   # MarkMap/D3.js 兼容的树形 JSON
        "mermaid": "mindmap\n  root..."  # Mermaid 格式（备选）
    }
    
    TODO:
    1. 调用 LLM 生成思维导图 JSON 数据
    2. 前端使用 markmap-lib 渲染可交互思维导图
    3. 支持导出为 SVG/PNG
    """

    name = "mindmap_agent"
    description = "生成知识点思维导图（JSON树形结构）"

    def run(self, state: AgentState) -> AgentState:
        topic = state.get("current_topic", "")

        # TODO: 调用 LLM 生成思维导图 JSON
        resource = LearningResource(
            resource_id=str(uuid.uuid4()),
            resource_type="mindmap",
            title=f"{topic} — 知识思维导图",
            content={
                "tree": {
                    "root": {
                        "text": topic,
                        "children": [
                            {"text": "TODO: 调用 Spark API 生成", "children": []},
                        ],
                    }
                },
                "mermaid": f"mindmap\n  root(({topic}))\n    TODO",
            },
            generated_at=datetime.now().isoformat(),
        )

        resources = state.get("generated_resources", [])
        return {**state, "generated_resources": resources + [resource]}


# ─────────────────────────────────────────────────────────────
# 3. 题库生成智能体
# ─────────────────────────────────────────────────────────────

QUIZ_SYSTEM_PROMPT = """你是一位出题专家，请根据学生画像和学习主题生成个性化练习题。

要求：
- 生成3种类型的题目：单选题、填空题、编程/分析题
- 难度根据学生知识水平调整（0-10分对应简单/中等/困难）
- 针对学生的易错点重点出题
- 每道题提供详细解析

返回 JSON 格式：
{
    "questions": [
        {
            "id": "q1",
            "type": "single_choice",  // single_choice / fill_blank / coding
            "difficulty": "easy",
            "question": "题目内容",
            "options": ["A...", "B...", "C...", "D..."],  // 仅单选题有
            "answer": "答案",
            "explanation": "解析"
        }
    ]
}"""


class QuizAgent(BaseAgent):
    """
    个性化题库生成智能体
    
    TODO:
    1. 根据画像中的 knowledge_level 动态调整题目难度
    2. 针对 error_prone_topics 重点出题
    3. 记录学生答题情况（供 EvaluatorAgent 使用）
    4. 支持题目去重（避免重复出同类题）
    """

    name = "quiz_agent"
    description = "生成个性化练习题库（选择/填空/编程题）"

    def run(self, state: AgentState) -> AgentState:
        topic = state.get("current_topic", "")

        # TODO: 调用 LLM 生成题目
        resource = LearningResource(
            resource_id=str(uuid.uuid4()),
            resource_type="quiz",
            title=f"{topic} — 练习题库",
            content={
                "questions": [
                    {
                        "id": "q1",
                        "type": "single_choice",
                        "difficulty": "medium",
                        "question": f"TODO: 调用 Spark API 生成关于「{topic}」的题目",
                        "options": ["A. 选项A", "B. 选项B", "C. 选项C", "D. 选项D"],
                        "answer": "A",
                        "explanation": "TODO: 生成题目解析",
                    }
                ]
            },
            generated_at=datetime.now().isoformat(),
        )

        resources = state.get("generated_resources", [])
        return {**state, "generated_resources": resources + [resource]}


# ─────────────────────────────────────────────────────────────
# 4. 视频脚本/动画智能体
# ─────────────────────────────────────────────────────────────

VIDEO_SYSTEM_PROMPT = """你是一位教育视频编导，请为学习主题生成教学视频脚本。

要求：
- 总时长3-5分钟
- 包含：开场白、知识点讲解（含可视化描述）、总结
- 为每个场景提供动画/图像提示词（用于生成视频）

返回 JSON 格式：
{
    "title": "视频标题",
    "total_duration": 秒数,
    "scenes": [
        {
            "scene_id": 1,
            "duration": 秒数,
            "narration": "旁白文本",
            "visual_prompt": "动画/图像描述（用于AI生图）",
            "on_screen_text": "屏幕显示的关键文字"
        }
    ]
}"""


class VideoAgent(BaseAgent):
    """
    多模态视频脚本生成智能体
    
    TODO:
    1. 调用 LLM 生成视频脚本和分镜
    2. 集成讯飞语音合成（TTS）将旁白转为语音
    3. 集成 AI 图像/视频生成（如使用讯飞相关工具）
    4. 最终合成可播放的 MP4 文件
    """

    name = "video_agent"
    description = "生成多模态教学视频脚本和动画提示词"

    def run(self, state: AgentState) -> AgentState:
        topic = state.get("current_topic", "")

        # TODO: 调用 LLM 生成视频脚本
        resource = LearningResource(
            resource_id=str(uuid.uuid4()),
            resource_type="video",
            title=f"{topic} — 教学视频脚本",
            content={
                "title": f"{topic}教学视频",
                "total_duration": 300,
                "scenes": [
                    {
                        "scene_id": 1,
                        "duration": 30,
                        "narration": f"TODO: 调用 Spark API 生成关于「{topic}」的视频脚本",
                        "visual_prompt": "TODO: 生成动画提示词",
                        "on_screen_text": topic,
                    }
                ],
            },
            generated_at=datetime.now().isoformat(),
        )

        resources = state.get("generated_resources", [])
        return {**state, "generated_resources": resources + [resource]}


# ─────────────────────────────────────────────────────────────
# 5. 代码实操案例生成智能体
# ─────────────────────────────────────────────────────────────

CODE_SYSTEM_PROMPT = """你是一位资深程序员和教育者，请为学习主题生成代码实操案例。

要求：
- 代码完整可运行（Python优先）
- 包含详细中文注释
- 提供逐步讲解（Step by Step）
- 针对初学者常见错误给出提示
- 提供扩展练习建议

返回 JSON 格式：
{
    "language": "python",
    "code": "完整代码（含注释）",
    "explanation": [
        {"step": 1, "title": "步骤标题", "description": "详细说明"}
    ],
    "common_mistakes": ["常见错误1", "常见错误2"],
    "extensions": ["扩展练习1", "扩展练习2"]
}"""


class CodeAgent(BaseAgent):
    """
    代码实操案例生成智能体
    
    TODO:
    1. 调用 LLM 生成可运行的代码示例
    2. 在沙箱环境中验证代码可运行性
    3. 根据学生画像中的编程水平调整代码复杂度
    4. 集成在线代码运行器（如 Jupyter Kernel）
    """

    name = "code_agent"
    description = "生成代码实操案例（含注释和逐步讲解）"

    def run(self, state: AgentState) -> AgentState:
        topic = state.get("current_topic", "")

        # TODO: 调用 LLM 生成代码案例
        resource = LearningResource(
            resource_id=str(uuid.uuid4()),
            resource_type="code",
            title=f"{topic} — 代码实操案例",
            content={
                "language": "python",
                "code": f"# TODO: 调用 Spark API 生成关于「{topic}」的代码案例\n# ...",
                "explanation": [
                    {"step": 1, "title": "初始化", "description": "TODO: 生成讲解内容"}
                ],
                "common_mistakes": [],
                "extensions": [],
            },
            generated_at=datetime.now().isoformat(),
        )

        resources = state.get("generated_resources", [])
        return {**state, "generated_resources": resources + [resource]}
