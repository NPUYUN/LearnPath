"""智能对话：资源库优先检索、匹配度路由、多模态回答、画像增量更新。"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, AsyncIterator

from app.core.guardrails import attach_sources, filter_sensitive
from app.core.llm import get_primary_llm
from app.core.prompts import (
    chat_direct_system,
    chat_library_polish_system,
    chat_profile_patch_system,
    chat_temperature,
)
from app.db.repository import list_libraries, save_profile
from app.rag.library_retriever import retrieve_from_library
from app.services.user_defaults import profile_fallback_fields
from app.services.multimodal_enrich_service import enrich_chat_media_answer_async
from app.services.personalization_strategy_service import (
    build_personalization_strategy,
    format_personalization_strategy_prompt,
    format_realtime_reply_policy_prompt,
)
from app.services.realtime_state_service import (
    analyze_realtime_state,
    realtime_state_strategy_hint,
)

# 资源库片段匹配度阈值（满分约 10+）
MATCH_THRESHOLD = 2.8

QUESTION_TYPES = (
    "chitchat",
    "concept",
    "code",
    "media",
    "practice",
    "profile_info",
    "general",
)

_CHITCHAT_EXACT = {
    "你好", "您好", "hi", "hello", "hey", "在吗", "在么", "在不在",
    "谢谢", "谢了", "感谢", "多谢", "好的", "ok", "okay", "嗯", "嗯嗯",
    "再见", "拜拜", "bye", "早上好", "晚上好", "下午好",
}


def is_chitchat_message(message: str) -> bool:
    """寒暄、致谢、告别等无具体学习诉求的短句。"""
    text = message.strip()
    if not text:
        return False
    if re.search(
        r"(你是谁|你叫什么|你能做什么|你有什么功能|介绍一下你自己|学径是什么|learnpath)",
        text,
        re.I,
    ):
        return True
    if len(text) > 48:
        return False
    lowered = text.lower()
    if lowered in _CHITCHAT_EXACT or text in _CHITCHAT_EXACT:
        return True
    if re.match(
        r"^(你好|您好|hi|hello|hey|在吗|在么|谢谢|感谢|多谢|再见|拜拜|"
        r"早上好|晚上好|下午好|好的|嗯)[!！。?？~～\s]*$",
        text,
        re.I,
    ):
        return True
    if re.match(r"^(你是谁|你叫什么|你能做什么|你有什么功能|介绍一下你自己)", text):
        return True
    return False


def _profile_snapshot_md(profile: dict | None) -> str:
    p = profile or {}
    level = str(p.get("knowledge_level") or "待评估").strip()
    goal = str(p.get("learning_goal") or "待设定").strip()
    weak = p.get("error_prone_topics") or []
    modality = str(p.get("preferred_modality") or "未设定").strip()
    weak_s = "、".join(str(x) for x in weak[:3]) if weak else "暂无记录"
    if len(goal) > 40:
        goal = goal[:39] + "…"
    return (
        "\n\n---\n\n"
        "#### 📊 你的学习画像\n\n"
        "| 维度 | 当前状态 |\n|------|----------|\n"
        f"| 知识基础 | {level} |\n"
        f"| 学习目标 | {goal} |\n"
        f"| 薄弱主题 | {weak_s} |\n"
        f"| 偏好模态 | {modality} |\n"
    )


def build_chitchat_reply(question: str, profile: dict | None = None) -> str:
    """寒暄类短回复（不调用 LLM，避免答非所问）。"""
    q = question.strip()
    if re.match(r"^(谢谢|感谢|多谢)", q):
        return "不客气！有学习上的问题，随时在对话里问我。"
    if re.match(r"^(再见|拜拜)", q, re.I):
        return "再见，祝你学习顺利。下次有问题再来找我。"
    if re.search(r"(你是谁|你叫什么|你能做什么|你有什么功能|你能怎么帮|你可以怎么帮|怎么帮我|能帮我.*学习|介绍一下)", q):
        return (
            "我是学径学习助手，可以帮你把学习问题拆清楚、生成配套资源、规划下一步路径。\n\n"
            "你可以直接告诉我：现在想学什么、哪里卡住了，或者让我帮你整理一份练习/讲解/学习计划。"
        )

    return (
        "你好，我是学径学习助手。\n\n"
        "你可以说一个具体学习目标或卡点，我会帮你解释、拆步骤、生成资源，或者规划下一步。"
    )


def classify_question_type(message: str) -> str:
    """根据用户提问判断回答形态（关键词优先，轻量快速）。"""
    text = message.strip()
    if re.search(
        r"(你是谁|你叫什么|你能做什么|你有什么功能|你能怎么帮|你可以怎么帮|怎么帮我|能帮我.*学习|介绍一下你自己|学径是什么|learnpath)",
        text,
        re.I,
    ):
        return "chitchat"
    if is_chitchat_message(text):
        return "chitchat"
    if any(k in text for k in ["代码", "编程", "python", "实现", "报错", "调试", "运行", "程序"]):
        return "code"
    if any(k in text for k in ["视频", "分镜", "动画", "多媒体", "演示", "镜头"]):
        return "media"
    if any(k in text for k in ["练习", "做题", "测验", "题目", "求解", "计算", "证明"]):
        return "practice"
    if any(
        k in text
        for k in ["是什么", "为什么", "解释", "定义", "区别", "原理", "不懂", "怎么理解", "如何理解"]
    ):
        return "concept"
    if any(k in text for k in ["我是", "专业", "基础", "目标", "画像", "风格", "每周", "时间"]):
        return "profile_info"
    return "general"


def _tokenize(text: str) -> set[str]:
    parts = re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z]{2,}|\d+", text.lower())
    return set(parts)


def _keyword_score(query: str, text: str) -> float:
    q = _tokenize(query)
    if not q:
        return 0.0
    t = _tokenize(text)
    if not t:
        return 0.0
    overlap = len(q & t)
    ratio = overlap / max(len(q), 1)
    bonus = 0.5 if any(kw in text for kw in re.findall(r"[\u4e00-\u9fff]{2,}", query)) else 0.0
    return overlap + ratio * 2 + bonus


def _search_user_resources(
    resources: list[dict], query: str, *, k: int = 5
) -> list[dict[str, Any]]:
    scored: list[tuple[float, dict[str, Any]]] = []
    for r in resources:
        body = (r.get("content") or "")[:2500]
        blob = f"{r.get('title', '')} {r.get('topic', '')} {body}"
        score = _keyword_score(query, blob)
        if score <= 0:
            continue
        scored.append(
            (
                score,
                {
                    "id": f"res-{r.get('id', '')}",
                    "text": body or r.get("title", ""),
                    "metadata": {
                        "title": r.get("title", "学习资源"),
                        "source": "resource_library",
                        "resource_id": r.get("id", ""),
                        "type": r.get("type", "doc"),
                        "topic": r.get("topic", ""),
                    },
                    "_score": score,
                },
            )
        )
    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:k]]


async def _search_material_libraries(user_id: str, query: str, *, k: int = 5) -> list[dict[str, Any]]:
    libs = await list_libraries(user_id)
    merged: list[tuple[float, dict[str, Any]]] = []
    for lib in libs:
        if lib.get("status") != "ready" or int(lib.get("chunk_count") or 0) <= 0:
            continue
        lib_id = lib.get("id", "")
        chunks = await retrieve_from_library(
            lib_id,
            query,
            collection_name=lib.get("collection_name", ""),
            k=min(3, k),
            fallback_dir=None,
        )
        for c in chunks:
            meta = dict(c.get("metadata") or {})
            meta.setdefault("title", meta.get("source_file") or lib.get("name", "资料库"))
            meta["source"] = "material_library"
            meta["library_name"] = lib.get("name", "")
            score = _keyword_score(query, c.get("text", ""))
            merged.append(
                (
                    score + 0.5,
                    {
                        "id": c.get("id", ""),
                        "text": c.get("text", ""),
                        "metadata": meta,
                        "_score": score,
                    },
                )
            )
    merged.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in merged[:k]]


def _evaluate_match_score(chunks: list[dict[str, Any]]) -> float:
    if not chunks:
        return 0.0
    scores = [float(c.get("_score") or _keyword_score("", c.get("text", ""))) for c in chunks]
    scores.sort(reverse=True)
    if len(scores) == 1:
        return scores[0]
    return scores[0] * 0.6 + (sum(scores[:3]) / min(3, len(scores))) * 0.4


async def retrieve_resource_library_context(
    user_id: str,
    query: str,
    user_resources: list[dict] | None = None,
    *,
    k: int = 6,
) -> dict[str, Any]:
    """优先检索用户资源库 + 资料库，返回片段与匹配度。"""
    from app.db.repository import list_resources

    resources = user_resources if user_resources is not None else await list_resources(user_id)
    res_chunks = _search_user_resources(resources, query, k=k)
    lib_chunks = await _search_material_libraries(user_id, query, k=k)
    combined = res_chunks + lib_chunks
    # 去重并按分排序
    seen: set[str] = set()
    ranked: list[dict[str, Any]] = []
    for c in sorted(combined, key=lambda x: float(x.get("_score") or 0), reverse=True):
        key = c.get("id") or c.get("text", "")[:80]
        if key in seen:
            continue
        seen.add(key)
        ranked.append(c)
    ranked = ranked[:k]
    score = _evaluate_match_score(ranked)
    return {
        "chunks": ranked,
        "match_score": score,
        "mode": "library_polish" if score >= MATCH_THRESHOLD else "direct",
        "resource_count": len(resources),
    }


def _format_chunks_context(chunks: list[dict[str, Any]]) -> str:
    if not chunks:
        return "（资源库暂无相关片段）"
    parts: list[str] = []
    for i, c in enumerate(chunks, 1):
        meta = c.get("metadata") or {}
        title = meta.get("title", f"片段{i}")
        src = meta.get("source", "")
        parts.append(f"### [{i}] {title} ({src})\n{c.get('text', '')[:1800]}")
    return "\n\n".join(parts)


def build_intelligent_chat_messages(
    *,
    question: str,
    topic: str,
    question_type: str,
    profile: dict | None,
    realtime_state: dict | None,
    retrieval: dict[str, Any],
    deep_thinking: bool = False,
    web_context: str = "",
    attachment_context: str = "",
) -> tuple[list[dict[str, str]], list[dict[str, Any]], str]:
    chunks = retrieval.get("chunks") or []
    mode = retrieval.get("mode", "direct")
    ctx = _format_chunks_context(chunks)

    profile_hint = ""
    if profile:
        profile_hint = (
            f"知识基础：{profile.get('knowledge_level', '')}；"
            f"目标：{profile.get('learning_goal', '')}；"
            f"薄弱点：{', '.join(profile.get('error_prone_topics') or [])}；"
            f"偏好：{profile.get('preferred_modality', '')}"
        )
    state_hint = realtime_state_strategy_hint(realtime_state)
    personalization_strategy = build_personalization_strategy(
        profile=profile,
        realtime_state=realtime_state,
        question_type=question_type,
        question=question,
    )
    strategy_hint = format_personalization_strategy_prompt(personalization_strategy)
    reply_policy_hint = format_realtime_reply_policy_prompt(
        personalization_strategy,
        realtime_state,
    )

    extra_blocks = ""
    if attachment_context.strip():
        extra_blocks += f"\n\n【用户上传附件摘要】\n{attachment_context.strip()[:12000]}"
    if web_context.strip():
        extra_blocks += f"\n\n【联网检索摘要（请标注为外部资料并批判性使用）】\n{web_context.strip()[:12000]}"

    if question_type == "chitchat":
        from app.core.prompts import chat_chitchat_system

        system = chat_chitchat_system(deep_thinking)
        user = (
            f"用户说：{question}\n"
            "请按系统要求简短回复：只介绍你能提供的学习帮助，不要提及学生画像、实时状态或任何具体学科知识。"
        )
        return [{"role": "system", "content": system}, {"role": "user", "content": user}], chunks, mode

    if mode == "library_polish":
        system = chat_library_polish_system(question_type, deep_thinking)
        system = f"{system}\n\n{reply_policy_hint}"
        user = (
            f"学习主题：{topic}\n"
            f"提问类型：{question_type}\n"
            f"学生画像：{profile_hint or '暂无'}\n"
            f"【实时画像】\n{state_hint}\n"
            f"【个性化策略】\n{strategy_hint}\n"
            f"用户问题：{question}\n\n"
            f"【资源库检索片段（请优先依据以下内容润色作答）】\n{ctx}"
            f"{extra_blocks}\n\n"
            "请按系统输出风格回答；不要注明内部检索过程，不要复述学生画像。"
            "务必执行个性化策略，但不要向用户暴露策略字段或画像字段。"
        )
    else:
        system = chat_direct_system(question_type, deep_thinking)
        system = f"{system}\n\n{reply_policy_hint}"
        user = (
            f"学习主题：{topic}\n"
            f"提问类型：{question_type}\n"
            f"学生画像：{profile_hint or '暂无'}\n"
            f"【实时画像】\n{state_hint}\n"
            f"【个性化策略】\n{strategy_hint}\n"
            f"用户问题：{question}\n\n"
            "说明：资源库匹配度较低，请基于你的学科知识直接作答；"
            "勿编造具体教材页码或链接。"
            "务必执行个性化策略，但不要向用户暴露策略字段或画像字段，也不要复述学生长期画像。"
            f"{extra_blocks}"
        )

    return [{"role": "system", "content": system}, {"role": "user", "content": user}], chunks, mode


def _mermaid_label(text: str, limit: int = 16) -> str:
    t = (text or "").strip()
    if len(t) > limit:
        t = t[: limit - 1] + "…"
    return t.replace('"', "'")


def _normalize_mermaid_arrows(code: str) -> str:
    code = code.replace("-->", "\0ARROW\0")
    code = code.replace("->", " --> ")
    code = code.replace("\0ARROW\0", " --> ")
    code = re.sub(r"\s+-->\s+", " --> ", code)
    return code


def _quote_mermaid_node_labels(code: str) -> str:
    code = re.sub(r"(\w+)\['([^']*)'\]", r'\1["\2"]', code)

    def _bracket(m: re.Match) -> str:
        label = m.group(2).strip()
        if re.search(r"[\u4e00-\u9fff]", label) and not label.startswith(('"', "'")):
            return f'{m.group(1)}["{label.replace(chr(34), chr(39))}"]'
        return m.group(0)

    code = re.sub(r"(\w+)\[([^\"'\n]+)\]", _bracket, code)
    return code


def _build_fallback_flowchart(raw: str) -> str:
    skip = {"LR", "RL", "TD", "TB", "BT", "flowchart"}
    edges = re.findall(
        r"([A-Za-z]\w*)\s*(?:\[[^\]]+\]|\([^)]+\)|\{[^}]+\})?\s*-->\s*([A-Za-z]\w*)",
        raw,
    )
    lines = [
        f"  {a} --> {b}"
        for a, b in edges
        if a.upper() not in skip and b.upper() not in skip
    ]
    if lines:
        return "flowchart LR\n" + "\n".join(lines)
    return "flowchart TD\n  start[\"主题\"] --> core[\"核心概念\"]\n  core --> apply[\"应用练习\"]"


def _repair_mermaid_code(raw: str) -> str:
    """修复单行/粘连的 Mermaid，保证边标签可渲染。"""
    code = (raw or "").strip()
    code = re.sub(r"^```mermaid\s*", "", code, flags=re.I)
    code = re.sub(r"```\s*$", "", code).strip()
    if not code:
        return "flowchart TD\n  A[主题] --> B[说明]"

    if re.match(r"^(mindmap|sequenceDiagram|classDiagram|stateDiagram)", code, re.I):
        return code

    code = _normalize_mermaid_arrows(code)
    code = re.sub(
        r"^(flowchart\s+)(LR|RL|TD|TB|BT)([A-Za-z])",
        r"\1\2\n  \3",
        code,
        flags=re.I | re.M,
    )
    code = _quote_mermaid_node_labels(code)
    code = re.sub(
        r"^graph\s+(TD|TB|LR|RL|BT)",
        lambda m: f"flowchart {m.group(1)}",
        code,
        flags=re.I,
    )
    code = re.sub(
        r"^flowchart\s+(td|tb|lr|rl|bt)\b",
        lambda m: f"flowchart {m.group(1).upper()}",
        code,
        flags=re.I,
    )

    if ";" in code:
        head = re.match(r"^(flowchart\s+(?:TD|TB|LR|RL|BT))", code, re.I)
        header = head.group(1) if head else "flowchart TD"
        body = re.sub(r"^flowchart\s+(?:TD|TB|LR|RL|BT)\s*;?\s*", "", code, flags=re.I)
        lines = [ln.strip() for ln in body.split(";") if ln.strip()]
        code = header + "\n" + "\n".join(f"  {ln}" if "-->" in ln else ln for ln in lines)

    code = re.sub(
        r"^(flowchart\s+(?:TD|TB|LR|RL|BT))\s+(.+)$",
        r"\1\n\2",
        code,
        flags=re.I | re.M,
    )
    code = re.sub(r"([\]\)])\s+([A-Za-z][\w]*\s*-->)", r"\1\n  \2", code)
    code = re.sub(r"\]([A-Z])(?=\s*--)", r"]\n  \1 ", code)
    code = re.sub(r"\]([A-Z])(?=\[)", r"]\n  \1", code)
    code = re.sub(r"\bBB\b", "B", code)

    out: list[str] = []
    for line in code.split("\n"):
        t = line.strip()
        if not t:
            continue
        if re.match(r"^flowchart", t, re.I):
            glued = re.match(r"^(flowchart\s+(?:TD|TB|LR|RL|BT))\s+(.+)$", t, re.I)
            if glued:
                out.append(glued.group(1))
                t = glued.group(2)
            else:
                out.append(t)
                continue
        parts = re.split(r"\s+(?=[A-Za-z][\w]*\s*-->)", t)
        for part in parts:
            p = part.strip()
            if not p:
                continue
            if "-->" in p or re.match(r"^[A-Za-z]", p):
                out.append(f"  {p}")
            else:
                out.append(p)
    code = "\n".join(out) if out else "flowchart TD\n  A[内容] --> B[说明]"
    code = _quote_mermaid_node_labels(code)

    def _quote_label(m: re.Match) -> str:
        label = m.group(1).strip()
        if re.search(r"[\u4e00-\u9fff]", label) and not label.startswith(('"', "'")):
            return f'-->|"{label.replace(chr(34), chr(39))}"|'
        return m.group(0)

    code = re.sub(r"-->\|([^|\n]+)\|", _quote_label, code)
    return code


def _fix_markdown_headings(text: str) -> str:
    """修复 ##标题 粘连、缺空格、标题与正文同行等 LLM 常见格式问题。"""
    out = text.replace("\r\n", "\n")
    out = re.sub(r"(?<=\S)(#{2,6})([^\s#\n])", r"\n\n\1 \2", out)
    out = re.sub(r"(^|\n)(#{1,6})([^\s#\n])", r"\1\2 \3", out, flags=re.M)
    out = re.sub(r"^(#{1,6}\s+[^\n\d]+?)(\d+\.\s)", r"\1\n\n\2", out, flags=re.M)

    section_suffixes = (
        "定义", "概念", "类型", "应用", "目标", "简介", "概述", "总结", "图解", "要点", "示例", "方向",
    )

    def _split_heading_line(line: str) -> str:
        hm = re.match(r"^(#{1,6}\s+)(.+)$", line)
        if not hm:
            return line
        marks, content = hm.group(1), hm.group(2)
        for suffix in section_suffixes:
            idx = content.find(suffix)
            if 0 <= idx <= 18 and len(content) > idx + len(suffix):
                return f"{marks}{content[: idx + len(suffix)]}\n\n{content[idx + len(suffix) :].lstrip()}"
        lst = re.match(r"^(.{2,28}?)(\d+\.\s[\s\S]+)$", content)
        if lst:
            return f"{marks}{lst.group(1).strip()}\n\n{lst.group(2).lstrip()}"
        return line

    out = "\n".join(_split_heading_line(ln) for ln in out.split("\n"))
    out = re.sub(r"([^\n\d])(\d+\.\s)", r"\1\n\2", out)
    out = re.sub(r"([^\n#])(#{1,6}\s)", r"\1\n\n\2", out)
    return out


def _normalize_markdown_answer(text: str) -> str:
    """修复 LLM 常见 Markdown 格式问题，便于前端渲染。"""
    if not (text or "").strip():
        return text or ""
    answer = text.replace("\r\n", "\n")
    answer = re.sub(r"([^\n])\s*```\s*mermaid", r"\1\n\n```mermaid", answer, flags=re.I)
    answer = re.sub(r"```\s*mermaid\s*([^\n`])", r"```mermaid\n\1", answer, flags=re.I)

    def _fix_fence(m: re.Match) -> str:
        return f"\n\n```mermaid\n{_repair_mermaid_code(m.group(1))}\n```\n\n"

    answer = re.sub(r"```mermaid\n([\s\S]*?)```", _fix_fence, answer, flags=re.I)
    answer = _fix_markdown_headings(answer)
    answer = re.sub(r"```\s*([\u4e00-\u9fff])", r"```\n\n\1", answer)
    answer = re.sub(r"([。！？；])(?=[^\n#`\d\s-])", r"\1\n", answer)
    return answer


def postprocess_multimodal_answer(
    answer: str,
    question_type: str,
    chunks: list[dict[str, Any]],
    topic: str,
    *,
    mode: str = "direct",
) -> str:
    answer = filter_sensitive(answer)
    answer = _normalize_markdown_answer(answer)

    if question_type == "chitchat":
        return answer

    if question_type == "code" and "```" not in answer:
        answer += (
            "\n\n### 代码示例\n\n```python\n"
            f"# {topic} 相关示例\n"
            "import numpy as np\n"
            "# 请根据讲解替换为完整可运行代码\n"
            "print('示例占位 — 请结合上文理解后运行')\n```\n"
        )
    if question_type == "media" and "分镜" not in answer and "镜头" not in answer:
        answer += (
            "\n\n### 短视频分镜脚本\n"
            "| 镜头 | 画面 | 旁白 | 时长 |\n|------|------|------|------|\n"
            f"| 1 | {topic} 概念引入 · 渐变标题卡 | 本讲学习目标与直觉建立… | 15s |\n"
            "| 2 | 公式/图示动画 · 概念关系网 | 关键推导与图示演示… | 25s |\n"
            "| 3 | 例题 walkthrough · 对比演示 | 一步骤一结论，标注易错点… | 20s |\n"
            "| 4 | 小结卡片 · 练习入口 | 复习要点与自测引导… | 10s |\n"
        )
    if question_type == "concept" and "```mermaid" not in answer:
        safe_topic = _mermaid_label(topic or "学习主题", 16)
        answer += (
            "\n\n### 知识关系图解\n\n```mermaid\nflowchart LR\n"
            f'  n1["{safe_topic}"] --> n2["核心概念"]\n'
            '  n2 --> n3["应用练习"]\n```\n'
        )
    if question_type == "practice" and "步骤" not in answer and "解题" not in answer:
        answer += "\n\n### 解题思路\n1. 明确已知与求解目标\n2. 选择公式或方法\n3. 分步推导并检验\n"

    if mode == "library_polish" and chunks:
        answer = attach_sources(answer, chunks)

    return answer


async def finalize_multimodal_answer(
    answer: str,
    question_type: str,
    chunks: list[dict[str, Any]],
    topic: str,
    *,
    mode: str = "direct",
) -> str:
    """同步后处理 + 异步多模态配图（media 类）。"""
    answer = postprocess_multimodal_answer(answer, question_type, chunks, topic, mode=mode)
    if question_type == "media":
        try:
            answer = await enrich_chat_media_answer_async(answer, topic)
        except Exception:
            pass
    return answer


async def patch_profile_from_chat(
    user_id: str,
    question: str,
    question_type: str,
    topic: str,
    existing: dict | None,
) -> dict | None:
    """依据提问类型增量完善学生画像。"""
    ex = dict(existing or {})
    fallbacks = profile_fallback_fields(user_id, ex)
    llm = get_primary_llm()

    prompt = [
        {"role": "system", "content": chat_profile_patch_system()},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "question": question[:500],
                    "question_type": question_type,
                    "topic": topic,
                    "current_profile": {
                        k: ex.get(k, fallbacks.get(k))
                        for k in (
                            "knowledge_level",
                            "learning_goal",
                            "cognitive_style",
                            "error_prone_topics",
                            "preferred_modality",
                            "pace_and_time",
                            "recent_progress",
                        )
                    },
                },
                ensure_ascii=False,
            ),
        },
    ]
    try:
        raw = await llm.chat(prompt, temperature=0.35)
        raw = filter_sensitive(raw)
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            return None
        patch = json.loads(match.group())
        if not isinstance(patch, dict):
            return None
    except Exception:
        patch = _rule_profile_patch(question, question_type, topic, ex)

    if not patch:
        return None

    merged = {**ex}
    for key in (
        "knowledge_level",
        "learning_goal",
        "cognitive_style",
        "preferred_modality",
        "pace_and_time",
        "recent_progress",
    ):
        val = patch.get(key)
        if val and str(val).strip() and str(val) not in ("待补充", "未评估", "未设定"):
            merged[key] = str(val)[:200]

    weak = list(merged.get("error_prone_topics") or [])
    for w in patch.get("error_prone_topics") or []:
        w = str(w).strip()[:80]
        if w and w not in weak:
            weak.append(w)
    if topic and topic not in weak and question_type == "practice":
        weak.append(topic)
    merged["error_prone_topics"] = weak[:8]
    merged["user_id"] = user_id
    merged["updated_at"] = datetime.utcnow().isoformat()
    await save_profile(merged)
    return merged


def _rule_profile_patch(
    question: str, question_type: str, topic: str, existing: dict
) -> dict:
    modality = str(existing.get("preferred_modality") or "")
    tags: list[str] = []
    if question_type == "code" and "代码" not in modality:
        tags.append("代码")
    if question_type == "media" and "视频" not in modality:
        tags.append("视频")
    if question_type == "practice" and "练习" not in modality:
        tags.append("练习")
    if question_type == "concept" and "文档" not in modality:
        tags.append("文档")
    new_mod = modality
    if tags:
        new_mod = (modality + "+" + "+".join(tags)) if modality and modality != "未设定" else "+".join(tags)

    return {
        "preferred_modality": new_mod[:120],
        "recent_progress": f"近期在对话中咨询：{topic or question[:40]}（{question_type}）",
        "error_prone_topics": [topic] if question_type == "practice" and topic else [],
    }


async def run_intelligent_chat(
    user_id: str,
    question: str,
    topic: str,
    *,
    profile: dict | None = None,
    resources: list[dict] | None = None,
    deep_thinking: bool = False,
    update_profile: bool = True,
) -> dict[str, Any]:
    """执行完整智能对话管线。"""
    question_type = classify_question_type(question)
    realtime_state = await analyze_realtime_state(
        user_id,
        question,
        profile=profile,
        question_type=question_type,
        deep_thinking=deep_thinking,
    )

    retrieval = await retrieve_resource_library_context(
        user_id, question, resources
    )

    messages, chunks, mode = build_intelligent_chat_messages(
        question=question,
        topic=topic,
        question_type=question_type,
        profile=profile,
        realtime_state=realtime_state,
        retrieval=retrieval,
        deep_thinking=deep_thinking,
    )

    from app.core.llm import get_chat_llm_fallback_chain
    from app.core.llm.resilience import chat_with_retry

    raw = ""
    last_err: Exception | None = None
    for client in get_chat_llm_fallback_chain():
        try:
            chat_once = getattr(client, "_chat_once", None)
            if chat_once:
                raw = await chat_with_retry(
                    chat_once,
                    messages,
                    temperature=chat_temperature(deep_thinking),
                    deep_thinking=deep_thinking,
                    task="chat",
                )
            else:
                raw = await client.chat(
                    messages,
                    temperature=chat_temperature(deep_thinking),
                    deep_thinking=deep_thinking,
                )
            if raw.strip():
                break
        except Exception as exc:
            last_err = exc
            continue
    if not raw.strip():
        raise last_err or RuntimeError("LLM 未返回内容")
    answer = await finalize_multimodal_answer(
        raw, question_type, chunks, topic, mode=mode
    )

    updated_profile = None
    if update_profile and question_type != "chitchat":
        updated_profile = await patch_profile_from_chat(
            user_id, question, question_type, topic, profile
        )

    return {
        "reply": filter_sensitive(answer),
        "profile": updated_profile,
        "realtime_state": realtime_state,
        "question_type": question_type,
        "retrieval_mode": mode,
        "match_score": retrieval.get("match_score", 0),
        "chunks": chunks,
    }


async def prepare_intelligent_chat(
    user_id: str,
    question: str,
    topic: str,
    *,
    profile: dict | None = None,
    realtime_state: dict | None = None,
    resources: list[dict] | None = None,
    deep_thinking: bool = False,
    web_search: bool = False,
    attachment_context: str = "",
) -> dict[str, Any]:
    """检索 + 构建 LLM 消息（供流式与非流式共用）。"""
    import asyncio

    question_type = classify_question_type(question)

    retrieval_timeout = 30.0 if deep_thinking else 10.0
    web_timeout = 45.0 if deep_thinking else 16.0

    if question_type == "chitchat":
        retrieval = {"chunks": [], "match_score": 0.0, "mode": "direct", "resource_count": 0}
        web_context = ""
    else:
        try:
            retrieval = await asyncio.wait_for(
                retrieve_resource_library_context(user_id, question, resources),
                timeout=retrieval_timeout,
            )
        except Exception:
            retrieval = {"chunks": [], "match_score": 0.0, "mode": "direct", "resource_count": 0}
        web_context = ""
        if web_search:
            from app.services.web_research_service import full_web_research

            try:
                summary, _queries = await asyncio.wait_for(
                    full_web_research(question),
                    timeout=web_timeout,
                )
                web_context = summary
            except Exception:
                web_context = ""
    messages, chunks, mode = build_intelligent_chat_messages(
        question=question,
        topic=topic,
        question_type=question_type,
        profile=profile,
        realtime_state=realtime_state,
        retrieval=retrieval,
        deep_thinking=deep_thinking,
        web_context=web_context,
        attachment_context=attachment_context,
    )
    return {
        "question_type": question_type,
        "realtime_state": realtime_state,
        "retrieval": retrieval,
        "messages": messages,
        "chunks": chunks,
        "mode": mode,
    }


def _pace_from_chunk_size(chunk_size: int) -> float:
    """本地伪流式每行间隔（秒），与前端流速档位对应。"""
    if chunk_size <= 2:
        return 0.04
    if chunk_size >= 16:
        return 0.004
    if chunk_size >= 8:
        return 0.01
    return 0.018


async def _stream_local_text(
    text: str,
    chunk_size: int = 2,
) -> AsyncIterator[dict[str, Any]]:
    """本地模板文本的伪流式输出（按行 + 短间隔，便于寒暄等场景可见流式）。"""
    from app.core.llm.resilience import yield_text_stream

    delay = _pace_from_chunk_size(chunk_size)
    async for piece in yield_text_stream(text, line_delay=delay, atomic_lines=True):
        yield {"type": "token", "data": piece}


async def stream_intelligent_chat(
    user_id: str,
    question: str,
    topic: str,
    *,
    profile: dict | None = None,
    realtime_state: dict | None = None,
    resources: list[dict] | None = None,
    deep_thinking: bool = False,
    web_search: bool = False,
    attachment_context: str = "",
    update_profile: bool = True,
    chunk_size: int = 8,
) -> AsyncIterator[dict[str, Any]]:
    """
    真流式智能对话：逐 token 推送 LLM 输出，结束后补全后处理与画像。
    产出: {"type": "token", "data": str} | {"type": "done", "data": str, "profile": ...}
    """
    import asyncio

    from app.core.llm import get_chat_llm_fallback_chain
    from app.core.llm.resilience import stream_with_client_fallback

    question_type = classify_question_type(question)
    if realtime_state is None:
        realtime_state = await analyze_realtime_state(
            user_id,
            question,
            profile=profile,
            question_type=question_type,
            deep_thinking=deep_thinking,
        )
        yield {"type": "realtime_state", "data": realtime_state}

    if question_type == "chitchat" and not attachment_context.strip():
        reply = build_chitchat_reply(question)
        async for item in _stream_local_text(reply, chunk_size=chunk_size):
            yield item
        yield {"type": "done", "data": reply, "profile": None}
        return

    try:
        prepare_timeout = 60.0 if deep_thinking else 24.0
        ctx = await asyncio.wait_for(
            prepare_intelligent_chat(
                user_id,
                question,
                topic,
                profile=profile,
                realtime_state=realtime_state,
                resources=resources,
                deep_thinking=deep_thinking,
                web_search=web_search,
                attachment_context=attachment_context,
            ),
            timeout=prepare_timeout,
        )
    except Exception as exc:
        yield {"type": "error", "data": f"准备对话上下文失败：{exc}"}
        return

    question_type = ctx["question_type"]
    chunks = ctx["chunks"]
    mode = ctx["mode"]

    acc = ""
    try:
        async for token in stream_with_client_fallback(
            get_chat_llm_fallback_chain(),
            ctx["messages"],
            temperature=chat_temperature(deep_thinking),
            deep_thinking=deep_thinking,
            task="chat",
        ):
            acc += token
            yield {"type": "token", "data": token}
    except Exception as exc:
        hint = str(exc).strip() or "LLM 调用失败"
        yield {
            "type": "error",
            "data": f"{hint}。可稍后重试，或在 .env 设置 LLM_MOCK=true 后重启后端。",
        }
        return

    if not acc.strip():
        yield {
            "type": "error",
            "data": "LLM 未返回内容。请检查 Kimi/星火 Key，或设置 LLM_MOCK=true 后重启后端。",
        }
        return

    final = postprocess_multimodal_answer(
        acc, question_type, chunks, topic, mode=mode
    )
    if len(final) > len(acc):
        from app.core.llm.resilience import yield_text_stream

        delta = final[len(acc) :]
        async for piece in yield_text_stream(delta):
            yield {"type": "token", "data": piece}

    final = filter_sensitive(final)
    yield {"type": "done", "data": final, "profile": None}

    updated_profile = None
    if update_profile and question_type != "chitchat":
        try:
            updated_profile = await asyncio.wait_for(
                patch_profile_from_chat(
                    user_id, question, question_type, topic, profile
                ),
                timeout=25.0,
            )
        except Exception:
            updated_profile = None
        if updated_profile:
            yield {"type": "profile", "data": updated_profile}
