"""LLM-backed semantic verification for quiz correctness.

Structural validation can only prove that an answer letter exists. This module asks
the model to solve every question independently so self-consistent but factually
wrong questions cannot be published.
"""

from __future__ import annotations

import json
import re
import ast
from typing import Any

from app.core.llm import get_primary_llm
from app.services.quiz_validation_service import parse_quiz_blocks


PASS_VERDICT = "pass"
VALID_VERDICTS = {
    PASS_VERDICT,
    "wrong_answer",
    "no_unique_answer",
    "bad_explanation",
    "invalid_question",
}


def _extract_json_object(raw: str) -> dict[str, Any] | None:
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, list):
            return {"questions": parsed}
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", cleaned)
    candidates = [match.group(0)] if match else []
    array_match = re.search(r"\[[\s\S]*\]", cleaned)
    if array_match:
        candidates.append(array_match.group(0))
    for candidate in candidates:
        for parser in (json.loads, ast.literal_eval):
            try:
                parsed = parser(candidate)
                if isinstance(parsed, dict):
                    return parsed
                if isinstance(parsed, list):
                    return {"questions": parsed}
            except (json.JSONDecodeError, SyntaxError, ValueError):
                continue
    return None


def parse_semantic_review(raw: str, content: str) -> dict[str, Any]:
    blocks = parse_quiz_blocks(content)
    block_map = {block.number: block for block in blocks}
    payload = _extract_json_object(raw) or {}
    rows = payload.get("questions") if isinstance(payload.get("questions"), list) else []
    reviewed: dict[int, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            number = int(row.get("number") or 0)
        except (TypeError, ValueError):
            continue
        if number not in block_map:
            continue
        verdict = str(row.get("verdict") or "").strip().lower()
        if verdict not in VALID_VERDICTS:
            verdict = "invalid_question"
        answer = str(row.get("correct_answer") or "NONE").strip().upper()
        if answer not in {"A", "B", "C", "D", "T", "F", "NONE"}:
            answer = "NONE"
        try:
            confidence = float(row.get("confidence") or 0)
        except (TypeError, ValueError):
            confidence = 0.0
        given_match = re.search(
            r"(?:\*\*)?答案(?:\*\*)?\s*[：:]\s*(?:\*\*)?([A-DTF])",
            block_map[number].raw,
            re.I,
        )
        given_answer = given_match.group(1).upper() if given_match else ""
        reason = str(row.get("reason") or "语义审题未给出理由").strip()[:500]
        raw_truth = row.get("option_truth") if isinstance(row.get("option_truth"), dict) else {}
        option_truth = {
            key: value
            for key in ("A", "B", "C", "D")
            if isinstance((value := raw_truth.get(key)), bool)
        }
        if len(option_truth) == 4:
            stem = re.split(
                r"^\s*(?:[-*]\s*)?(?:\*\*)?[A-D]\s*[.．、:：)]",
                block_map[number].raw,
                maxsplit=1,
                flags=re.M | re.I,
            )[0]
            asks_false = bool(re.search(r"错误|不正确|不是|不属于|不能|不适用", stem))
            candidates = [key for key, truth in option_truth.items() if truth is (not asks_false)]
            if len(candidates) != 1:
                verdict = "no_unique_answer"
                answer = "NONE"
                reason = f"逐项真值表显示满足题干的选项有 {len(candidates)} 个：{candidates or '无'}。{reason}"
            elif answer != candidates[0]:
                verdict = "wrong_answer"
                reason = f"逐项真值表唯一答案为 {candidates[0]}，审题答案为 {answer}。{reason}"
                answer = candidates[0]
        if verdict == PASS_VERDICT and (answer == "NONE" or not given_answer or answer != given_answer):
            verdict = "wrong_answer"
            reason = f"给定答案为 {given_answer or '缺失'}，独立求解答案为 {answer}。{reason}"
        reviewed[number] = {
            "number": number,
            "verdict": verdict,
            "correct_answer": answer,
            "reason": reason,
            "confidence": max(0.0, min(1.0, confidence)),
            "option_truth": option_truth,
        }

    invalid: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []
    for block in blocks:
        row = reviewed.get(block.number)
        if row is None:
            row = {
                "number": block.number,
                "verdict": "invalid_question",
                "correct_answer": "NONE",
                "reason": "语义审题未覆盖该题",
                "confidence": 0.0,
            }
        items.append(row)
        if row["verdict"] != PASS_VERDICT or row["confidence"] < 0.7:
            issue = row["reason"]
            if row["verdict"] == PASS_VERDICT:
                issue = f"语义审题置信度不足：{issue}"
            invalid.append(
                {
                    "number": block.number,
                    "level": block.level,
                    "issues": [f"语义正确性未通过：{issue}"],
                    "raw": block.raw,
                    "semantic_verdict": row["verdict"],
                    "correct_answer": row["correct_answer"],
                }
            )
    return {
        "passed": bool(blocks) and not invalid and len(items) == len(blocks),
        "reviewed_count": len(reviewed),
        "question_count": len(blocks),
        "invalid_questions": invalid,
        "invalid_numbers": [row["number"] for row in invalid],
        "items": items,
        "error": "" if payload else "语义审题返回内容无法解析",
    }


def _consensus_review(first: dict[str, Any], second: dict[str, Any], content: str) -> dict[str, Any]:
    blocks = parse_quiz_blocks(content)
    first_map = {int(row["number"]): row for row in first.get("items", [])}
    second_map = {int(row["number"]): row for row in second.get("items", [])}
    items: list[dict[str, Any]] = []
    invalid: list[dict[str, Any]] = []
    for block in blocks:
        left = first_map.get(block.number)
        right = second_map.get(block.number)
        agreed_pass = bool(
            left
            and right
            and left.get("verdict") == PASS_VERDICT
            and right.get("verdict") == PASS_VERDICT
            and left.get("correct_answer") == right.get("correct_answer")
            and left.get("option_truth") == right.get("option_truth")
            and min(float(left.get("confidence") or 0), float(right.get("confidence") or 0)) >= 0.7
        )
        if agreed_pass:
            row = {
                **left,
                "confidence": min(float(left["confidence"]), float(right["confidence"])),
                "reason": f"双重审题一致：{left.get('reason', '')}",
            }
        else:
            left_summary = (
                f"{left.get('verdict')}/{left.get('correct_answer')}：{left.get('reason')}"
                if left
                else "未返回"
            )
            right_summary = (
                f"{right.get('verdict')}/{right.get('correct_answer')}：{right.get('reason')}"
                if right
                else "未返回"
            )
            same_invalid = bool(
                left
                and right
                and left.get("verdict") != PASS_VERDICT
                and right.get("verdict") != PASS_VERDICT
                and left.get("verdict") == right.get("verdict")
                and left.get("correct_answer") == right.get("correct_answer")
            )
            row = {
                "number": block.number,
                "verdict": left.get("verdict") if same_invalid else "invalid_question",
                "correct_answer": left.get("correct_answer") if same_invalid else "NONE",
                "reason": f"双重审题未达成发布共识；审题A={left_summary}；审题B={right_summary}"[:500],
                "confidence": 0.0,
            }
            invalid.append(
                {
                    "number": block.number,
                    "level": block.level,
                    "issues": [f"语义正确性未通过：{row['reason']}"],
                    "raw": block.raw,
                    "semantic_verdict": row["verdict"],
                    "correct_answer": row["correct_answer"],
                }
            )
        items.append(row)
    errors = [str(value) for value in (first.get("error"), second.get("error")) if value]
    return {
        "passed": bool(blocks) and not invalid and not errors,
        "reviewed_count": min(
            int(first.get("reviewed_count") or 0), int(second.get("reviewed_count") or 0)
        ),
        "question_count": len(blocks),
        "invalid_questions": invalid,
        "invalid_numbers": [row["number"] for row in invalid],
        "items": items,
        "error": "；".join(errors),
    }


async def review_quiz_semantics(title: str, content: str) -> dict[str, Any]:
    blocks = parse_quiz_blocks(content)
    if not blocks:
        return parse_semantic_review("{}", content)
    llm = get_primary_llm()
    if llm.use_mock:
        return {
            **parse_semantic_review("{}", content),
            "error": "当前模型不可用，未完成题目语义正确性审核",
        }
    results: list[dict[str, Any]] = []
    # Small batches avoid long JSON being truncated or decorated by the model.
    for start in range(0, len(blocks), 4):
        batch = blocks[start : start + 4]
        batch_content = "\n\n".join(block.raw for block in batch)
        prompt = (
            "不要相信原答案和解析，逐题独立求解。先逐项判断 A-D 的真假，并特别注意题干问的是正确项还是错误项。\n"
            "然后统计满足题干的选项数量：不是恰好一个就必须判 no_unique_answer。最后检查给定答案和解析。\n"
            "无唯一答案=no_unique_answer；答案错=wrong_answer；解析错=bad_explanation；题目错误=invalid_question；全部正确才是 pass。\n"
            "必须覆盖本批每题。只输出 JSON，reason 限 60 字：\n"
            '{"questions":[{"number":1,"verdict":"pass|wrong_answer|no_unique_answer|bad_explanation|invalid_question",'
            '"correct_answer":"A|B|C|D|T|F|NONE","option_truth":{"A":true,"B":false,"C":false,"D":false},'
            '"reason":"逐项判断及唯一性依据","confidence":0.0}]}\n\n'
            f"题集：{title}\n{batch_content}"
        )
        try:
            raw_first = await llm.chat(
                [
                    {"role": "system", "content": "你是主审题专家，必须逐项验算并检查唯一答案，宁可拒绝也不能放过错误。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.0,
                deep_thinking=True,
                task="resource",
            )
            raw_second = await llm.chat(
                [
                    {
                        "role": "system",
                        "content": "你是独立反方审题专家。主动寻找反例、多解和题干陷阱，逐项求真，不得沿用原答案。",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.0,
                deep_thinking=True,
                task="resource",
            )
            first = parse_semantic_review(raw_first, batch_content)
            second = parse_semantic_review(raw_second, batch_content)
            results.append(_consensus_review(first, second, batch_content))
        except Exception as exc:
            failed = parse_semantic_review("{}", batch_content)
            failed["error"] = f"语义审题调用失败：{exc}"
            results.append(failed)

    items = [item for result in results for item in result.get("items", [])]
    invalid = [row for result in results for row in result.get("invalid_questions", [])]
    errors = [str(result.get("error")) for result in results if result.get("error")]
    return {
        "passed": bool(blocks) and not invalid and not errors and len(items) == len(blocks),
        "reviewed_count": sum(int(result.get("reviewed_count") or 0) for result in results),
        "question_count": len(blocks),
        "invalid_questions": invalid,
        "invalid_numbers": [row["number"] for row in invalid],
        "items": items,
        "error": "；".join(errors),
    }
