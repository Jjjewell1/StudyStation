"""Google OAuth + API service factory for the StudyStation backend.

Multi-user: tokens are stored keyed by the connected Google email, so a new
user just signs in with their account (the OAuth client is configured once by
the app owner via GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).

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
from sqlalchemy.dialects.postgresql import insert as pg_insert

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
    sa.Column("email", sa.Text, primary_key=True),
    sa.Column("refresh_token", sa.Text),
    sa.Column("access_token", sa.Text),
    sa.Column("token_expiry", sa.DateTime(timezone=True)),
    sa.Column("updated_at", sa.DateTime(timezone=True)),
)

google_state_t = sa.Table(
    "google_state", metadata,
    sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
    sa.Column("state", sa.Text),
    sa.Column("created_at", sa.DateTime(timezone=True)),
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
    """Create the google_tokens + google_state tables if missing (idempotent)."""
    with engine.begin() as conn:
        conn.execute(sa.text(
            "CREATE TABLE IF NOT EXISTS google_tokens ("
            "  email TEXT PRIMARY KEY,"
            "  refresh_token TEXT,"
            "  access_token TEXT,"
            "  token_expiry TIMESTAMPTZ,"
            "  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()"
            ")"
        ))
        # google_state started as a single row (id INTEGER PK DEFAULT 1); the
        # OAuth `state` from parallel/retried connect flows clobbered each
        # other, causing CSRF-looking mismatches on callback. It's now a
        # time-expiring queue keyed by the state value, carrying the PKCE
        # code_verifier so the callback can finish the token exchange.
        has_state_queue = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'google_state' AND column_name = 'created_at'"
        )).first()
        if not has_state_queue:
            conn.execute(sa.text("DROP TABLE IF EXISTS google_state"))
            conn.execute(sa.text(
                "CREATE TABLE google_state ("
                "  id BIGSERIAL PRIMARY KEY,"
                "  state TEXT NOT NULL,"
                "  verifier TEXT,"
                "  created_at TIMESTAMPTZ NOT NULL DEFAULT now()"
                ")"
            ))
        has_verifier = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'google_state' AND column_name = 'verifier'"
        )).first()
        if not has_verifier:
            conn.execute(sa.text("ALTER TABLE google_state ADD COLUMN verifier TEXT"))
        conn.execute(sa.text(
            "CREATE INDEX IF NOT EXISTS idx_google_state_lookup ON google_state(state)"
        ))


def _load(engine: sa.Engine, email: str | None = None) -> dict | None:
    with engine.connect() as conn:
        if email:
            row = conn.execute(
                google_tokens_t.select().where(google_tokens_t.c.email == email)
            ).mappings().first()
        else:
            # Default account = most recently updated.
            row = conn.execute(
                google_tokens_t.select().order_by(google_tokens_t.c.updated_at.desc()).limit(1)
            ).mappings().first()
    return dict(row) if row else None


def _save(engine: sa.Engine, email: str, **fields) -> None:
    fields["updated_at"] = datetime.now(timezone.utc)
    with engine.begin() as conn:
        conn.execute(
            pg_insert(google_tokens_t).values(email=email, **fields)
            .on_conflict_do_update(index_elements=["email"], set_=fields)
        )


def _upsert_field(engine: sa.Engine, email: str, field: str, value) -> None:
    with engine.begin() as conn:
        conn.execute(
            sa.update(google_tokens_t)
            .where(google_tokens_t.c.email == email)
            .values({field: value, "updated_at": datetime.now(timezone.utc)})
        )


STATE_TTL_MINUTES = 15


def _set_state(engine: sa.Engine, state: str | None, verifier: str | None = None) -> None:
    """Queue a fresh OAuth state + PKCE verifier (multi-row; old ones expire)."""
    if not state:
        return
    with engine.begin() as conn:
        conn.execute(
            sa.text("INSERT INTO google_state (state, verifier) VALUES (:s, :v)"),
            {"s": state, "v": verifier},
        )
        conn.execute(
            sa.text("DELETE FROM google_state WHERE created_at < now() - interval '15 minutes'")
        )


def _take_state(engine: sa.Engine, state: str) -> str | None | False:
    """Validate + consume one queued state value.

    Returns its code_verifier (or None), or False when the state was never
    queued (or already used)."""
    with engine.begin() as conn:
        row = conn.execute(
            sa.text("DELETE FROM google_state WHERE state = :s RETURNING verifier"),
            {"s": state},
        ).first()
    return row[0] if row else False


def build_auth_url(engine: sa.Engine) -> str:
    """Generate the Google consent URL and persist the OAuth `state`.

    google-auth-oauthlib autogenerates a PKCE code_verifier when building the
    consent URL (which is why the URL carries a S256 code_challenge). The
    verifier only exists on the Flow object, so it's stored with the state to
    complete the token exchange on the other side."""
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=redirect_uri())
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",  # re-consent ensures a fresh refresh token each link
        include_granted_scopes="true",
    )
    _set_state(engine, state, getattr(flow, "code_verifier", None))
    return auth_url


def exchange_code(engine: sa.Engine, code: str, state: str | None) -> str:
    """Exchange the OAuth code for tokens, persist keyed by email.

    The `state` must have been queued by build_auth_url; it's consumed (one
    use only) so a replay or stale callback can't pass validation. The PKCE
    code_verifier captured at consent-URL build time is restored onto a fresh
    Flow so Google accepts the exchange."""
    verifier = _take_state(engine, state) if state else False
    if verifier is False:
        raise RuntimeError("OAuth state mismatch - possible CSRF, retry the link.")
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=redirect_uri())
    if verifier:
        flow.code_verifier = verifier
    flow.fetch_token(code=code)
    creds = flow.credentials
    email = creds.id_token and _email_from_id_token(creds.id_token)
    if not email:
        email = _email_from_tokeninfo(creds.token)
    if not email:
        raise RuntimeError("could not determine the Google account email")
    _save(
        engine,
        email,
        refresh_token=creds.refresh_token,
        access_token=creds.token,
        token_expiry=creds.expiry,
    )
    return email


def _email_from_id_token(id_token: str) -> str | None:
    try:
        import base64
        import json as _json
        payload = id_token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return _json.loads(base64.urlsafe_b64decode(payload)).get("email")
    except Exception:  # noqa: BLE001 - email is best-effort metadata
        return None


def _email_from_tokeninfo(access_token: str) -> str | None:
    try:
        import json as _json
        import urllib.request
        url = f"https://oauth2.googleapis.com/tokeninfo?access_token={access_token}"
        with urllib.request.urlopen(url, timeout=10) as resp:
            return _json.loads(resp.read().decode("utf-8")).get("email")
    except Exception:  # noqa: BLE001
        return None


def get_credentials(engine: sa.Engine, email: str | None = None) -> Credentials:
    """Return refreshed, valid Credentials (persisting any refresh)."""
    cfg = _client_config()["web"]
    row = _load(engine, email)
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
            row["email"],
            refresh_token=creds.refresh_token,
            access_token=creds.token,
            token_expiry=creds.expiry,
        )
    return creds


def _build(engine: sa.Engine, name: str, version: str, email: str | None = None):
    creds = get_credentials(engine, email)
    return build(name, version, credentials=creds, cache_discovery=False)


def calendar_service(engine: sa.Engine, email: str | None = None):
    return _build(engine, "calendar", "v3", email)


def tasks_service(engine: sa.Engine, email: str | None = None):
    return _build(engine, "tasks", "v1", email)


def people_service(engine: sa.Engine, email: str | None = None):
    return _build(engine, "people", "v1", email)


def gmail_service(engine: sa.Engine, email: str | None = None):
    return _build(engine, "gmail", "v1", email)


def connected_emails(engine: sa.Engine) -> list[str]:
    with engine.connect() as conn:
        rows = conn.execute(
            sa.select(google_tokens_t.c.email).order_by(google_tokens_t.c.updated_at.desc())
        ).all()
    return [r[0] for r in rows]


def default_email(engine: sa.Engine) -> str | None:
    row = _load(engine)
    return row["email"] if row else None


def is_connected(engine: sa.Engine) -> bool:
    row = _load(engine)
    return bool(row and row.get("refresh_token"))


def disconnect(engine: sa.Engine, email: str | None = None) -> None:
    with engine.begin() as conn:
        if email:
            conn.execute(google_tokens_t.delete().where(google_tokens_t.c.email == email))
        else:
            conn.execute(google_tokens_t.delete())
