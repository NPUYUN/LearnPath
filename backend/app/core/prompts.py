"""集中管理各场景 System Prompt 与回复话术。"""

from __future__ import annotations

DEEP_THINKING_APPEND = (
    "\n\n【深度思考模式】\n"
    "请先给出简要的「分析要点」（分点列出推理依据与知识库引用），再给出「结论」。\n"
    "不确定之处须明确声明，禁止编造来源或数据。"
)

_PROFILE_BASE = (
    "你是「学径 LearnPath」高校学习顾问，负责从对话中抽取并更新学生学习画像。\n"
    "要求：教育学视角、字段定义清晰、仅输出可解析 JSON，禁止口语化敷衍。\n"
    "JSON 字段：knowledge_level, learning_goal, cognitive_style, error_prone_topics(数组), "
    "preferred_modality, pace_and_time, recent_progress。\n"
    "若信息不足，保留合理默认值并在字段中体现「待补充」。"
)

_TUTOR_BASE = (
    "你是「学径 LearnPath」高校课程辅导教师，基于提供的知识库片段作答。\n"
    "要求：学术严谨、结构清晰、引用知识库内容；知识库未覆盖时明确说明「知识库暂无依据」。\n"
    "回复须包含：\n"
    "1. **文字解答**（分点，含定义与要点）\n"
    "2. **Mermaid 图解**（使用 ```mermaid 代码块）\n"
    "3. **短视频分镜脚本**（3–5 个镜头，含画面与旁白要点）\n"
    "禁止空洞套话与编造文献。"
)


def profile_system(deep: bool = False) -> str:
    text = _PROFILE_BASE
    if deep:
        text += DEEP_THINKING_APPEND
    return text


def tutor_system(deep: bool = False) -> str:
    text = _TUTOR_BASE
    if deep:
        text += DEEP_THINKING_APPEND
    return text


def chat_reply_hint(intent: str, deep: bool = False) -> str:
    """各意图节点面向用户的完成说明（非 LLM system）。"""
    hints: dict[str, str] = {
        "profile": (
            "【学习画像已更新】\n"
            "- 已同步 6 维画像字段（知识基础、目标、认知风格、薄弱点、偏好模态、时间投入）。\n"
            "- 建议下一步：在「学习画像」页查看雷达图，或对话生成个性化资源。"
        ),
        "generate": (
            "【学习资源已生成】\n"
            "- 已按你的主题生成多类型资源（文档 / 思维导图 / 题库 / 阅读 / 多媒体 / 代码示例）。\n"
            "- 建议下一步：在「资源库」浏览内容，或在「学习路径」查看分阶段安排。"
        ),
        "path": (
            "【学习路径已规划】\n"
            "- 已根据画像与现有资源生成分阶段路径（含阶段目标与预估学时）。\n"
            "- 建议下一步：在「学习路径」页按步骤推进，完成各阶段配套资源。"
        ),
        "eval": (
            "【学习效果评估】\n"
            "- 可在「学习评估」页查看雷达图、资源分布与 AI 建议。\n"
            "- 建议在「资源库」完成题库测验，系统将据此更新薄弱点与路径。"
        ),
        "tutor": (
            "【智能辅导】\n"
            "- 已结合课程知识库生成结构化解答（含图解与分镜脚本）。\n"
            "- 若有疑问可继续追问，或前往「资源库」巩固相关练习。"
        ),
        "chat": "已收到你的消息。请说明学习目标或具体问题，以便调用画像、资源、路径或辅导能力。",
    }
    text = hints.get(intent, hints["chat"])
    if deep and intent in ("profile", "generate", "path", "eval", "tutor"):
        text += "\n\n（本次启用深度思考，推理过程更完整，响应可能略慢。）"
    return text


def profile_temperature(deep: bool = False) -> float:
    return 0.35 if deep else 0.7


def tutor_temperature(deep: bool = False) -> float:
    return 0.4 if deep else 0.7
