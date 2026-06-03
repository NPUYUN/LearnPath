"""多模态能力自检脚本。"""
import asyncio
import json
import sys

import httpx
from fastapi.testclient import TestClient


async def main() -> int:
    from app.core.config import get_settings
    from app.main import app
    from app.services.media_storage import save_generated_image, save_generated_video
    from app.services.multimodal_enrich_service import enrich_media_content_async
    from app.services.qwen_image_service import generate_qwen_image
    from app.services.qwen_video_service import generate_qwen_i2v

    s = get_settings()
    report: dict = {
        "config": {
            "qwen_api_key": s.has_qwen,
            "qwen_video": s.has_qwen_video,
            "qwen_vision": s.has_qwen_vision,
            "spark_tti": s.has_spark_tti,
            "kimi_prompt": s.has_kimi and not s.llm_mock,
        },
        "capabilities": [],
        "issues": [],
        "not_implemented": [],
    }

    def cap(name: str, ok: bool, detail: str = ""):
        report["capabilities"].append({"name": name, "ok": ok, "detail": detail})
        if not ok:
            report["issues"].append(f"{name}: {detail or '失败'}")

    # 1 文生图
    img = await generate_qwen_image("测试配图，蓝紫渐变，无文字", width=512, height=512)
    cap("千问文生图", bool(img), f"{len(img or b'')} bytes" if img else "API 失败")
    img_url = save_generated_image(img) if img else None

    # 2 图生视频
    vid = None
    if img:
        vid = await generate_qwen_i2v("缓慢推镜，教育讲解风格", image_bytes=img)
    cap("千问图生视频", bool(vid), f"{len(vid or b'')} bytes" if vid else "API 失败/超时")
    vid_url = save_generated_video(vid) if vid else None

    # 3 资源增强流水线
    enriched = await enrich_media_content_async(
        "## 分镜\n| 镜号 | 画面 |\n| 1 | 引入 |\n| 2 | 演示 |",
        "自检主题",
        max_images=1,
    )
    cap("资源增强·配图", "/api/media/images/" in enriched or "```svg" in enriched)
    cap("资源增强·视频", "/api/media/videos/" in enriched, "流水线未写入视频")

    # 4 HTTP 路由（当前代码）
    client = TestClient(app)
    status = client.get("/api/media/status").json()
    cap("状态接口·配图", status.get("available") is True)
    cap(
        "状态接口·视频",
        status.get("video_generation", {}).get("available") is True,
        status.get("video_generation", {}).get("note", ""),
    )
    cap(
        "状态接口·视觉",
        status.get("vision", {}).get("available") is True,
        status.get("vision", {}).get("note", ""),
    )
    if img_url:
        ir = client.get(img_url)
        cap("HTTP 配图访问", ir.status_code == 200, f"HTTP {ir.status_code}")
    if vid_url:
        vr = client.get(vid_url)
        cap("HTTP 视频访问", vr.status_code == 200, f"HTTP {vr.status_code}")

    # 5 运行中服务是否过期
    try:
        async with httpx.AsyncClient(timeout=5) as hc:
            live = (await hc.get("http://127.0.0.1:8000/api/media/status")).json()
            live_vid = live.get("video_generation", {}).get("available")
            if live_vid is False and status.get("video_generation", {}).get("available"):
                report["issues"].append("运行中后端未重启：/api/media/status 仍显示 video 不可用")
    except Exception as exc:
        report["live_server"] = str(exc)

    # 6 千问-VL（有配图时试跑）
    if img:
        from app.services.qwen_vision_service import describe_image
        from app.services.media_storage import media_image_path

        path = media_image_path(img_url.rsplit("/", 1)[-1]) if img_url else None
        vl_text = ""
        if path and path.is_file():
            vl_text = await describe_image(image_path=path, image_ext=path.suffix)
        cap("千问-VL 图片理解", bool((vl_text or "").strip()), (vl_text or "")[:80])

    # 未实现项（预期）
    report["not_implemented"] = [
        {"name": "讯飞星火 TTI", "reason": "未配置 SPARK_APP_ID / TTI_KEY / SECRET（千问可替代）"},
        {"name": "聊天内生成视频", "reason": "故意关闭，避免单次对话等待数分钟"},
        {"name": "文生视频独立入口", "reason": "仅作为图生视频失败时的回退"},
    ]

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not report["issues"] else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
