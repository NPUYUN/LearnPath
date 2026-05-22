from fastapi import APIRouter

from app.agents.graph import build_graph
from app.models.schemas import TutorRequest

router = APIRouter(prefix="/tutor", tags=["tutor"])


@router.post("/ask")
async def ask(req: TutorRequest):
    graph = build_graph()
    result = await graph.ainvoke(
        {
            "user_id": req.user_id,
            "intent": "tutor",
            "topic": req.topic,
            "messages": [{"role": "user", "content": req.question}],
        }
    )
    return {"reply": result.get("reply", "")}
