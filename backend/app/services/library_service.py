"""资料库 CRUD 与内置库初始化。"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

from app.core.config import ROOT_DIR
from app.db.repository import get_library, list_libraries, save_library
from app.rag.chunking import load_markdown_files
from app.rag.library_retriever import builtin_kb_root, ingest_text_chunks


def _manifest_path() -> Path:
    return ROOT_DIR / "data" / "knowledge_base" / "manifest.json"


async def ensure_builtin_libraries() -> int:
    path = _manifest_path()
    if not path.exists():
        return 0
    data = json.loads(path.read_text(encoding="utf-8"))
    count = 0
    for item in data.get("libraries", []):
        lib_id = item["id"]
        existing = await get_library(lib_id, "")
        kb_path = item.get("path", "")
        kb_dir = builtin_kb_root() / kb_path if kb_path else None
        docs = load_markdown_files(kb_dir) if kb_dir and kb_dir.exists() else []
        chunk_count = len(docs)
        if item.get("collection") and docs:
            ingest_text_chunks(
                lib_id,
                docs,
                collection_name=item["collection"],
                reset=True,
            )
        payload = {
            "id": lib_id,
            "user_id": "",
            "name": item.get("name", lib_id),
            "description": item.get("description", ""),
            "source_type": "builtin",
            "status": "ready" if chunk_count else "empty",
            "collection_name": item.get("collection", f"lib_{lib_id}"),
            "kb_path": kb_path,
            "course": item.get("course", ""),
            "file_count": _count_kb_files(kb_dir),
            "chunk_count": chunk_count,
            "updated_at": datetime.utcnow().isoformat(),
        }
        await save_library(payload)
        count += 1
    return count


async def create_user_library(
    user_id: str,
    name: str,
    description: str = "",
    *,
    requirements: str = "",
    source_mode: str = "upload",
    source_library_id: str | None = None,
) -> dict:
    lib_id = str(uuid.uuid4()).replace("-", "")[:16]
    collection = f"lib_{lib_id}"
    clean_name = name.strip() or "未命名资料库"
    clean_requirements = requirements.strip()
    synthesis = {
        "name": clean_name,
        "description": description.strip() or f"「{clean_name}」学习资料库",
        "build_mode": source_mode,
        "source_library_id": source_library_id or "",
        "requirements": clean_requirements,
        "description_doc": (
            f"# {clean_name} 说明\n\n"
            f"## 复习用途\n{description.strip() or clean_requirements or '用于整理课程复习材料、生成学习资源和规划学习路径。'}\n\n"
            "## 当前状态\n资料库尚未写入文件，后续可上传资料或依据诉求生成资源。"
        ),
        "index_doc": "# 资源索引\n\n当前暂无文件资源。",
        "file_docs": [],
        "relationship_doc": "",
        "resource_index": {},
    }
    payload = {
        "id": lib_id,
        "user_id": user_id,
        "name": clean_name,
        "description": description.strip(),
        "source_type": "upload",
        "status": "ready" if source_mode == "empty" else "empty",
        "collection_name": collection,
        "file_count": 0,
        "chunk_count": 0,
        "synthesis": synthesis,
        "created_at": datetime.utcnow().isoformat(),
    }
    await save_library(payload)
    return payload


async def get_or_create_library(
    user_id: str,
    *,
    library_id: str | None = None,
    new_library_name: str | None = None,
    requirements: str = "",
    source_mode: str = "upload",
    source_library_id: str | None = None,
) -> dict | None:
    if library_id:
        return await get_library(library_id, user_id)
    if new_library_name and new_library_name.strip():
        return await create_user_library(
            user_id,
            new_library_name.strip(),
            requirements=requirements,
            source_mode=source_mode,
            source_library_id=source_library_id,
        )
    return None


async def list_all_libraries(user_id: str) -> list[dict]:
    await ensure_builtin_libraries()
    return await list_libraries(user_id)


def _mime_for_filename(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return {
        ".md": "text/markdown",
        ".markdown": "text/markdown",
        ".txt": "text/plain",
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".ppt": "application/vnd.ms-powerpoint",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".xls": "application/vnd.ms-excel",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".html": "text/html",
        ".py": "text/x-python",
    }.get(ext, "application/octet-stream")


def _count_kb_files(kb_dir: Path | None) -> int:
    if not kb_dir or not kb_dir.exists():
        return 0
    from app.services.file_extract_service import supported_extensions

    allowed = {e.lower() for e in supported_extensions()}
    return sum(
        1
        for path in kb_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in allowed
    )


def _builtin_library_files(lib: dict) -> list[dict]:
    """内置库：从 knowledge_base 目录枚举章节与说明文件。"""
    kb_path = lib.get("kb_path") or ""
    if not kb_path:
        return []
    root = builtin_kb_root() / kb_path
    if not root.exists():
        return []
    from app.services.file_extract_service import supported_extensions

    allowed = {e.lower() for e in supported_extensions()}
    out: list[dict] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in allowed:
            continue
        rel = path.relative_to(root).as_posix()
        out.append(
            {
                "id": f"builtin-{lib['id']}-{rel}",
                "library_id": lib["id"],
                "filename": rel,
                "mime_type": _mime_for_filename(path.name),
                "size": path.stat().st_size,
                "status": "ready",
            }
        )
    return out


async def list_library_files_resolved(lib: dict) -> list[dict]:
    """用户上传文件走数据库；内置库优先磁盘枚举以保证与知识库目录一致。"""
    from app.db.repository import list_library_files

    if lib.get("source_type") == "builtin":
        disk = _builtin_library_files(lib)
        if disk:
            return disk
    files = await list_library_files(lib["id"])
    return [f for f in files if f.get("status") != "skipped"]
