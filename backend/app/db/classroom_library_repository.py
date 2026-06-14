from __future__ import annotations

import uuid
from datetime import datetime

from app.db.session import SessionLocal
from app.db.models import ClassroomLibraryRecord, dumps, loads
from app.models.schemas import (
    ClassroomGenerateRequest,
    ClassroomGenerationJob,
    ClassroomLibraryItem,
    ClassroomSessionResponse,
)
def _seed_from_request(req: ClassroomGenerateRequest) -> dict:
    return {
        "stepKey": req.step_key,
        "title": req.title,
        "objective": req.objective,
        "resourceIds": req.resource_ids,
        "estimatedMinutes": req.estimated_minutes,
        "courseName": req.course_name,
        "source": "path" if req.step_key else "manual",
    }


def _row_to_item(row: ClassroomLibraryRecord) -> ClassroomLibraryItem:
    result = None
    if row.result_json:
        try:
            result = ClassroomSessionResponse(**loads(row.result_json))
        except Exception:
            result = None
    seed = loads(row.seed_json) if row.seed_json else {}
    return ClassroomLibraryItem(
        id=row.id,
        job_id=row.job_id,
        user_id=row.user_id,
        step_key=row.step_key,
        title=row.title,
        objective=row.objective,
        course_name=row.course_name,
        status=row.status,  # type: ignore[arg-type]
        stage=row.stage,
        progress=row.progress,
        is_favorite=row.is_favorite,
        has_result=bool(row.result_json),
        error=row.error or "",
        seed=seed,
        result=result,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def create_library_entry_for_job(req: ClassroomGenerateRequest, job: ClassroomGenerationJob) -> str:
    seed = _seed_from_request(req)
    with SessionLocal() as db:
        row = ClassroomLibraryRecord(
            id=str(uuid.uuid4()),
            user_id=req.user_id,
            job_id=job.id,
            step_key=req.step_key,
            title=req.title or job.title,
            objective=req.objective,
            course_name=req.course_name,
            status=job.status,
            stage=job.stage,
            progress=job.progress,
            seed_json=dumps(seed),
            request_json=dumps(req.model_dump()),
            result_json=dumps(job.result.model_dump()) if job.result else "",
            error=job.error or "",
        )
        db.add(row)
        db.commit()
        return row.id


def sync_library_from_job(job: ClassroomGenerationJob) -> None:
    with SessionLocal() as db:
        row = (
            db.query(ClassroomLibraryRecord)
            .filter(ClassroomLibraryRecord.job_id == job.id)
            .first()
        )
        if not row:
            return
        row.status = job.status
        row.stage = job.stage
        row.progress = job.progress
        row.error = job.error or ""
        row.title = job.title or row.title
        row.result_json = dumps(job.result.model_dump()) if job.result else row.result_json
        row.updated_at = datetime.utcnow()
        db.commit()


def list_classroom_library(user_id: str) -> list[ClassroomLibraryItem]:
    with SessionLocal() as db:
        rows = (
            db.query(ClassroomLibraryRecord)
            .filter(ClassroomLibraryRecord.user_id == user_id)
            .order_by(
                ClassroomLibraryRecord.is_favorite.desc(),
                ClassroomLibraryRecord.updated_at.desc(),
            )
            .all()
        )
        return [_row_to_item(row) for row in rows]


def get_classroom_library_item(item_id: str, user_id: str) -> ClassroomLibraryItem | None:
    with SessionLocal() as db:
        row = (
            db.query(ClassroomLibraryRecord)
            .filter(ClassroomLibraryRecord.id == item_id, ClassroomLibraryRecord.user_id == user_id)
            .first()
        )
        return _row_to_item(row) if row else None


def delete_classroom_library_item(item_id: str, user_id: str) -> bool:
    with SessionLocal() as db:
        row = (
            db.query(ClassroomLibraryRecord)
            .filter(ClassroomLibraryRecord.id == item_id, ClassroomLibraryRecord.user_id == user_id)
            .first()
        )
        if not row:
            return False
        db.delete(row)
        db.commit()
        return True


def set_classroom_library_favorite(item_id: str, user_id: str, is_favorite: bool) -> ClassroomLibraryItem | None:
    with SessionLocal() as db:
        row = (
            db.query(ClassroomLibraryRecord)
            .filter(ClassroomLibraryRecord.id == item_id, ClassroomLibraryRecord.user_id == user_id)
            .first()
        )
        if not row:
            return None
        row.is_favorite = is_favorite
        row.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return _row_to_item(row)


def get_library_request(item_id: str, user_id: str) -> ClassroomGenerateRequest | None:
    with SessionLocal() as db:
        row = (
            db.query(ClassroomLibraryRecord)
            .filter(ClassroomLibraryRecord.id == item_id, ClassroomLibraryRecord.user_id == user_id)
            .first()
        )
        if not row or not row.request_json:
            return None
        try:
            return ClassroomGenerateRequest(**loads(row.request_json))
        except Exception:
            return None


def attach_regenerated_job(item_id: str, user_id: str, job: ClassroomGenerationJob) -> ClassroomLibraryItem | None:
    with SessionLocal() as db:
        row = (
            db.query(ClassroomLibraryRecord)
            .filter(ClassroomLibraryRecord.id == item_id, ClassroomLibraryRecord.user_id == user_id)
            .first()
        )
        if not row:
            return None
        row.job_id = job.id
        row.status = job.status
        row.stage = job.stage
        row.progress = job.progress
        row.error = ""
        row.result_json = ""
        row.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return _row_to_item(row)


def get_library_item_by_job_id(job_id: str, user_id: str) -> ClassroomLibraryItem | None:
    with SessionLocal() as db:
        row = (
            db.query(ClassroomLibraryRecord)
            .filter(ClassroomLibraryRecord.job_id == job_id, ClassroomLibraryRecord.user_id == user_id)
            .first()
        )
        return _row_to_item(row) if row else None
