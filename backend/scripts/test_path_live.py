"""测试路径规划：本地 graph + 可选 live API。"""
import asyncio
import json
import sys

import httpx


async def test_graph() -> None:
    from app.agents.supervisor import classify_intent
    from app.agents.graph import build_graph
    from app.services.graph_state import build_graph_state

    msg = "我马上要考计算机网络了，请帮我规划复习计划"
    intent = classify_intent(msg)
    print(f"classify_intent: {intent}")
    state = await build_graph_state(
        "demo",
        {
            "intent": intent,
            "messages": [{"role": "user", "content": msg}],
            "topic": msg,
            "deep_thinking": False,
        },
    )
    result = await build_graph().ainvoke(state)
    reply = result.get("reply") or ""
    steps = (result.get("path") or {}).get("steps") or []
    print("steps:", [s.get("title") for s in steps])
    print("reply_has_old_template:", "【学习路径已规划】" in reply)
    print("reply_has_network:", "网络" in reply)
    print("reply_preview:", reply[:400])


async def test_live() -> None:
    from app.core.security import create_access_token

    token = create_access_token("demo")
    msg = "我马上要考计算机网络了，请帮我规划复习计划"
    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post(
            "http://127.0.0.1:8000/api/chat/stream",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "user_id": "demo",
                "message": msg,
                "stream": True,
                "deep_thinking": False,
            },
        )
        print("live_status:", r.status_code)
        body = r.text
        print("live_intent:", "event: intent" in body and "path" in body)
        print("live_old_template:", "【学习路径已规划】" in body)
        print("live_network:", "网络" in body)
        # extract done event
        for block in body.replace("\r\n", "\n").split("\n\n"):
            if "event: done" in block or block.startswith("data:"):
                if "done" in block:
                    print("done_snippet:", block[:500])


async def main() -> None:
    await test_graph()
    print("--- live ---")
    try:
        await test_live()
    except Exception as exc:
        print("live_error:", exc)


if __name__ == "__main__":
    asyncio.run(main())
