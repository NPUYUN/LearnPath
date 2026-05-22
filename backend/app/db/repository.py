from datetime import datetime

from app.db.models import PathRecord, ProfileRecord, ResourceRecord, dumps, loads
from app.db.session import SessionLocal


async def save_profile(profile: dict) -> None:
    with SessionLocal() as db:
        row = db.get(ProfileRecord, profile["user_id"])
        if row is None:
            row = ProfileRecord(user_id=profile["user_id"], data_json=dumps(profile))
            db.add(row)
        else:
            row.data_json = dumps(profile)
            row.updated_at = datetime.utcnow()
        db.commit()


async def get_profile(user_id: str) -> dict | None:
    with SessionLocal() as db:
        row = db.get(ProfileRecord, user_id)
        return loads(row.data_json) if row else None


async def save_path(path: dict) -> None:
    with SessionLocal() as db:
        row = db.get(PathRecord, path["user_id"])
        if row is None:
            row = PathRecord(user_id=path["user_id"], data_json=dumps(path))
            db.add(row)
        else:
            row.data_json = dumps(path)
            row.updated_at = datetime.utcnow()
        db.commit()


async def get_path(user_id: str) -> dict | None:
    with SessionLocal() as db:
        row = db.get(PathRecord, user_id)
        return loads(row.data_json) if row else None


async def save_resources(user_id: str, resources: list[dict]) -> None:
    with SessionLocal() as db:
        for r in resources:
            rid = r.get("id")
            if not rid:
                continue
            row = db.get(ResourceRecord, rid)
            payload = {**r, "user_id": user_id}
            if row is None:
                db.add(
                    ResourceRecord(
                        id=rid,
                        user_id=user_id,
                        type=r.get("type", "doc"),
                        title=r.get("title", ""),
                        content=r.get("content", ""),
                        data_json=dumps(payload),
                    )
                )
            else:
                row.content = r.get("content", row.content)
                row.data_json = dumps(payload)
        db.commit()


async def list_resources(user_id: str) -> list[dict]:
    with SessionLocal() as db:
        rows = db.query(ResourceRecord).filter(ResourceRecord.user_id == user_id).all()
        return [loads(r.data_json) for r in rows]
