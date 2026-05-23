from datetime import datetime, timedelta
import random
import string
import uuid

from app.db.models import (
    ChatMessageRecord,
    LearningEventRecord,
    OtpRecord,
    PathRecord,
    ProfileRecord,
    QuizAttemptRecord,
    ResourceRecord,
    UserPreferencesRecord,
    UserRecord,
    dumps,
    loads,
)
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


async def get_resource(user_id: str, resource_id: str) -> dict | None:
    with SessionLocal() as db:
        row = db.get(ResourceRecord, resource_id)
        if not row or row.user_id != user_id:
            return None
        data = loads(row.data_json)
        data.setdefault("id", row.id)
        data.setdefault("type", row.type)
        data.setdefault("title", row.title)
        data.setdefault("content", row.content)
        return data


async def save_quiz_attempt(
    user_id: str,
    quiz_resource_id: str,
    answers: list[int],
    score: int,
    total: int,
) -> dict:
    with SessionLocal() as db:
        row = QuizAttemptRecord(
            id=str(uuid.uuid4()),
            user_id=user_id,
            quiz_resource_id=quiz_resource_id,
            answers_json=dumps({"answers": answers}),
            score=score,
            total=total,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return {
            "id": row.id,
            "user_id": row.user_id,
            "quiz_resource_id": row.quiz_resource_id,
            "score": row.score,
            "total": row.total,
            "created_at": row.created_at.isoformat() if row.created_at else "",
        }


async def get_last_quiz_attempt(user_id: str) -> dict | None:
    with SessionLocal() as db:
        row = (
            db.query(QuizAttemptRecord)
            .filter(QuizAttemptRecord.user_id == user_id)
            .order_by(QuizAttemptRecord.created_at.desc())
            .first()
        )
        if not row:
            return None
        return {
            "id": row.id,
            "quiz_resource_id": row.quiz_resource_id,
            "score": row.score,
            "total": row.total,
            "created_at": row.created_at.isoformat() if row.created_at else "",
        }


# ── Auth helpers ──────────────────────────────────────────────────────────────

def create_otp(email: str) -> str:
    """生成并存储 6 位数字验证码，5 分钟有效。"""
    code = "".join(random.choices(string.digits, k=6))
    expires_at = datetime.utcnow() + timedelta(minutes=5)
    with SessionLocal() as db:
        db.add(OtpRecord(email=email, code=code, expires_at=expires_at))
        db.commit()
    return code


def verify_otp_code(email: str, code: str) -> bool:
    """验证 OTP，验证成功后标记为已使用。"""
    with SessionLocal() as db:
        record = (
            db.query(OtpRecord)
            .filter(
                OtpRecord.email == email,
                OtpRecord.code == code,
                OtpRecord.used.is_(False),
                OtpRecord.expires_at > datetime.utcnow(),
            )
            .order_by(OtpRecord.created_at.desc())
            .first()
        )
        if not record:
            return False
        record.used = True
        db.commit()
        return True


def _demo_account() -> dict:
    return {
        "user_id": "demo",
        "display_name": "演示学生",
        "email": "demo@learnpath.local",
        "course_name": "机器学习导论",
        "major": "计算机科学",
        "bio": "学径演示账号，用于体验多智能体个性化学习。",
        "phone": "",
        "created_at": datetime.utcnow().isoformat(),
    }


async def get_user_account(user_id: str) -> dict | None:
    if user_id == "demo":
        base = _demo_account()
        prefs = await get_preferences("demo")
        base.update({k: v for k, v in (prefs.get("account_patch") or {}).items() if v is not None})
        return base
    with SessionLocal() as db:
        row = db.get(UserRecord, user_id)
        if not row:
            return None
        return {
            "user_id": row.id,
            "display_name": row.display_name or "",
            "email": row.email,
            "course_name": getattr(row, "course_name", None) or "",
            "major": getattr(row, "major", None) or "",
            "bio": getattr(row, "bio", None) or "",
            "phone": getattr(row, "phone", None) or "",
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }


async def update_user_account(user_id: str, patch: dict) -> dict | None:
    if user_id == "demo":
        base = _demo_account()
        prefs = await get_preferences("demo")
        prefs_patch = prefs.get("account_patch") or {}
        base.update({k: v for k, v in prefs_patch.items() if v is not None})
        base.update({k: v for k, v in patch.items() if v is not None})
        await set_preferences("demo", {"account_patch": {k: base[k] for k in (
            "display_name", "course_name", "major", "bio", "phone", "email"
        ) if k in base}})
        return base
    with SessionLocal() as db:
        row = db.get(UserRecord, user_id)
        if not row:
            return None
        for key in ("display_name", "course_name", "major", "bio", "phone"):
            if key in patch and patch[key] is not None:
                setattr(row, key, patch[key])
        db.commit()
        db.refresh(row)
        return {
            "user_id": row.id,
            "display_name": row.display_name or "",
            "email": row.email,
            "course_name": getattr(row, "course_name", None) or "",
            "major": getattr(row, "major", None) or "",
            "bio": getattr(row, "bio", None) or "",
            "phone": getattr(row, "phone", None) or "",
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }


def get_or_create_user(email: str) -> dict:
    """根据邮箱获取或创建用户，返回用户信息字典。"""
    with SessionLocal() as db:
        row = db.query(UserRecord).filter(UserRecord.email == email).first()
        if row is None:
            row = UserRecord(
                id=str(uuid.uuid4()),
                email=email,
                display_name=email.split("@")[0],
            )
            db.add(row)
            db.commit()
            db.refresh(row)
        return {"id": row.id, "email": row.email, "display_name": row.display_name}


async def record_event(
    user_id: str,
    event_type: str,
    *,
    resource_id: str = "",
    meta: dict | None = None,
) -> dict:
    with SessionLocal() as db:
        row = LearningEventRecord(
            id=str(uuid.uuid4()),
            user_id=user_id,
            event_type=event_type,
            resource_id=resource_id or "",
            meta_json=dumps(meta or {}),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return {
            "id": row.id,
            "user_id": row.user_id,
            "event_type": row.event_type,
            "resource_id": row.resource_id,
            "created_at": row.created_at.isoformat() if row.created_at else "",
        }


def list_events(user_id: str, limit: int = 50) -> list[dict]:
    with SessionLocal() as db:
        rows = (
            db.query(LearningEventRecord)
            .filter(LearningEventRecord.user_id == user_id)
            .order_by(LearningEventRecord.created_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "event_type": r.event_type,
                "resource_id": r.resource_id,
                "meta": loads(r.meta_json),
                "created_at": r.created_at.isoformat() if r.created_at else "",
            }
            for r in rows
        ]


def _default_preferences(user_id: str) -> dict:
    return {"user_id": user_id, "starred_resource_ids": [], "account_patch": {}}


async def get_preferences(user_id: str) -> dict:
    with SessionLocal() as db:
        row = db.get(UserPreferencesRecord, user_id)
        if not row:
            return _default_preferences(user_id)
        data = loads(row.data_json)
        data.setdefault("user_id", user_id)
        data.setdefault("starred_resource_ids", [])
        data.setdefault("account_patch", {})
        return data


async def set_preferences(user_id: str, patch: dict) -> dict:
    current = await get_preferences(user_id)
    if "starred_resource_ids" in patch and patch["starred_resource_ids"] is not None:
        current["starred_resource_ids"] = list(patch["starred_resource_ids"])
    if "account_patch" in patch and patch["account_patch"] is not None:
        current["account_patch"] = {**current.get("account_patch", {}), **patch["account_patch"]}
    with SessionLocal() as db:
        row = db.get(UserPreferencesRecord, user_id)
        if row is None:
            row = UserPreferencesRecord(user_id=user_id, data_json=dumps(current))
            db.add(row)
        else:
            row.data_json = dumps(current)
            row.updated_at = datetime.utcnow()
        db.commit()
    return current


async def append_chat_message(
    user_id: str,
    role: str,
    content: str,
    resources: list[dict] | None = None,
) -> dict:
    with SessionLocal() as db:
        row = ChatMessageRecord(
            id=str(uuid.uuid4()),
            user_id=user_id,
            role=role,
            content=content,
            resources_json=dumps(resources or []),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return {
            "id": row.id,
            "role": row.role,
            "content": row.content,
            "resources": loads(row.resources_json),
            "created_at": row.created_at.isoformat() if row.created_at else "",
        }


def list_chat_messages(user_id: str, limit: int = 100) -> list[dict]:
    with SessionLocal() as db:
        rows = (
            db.query(ChatMessageRecord)
            .filter(ChatMessageRecord.user_id == user_id)
            .order_by(ChatMessageRecord.created_at.asc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "role": r.role,
                "content": r.content,
                "resources": loads(r.resources_json),
                "created_at": r.created_at.isoformat() if r.created_at else "",
            }
            for r in rows
        ]


def list_resources_with_meta(user_id: str) -> list[dict]:
    """返回资源列表，包含 type、title、created_at 等元数据。"""
    with SessionLocal() as db:
        rows = (
            db.query(ResourceRecord)
            .filter(ResourceRecord.user_id == user_id)
            .order_by(ResourceRecord.created_at.desc())
            .all()
        )
        return [
            {
                "id": r.id,
                "type": r.type,
                "title": r.title,
                "created_at": r.created_at.isoformat() if r.created_at else "",
                **loads(r.data_json),
            }
            for r in rows
        ]
