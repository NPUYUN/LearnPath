from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def get_engine():
    settings = get_settings()
    Path = __import__("pathlib").Path
    if settings.database_url.startswith("sqlite"):
        db_path = settings.database_url.replace("sqlite:///", "")
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    return create_engine(settings.database_url, connect_args={"check_same_thread": False})


engine = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _migrate_users_columns() -> None:
    """为已有 SQLite 库补充 users 表新列（无 Alembic 时的轻量迁移）。"""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("users")}
    alters = [
        ("course_name", "VARCHAR(256) DEFAULT ''"),
        ("major", "VARCHAR(128) DEFAULT ''"),
        ("bio", "TEXT DEFAULT ''"),
        ("phone", "VARCHAR(32) DEFAULT ''"),
    ]
    with engine.begin() as conn:
        for col, ddl in alters:
            if col not in existing:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {ddl}"))


def _migrate_chat_messages_columns() -> None:
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "chat_messages" in insp.get_table_names():
        existing = {c["name"] for c in insp.get_columns("chat_messages")}
        alters = [
            ("turn_id", "VARCHAR(64) DEFAULT ''"),
            ("attachments_json", "TEXT DEFAULT '[]'"),
            ("conversation_id", "VARCHAR(64) DEFAULT ''"),
        ]
        with engine.begin() as conn:
            for col, ddl in alters:
                if col not in existing:
                    conn.execute(text(f"ALTER TABLE chat_messages ADD COLUMN {col} {ddl}"))


def init_db() -> None:
    from app.db import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate_users_columns()
    _migrate_chat_messages_columns()
