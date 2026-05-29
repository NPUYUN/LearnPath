"""Quick smoke test: health + demo chat stream."""
import json
import urllib.request

BASE = "http://127.0.0.1:8000"


def post(path: str, body: dict, token: str | None = None) -> bytes:
    data = json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def main() -> None:
    health = json.loads(urllib.request.urlopen(f"{BASE}/api/health", timeout=10).read())
    print("health:", json.dumps(health, ensure_ascii=False))

    user = json.loads(post("/api/auth/demo-token", {"display_name": "test"}))
    token = user["access_token"]
    print("token ok, user_id:", user["user_id"])

    raw = post(
        "/api/chat",
        {"user_id": "demo", "message": "我想开始学习一门课程", "stream": False},
        token=token,
    )
    data = json.loads(raw)
    reply = (data.get("reply") or "").strip()
    print("reply length:", len(reply))
    print("reply preview:", reply[:200] if reply else "(empty)")
    if not reply:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
