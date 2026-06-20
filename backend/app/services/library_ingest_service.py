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
    preview = _meaningful_excerpt(text, limit=700)
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


def _meaningful_excerpt(text: str, *, limit: int = 800) -> str:
    lines: list[str] = []
    seen: set[str] = set()
    for raw in (text or "").splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if len(line) < 6:
            continue
        low = line.lower()
        if low in seen:
            continue
        seen.add(low)
        alpha_num = sum(1 for ch in line if ch.isalnum() or "\u4e00" <= ch <= "\u9fff")
        if alpha_num / max(len(line), 1) < 0.45:
            continue
        if line in {"计算机网络", "西北工业大学软件学院"}:
            continue
        lines.append(line)
        if sum(len(x) for x in lines) >= limit:
            break
    return " ".join(lines)[:limit].strip()


def _analysis_topics(analysis: dict) -> list[str]:
    topics = analysis.get("topics") or analysis.get("key_concepts") or []
    if not isinstance(topics, list):
        return []
    return [str(t).strip() for t in topics if str(t).strip()][:8]


def _build_file_doc(filename: str, analysis: dict, text: str, requirements: str = "") -> str:
    title = str(analysis.get("title") or Path(filename).stem or filename).strip()
    summary = str(analysis.get("summary") or "").strip()
    if not summary:
        summary = _meaningful_excerpt(text, limit=800)
    topics = _analysis_topics(analysis)
    chapters = analysis.get("suggested_chapters") or []
    lines = [
        f"# {title}",
        "",
        f"- 文件：{filename}",
        f"- 难度：{analysis.get('difficulty') or '待评估'}",
    ]
    if topics:
        lines.append(f"- 关键词：{'、'.join(topics[:8])}")
    if requirements.strip():
        lines.append(f"- 建库诉求：{requirements.strip()[:240]}")
    lines.extend(["", "## 内容说明", summary[:800] or "该文件已入库，可用于生成讲解、练习和路径节点。"])
    if chapters:
        lines.extend(["", "## 复习切入点"])
        for item in chapters[:8]:
            if isinstance(item, dict):
                name = str(item.get("title") or "").strip()
                brief = str(item.get("brief") or "").strip()
                if name:
                    lines.append(f"- {name}：{brief[:160]}")
            else:
                lines.append(f"- {str(item)[:180]}")
    return "\n".join(lines).strip()


def _build_index_doc(library_name: str, parsed: list[dict[str, Any]], requirements: str = "") -> str:
    lines = [f"# {library_name} 索引", ""]
    if requirements.strip():
        lines.extend(["## 建库诉求", requirements.strip()[:1000], ""])
    lines.append("## 文件索引")
    for item in parsed:
        analysis = item.get("analysis") or {}
        topics = _analysis_topics(analysis)
        title = str(analysis.get("title") or Path(item.get("filename") or "").stem).strip()
        lines.append(
            f"- {item.get('filename')}: {title}"
            + (f"；主题：{'、'.join(topics[:5])}" if topics else "")
        )
    lines.extend(["", "## 资源类型建议"])
    lines.extend(
        [
            "- 讲解文档：用于梳理概念、公式、章节脉络。",
            "- 练习题库：用于检查定义、计算步骤和易错点。",
            "- 思维导图：用于复习章节结构和概念关系。",
            "- 代码案例/实践项目：用于把方法落到可运行或可交付任务。",
            "- 多模态讲解：用于把抽象概念转为画面、旁白和流程。",
        ]
    )
    return "\n".join(lines).strip()


def _build_relationship_doc(library_name: str, parsed: list[dict[str, Any]]) -> str:
    if len(parsed) <= 1:
        return ""
    topic_owner: dict[str, list[str]] = {}
    for item in parsed:
        filename = str(item.get("filename") or "")
        for topic in _analysis_topics(item.get("analysis") or {}):
            topic_owner.setdefault(topic, []).append(filename)
    overlaps = [f"- {topic}: {'、'.join(files[:4])}" for topic, files in topic_owner.items() if len(files) > 1]
    ordered = [
        str((item.get("analysis") or {}).get("title") or item.get("filename") or "").strip()
        for item in parsed
    ]
    lines = [
        f"# {library_name} 文件关系",
        "",
        "## 建议阅读顺序",
        *[f"{idx + 1}. {name}" for idx, name in enumerate(ordered) if name],
    ]
    if overlaps:
        lines.extend(["", "## 重叠主题", *overlaps[:10]])
    lines.extend(
        [
            "",
            "## 使用建议",
            "先用索引确认章节范围，再按文件说明定位重点；生成学习路径时，优先把同一主题的文件放到相邻子路径中。",
        ]
    )
    return "\n".join(lines).strip()


def _attach_library_docs(
    library_name: str,
    synthesis: dict,
    parsed: list[dict[str, Any]],
    requirements: str = "",
) -> dict:
    file_docs = [
        {
            "file_id": item.get("id", ""),
            "filename": item.get("filename", ""),
            "title": str((item.get("analysis") or {}).get("title") or Path(item.get("filename") or "").stem),
            "doc": _build_file_doc(
                str(item.get("filename") or ""),
                item.get("analysis") or {},
                str(item.get("text") or ""),
                requirements,
            ),
        }
        for item in parsed
    ]
    description = str(synthesis.get("description") or "").strip() or f"「{library_name}」学习资料库"
    description_doc = str(synthesis.get("description_doc") or "").strip()
    if not description_doc:
        objectives = synthesis.get("learning_objectives") or []
        obj_lines = [f"- {str(o)}" for o in objectives[:6] if str(o).strip()] if isinstance(objectives, list) else []
        description_doc = "\n".join(
            [
                f"# {library_name} 说明",
                "",
                "## 复习用途",
                description,
                "",
                "## 学习目标",
                *(obj_lines or ["- 理解资料覆盖的核心概念并完成配套练习。"]),
            ]
        ).strip()
    knowledge_index: list[dict[str, Any]] = []
    seen_points: set[str] = set()
    for item in parsed:
        analysis = item.get("analysis") or {}
        chapter = str(analysis.get("chapter") or analysis.get("title") or item.get("filename") or "资料章节")
        difficulty = str(analysis.get("difficulty") or "intermediate")
        for point in _analysis_topics(analysis):
            if point in seen_points:
                continue
            seen_points.add(point)
            knowledge_index.append(
                {
                    "id": f"kp_{len(knowledge_index) + 1}",
                    "name": point,
                    "chapter": chapter[:120],
                    "prerequisites": [],
                    "next_points": [],
                    "difficulty": difficulty,
                    "importance": "core" if len(knowledge_index) < 8 else "supporting",
                    "source_files": [str(item.get("filename") or "")],
                }
            )
    knowledge_relations = [
        {
            "from": knowledge_index[index - 1]["name"],
            "to": knowledge_index[index]["name"],
            "relation": "prerequisite",
        }
        for index in range(1, len(knowledge_index))
        if knowledge_index[index - 1]["name"] != knowledge_index[index]["name"]
    ]
    main_points = [row["name"] for row in knowledge_index[:12]]
    return {
        **synthesis,
        "requirements": requirements.strip(),
        "description_doc": description_doc,
        "index_doc": str(synthesis.get("index_doc") or "").strip()
        or _build_index_doc(library_name, parsed, requirements),
        "file_docs": file_docs,
        "relationship_doc": str(synthesis.get("relationship_doc") or "").strip()
        or _build_relationship_doc(library_name, parsed),
        "resource_index": synthesis.get("resource_index") or {},
        "library_profile": synthesis.get("library_profile")
        or {
            "name": library_name,
            "course": str(synthesis.get("course") or library_name),
            "suitable_for": str(synthesis.get("suitable_for") or "依据学生画像动态匹配"),
            "coverage": description,
            "main_knowledge_points": main_points,
            "recommended_usage": "按知识索引定位内容，用于路径规划、AI 课堂、练习和复习。",
        },
        "knowledge_index": synthesis.get("knowledge_index") or knowledge_index,
        "knowledge_relations": synthesis.get("knowledge_relations") or knowledge_relations,
        "resource_manifest": synthesis.get("resource_manifest") or [],
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
    if not data.get("description_doc"):
        data["description_doc"] = _build_file_doc(filename, data, text)
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
    *,
    requirements: str = "",
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
            if len(_meaningful_excerpt(text, limit=120)) < 20:
                await save_library_file(
                    {
                        "id": fid,
                        "library_id": library_id,
                        "filename": filename,
                        "mime_type": guess_mime(filename),
                        "size": len(data),
                        "status": "skipped",
                        "error": "有效文本过少，已跳过",
                    }
                )
                continue
            analysis = await analyze_single_file(filename, text, fast=fast_ingest)
            analysis["description_doc"] = _build_file_doc(filename, analysis, text, requirements)
            record = {
                "id": fid,
                "library_id": library_id,
                "filename": filename,
                "mime_type": guess_mime(filename),
                "size": len(data),
                "status": "ready",
                "text_length": len(text),
                "preview_text": text[:120000],
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
    synthesis = _attach_library_docs(lib.get("name", ""), synthesis, parsed, requirements)
    chunks = chunk_uploaded_documents(parsed, library_id=library_id)
    reset = lib.get("chunk_count", 0) == 0
    ingested = ingest_text_chunks(
        library_id,
        chunks,
        collection_name=lib.get("collection_name", ""),
        reset=reset,
    )

    all_files = await list_library_files(library_id)
    ready_files = [f for f in all_files if f.get("status") == "ready"]
    updated = {
        **lib,
        "status": "ready",
        "description": synthesis.get("description") or lib.get("description", ""),
        "file_count": len(ready_files),
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
