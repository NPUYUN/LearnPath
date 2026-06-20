"""Deterministic quiz answer/explanation consistency checks."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(slots=True)
class QuizQuestionBlock:
    number: int
    level: str
    raw: str
    start: int
    end: int


def parse_quiz_blocks(content: str) -> list[QuizQuestionBlock]:
    matches = list(re.finditer(r"^#{2,4}\s*第\s*(\d+)\s*题(?:[（(]([^）)]+)[）)])?[^\n]*", content, re.M))
    blocks: list[QuizQuestionBlock] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        blocks.append(
            QuizQuestionBlock(
                number=int(match.group(1)),
                level=str(match.group(2) or "基础").strip(),
                raw=content[match.start() : end].strip(),
                start=match.start(),
                end=end,
            )
        )
    return blocks


def _options(raw: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for match in re.finditer(
        r"^\s*(?:[-*]\s*)?(?:\*\*)?([A-D])\s*[.．、:：)](?:\*\*)?\s*(.+)$",
        raw,
        re.M | re.I,
    ):
        key = match.group(1).upper()
        # The first A-D set is the option list; later diagnosis rows must not replace it.
        out.setdefault(key, re.sub(r"\*\*", "", match.group(2)).strip())
    return out


def _answer(raw: str) -> str:
    match = re.search(r"(?:\*\*)?答案(?:\*\*)?\s*[：:]\s*(?:\*\*)?([A-DTF]|正确|错误)", raw, re.I)
    if not match:
        return ""
    value = match.group(1).upper()
    return {"正确": "T", "错误": "F"}.get(value, value)


def _explanation(raw: str) -> str:
    match = re.search(
        r"(?:\*\*)?(?:详细解析|详解|解析)(?:\*\*)?\s*[：:]?\s*([\s\S]*?)(?=\n\s*(?:\*\*)?(?:选项诊断|误区诊断|目标知识点|下一步)|$)",
        raw,
        re.I,
    )
    return match.group(1).strip() if match else ""


def _explicit_explanation_answer(explanation: str) -> str:
    match = re.search(r"(?:正确答案|答案|应选|故选|所以选)\s*(?:是|为|：|:)?\s*([A-DTF])\b", explanation, re.I)
    return match.group(1).upper() if match else ""


def _final_numeric_result(explanation: str) -> str:
    matches = re.findall(
        r"(?:最终|结果|答案|因此|所以)[^\n。；]{0,60}?(?:=|为|是)\s*(-?\d+(?:\.\d+)?)",
        explanation,
    )
    return matches[-1] if matches else ""


def validate_question(block: QuizQuestionBlock) -> list[str]:
    raw = block.raw
    options = _options(raw)
    answer = _answer(raw)
    explanation = _explanation(raw)
    judgment = bool(re.search(r"题型\s*[：:]\s*判断", raw))
    issues: list[str] = []

    if judgment:
        if answer not in {"T", "F"}:
            issues.append("判断题答案只能是 T 或 F")
    else:
        if answer not in options:
            issues.append("答案不在 A-D 选项中")
        if len(options) != 4:
            issues.append("单选题必须有完整 A-D 四个选项")

    if not explanation:
        issues.append("缺少详细解析")
    explicit = _explicit_explanation_answer(explanation)
    if explicit and answer and explicit != answer:
        issues.append(f"答案为 {answer}，但解析明确支持 {explicit}")

    numeric = _final_numeric_result(explanation)
    if numeric and answer in options:
        answer_numbers = re.findall(r"-?\d+(?:\.\d+)?", options[answer])
        if answer_numbers and numeric not in answer_numbers:
            issues.append(f"计算解析结果为 {numeric}，与答案选项 {answer} 不一致")
    return list(dict.fromkeys(issues))


def validate_quiz_content(content: str) -> dict:
    blocks = parse_quiz_blocks(content)
    invalid: list[dict] = []
    for block in blocks:
        issues = validate_question(block)
        if issues:
            invalid.append(
                {
                    "number": block.number,
                    "level": block.level,
                    "issues": issues,
                    "raw": block.raw,
                }
            )
    return {
        "question_count": len(blocks),
        "invalid_questions": invalid,
        "invalid_numbers": [row["number"] for row in invalid],
        "passed": bool(blocks) and not invalid,
    }


def replace_question_blocks(content: str, replacements: dict[int, str]) -> str:
    blocks = parse_quiz_blocks(content)
    if not blocks or not replacements:
        return content
    out: list[str] = []
    cursor = 0
    for block in blocks:
        out.append(content[cursor : block.start])
        out.append(replacements.get(block.number, block.raw).strip())
        cursor = block.end
    out.append(content[cursor:])
    return "\n\n".join(part.strip("\n") for part in out if part).strip()


def remove_question_blocks(content: str, numbers: list[int]) -> str:
    return replace_question_blocks(content, {number: "" for number in numbers})
