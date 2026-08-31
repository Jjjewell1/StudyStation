"""DB layer: schema bootstrap + idempotent Canvas upserts.

All writes happen in ONE transaction at the end of a run (data is pulled over
HTTP first), so a dead session mid-pull can never leave half-synced rows.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, insert

SCHEMA_PATH = Path(__file__).parent / "schema.sql"

metadata = sa.MetaData()

courses_t = sa.Table(
    "courses", metadata,
    sa.Column("id", sa.BigInteger, primary_key=True),
    sa.Column("name", sa.Text, nullable=False),
    sa.Column("course_code", sa.Text),
    sa.Column("term_name", sa.Text),
    sa.Column("term_start", sa.Date),
    sa.Column("term_end", sa.Date),
    sa.Column("start_at", sa.DateTime(timezone=True)),
    sa.Column("end_at", sa.DateTime(timezone=True)),
    sa.Column("is_active", sa.Boolean, nullable=False),
    sa.Column("raw", JSONB, nullable=False),
    sa.Column("synced_at", sa.DateTime(timezone=True)),
)

assignments_t = sa.Table(
    "assignments", metadata,
    sa.Column("id", sa.BigInteger, primary_key=True),
    sa.Column("course_id", sa.BigInteger, nullable=False),
    sa.Column("name", sa.Text, nullable=False),
    sa.Column("description_html", sa.Text),
    sa.Column("due_at", sa.DateTime(timezone=True)),
    sa.Column("unlock_at", sa.DateTime(timezone=True)),
    sa.Column("lock_at", sa.DateTime(timezone=True)),
    sa.Column("points_possible", sa.Numeric(8, 2)),
    sa.Column("submission_types", JSONB, nullable=False),
    sa.Column("html_url", sa.Text),
    sa.Column("published", sa.Boolean),
    sa.Column("raw", JSONB, nullable=False),
    sa.Column("synced_at", sa.DateTime(timezone=True)),
)

due_dates_t = sa.Table(
    "due_dates", metadata,
    sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
    sa.Column("source_type", sa.Text, nullable=False),
    sa.Column("source_id", sa.BigInteger, nullable=False),
    sa.Column("course_id", sa.BigInteger, nullable=False),
    sa.Column("title", sa.Text),
    sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("raw", JSONB, nullable=False),
    sa.UniqueConstraint("source_type", "source_id", name="due_dates_source_unique"),
)

sync_runs_t = sa.Table(
    "sync_runs", metadata,
    sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
    sa.Column("started_at", sa.DateTime(timezone=True)),
    sa.Column("finished_at", sa.DateTime(timezone=True)),
    sa.Column("status", sa.Text, nullable=False),
    sa.Column("detail", sa.Text),
    sa.Column("counts", JSONB),
)

resource_links_t = sa.Table(
    "resource_links", metadata,
    sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
    sa.Column("course_id", sa.BigInteger, nullable=False),
    sa.Column("category", sa.Text),
    sa.Column("title", sa.Text, nullable=False),
    sa.Column("url", sa.Text, nullable=False),
    sa.Column("sort_order", sa.Integer, nullable=False),
    sa.Column("synced_at", sa.DateTime(timezone=True)),
    sa.UniqueConstraint("course_id", "url", name="resource_links_course_url_unique"),
)


def make_engine(database_url: str) -> sa.Engine:
    # Plain postgresql:// makes SQLAlchemy look for psycopg2, which isn't
    # installed - force the psycopg 3 dialect explicitly.
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    # pool_pre_ping survives idle-night gaps between cron invocations
    return sa.create_engine(database_url, pool_pre_ping=True)


def get_canvas_session_override(engine: sa.Engine) -> str | None:
    """Return the dashboard-saved canvas_session.json override, if any."""
    with engine.connect() as conn:
        row = conn.execute(sa.text(
            "SELECT session_json FROM canvas_session WHERE id = 1"
        )).first()
    return row[0] if row else None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_schema(engine: sa.Engine) -> None:
    """Apply schema.sql idempotently. Statements are split on ';\n' - keep
    every semicolon at end-of-line in that file."""
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    statements = [chunk.strip() for chunk in sql.split(";\n") if chunk.strip()]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(sa.text(stmt))


def _ts(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _date(value: str | None):
    ts = _ts(value)
    return ts.date() if ts else None


def _course_row(c: dict) -> dict:
    term = c.get("term") or {}
    return {
        "id": int(c["id"]),
        "name": c.get("name") or "(unnamed course)",
        "course_code": c.get("course_code"),
        "term_name": term.get("name"),
        "term_start": _date(term.get("start_at")),
        "term_end": _date(term.get("end_at")),
        "start_at": _ts(c.get("start_at")),
        "end_at": _ts(c.get("end_at")),
        "is_active": True,
        "raw": c,
    }


def _assignment_row(course_id: int, a: dict) -> dict:
    return {
        "id": int(a["id"]),
        "course_id": course_id,
        "name": a.get("name") or "(unnamed assignment)",
        "description_html": a.get("description"),
        "due_at": _ts(a.get("due_at")),
        "unlock_at": _ts(a.get("unlock_at")),
        "lock_at": _ts(a.get("lock_at")),
        "points_possible": a.get("points_possible"),
        "submission_types": a.get("submission_types") or [],
        "html_url": a.get("html_url"),
        "published": a.get("published"),
        "raw": a,
    }


def _due_date_rows(assignments: list[dict], events: list[dict]) -> tuple[list[dict], int]:
    """Build the unified timeline. Returns (rows, skipped_count)."""
    rows: list[dict] = []
    skipped = 0
    for a in assignments:
        due = _ts(a.get("due_at"))
        if due is None:
            skipped += 1
            continue
        rows.append({
            "source_type": "assignment",
            "source_id": int(a["id"]),
            "course_id": int(a["course_id"]),
            "title": a.get("name"),
            "due_at": due,
            "raw": {"html_url": a.get("html_url")},
        })
    for e in events:
        due = _ts(e.get("end_at")) or _ts(e.get("start_at"))
        if due is None:
            skipped += 1
            continue
        try:
            src_id = int(str(e.get("id")))
        except (TypeError, ValueError):
            skipped += 1
            continue
        rows.append({
            "source_type": "calendar_event",
            "source_id": src_id,
            "course_id": int(e["course_id"]),
            "title": e.get("title"),
            "due_at": due,
            "raw": e,
        })
    return rows, skipped


def _bulk_upsert(conn: sa.Connection, table: sa.Table, rows: list[dict],
                 key_cols: list[str]) -> int:
    if not rows:
        return 0
    stmt = insert(table).values(rows)
    set_ = {
        col.name: getattr(stmt.excluded, col.name)
        for col in table.columns
        if col.name not in key_cols and not col.primary_key and col.name != "id"
    }
    # synced_at / updated-style timestamps always refresh to now()
    if "synced_at" in table.c:
        set_["synced_at"] = sa.func.now()
    stmt = stmt.on_conflict_do_update(index_elements=key_cols, set_=set_)
    conn.execute(stmt)
    return len(rows)


def write_sync(engine: sa.Engine, started_at: datetime,
               courses: list[dict], assignments: list[dict],
               events: list[dict]) -> dict:
    """Upsert everything in one transaction; append a sync_runs row."""
    course_rows = [_course_row(c) for c in courses]
    seen_course_ids = [r["id"] for r in course_rows]
    assignment_rows = [_assignment_row(a["course_id"], a) for a in assignments]
    due_rows, skipped_dues = _due_date_rows(assignments, events)

    counts = {
        "courses": len(course_rows),
        "assignments": len(assignment_rows),
        "due_dates": len(due_rows),
        "due_dates_skipped_no_time": skipped_dues,
    }

    with engine.begin() as conn:
        counts["courses_written"] = _bulk_upsert(conn, courses_t, course_rows, ["id"])
        counts["assignments_written"] = _bulk_upsert(
            conn, assignments_t, assignment_rows, ["id"]
        )
        counts["due_dates_written"] = _bulk_upsert(
            conn, due_dates_t, due_rows, ["source_type", "source_id"]
        )
        # Courses absent from this pull (dropped/concluded) get flagged, never deleted.
        if seen_course_ids:
            conn.execute(
                sa.update(courses_t)
                .where(~courses_t.c.id.in_(seen_course_ids))
                .values(is_active=False)
            )
        conn.execute(sync_runs_t.insert().values(
            started_at=started_at,
            finished_at=_utcnow(),
            status="success",
            counts=counts,
        ))
    return counts


def write_resource_links(engine: sa.Engine, rows: list[dict]) -> int:
    """Replace resource links for the given course (re-scraped each sync).

    Simple delete+insert: resource pages are tiny and fully re-scraped, so a
    clean swap avoids stale-link drift."""
    if not rows:
        return 0
    course_ids = {r["course_id"] for r in rows}
    with engine.begin() as conn:
        for cid in course_ids:
            conn.execute(
                sa.delete(resource_links_t).where(resource_links_t.c.course_id == cid)
            )
        conn.execute(resource_links_t.insert(), rows)
    return len(rows)


def record_failure(engine: sa.Engine, started_at: datetime,
                    status: str, detail: str) -> None:
    try:
        with engine.begin() as conn:
            conn.execute(sync_runs_t.insert().values(
                started_at=started_at,
                finished_at=_utcnow(),
                status=status,
                detail=detail[:2000],
            ))
    except Exception:
        pass  # failure bookkeeping must never mask the original error
