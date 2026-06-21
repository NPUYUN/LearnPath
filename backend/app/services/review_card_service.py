"""专属复习卡：按主题浓缩知识点与考点，区别于常规多类型学习资源。"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from app.core.llm.router import get_primary_llm
from app.db.repository import record_event, save_resources
from app.services.resource_metadata_service import build_resource_metadata
from app.services.resource_service import get_user_resources

_REVIEW_CARD_SYSTEM = (
    "你是「学径 LearnPath」复习卡生成器。\n"
    "根据给定主题，输出一份**浓缩复习卡** Markdown（不要 JSON，不要代码块包裹全文）。\n"
    "必须包含以下二级标题（按顺序）：\n"
    "## 核心考点\n"
    "## 必记公式/定义\n"
    "## 易错辨析\n"
    "## 快问快答\n"
    "要求：\n"
    "1. 面向考试与复盘，条目精炼，每条不超过两行\n"
    "2. 易错辨析用 Markdown 表格（误区 | 正确理解）\n"
    "3. 快问快答 5 题，格式「Q: … / A: …」\n"
    "4. 禁止空洞套话，禁止「首先其次」式废话\n"
    "5. 第一行用一级标题：# {主题} · 专属复习卡"
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_points(content: str, limit: int = 8) -> list[str]:
    points: list[str] = []
    for line in content.splitlines():
        text = line.strip()
        if text.startswith(("- ", "* ", "1.", "2.", "3.")):
            cleaned = re.sub(r"^[-*]\s+|\d+\.\s+", "", text).strip()
            if cleaned and len(cleaned) > 4:
                points.append(cleaned[:120])
        if len(points) >= limit:
            break
    return points[:limit]


def _fallback_content(topic: str) -> str:
    t = topic.strip()
    lower = t.lower()
    if any(k in t for k in ("机器学习", "ML", "线性回归", "梯度下降", "过拟合")):
        focus = "机器学习"
    elif any(k in lower for k in ("python", "语法", "列表", "字典")):
        focus = "Python"
    else:
        focus = t

    return f"""# {t} · 专属复习卡

> 浓缩复习资料 · 聚焦考点与易错点

## 核心考点
- **{focus}** 的基本概念与适用场景
- 关键术语定义及相互关系（建议对照思维导图记忆）
- 典型解题/应用流程：输入 → 处理 → 输出 → 评估
- 与相近概念的区别（见易错辨析）

## 必记公式/定义
- 核心定义用一句话表述，并给出符号含义
- 常用公式写清变量单位与使用前提
- 记住「何时用、何时不用」比死记公式更重要

## 易错辨析
| 误区 | 正确理解 |
|------|----------|
| 只背结论不做推导 | 复习卡用于触发回忆，需能口头解释 WHY |
| 混淆相似概念 | 用对比表或例子区分 {focus} 中的近义概念 |
| 忽略边界条件 | 公式/方法成立的前提必须一并记忆 |

## 快问快答
Q: {t} 最核心的 1 个考点是什么？  
A: （请结合你的课程笔记填写）

Q: 举一个 {focus} 的实际应用场景？  
A: …

Q: 最常见的 1 个错误理解是什么？  
A: …

Q: 若考试时间紧，优先复习哪 3 条？  
A: 核心定义、关键公式、1 个易错点

Q: 如何用 5 分钟自测是否掌握？  
A: 闭卷写出考点清单并口述 1 道快问快答
"""


async def _generate_markdown(topic: str) -> str:
    topic = topic.strip()
    if not topic:
        raise ValueError("请填写复习主题")

    llm = get_primary_llm()
    if not llm.use_mock:
        try:
            body = await llm.chat(
                [
                    {"role": "system", "content": _REVIEW_CARD_SYSTEM.replace("{主题}", topic)},
                    {"role": "user", "content": f"主题：{topic}\n请生成专属复习卡。"},
                ],
                temperature=0.45,
                task="review_card",
            )
            text = (body or "").strip()
            if text and len(text) > 120:
                if not text.startswith("#"):
                    text = f"# {topic} · 专属复习卡\n\n{text}"
                return text
        except Exception:
            pass

    return _fallback_content(topic)


def _build_review_card(user_id: str, topic: str, content: str) -> dict:
    rid = uuid.uuid4().hex[:12]
    knowledge_points = _extract_points(content)
    if not knowledge_points:
        knowledge_points = [topic[:80]]

    row = {
        "id": rid,
        "type": "review_card",
        "title": f"{topic} · 专属复习卡",
        "topic": topic,
        "content": content,
        "sources": ["复习卡生成"],
        "generation_mode": "review_card",
        "status": "published",
        "created_at": _now_iso(),
        "metadata": {
            "learning_purpose": "review",
            "used_for": ["review"],
            "recommended_stage": "复习巩固",
            "estimated_minutes": 10,
            "knowledge_points": knowledge_points,
            "quality_tags": ["复习卡", "考点浓缩"],
            "quality_score": 8.0,
            "summary": f"「{topic}」专属复习卡：浓缩考点、易错点与快问快答。",
            "learning_before_tip": "先闭卷回忆该主题要点，再对照复习卡查漏补缺。",
            "learning_after_check": "完成快问快答，在学习路径中标记掌握度。",
            "next_step": "针对错题回到对应讲解资源或生成新的复习卡。",
        },
    }
    row["metadata"] = build_resource_metadata(
        row,
        generation_context={"requirements": f"专属复习卡：{topic}", "topic": topic},
    )
    return row


async def list_review_cards(user_id: str) -> list[dict]:
    rows = await get_user_resources(user_id)
    cards = [r.model_dump() for r in rows if r.type == "review_card"]
    cards.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
    return cards


async def generate_review_card(user_id: str, topic: str) -> dict:
    topic = topic.strip()
    if not topic:
        raise ValueError("请填写复习主题")
    if len(topic) > 120:
        raise ValueError("主题过长，请控制在 120 字以内")

    content = await _generate_markdown(topic)
    resource = _build_review_card(user_id, topic, content)
    await save_resources(user_id, [resource])
    await record_event(
        user_id,
        "review_card_generate",
        resource_id=resource["id"],
        meta={
            "title": resource["title"],
            "topic": topic,
            "knowledge_points": resource["metadata"].get("knowledge_points", [])[:5],
        },
    )
    saved = await get_user_resources(user_id)
    match = next((r for r in saved if r.id == resource["id"]), None)
    return match.model_dump() if match else resource
