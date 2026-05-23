import json
import re

from app.agents.graph import build_graph
from app.db.repository import get_profile, get_resource, record_event, save_path, save_profile, save_quiz_attempt
from app.models.schemas import EvalSubmitResponse
from app.services.graph_state import build_graph_state


def _parse_quiz_content(content: str) -> dict:
    match = re.search(r"\{[\s\S]*\"questions\"[\s\S]*\}", content)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return {"questions": []}


async def submit_quiz(user_id: str, quiz_id: str, answers: list[int]) -> EvalSubmitResponse:
    resource = await get_resource(user_id, quiz_id)
    if not resource or resource.get("type") != "quiz":
        raise ValueError("题库资源不存在")

    quiz = _parse_quiz_content(resource.get("content", ""))
    questions = quiz.get("questions") or []
    total = len(questions)
    if total == 0:
        raise ValueError("题库格式无效")

    score = 0
    weak_topics: list[str] = []
    for i, q in enumerate(questions):
        correct = int(q.get("answer", 0))
        given = answers[i] if i < len(answers) else -1
        if given == correct:
            score += 1
        else:
            stem = str(q.get("stem", ""))
            if "回归" in stem:
                weak_topics.append("线性回归")
            elif "梯度" in stem:
                weak_topics.append("梯度下降")
            elif "过拟合" in stem:
                weak_topics.append("过拟合")
            else:
                weak_topics.append(resource.get("topic") or "综合练习")

    await save_quiz_attempt(user_id, quiz_id, answers, score, total)
    await record_event(
        user_id,
        "quiz_submit",
        resource_id=quiz_id,
        meta={"score": score, "total": total, "title": resource.get("title", "")},
    )

    profile = await get_profile(user_id) or {"user_id": user_id}
    merged_topics = list(dict.fromkeys(list(profile.get("error_prone_topics") or []) + weak_topics))[:8]
    profile.update(
        {
            "user_id": user_id,
            "error_prone_topics": merged_topics,
            "recent_progress": f"最近测验 {score}/{total} 分，{'需加强 ' + '、'.join(weak_topics[:3]) if weak_topics else '表现良好'}",
        }
    )
    await save_profile(profile)

    graph = build_graph()
    state = await build_graph_state(
        user_id,
        {
            "intent": "path",
            "messages": [{"role": "user", "content": f"根据测验结果 {score}/{total} 调整学习路径"}],
            "profile": profile,
        },
    )
    result = await graph.ainvoke(state)
    if result.get("path"):
        await save_path(result["path"])

    pct = int(score / total * 100) if total else 0
    feedback = (
        f"测验完成：{score}/{total}（{pct}%）。"
        + (f"建议重点巩固：{'、'.join(weak_topics)}。" if weak_topics else "掌握情况良好，可进入下一阶段。")
    )
    return EvalSubmitResponse(score=score, total=total, feedback=feedback, weak_topics=weak_topics)
