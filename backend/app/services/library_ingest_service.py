"""上传文件 → LLM 分析 → 资料库向量入库。"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.core.llm.router import get_primary_llm
from app.core.prompts import LIBRARY_FILE_ANALYSIS_SYSTEM, LIBRARY_SYNTHESIS_SYSTEM
from app.db.repository import get_library, list_library_files, save_library, save_library_file
from app.rag.library_retriever import chunk_uploaded_documents, ingest_text_chunks
from app.services.file_extract_service import extract_text_from_bytes, guess_mime


def _strip_markdown_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _looks_like_json_blob(text: str) -> bool:
    cleaned = text.strip()
    return cleaned.startswith("{") and (
        '"description"' in cleaned or '"learning_objectives"' in cleaned
    )


def _parse_json(text: str) -> dict:
    cleaned = _strip_markdown_fence(text)
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if not match:
        return {}
    blob = match.group(0)
    try:
        parsed = json.loads(blob)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        pass
    # 容忍尾逗号等常见 LLM JSON 瑕疵
    relaxed = re.sub(r",\s*([}\]])", r"\1", blob)
    try:
        parsed = json.loads(relaxed)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _extract_description_from_raw(raw: str) -> str:
    parsed = _parse_json(raw)
    desc = str(parsed.get("description") or "").strip()
    if desc and not _looks_like_json_blob(desc):
        return desc
    match = re.search(r'"description"\s*:\s*"((?:[^"\\]|\\.)*)"', raw)
    if not match:
        return ""
    try:
        return json.loads(f'"{match.group(1)}"')
    except json.JSONDecodeError:
        return match.group(1).replace('\\"', '"')


def _normalize_library_description(
    synthesis: dict,
    raw: str,
    library_name: str,
) -> str:
    desc = str(synthesis.get("description") or "").strip()
    if desc and not _looks_like_json_blob(desc):
        return desc[:500]

    if desc and _looks_like_json_blob(desc):
        nested = _parse_json(desc)
        nested_desc = str(nested.get("description") or "").strip()
        if nested_desc:
            return nested_desc[:500]

    from_raw = _extract_description_from_raw(raw)
    if from_raw:
        return from_raw[:500]

    objectives = synthesis.get("learning_objectives") or _parse_json(raw).get("learning_objectives") or []
    if isinstance(objectives, list) and objectives:
        joined = "；".join(str(item).strip() for item in objectives[:3] if str(item).strip())
        if joined:
            return f"围绕「{library_name}」，学习目标包括：{joined}"[:500]

    if desc:
        return desc[:500]
    return f"「{library_name}」学习资料库"


def _fast_file_analysis(filename: str, text: str) -> dict:
    preview = re.sub(r"\s+", " ", text[:600]).strip()
    title = Path(filename).stem if filename else "文档"
    return {
        "title": title,
        "summary": preview[:300] if preview else f"文件 {filename}",
        "topics": [],
        "key_concepts": [],
        "difficulty": "入门",
        "analysis_mode": "fast",
    }


def _fast_library_synthesis(library_name: str, parsed: list[dict[str, Any]]) -> dict:
    names = [str(f.get("filename") or "").strip() for f in parsed if f.get("filename")]
    if not names:
        desc = f"「{library_name}」学习资料库"
    elif len(names) == 1:
        desc = f"「{library_name}」资料库，已收录文件：{names[0]}"
    else:
        head = "、".join(names[:4])
        tail = f" 等 {len(names)} 个文件" if len(names) > 4 else f" 共 {len(names)} 个文件"
        desc = f"「{library_name}」资料库，已收录：{head}{tail}"
    return {
        "name": library_name,
        "description": desc[:500],
        "learning_objectives": [],
        "knowledge_map": [],
        "analysis_mode": "fast",
    }


async def analyze_single_file(filename: str, text: str, *, fast: bool = False) -> dict:
    if fast:
        return _fast_file_analysis(filename, text)
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
    *,
    fast: bool = False,
) -> dict:
    if fast:
        data = _fast_library_synthesis(library_name, file_analyses)
        data["description"] = _normalize_library_description(data, "", library_name)
        return data

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
        data = {"name": library_name}
    data["raw_synthesis"] = raw
    data["description"] = _normalize_library_description(data, raw, library_name)
    return data


async def process_uploaded_files(
    user_id: str,
    library_id: str,
    files: list[tuple[str, bytes]],
) -> dict[str, Any]:
    lib = await get_library(library_id, user_id)
    if not lib or lib.get("source_type") == "builtin":
        raise ValueError("资料库不存在或不可写入")

    fast_ingest = get_settings().library_fast_ingest
    parsed: list[dict[str, Any]] = []
    errors: list[str] = []

    for filename, data in files:
        fid = str(uuid.uuid4()).replace("-", "")[:12]
        try:
            text = extract_text_from_bytes(filename, data)
            analysis = await analyze_single_file(filename, text, fast=fast_ingest)
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

    synthesis = await synthesize_library(lib.get("name", ""), parsed, fast=fast_ingest)
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
        "fast_ingest": fast_ingest,
    }
