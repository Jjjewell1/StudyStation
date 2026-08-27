"""Read-only DB access for the dashboard API.

The sync job owns all writes (and the schema). This module only SELECTs the
shape the frontend expects:

  Course     -> { id, name, term, progress }
  Assignment -> { id, courseId, name, dueAt, points, status }
"""

from __future__ import annotations

import re

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert

metadata = sa.MetaData()

courses_t = sa.Table(
    "courses", metadata,
    sa.Column("id", sa.BigInteger),
    sa.Column("name", sa.Text),
    sa.Column("course_code", sa.Text),
    sa.Column("term_name", sa.Text),
    sa.Column("is_active", sa.Boolean),
    sa.Column("user_dropped", sa.Boolean),
)

course_drops_t = sa.Table(
    "course_drops", metadata,
    sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
    sa.Column("course_id", sa.BigInteger),
    sa.Column("name", sa.Text),
    sa.Column("dropped_at", sa.DateTime(timezone=True)),
    sa.Column("restored_at", sa.DateTime(timezone=True)),
)

assignments_t = sa.Table(
    "assignments", metadata,
    sa.Column("id", sa.BigInteger),
    sa.Column("course_id", sa.BigInteger),
    sa.Column("name", sa.Text),
    sa.Column("due_at", sa.DateTime(timezone=True)),
    sa.Column("points_possible", sa.Numeric(8, 2)),
    sa.Column("html_url", sa.Text),
)

assignment_status_t = sa.Table(
    "assignment_status", metadata,
    sa.Column("assignment_id", sa.BigInteger),
    sa.Column("status", sa.Text),
    sa.Column("notes", sa.Text),
    sa.Column("updated_by", sa.Text),
    sa.Column("updated_at", sa.DateTime(timezone=True)),
)

resource_links_t = sa.Table(
    "resource_links", metadata,
    sa.Column("course_id", sa.BigInteger),
    sa.Column("category", sa.Text),
    sa.Column("title", sa.Text),
    sa.Column("url", sa.Text),
    sa.Column("sort_order", sa.Integer),
)

sync_runs_t = sa.Table(
    "sync_runs", metadata,
    sa.Column("id", sa.BigInteger),
    sa.Column("started_at", sa.DateTime(timezone=True)),
    sa.Column("finished_at", sa.DateTime(timezone=True)),
    sa.Column("status", sa.Text),
    sa.Column("detail", sa.Text),
    sa.Column("counts", sa.JSON),
)


def make_engine(database_url: str) -> sa.Engine:
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return sa.create_engine(database_url, pool_pre_ping=True)


def ensure_schema(engine: sa.Engine) -> None:
    """Create dashboard-owned tables/columns (idempotent).

    The sync job owns the core schema; this only adds the pieces the dashboard
    owns: courses.user_dropped (manual hide) and the course_drops audit log."""
    with engine.begin() as conn:
        conn.execute(sa.text(
            "ALTER TABLE courses ADD COLUMN IF NOT EXISTS user_dropped "
            "BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        conn.execute(sa.text(
            "CREATE TABLE IF NOT EXISTS course_drops ("
            "  id BIGSERIAL PRIMARY KEY,"
            "  course_id BIGINT NOT NULL,"
            "  name TEXT NOT NULL,"
            "  dropped_at TIMESTAMPTZ NOT NULL DEFAULT now(),"
            "  restored_at TIMESTAMPTZ"
            ")"
        ))


def _iso(dt) -> str | None:
    # Serialize tz-aware datetimes to the ISO string the frontend parses.
    return dt.isoformat() if dt is not None else None


def _short_label(code: str | None, name: str) -> str:
    """Compact display label, e.g. 'SW294.ITE.140.W1.FA26' -> 'ITE - 140'.

    Canvas course_code is a dotted SIS string; extract the subject token +
    numeric token. Falls back to the course name when there's no numeric part
    (e.g. 'SWCC Resources')."""
    if not code:
        return name
    parts = code.split(".")
    for i, tok in enumerate(parts):
        if tok.isalpha() and 2 <= len(tok) <= 5 and i + 1 < len(parts) and parts[i + 1].isdigit():
            return f"{tok} - {parts[i + 1]}"
    return name


def _subtext(code: str | None, name: str) -> str:
    """Course name minus its leading 'SUBJ NNN' prefix.

    e.g. 'ITN 106 Microcomputer Operating System' -> 'Microcomputer Operating
    System'. Falls back to the full name when there's no subject+number token
    (or the name doesn't carry the prefix, e.g. 'English 111')."""
    if not code:
        return name
    parts = code.split(".")
    for i, tok in enumerate(parts):
        if tok.isalpha() and 2 <= len(tok) <= 5 and i + 1 < len(parts) and parts[i + 1].isdigit():
            prefix = f"{tok} {parts[i + 1]}"
            # strip "SUBJ NNN" (space or dash) from the start of the name
            m = re.match(rf"^\s*{re.escape(tok)}\s*[- ]\s*{re.escape(parts[i + 1])}\s*[-:]*\s*", name, re.IGNORECASE)
            if m:
                stripped = name[m.end():].strip()
                if stripped:
                    return stripped
            return name
    return name


def fetch_courses(engine: sa.Engine) -> list[dict]:
    """Active courses with progress = submitted/total assignments (0-100)."""
    submitted = (
        sa.select(
            assignments_t.c.course_id,
            sa.func.count().label("n"),
        )
        .select_from(
            assignments_t.outerjoin(
                assignment_status_t,
                assignment_status_t.c.assignment_id == assignments_t.c.id,
            )
        )
        .where(assignment_status_t.c.status == "submitted")
        .group_by(assignments_t.c.course_id)
        .subquery()
    )

    stmt = (
        sa.select(
            courses_t.c.id,
            courses_t.c.name,
            courses_t.c.course_code,
            courses_t.c.term_name,
            sa.func.count(assignments_t.c.id).label("total"),
            sa.func.coalesce(submitted.c.n, 0).label("done"),
        )
        .select_from(
            courses_t.outerjoin(
                assignments_t, assignments_t.c.course_id == courses_t.c.id
            ).outerjoin(submitted, submitted.c.course_id == courses_t.c.id)
        )
        .where(
            courses_t.c.is_active.is_(True),
            sa.func.coalesce(courses_t.c.user_dropped, False).is_(False),
            # Resource-hub courses (e.g. SWCC Resources) aren't real classes;
            # their links surface via /api/resources instead.
            ~courses_t.c.name.ilike("%resource%"),
        )
        .group_by(courses_t.c.id, courses_t.c.name, courses_t.c.course_code, courses_t.c.term_name, submitted.c.n)
        .order_by(courses_t.c.name)
    )

    with engine.connect() as conn:
        rows = conn.execute(stmt).mappings().all()

    out = []
    for r in rows:
        total = int(r["total"] or 0)
        done = int(r["done"] or 0)
        progress = round(done / total * 100) if total else 0
        out.append({
            "id": str(r["id"]),
            "name": r["name"],
            "code": r["course_code"],
            "short": _short_label(r["course_code"], r["name"]),
            "subtext": _subtext(r["course_code"], r["name"]),
            "term": r["term_name"] or "",
            "progress": progress,
        })
    return out


def fetch_resource_links(engine: sa.Engine) -> list[dict]:
    """Curated links from resource-hub courses, grouped by category."""
    stmt = (
        sa.select(
            resource_links_t.c.category,
            resource_links_t.c.title,
            resource_links_t.c.url,
        )
        .order_by(resource_links_t.c.category, resource_links_t.c.sort_order)
    )
    with engine.connect() as conn:
        rows = conn.execute(stmt).mappings().all()

    groups: dict[str, list[dict]] = {}
    for r in rows:
        cat = r["category"] or "Other"
        groups.setdefault(cat, []).append({"title": r["title"], "url": r["url"]})
    return [{"category": k, "links": v} for k, v in groups.items()]


def fetch_assignments(engine: sa.Engine) -> list[dict]:
    """Assignments for ACTIVE courses, joined with local study status.

    Joining courses_t and filtering is_active ensures assignments for dropped
    courses (e.g. a class you withdrew from) disappear alongside the course."""
    stmt = (
        sa.select(
            assignments_t.c.id,
            assignments_t.c.course_id,
            assignments_t.c.name,
            assignments_t.c.due_at,
            assignments_t.c.points_possible,
            assignments_t.c.html_url,
            sa.func.coalesce(assignment_status_t.c.status, "not_started").label("status"),
        )
        .select_from(
            assignments_t
            .join(courses_t, courses_t.c.id == assignments_t.c.course_id)
            .outerjoin(
                assignment_status_t,
                assignment_status_t.c.assignment_id == assignments_t.c.id,
            )
        )
        .where(
            courses_t.c.is_active.is_(True),
            sa.func.coalesce(courses_t.c.user_dropped, False).is_(False),
        )
        .order_by(assignments_t.c.due_at.asc().nulls_last(), assignments_t.c.name)
    )

    with engine.connect() as conn:
        rows = conn.execute(stmt).mappings().all()

    return [
        {
            "id": str(r["id"]),
            "courseId": str(r["course_id"]),
            "name": r["name"],
            "dueAt": _iso(r["due_at"]),
            "points": float(r["points_possible"] or 0),
            "status": r["status"],
            "url": r["html_url"],
        }
        for r in rows
    ]


VALID_STATUSES = ("not_started", "drafted", "submitted")


def set_assignment_status(engine: sa.Engine, assignment_id: int, status: str) -> str:
    """Upsert the local study status for an assignment. Returns the status.

    This is the one table the sync job deliberately never touches, so the
    dashboard owns it. status is one of not_started/drafted/submitted."""
    if status not in VALID_STATUSES:
        raise ValueError(f"invalid status {status!r} (expected one of {VALID_STATUSES})")
    with engine.begin() as conn:
        conn.execute(
            pg_insert(assignment_status_t).values(
                assignment_id=assignment_id,
                status=status,
                updated_by="dashboard",
                updated_at=sa.func.now(),
            ).on_conflict_do_update(
                index_elements=["assignment_id"],
                set_={"status": status, "updated_by": "dashboard", "updated_at": sa.func.now()},
            )
        )
    return status


def drop_course(engine: sa.Engine, course_id: int) -> str:
    """Manually hide a course (user_dropped=True) and append a log entry."""
    with engine.begin() as conn:
        row = conn.execute(
            sa.select(courses_t.c.name).where(courses_t.c.id == course_id)
        ).first()
        if not row:
            raise ValueError(f"course {course_id} not found")
        name = row[0]
        conn.execute(
            sa.update(courses_t)
            .where(courses_t.c.id == course_id)
            .values(user_dropped=True)
        )
        conn.execute(course_drops_t.insert().values(
            course_id=course_id, name=name, dropped_at=sa.func.now(),
        ))
    return name


def restore_course(engine: sa.Engine, course_id: int) -> str:
    """Re-show a manually dropped course and stamp the log entry restored."""
    with engine.begin() as conn:
        row = conn.execute(
            sa.select(courses_t.c.name).where(courses_t.c.id == course_id)
        ).first()
        if not row:
            raise ValueError(f"course {course_id} not found")
        name = row[0]
        conn.execute(
            sa.update(courses_t)
            .where(courses_t.c.id == course_id)
            .values(user_dropped=False)
        )
        # Mark the most recent open drop entry as restored.
        conn.execute(
            sa.update(course_drops_t)
            .where(course_drops_t.c.course_id == course_id, course_drops_t.c.restored_at.is_(None))
            .values(restored_at=sa.func.now())
        )
    return name


def fetch_drop_log(engine: sa.Engine) -> list[dict]:
    stmt = (
        sa.select(
            course_drops_t.c.course_id,
            course_drops_t.c.name,
            course_drops_t.c.dropped_at,
            course_drops_t.c.restored_at,
        )
        .order_by(course_drops_t.c.dropped_at.desc())
    )
    with engine.connect() as conn:
        rows = conn.execute(stmt).mappings().all()
    return [
        {
            "courseId": str(r["course_id"]),
            "name": r["name"],
            "droppedAt": _iso(r["dropped_at"]),
            "restoredAt": _iso(r["restored_at"]),
            "dropped": r["restored_at"] is None,
        }
        for r in rows
    ]


def fetch_dropped_courses(engine: sa.Engine) -> list[dict]:
    """Courses the user manually hid, with a short label for the settings UI."""
    stmt = (
        sa.select(
            courses_t.c.id,
            courses_t.c.name,
            courses_t.c.course_code,
            courses_t.c.term_name,
        )
        .where(sa.func.coalesce(courses_t.c.user_dropped, False).is_(True))
        .order_by(courses_t.c.name)
    )
    with engine.connect() as conn:
        rows = conn.execute(stmt).mappings().all()
    return [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "short": _short_label(r["course_code"], r["name"]),
            "term": r["term_name"] or "",
        }
        for r in rows
    ]


def fetch_last_sync(engine: sa.Engine) -> dict | None:
    stmt = (
        sa.select(
            sync_runs_t.c.started_at,
            sync_runs_t.c.finished_at,
            sync_runs_t.c.status,
            sync_runs_t.c.detail,
            sync_runs_t.c.counts,
        )
        .order_by(sync_runs_t.c.id.desc())
        .limit(1)
    )
    with engine.connect() as conn:
        row = conn.execute(stmt).mappings().first()
    if not row:
        return None
    return {
        "startedAt": _iso(row["started_at"]),
        "finishedAt": _iso(row["finished_at"]),
        "status": row["status"],
        "detail": row["detail"],
        "counts": row["counts"],
    }
