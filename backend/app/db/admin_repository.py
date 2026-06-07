"""管理员：跨用户数据聚合与列表。"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import func

from app.core.admin_user import is_admin_user
from app.db.models import (
    ChatConversationRecord,
    ChatMessageRecord,
    LearningEventRecord,
    QuizAttemptRecord,
    ResourceLibraryRecord,
    ResourceRecord,
    UserRecord,
)
from app.db.session import SessionLocal


def _iso(dt: datetime | None) -> str:
    return dt.isoformat() if dt else ""


def _days_ago(n: int) -> datetime:
    return datetime.utcnow() - timedelta(days=n)


def get_platform_overview() -> dict:
    with SessionLocal() as db:
        user_count = db.query(func.count(UserRecord.id)).scalar() or 0
        resource_count = db.query(func.count(ResourceRecord.id)).scalar() or 0
        library_count = db.query(func.count(ResourceLibraryRecord.id)).scalar() or 0
        conv_count = db.query(func.count(ChatConversationRecord.id)).scalar() or 0
        msg_count = db.query(func.count(ChatMessageRecord.id)).scalar() or 0
        event_count = db.query(func.count(LearningEventRecord.id)).scalar() or 0
        quiz_count = db.query(func.count(QuizAttemptRecord.id)).scalar() or 0

        since_7 = _days_ago(7)
        active_users = (
            db.query(LearningEventRecord.user_id)
            .filter(LearningEventRecord.created_at >= since_7)
            .distinct()
            .count()
        )
        chat_users = (
            db.query(ChatMessageRecord.user_id)
            .filter(ChatMessageRecord.created_at >= since_7, ChatMessageRecord.role == "user")
            .distinct()
            .count()
        )

        type_rows = (
            db.query(ResourceRecord.type, func.count(ResourceRecord.id))
            .group_by(ResourceRecord.type)
            .all()
        )
        resource_by_type = {str(t or "unknown"): int(c) for t, c in type_rows}

        event_rows = (
            db.query(LearningEventRecord.event_type, func.count(LearningEventRecord.id))
            .group_by(LearningEventRecord.event_type)
            .all()
        )
        events_by_type = {str(t or "unknown"): int(c) for t, c in event_rows}

    return {
        "users_registered": int(user_count) + 1,  # + demo
        "resources_total": int(resource_count),
        "libraries_total": int(library_count),
        "conversations_total": int(conv_count),
        "messages_total": int(msg_count),
        "events_total": int(event_count),
        "quiz_attempts_total": int(quiz_count),
        "active_users_7d": int(active_users),
        "chat_active_users_7d": int(chat_users),
        "resource_by_type": resource_by_type,
        "events_by_type": events_by_type,
    }


def get_daily_activity(days: int = 14) -> list[dict]:
    since = _days_ago(days)
    buckets: dict[str, dict] = defaultdict(lambda: {"date": "", "events": 0, "messages": 0, "resources": 0})

    with SessionLocal() as db:
        for row in (
            db.query(LearningEventRecord.created_at)
            .filter(LearningEventRecord.created_at >= since)
            .all()
        ):
            if not row.created_at:
                continue
            key = row.created_at.strftime("%Y-%m-%d")
            buckets[key]["date"] = key
            buckets[key]["events"] += 1

        for row in (
            db.query(ChatMessageRecord.created_at)
            .filter(ChatMessageRecord.created_at >= since)
            .all()
        ):
            if not row.created_at:
                continue
            key = row.created_at.strftime("%Y-%m-%d")
            buckets[key]["date"] = key
            buckets[key]["messages"] += 1

        for row in (
            db.query(ResourceRecord.created_at)
            .filter(ResourceRecord.created_at >= since)
            .all()
        ):
            if not row.created_at:
                continue
            key = row.created_at.strftime("%Y-%m-%d")
            buckets[key]["date"] = key
            buckets[key]["resources"] += 1

    # 填充空日期
    out: list[dict] = []
    for i in range(days - 1, -1, -1):
        d = (_days_ago(i)).strftime("%Y-%m-%d")
        slot = buckets.get(d) or {"date": d, "events": 0, "messages": 0, "resources": 0}
        slot["date"] = d
        out.append(slot)
    return out


def list_platform_users(limit: int = 100) -> list[dict]:
    with SessionLocal() as db:
        rows = (
            db.query(UserRecord)
            .order_by(UserRecord.created_at.desc())
            .limit(limit)
            .all()
        )
        users: list[dict] = []
        for r in rows:
            uid = r.id
            users.append(
                {
                    "user_id": uid,
                    "email": r.email,
                    "display_name": r.display_name or r.email.split("@")[0],
                    "course_name": r.course_name or "",
                    "created_at": _iso(r.created_at),
                    "kind": "registered",
                    "resource_count": db.query(func.count(ResourceRecord.id))
                    .filter(ResourceRecord.user_id == uid)
                    .scalar()
                    or 0,
                    "message_count": db.query(func.count(ChatMessageRecord.id))
                    .filter(ChatMessageRecord.user_id == uid)
                    .scalar()
                    or 0,
                }
            )

        demo_resources = (
            db.query(func.count(ResourceRecord.id)).filter(ResourceRecord.user_id == "demo").scalar() or 0
        )
        demo_messages = (
            db.query(func.count(ChatMessageRecord.id)).filter(ChatMessageRecord.user_id == "demo").scalar() or 0
        )
        users.insert(
            0,
            {
                "user_id": "demo",
                "email": "demo@learnpath.local",
                "display_name": "演示学生",
                "course_name": "机器学习导论",
                "created_at": "",
                "kind": "demo",
                "resource_count": int(demo_resources),
                "message_count": int(demo_messages),
            },
        )
        return users


def _purge_user_data(db, user_id: str) -> None:
    from app.db.models import (
        LibraryFileRecord,
        PathRecord,
        ProfileRecord,
        UserPreferencesRecord,
    )

    libraries = db.query(ResourceLibraryRecord).filter(ResourceLibraryRecord.user_id == user_id).all()
    library_ids = [r.id for r in libraries]
    if library_ids:
        db.query(LibraryFileRecord).filter(LibraryFileRecord.library_id.in_(library_ids)).delete(
            synchronize_session=False
        )
    for lib in libraries:
        _delete_chroma_collection(lib.collection_name or f"lib_{lib.id}")
    db.query(ResourceLibraryRecord).filter(ResourceLibraryRecord.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(ResourceRecord).filter(ResourceRecord.user_id == user_id).delete(synchronize_session=False)
    db.query(QuizAttemptRecord).filter(QuizAttemptRecord.user_id == user_id).delete(synchronize_session=False)
    db.query(LearningEventRecord).filter(LearningEventRecord.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(ChatMessageRecord).filter(ChatMessageRecord.user_id == user_id).delete(synchronize_session=False)
    db.query(ChatConversationRecord).filter(ChatConversationRecord.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(ProfileRecord).filter(ProfileRecord.user_id == user_id).delete(synchronize_session=False)
    db.query(PathRecord).filter(PathRecord.user_id == user_id).delete(synchronize_session=False)
    db.query(UserPreferencesRecord).filter(UserPreferencesRecord.user_id == user_id).delete(
        synchronize_session=False
    )
    _purge_chat_uploads(user_id)


def _delete_chroma_collection(collection_name: str) -> None:
    if not collection_name:
        return
    try:
        from app.rag.library_retriever import _get_client

        _get_client().delete_collection(collection_name)
    except Exception:
        pass


def _purge_chat_uploads(user_id: str) -> None:
    import shutil

    from app.core.config import ROOT_DIR

    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in user_id)[:64]
    path = ROOT_DIR / "storage" / "chat_uploads" / safe
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)


def purge_demo_user_data() -> None:
    with SessionLocal() as db:
        _purge_user_data(db, "demo")
        db.commit()


def delete_platform_user(user_id: str) -> bool:
    if is_admin_user(user_id):
        raise ValueError("不能删除管理员账号")
    if user_id == "demo":
        raise ValueError("演示账号不可删除，请使用「重置演示数据」")

    with SessionLocal() as db:
        user = db.query(UserRecord).filter(UserRecord.id == user_id).first()
        if not user:
            return False
        _purge_user_data(db, user_id)
        db.delete(user)
        db.commit()
        return True


def list_all_resources(limit: int = 200) -> list[dict]:
    with SessionLocal() as db:
        rows = (
            db.query(ResourceRecord)
            .order_by(ResourceRecord.created_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "user_id": r.user_id,
                "type": r.type,
                "title": r.title,
                "created_at": _iso(r.created_at),
            }
            for r in rows
        ]


def list_recent_events(limit: int = 80) -> list[dict]:
    with SessionLocal() as db:
        rows = (
            db.query(LearningEventRecord)
            .order_by(LearningEventRecord.created_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": r.id,
                "user_id": r.user_id,
                "event_type": r.event_type,
                "resource_id": r.resource_id,
                "created_at": _iso(r.created_at),
            }
            for r in rows
        ]


def get_user_rankings(limit: int = 8) -> list[dict]:
    with SessionLocal() as db:
        rows = (
            db.query(
                LearningEventRecord.user_id,
                func.count(LearningEventRecord.id).label("cnt"),
            )
            .group_by(LearningEventRecord.user_id)
            .order_by(func.count(LearningEventRecord.id).desc())
            .limit(limit)
            .all()
        )
        out = []
        for uid, cnt in rows:
            label = uid
            if uid == "demo":
                label = "演示学生"
            elif not is_admin_user(uid):
                u = db.query(UserRecord).filter(UserRecord.id == uid).first()
                if u:
                    label = u.display_name or u.email
            out.append({"user_id": uid, "label": label, "events": int(cnt)})
        return out
