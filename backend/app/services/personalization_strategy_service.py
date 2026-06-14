"""个性化教学策略层：把长期画像 + 实时画像转成 AI 可执行的内部策略。"""

from __future__ import annotations

from typing import Any

from app.models.schemas import PersonalizationStrategy, ResourceType


_RESOURCE_TYPES: tuple[ResourceType, ...] = (
    "doc",
    "mindmap",
    "quiz",
    "reading",
    "media",
    "code",
    "ppt",
    "design",
    "project",
)


def build_personalization_strategy(
    *,
    profile: dict | None = None,
    realtime_state: dict | None = None,
    question_type: str = "general",
    question: str = "",
) -> dict[str, Any]:
    """生成本轮内部教学策略。

    实时画像回答「学生现在怎样」，策略层回答「AI 这轮该怎么做」。
    """

    p = profile or {}
    s = realtime_state or {}
    emotion = str(s.get("emotion") or "neutral")
    engagement = str(s.get("engagement") or "medium")
    load = str(s.get("cognitive_load") or "medium")
    confusion = _level(s.get("confusion_level"), 0.0)
    curiosity = _level(s.get("curiosity_level"), 0.0)
    load_level = _level(s.get("cognitive_load_level"), 0.5)
    frustration = _level(s.get("frustration_level"), 0.0)
    confidence = _level(s.get("confidence_level"), 0.6)
    initiative = _level(s.get("initiative_level"), 0.5)
    focus_topics = _focus_topics(s, p, question)

    if load_level >= 0.72:
        load = "high"
    if frustration >= 0.65:
        emotion = "frustrated"
    if confidence <= 0.34 and confusion >= 0.45:
        emotion = "confused"

    mode = _select_mode(emotion, engagement, load, confusion, curiosity)
    tone = "温和、清晰、鼓励"
    difficulty: str = "maintain"
    pacing: str = "normal"
    depth: str = "standard"
    response_plan = [
        "先回应用户本轮问题，不绕到无关学科主题",
        "用用户当前语言风格表达，保持自然口语感",
    ]
    must_do = [
        "只把策略体现在回答方式里，不要向用户暴露画像字段或内部策略",
        "回答末尾给一个自然的下一步入口",
    ]
    avoid = [
        "不要说「我检测到你的情绪/负荷/画像」",
        "不要把一时状态当成长期结论",
        "不要堆叠用户没问到的新术语",
    ]
    preferred_resources = _resource_preferences_from_profile(p)
    avoid_resources: list[ResourceType] = []
    assessment_style = "结尾给一个小检查问题，确认是否理解"

    if mode == "unblock":
        tone = "先安抚，再清晰拆解；语气稳一点"
        difficulty = "lower"
        pacing = "slow"
        depth = "standard"
        response_plan.extend(
            [
                "用一句话确认卡点正常，不评价学生能力",
                "先给核心直觉，再分 3 步以内解释",
                "用一个最小例子替代长推导",
            ]
        )
        must_do.extend(
            [
                "每一步只推进一个概念",
                "如果必须出现公式，先解释每个符号的含义",
            ]
        )
        avoid.extend(["不要说「这很简单」", "不要直接给大段公式推导"])
        _prepend_unique(preferred_resources, ["mindmap", "doc", "media"])
        _append_unique(avoid_resources, ["project", "design"])
        assessment_style = "用一个 1 分钟小问题确认卡点是否解开"

    elif mode == "simplify":
        tone = "克制、低密度、先建立直觉"
        difficulty = "lower"
        pacing = "slow"
        depth = "brief"
        response_plan.extend(
            [
                "先压缩成一句核心结论",
                "把抽象概念换成类比或图解式描述",
                "只展开最关键的一层原因",
            ]
        )
        must_do.append("降低信息密度，少用并列分支")
        avoid.extend(["不要连续提出多个问题", "不要推荐长篇阅读作为第一步"])
        _prepend_unique(preferred_resources, ["mindmap", "media", "doc"])
        _append_unique(avoid_resources, ["project", "design", "quiz"])
        assessment_style = "结尾只给一个很短的判断题或复述任务"

    elif mode == "explore":
        tone = "保持探索感，积极回应好奇心"
        difficulty = "maintain"
        pacing = "normal"
        depth = "deep"
        response_plan.extend(
            [
                "先回答核心为什么，再补充背后的机制",
                "给一个可继续追问的延展方向",
                "必要时连接到长期学习目标",
            ]
        )
        must_do.append("把好奇点转成可继续学习的问题")
        avoid.append("不要过早收束成机械总结")
        _prepend_unique(preferred_resources, ["reading", "code", "project", "doc"])
        assessment_style = "结尾给一个开放式追问或小实验"

    elif mode == "challenge":
        tone = "直接、有挑战感，但不压迫"
        difficulty = "raise"
        pacing = "fast"
        depth = "deep"
        response_plan.extend(
            [
                "先给标准解法，再给一个更高阶视角",
                "加入一个挑战任务或变式练习",
            ]
        )
        must_do.append("明确挑战任务的完成标准")
        avoid.append("不要只给鼓励而没有任务")
        _prepend_unique(preferred_resources, ["quiz", "code", "project", "reading"])
        assessment_style = "结尾给一个挑战题或可验证的小项目"

    elif mode == "focus":
        tone = "简短、轻量、减少压力"
        difficulty = "lower"
        pacing = "slow"
        depth = "brief"
        response_plan.extend(
            [
                "回答控制在少量要点内",
                "优先给可马上完成的小动作",
                "把学习任务拆到 5 分钟级别",
            ]
        )
        must_do.append("避免一次性布置多个任务")
        avoid.extend(["不要长篇解释", "不要推高强度项目"])
        _prepend_unique(preferred_resources, ["mindmap", "reading", "doc"])
        _append_unique(avoid_resources, ["project", "design"])
        assessment_style = "结尾给一个轻量复习动作，不要求立刻完成大题"

    elif mode == "stabilize":
        tone = "稳定、给优先级、减少不确定感"
        difficulty = "maintain"
        pacing = "slow"
        depth = "standard"
        response_plan.extend(
            [
                "先给最短路径和优先级",
                "把问题拆成现在要做/可以稍后做",
                "用清单减少不确定感",
            ]
        )
        must_do.append("先帮助用户判断最重要的一步")
        avoid.extend(["不要制造更多待办", "不要夸大难度"])
        _prepend_unique(preferred_resources, ["doc", "mindmap", "quiz"])
        assessment_style = "结尾给一个下一步确认问题"

    else:
        response_plan.extend(
            [
                "按定义/例子/应用或步骤组织回答",
                "根据需要给一个后续练习或资源方向",
            ]
        )

    _apply_question_type_policy(
        question_type,
        response_plan=response_plan,
        must_do=must_do,
        avoid=avoid,
        preferred_resources=preferred_resources,
    )
    _apply_profile_policy(
        p,
        focus_topics,
        must_do=must_do,
        preferred_resources=preferred_resources,
    )
    _apply_realtime_style_policy(
        s,
        response_plan=response_plan,
        must_do=must_do,
    )
    if confidence <= 0.4 and mode in ("unblock", "simplify", "stabilize"):
        _prepend_unique(response_plan, ["先让学生获得一点把握感，再继续推进"])
        _append_unique(avoid, ["不要直接评价学生基础差"])
    if initiative >= 0.72 and mode not in ("unblock", "simplify", "focus"):
        _append_unique(must_do, ["把主动性转成一个明确可执行的小任务"])
    _prioritize_resources_for_mode(mode, preferred_resources)

    valid_avoid_resources = _valid_resource_types(avoid_resources)[:5]
    valid_preferred_resources = [
        item
        for item in _valid_resource_types(preferred_resources)
        if item not in valid_avoid_resources
    ][:5]

    strategy = PersonalizationStrategy(
        teaching_mode=mode,
        tone=tone,
        difficulty=difficulty,  # type: ignore[arg-type]
        pacing=pacing,  # type: ignore[arg-type]
        explanation_depth=depth,  # type: ignore[arg-type]
        response_plan=_dedupe(response_plan)[:8],
        must_do=_dedupe(must_do)[:8],
        avoid=_dedupe(avoid)[:8],
        preferred_resource_types=valid_preferred_resources,
        avoid_resource_types=valid_avoid_resources,
        assessment_style=assessment_style,
        focus_topics=focus_topics[:5],
    )
    return strategy.model_dump(mode="json")


def format_personalization_strategy_prompt(strategy: dict | PersonalizationStrategy | None) -> str:
    """格式化为 LLM 可读的内部提示词片段。"""

    if not strategy:
        strategy_obj = PersonalizationStrategy()
    elif isinstance(strategy, PersonalizationStrategy):
        strategy_obj = strategy
    else:
        data = {
            k: v
            for k, v in strategy.items()
            if k in PersonalizationStrategy.model_fields
        }
        strategy_obj = PersonalizationStrategy(**data)

    resource_like = "、".join(strategy_obj.preferred_resource_types) or "无特别偏好"
    resource_avoid = "、".join(strategy_obj.avoid_resource_types) or "无"
    focus = "、".join(strategy_obj.focus_topics) or "当前问题"
    return (
        "内部个性化策略（只用于调整回答，不要直接告诉用户）：\n"
        f"- 教学模式：{strategy_obj.teaching_mode}；焦点：{focus}\n"
        f"- 语气：{strategy_obj.tone}\n"
        f"- 难度调整：{strategy_obj.difficulty}；节奏：{strategy_obj.pacing}；解释深度：{strategy_obj.explanation_depth}\n"
        f"- 回答结构：{_join_items(strategy_obj.response_plan)}\n"
        f"- 必须做到：{_join_items(strategy_obj.must_do)}\n"
        f"- 避免：{_join_items(strategy_obj.avoid)}\n"
        f"- 资源倾向：优先 {resource_like}；避免 {resource_avoid}\n"
        f"- 理解检查：{strategy_obj.assessment_style}"
    )


def format_realtime_reply_policy_prompt(
    strategy: dict | PersonalizationStrategy | None,
    realtime_state: dict | None,
) -> str:
    """Build a high-priority hidden policy that turns realtime state into reply behavior."""

    if not strategy:
        strategy_obj = PersonalizationStrategy()
    elif isinstance(strategy, PersonalizationStrategy):
        strategy_obj = strategy
    else:
        data = {
            k: v
            for k, v in strategy.items()
            if k in PersonalizationStrategy.model_fields
        }
        strategy_obj = PersonalizationStrategy(**data)

    state = realtime_state or {}
    confusion = _level(state.get("confusion_level"), 0.0)
    curiosity = _level(state.get("curiosity_level"), 0.0)
    load_level = _level(state.get("cognitive_load_level"), 0.5)
    frustration = _level(state.get("frustration_level"), 0.0)
    confidence = _level(state.get("confidence_level"), 0.6)
    initiative = _level(state.get("initiative_level"), 0.5)
    implicit = str(state.get("implicit_emotion") or "").strip()[:40] or "未识别"
    next_action = str(state.get("next_best_action") or strategy_obj.assessment_style).strip()[:80]

    rules = [
        "这是内部实时画像驱动策略，只能改变回答方式，禁止向用户展示或复述画像字段、分数、检测结论。",
        f"当前教学模式：{strategy_obj.teaching_mode}；语气：{strategy_obj.tone}；节奏：{strategy_obj.pacing}；深度：{strategy_obj.explanation_depth}。",
        f"实时信号：隐含情绪={implicit}；困惑={confusion:.2f}；好奇={curiosity:.2f}；负荷={load_level:.2f}；受挫={frustration:.2f}；信心={confidence:.2f}；主动性={initiative:.2f}。",
        "回答必须先解决用户本轮问题，不要转去讲用户没问的内容。",
        "结尾只给一个自然的下一步，不要布置多条任务。",
    ]
    if confusion >= 0.62 or frustration >= 0.58 or load_level >= 0.72:
        rules.extend(
            [
                "学生此刻可能卡住或负荷偏高：先用一句话降低压力，再给一句直觉解释。",
                "拆解最多 3 步；每步只推进一个概念；公式和术语必须后置，并先解释符号含义。",
                "优先用最小例子、类比或小图景，不要直接上长推导。",
            ]
        )
    if confidence <= 0.42:
        rules.extend(
            [
                "学生信心偏低：避免评价能力，避免说“很简单”“你只需要”。",
                "先给一个容易完成的小抓手，让用户获得把握感。",
            ]
        )
    if curiosity >= 0.68 and load_level < 0.68:
        rules.extend(
            [
                "学生好奇心较高：回答核心后，可以补一个更深层的为什么或可探索方向。",
                "拓展只能给一个，不要把回答散成百科式展开。",
            ]
        )
    if initiative >= 0.72 and load_level < 0.72:
        rules.append("学生主动性较高：把主动性转成一个明确可执行的小实验、小练习或追问。")
    if str(state.get("emotion") or "") == "tired" or str(state.get("engagement") or "") == "low":
        rules.extend(
            [
                "学生可能疲劳或投入偏低：回答要短，信息密度要低。",
                "优先给 5 分钟内能完成的小动作。",
            ]
        )
    if next_action:
        rules.append(f"本轮优先教学动作：{next_action}。")
    if strategy_obj.must_do:
        rules.append(f"必须体现：{_join_items(strategy_obj.must_do[:4])}。")
    if strategy_obj.avoid:
        rules.append(f"避免：{_join_items(strategy_obj.avoid[:4])}。")

    return "【内部实时个性化回复策略】\n" + "\n".join(f"- {item}" for item in rules)


def _select_mode(
    emotion: str,
    engagement: str,
    load: str,
    confusion: float,
    curiosity: float,
) -> str:
    if emotion in ("frustrated", "confused") or confusion >= 0.65:
        return "unblock"
    if emotion == "anxious":
        return "stabilize"
    if emotion == "tired" or engagement == "low":
        return "focus"
    if load == "high":
        return "simplify"
    if emotion == "excited" or curiosity >= 0.7:
        return "explore"
    if engagement == "high":
        return "challenge"
    return "routine"


def _apply_question_type_policy(
    question_type: str,
    *,
    response_plan: list[str],
    must_do: list[str],
    avoid: list[str],
    preferred_resources: list[str],
) -> None:
    if question_type == "code":
        _prepend_unique(response_plan, ["先给最小可运行代码，再解释关键行"])
        _append_unique(must_do, ["说明代码运行前提和常见报错点"])
        _prepend_unique(preferred_resources, ["code", "doc"])
    elif question_type == "practice":
        _prepend_unique(response_plan, ["先拆题目条件，再给解题步骤"])
        _append_unique(must_do, ["标注易错点和检查方法"])
        _prepend_unique(preferred_resources, ["quiz", "doc"])
    elif question_type == "concept":
        _prepend_unique(response_plan, ["先给一句话直觉，再解释定义和例子"])
        _prepend_unique(preferred_resources, ["mindmap", "doc", "media"])
    elif question_type == "media":
        _append_unique(must_do, ["用画面/分镜帮助理解抽象概念"])
        _prepend_unique(preferred_resources, ["media", "mindmap"])
    elif question_type == "profile_info":
        _append_unique(must_do, ["只确认与学习有关的画像信息"])
        _append_unique(avoid, ["不要询问隐私或无关个人信息"])


def _apply_profile_policy(
    profile: dict,
    focus_topics: list[str],
    *,
    must_do: list[str],
    preferred_resources: list[str],
) -> None:
    weak = [str(x).strip() for x in profile.get("error_prone_topics") or [] if str(x).strip()]
    if weak and focus_topics and any(t in weak for t in focus_topics):
        _append_unique(must_do, ["把当前主题作为薄弱点巩固，不要只给一次性答案"])
    modality = str(profile.get("preferred_modality") or "")
    style = str(profile.get("cognitive_style") or "")
    if "图" in modality or "导图" in modality or "视觉" in style:
        _prepend_unique(preferred_resources, ["mindmap", "media"])
        _append_unique(must_do, ["优先使用关系图、类比或结构表"])
    if "练习" in modality or "实践" in style:
        _prepend_unique(preferred_resources, ["quiz", "code", "project"])
        _append_unique(must_do, ["给一个可操作的小练习或小实验"])


def _apply_realtime_style_policy(
    state: dict,
    *,
    response_plan: list[str],
    must_do: list[str],
) -> None:
    language_style = str(state.get("language_style") or "")
    if "例子" in language_style:
        _append_unique(response_plan, ["优先用例子解释，再抽象总结"])
    if "代码" in language_style:
        _append_unique(response_plan, ["可用代码或伪代码辅助说明"])
    if "图解" in language_style or "导图" in language_style:
        _append_unique(response_plan, ["可用结构图或 mermaid 关系图辅助"])
    if state.get("preferred_reply_style"):
        _append_unique(must_do, [f"参考实时回复偏好：{str(state.get('preferred_reply_style'))[:80]}"])
    if state.get("next_best_action"):
        _append_unique(must_do, [f"本轮教学动作：{str(state.get('next_best_action'))[:80]}"])


def _resource_preferences_from_profile(profile: dict) -> list[str]:
    text = f"{profile.get('preferred_modality') or ''} {profile.get('cognitive_style') or ''}"
    prefs: list[str] = []
    if "导图" in text or "图" in text:
        prefs.extend(["mindmap", "media"])
    if "文档" in text:
        prefs.extend(["doc", "reading"])
    if "阅读" in text:
        prefs.append("reading")
    if "练习" in text or "测验" in text:
        prefs.append("quiz")
    if "代码" in text or "实践" in text:
        prefs.extend(["code", "project"])
    return _dedupe(prefs) or ["doc", "mindmap", "quiz"]


def _prioritize_resources_for_mode(mode: str, resources: list[str]) -> None:
    priority_map = {
        "unblock": ["mindmap", "doc", "media", "quiz"],
        "simplify": ["mindmap", "media", "doc"],
        "focus": ["mindmap", "reading", "doc"],
        "stabilize": ["doc", "mindmap", "quiz"],
        "explore": ["reading", "code", "project", "doc"],
        "challenge": ["quiz", "code", "project", "reading"],
    }
    priority = priority_map.get(mode)
    if not priority:
        return
    ordered = [item for item in priority if item in resources]
    ordered.extend(item for item in resources if item not in ordered)
    resources[:] = ordered


def _focus_topics(state: dict, profile: dict, question: str) -> list[str]:
    topics: list[str] = []
    _append_unique(topics, _as_str_list(state.get("stuck_topics")))
    _append_unique(topics, _as_str_list(state.get("curiosity_topics")))
    for weak in _as_str_list(profile.get("error_prone_topics")):
        if weak and weak in question:
            _append_unique(topics, [weak])
    return topics[:5]


def _level(value: Any, default: float) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except Exception:
        return default


def _as_str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        text = str(item).strip()
        if text and text not in out:
            out.append(text[:80])
    return out


def _prepend_unique(target: list[str], items: list[str]) -> None:
    for item in reversed(items):
        if item in target:
            target.remove(item)
        target.insert(0, item)


def _append_unique(target: list[str], items: list[str]) -> None:
    for item in items:
        if item and item not in target:
            target.append(item)


def _dedupe(items: list[str]) -> list[str]:
    out: list[str] = []
    for item in items:
        text = str(item).strip()
        if text and text not in out:
            out.append(text)
    return out


def _valid_resource_types(items: list[str]) -> list[ResourceType]:
    valid = set(_RESOURCE_TYPES)
    return [item for item in _dedupe(items) if item in valid]  # type: ignore[list-item]


def _join_items(items: list[str]) -> str:
    return "；".join(items) if items else "无"
