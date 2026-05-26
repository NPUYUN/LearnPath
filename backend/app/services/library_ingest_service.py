"""上传文件 → LLM 分析 → 资料库向量入库。"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from typing import Any

from app.core.llm.router import get_primary_llm
from app.core.prompts import LIBRARY_FILE_ANALYSIS_SYSTEM, LIBRARY_SYNTHESIS_SYSTEM
from app.db.repository import get_library, list_library_files, save_library, save_library_file
from app.rag.library_retriever import chunk_uploaded_documents, ingest_text_chunks
from app.services.file_extract_service import extract_text_from_bytes, guess_mime


def _parse_json(text: str) -> dict:
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return {}
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}


async def analyze_single_file(filename: str, text: str) -> dict:
    llm = get_primary_llm()
    excerpt = text[:12000]
    raw = await llm.chat(
        [
            {"role": "system", "content": LIBRARY_FILE_ANALYSIS_SYSTEM},
            {
                "role": "user",
                "content": f"文件名：{filename}\n\n文件内容：\n{excerpt}",
            },
        ],
        temperature=0.3,
    )
    data = _parse_json(raw)
    if not data:
        data = {
            "title": filename,
            "summary": raw[:300],
            "topics": [],
            "key_concepts": [],
            "difficulty": "入门",
        }
    data["raw_analysis"] = raw
    return data


async def synthesize_library(
    library_name: str,
    file_analyses: list[dict],
) -> dict:
    llm = get_primary_llm()
    payload = json.dumps(
        [{"filename": f.get("filename"), "analysis": f.get("analysis")} for f in file_analyses],
        ensure_ascii=False,
    )[:15000]
    raw = await llm.chat(
        [
            {"role": "system", "content": LIBRARY_SYNTHESIS_SYSTEM},
            {
                "role": "user",
                "content": f"资料库名称：{library_name}\n\n各文件分析：\n{payload}",
            },
        ],
        temperature=0.35,
    )
    data = _parse_json(raw)
    if not data:
        data = {"name": library_name, "description": raw[:500]}
    data["raw_synthesis"] = raw
    return data


async def process_uploaded_files(
    user_id: str,
    library_id: str,
    files: list[tuple[str, bytes]],
) -> dict[str, Any]:
    lib = await get_library(library_id, user_id)
    if not lib or lib.get("source_type") == "builtin":
        raise ValueError("资料库不存在或不可写入")

    parsed: list[dict[str, Any]] = []
    errors: list[str] = []

    for filename, data in files:
        fid = str(uuid.uuid4()).replace("-", "")[:12]
        try:
            text = extract_text_from_bytes(filename, data)
            analysis = await analyze_single_file(filename, text)
            record = {
                "id": fid,
                "library_id": library_id,
                "filename": filename,
                "mime_type": guess_mime(filename),
                "size": len(data),
                "status": "ready",
                "text_length": len(text),
                "analysis": analysis,
            }
            await save_library_file(record)
            parsed.append({"id": fid, "filename": filename, "text": text, "analysis": analysis})
        except Exception as e:
            errors.append(f"{filename}: {e}")
            await save_library_file(
                {
                    "id": fid,
                    "library_id": library_id,
                    "filename": filename,
                    "mime_type": guess_mime(filename),
                    "size": len(data),
                    "status": "error",
                    "error": str(e),
                }
            )

    if not parsed:
        await save_library(
            {
                **lib,
                "status": "error",
                "last_error": "; ".join(errors) or "无有效文件",
                "updated_at": datetime.utcnow().isoformat(),
            }
        )
        return {"library_id": library_id, "ingested": 0, "errors": errors}

    synthesis = await synthesize_library(lib.get("name", ""), parsed)
    chunks = chunk_uploaded_documents(parsed, library_id=library_id)
    reset = lib.get("chunk_count", 0) == 0
    ingested = ingest_text_chunks(
        library_id,
        chunks,
        collection_name=lib.get("collection_name", ""),
        reset=reset,
    )

    all_files = await list_library_files(library_id)
    updated = {
        **lib,
        "status": "ready",
        "description": synthesis.get("description") or lib.get("description", ""),
        "file_count": len(all_files),
        "chunk_count": (0 if reset else lib.get("chunk_count", 0)) + ingested,
        "synthesis": synthesis,
        "updated_at": datetime.utcnow().isoformat(),
    }
    await save_library(updated)

    return {
        "library_id": library_id,
        "ingested_chunks": ingested,
        "file_count": len(parsed),
        "errors": errors,
        "synthesis": synthesis,
        "library": updated,
    }
