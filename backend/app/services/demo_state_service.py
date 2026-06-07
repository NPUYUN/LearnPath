"""演示账号数据状态：区分「已清空」与「示例数据」，避免清空后自动回填。"""

from __future__ import annotations

import json
from pathlib import Path

from app.core.config import ROOT_DIR

_STATE_PATH = ROOT_DIR / "storage" / "demo_state.json"


def get_demo_state() -> str:
    """返回 sample（示例数据）或 cleared（用户已清空）。"""
    if not _STATE_PATH.is_file():
        return "sample"
    try:
        data = json.loads(_STATE_PATH.read_text(encoding="utf-8"))
        state = str(data.get("state", "sample")).lower()
        return state if state in {"sample", "cleared"} else "sample"
    except Exception:
        return "sample"


def set_demo_state(state: str) -> None:
    _STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    _STATE_PATH.write_text(
        json.dumps({"state": state}, ensure_ascii=False),
        encoding="utf-8",
    )
