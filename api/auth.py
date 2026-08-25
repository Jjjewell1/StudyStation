"""PIN-based authentication for the StudyStation dashboard.

Single-user: a shared PIN (ACCESS_PIN env) unlocks a session token stored in
the auth_sessions table. The frontend sends it as `Authorization: Bearer ...`.
If ACCESS_PIN is unset, auth is disabled (open mode).
"""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa

SESSION_DAYS = 30

metadata = sa.MetaData()

auth_sessions_t = sa.Table(
    "auth_sessions", metadata,
    sa.Column("token", sa.Text, primary_key=True),
    sa.Column("created_at", sa.DateTime(timezone=True)),
    sa.Column("expires_at", sa.DateTime(timezone=True)),
)


def access_pin() -> str:
    return (os.environ.get("ACCESS_PIN") or "").strip()


def pin_required() -> bool:
    return bool(access_pin())


def ensure_schema(engine: sa.Engine) -> None:
    with engine.begin() as conn:
        conn.execute(sa.text(
            "CREATE TABLE IF NOT EXISTS auth_sessions ("
            "  token TEXT PRIMARY KEY,"
            "  created_at TIMESTAMPTZ NOT NULL,"
            "  expires_at TIMESTAMPTZ NOT NULL"
            ")"
        ))


def create_session(engine: sa.Engine, pin: str) -> str:
    if not pin_required():
        raise RuntimeError("ACCESS_PIN is not set")
    if not secrets.compare_digest(pin, access_pin()):
        raise PermissionError("incorrect pin")
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    with engine.begin() as conn:
        conn.execute(auth_sessions_t.insert().values(
            token=token,
            created_at=now,
            expires_at=now + timedelta(days=SESSION_DAYS),
        ))
    return token


def validate(engine: sa.Engine, token: str) -> bool:
    if not token:
        return False
    now = datetime.now(timezone.utc)
    with engine.begin() as conn:
        # prune expired sessions opportunistically
        conn.execute(sa.delete(auth_sessions_t).where(auth_sessions_t.c.expires_at < now))
        row = conn.execute(
            auth_sessions_t.select().where(auth_sessions_t.c.token == token)
        ).first()
    return row is not None


def revoke(engine: sa.Engine, token: str) -> None:
    with engine.begin() as conn:
        conn.execute(sa.delete(auth_sessions_t).where(auth_sessions_t.c.token == token))
