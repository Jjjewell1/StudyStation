"""Google OAuth + API service factory for the StudyStation backend.

Single-user: one stored token row (google_tokens, id=1). The OAuth flow is
authorization-code with offline access so we get a refresh token that outlives
the browser session.

Services built here (scopes configured read+write):
  - calendar  (Google Calendar)
  - tasks     (Google Tasks / "To Do")
  - people    (Contacts)
  - gmail     (Gmail, `gmail.modify` = read + mark read/unread)
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

import sqlalchemy as sa

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/contacts",
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/gmail.modify",
]

TOKEN_URI = "https://oauth2.googleapis.com/token"
AUTH_URI = "https://accounts.google.com/o/oauth2/auth"

metadata = sa.MetaData()

google_tokens_t = sa.Table(
    "google_tokens", metadata,
    sa.Column("id", sa.Integer, primary_key=True, default=1),
    sa.Column("email", sa.Text),
    sa.Column("refresh_token", sa.Text),
    sa.Column("access_token", sa.Text),
    sa.Column("token_expiry", sa.DateTime(timezone=True)),
    sa.Column("state", sa.Text),
    sa.Column("updated_at", sa.DateTime(timezone=True)),
)


class GoogleNotConfigured(RuntimeError):
    """GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set."""


class GoogleNotConnected(RuntimeError):
    """No stored Google token - user hasn't authorized yet."""


def _client_config() -> dict:
    client_id = (os.environ.get("GOOGLE_CLIENT_ID") or "").strip()
    client_secret = (os.environ.get("GOOGLE_CLIENT_SECRET") or "").strip()
    if not client_id or not client_secret:
        raise GoogleNotConfigured(
            "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set to use Google features."
        )
    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": AUTH_URI,
            "token_uri": TOKEN_URI,
        }
    }


def redirect_uri() -> str:
    return (os.environ.get("GOOGLE_REDIRECT_URI") or "").strip() or \
        "https://studystation.jewellcore.com/api/google/callback"


def ensure_schema(engine: sa.Engine) -> None:
    """Create the google_tokens table if missing (idempotent)."""
    with engine.begin() as conn:
        conn.execute(sa.text(
            "CREATE TABLE IF NOT EXISTS google_tokens ("
            "  id INTEGER PRIMARY KEY DEFAULT 1,"
            "  email TEXT,"
            "  refresh_token TEXT,"
            "  access_token TEXT,"
            "  token_expiry TIMESTAMPTZ,"
            "  state TEXT,"
            "  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()"
            ")"
        ))


def _load(engine: sa.Engine) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(
            google_tokens_t.select().where(google_tokens_t.c.id == 1)
        ).mappings().first()
    return dict(row) if row else None


def _save(engine: sa.Engine, **fields) -> None:
    fields["updated_at"] = datetime.now(timezone.utc)
    with engine.begin() as conn:
        conn.execute(
            sa.insert(google_tokens_t).values(id=1, **fields)
            .on_conflict_do_update(index_elements=["id"], set_=fields)
        )


def _upsert_field(engine: sa.Engine, field: str, value) -> None:
    with engine.begin() as conn:
        conn.execute(
            sa.update(google_tokens_t)
            .where(google_tokens_t.c.id == 1)
            .values({field: value, "updated_at": datetime.now(timezone.utc)})
        )


def build_auth_url(engine: sa.Engine) -> str:
    """Generate the Google consent URL and persist the OAuth `state`."""
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=redirect_uri())
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",  # re-consent ensures a fresh refresh token each link
        include_granted_scopes="true",
    )
    _upsert_field(engine, "state", state)
    return auth_url


def exchange_code(engine: sa.Engine, code: str, state: str | None) -> None:
    """Exchange the OAuth code for tokens and persist them."""
    stored = _load(engine) or {}
    if state and stored.get("state") and state != stored["state"]:
        raise RuntimeError("OAuth state mismatch - possible CSRF, retry the link.")
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=redirect_uri())
    flow.fetch_token(code=code)
    creds = flow.credentials
    email = creds.id_token and _email_from_id_token(creds.id_token)
    _save(
        engine,
        refresh_token=creds.refresh_token,
        access_token=creds.token,
        token_expiry=creds.expiry,
        email=email,
        state=None,
    )


def _email_from_id_token(id_token: str) -> str | None:
    try:
        import base64
        import json as _json
        payload = id_token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return _json.loads(base64.urlsafe_b64decode(payload)).get("email")
    except Exception:  # noqa: BLE001 - email is best-effort metadata
        return None


def get_credentials(engine: sa.Engine) -> Credentials:
    """Return refreshed, valid Credentials (persisting any refresh)."""
    cfg = _client_config()["web"]
    row = _load(engine)
    if not row or not row.get("refresh_token"):
        raise GoogleNotConnected("Google is not connected - visit /api/google/auth first.")
    creds = Credentials(
        token=row.get("access_token"),
        refresh_token=row["refresh_token"],
        token_uri=TOKEN_URI,
        client_id=cfg["client_id"],
        client_secret=cfg["client_secret"],
        scopes=SCOPES,
    )
    if not creds.valid:
        creds.refresh(Request())
        _save(
            engine,
            refresh_token=creds.refresh_token,
            access_token=creds.token,
            token_expiry=creds.expiry,
            email=row.get("email"),
        )
    return creds


def _build(engine: sa.Engine, name: str, version: str):
    creds = get_credentials(engine)
    return build(name, version, credentials=creds, cache_discovery=False)


def calendar_service(engine: sa.Engine):
    return _build(engine, "calendar", "v3")


def tasks_service(engine: sa.Engine):
    return _build(engine, "tasks", "v1")


def people_service(engine: sa.Engine):
    return _build(engine, "people", "v1")


def gmail_service(engine: sa.Engine):
    return _build(engine, "gmail", "v1")


def get_email(engine: sa.Engine) -> str | None:
    row = _load(engine)
    if row and row.get("email"):
        return row["email"]
    # Fall back to the Gmail profile when email wasn't captured at link time.
    try:
        profile = gmail_service(engine).users().getProfile(userId="me").execute()
        email = profile.get("emailAddress")
        if email:
            _upsert_field(engine, "email", email)
        return email
    except Exception:  # noqa: BLE001
        return None


def is_connected(engine: sa.Engine) -> bool:
    row = _load(engine)
    return bool(row and row.get("refresh_token"))


def disconnect(engine: sa.Engine) -> None:
    with engine.begin() as conn:
        conn.execute(google_tokens_t.delete().where(google_tokens_t.c.id == 1))
