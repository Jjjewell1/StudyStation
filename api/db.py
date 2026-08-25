"""Read-only DB access for the dashboard API.

The sync job owns all writes (and the schema). This module only SELECTs the
shape the frontend expects:

  Course     -> { id, name, term, progress }
  Assignment -> { id, courseId, name, dueAt, points, status }
"""

from __future__ import annotations

import sqlalchemy as sa

metadata = sa.MetaData()

courses_t = sa.Table(
    "courses", metadata,
    sa.Column("id", sa.BigInteger),
    sa.Column("name", sa.Text),
    sa.Column("course_code", sa.Text),
    sa.Column("term_name", sa.Text),
    sa.Column("is_active", sa.Boolean),
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
)


def make_engine(database_url: str) -> sa.Engine:
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return sa.create_engine(database_url, pool_pre_ping=True)


def _iso(dt) -> str | None:
    # Serialize tz-aware datetimes to the ISO string the frontend parses.
    return dt.isoformat() if dt is not None else None


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
        .where(courses_t.c.is_active.is_(True))
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
            "term": r["term_name"] or "",
            "progress": progress,
        })
    return out


def fetch_assignments(engine: sa.Engine) -> list[dict]:
    """All assignments joined with local study status (default not_started)."""
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
            assignments_t.outerjoin(
                assignment_status_t,
                assignment_status_t.c.assignment_id == assignments_t.c.id,
            )
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
