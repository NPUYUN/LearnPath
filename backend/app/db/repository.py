from datetime import datetime, timedelta
import random
import string
import uuid

from app.db.models import PathRecord, ProfileRecord, ResourceRecord, UserRecord, OtpRecord, dumps, loads
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
        return _demo_account()
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
        base.update({k: v for k, v in patch.items() if v is not None})
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
