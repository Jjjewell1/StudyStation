"""StudyStation nightly sync: Canvas -> Postgres.

Pulls (full pagination @100/page):
  - /api/v1/courses?enrollment_state=active
  - /api/v1/courses/:id/assignments
  - /api/v1/courses/:id/calendar_events (windowed)

Then upserts everything in one transaction.

Exit codes:
  0 = synced OK
  1 = unexpected failure (details in log + sync_runs table)
  2 = Canvas session expired -> rerun capture_session.py on the dev PC
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import db  # noqa: E402
from config import Config  # noqa: E402
from studystation.resources import extract_links, is_resource_course  # noqa: E402
from studystation.session import (  # noqa: E402
    PER_PAGE,
    SessionExpired,
    api_get,
    canvas_base_url,
    iter_pages,
    open_canvas_request,
)

BANNER = r"""
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!! CANVAS SESSION EXPIRED                                   !!
!! The captured login was rejected by Canvas.               !!
!! FIX: run `python capture_session.py` on your PC, then    !!
!!      paste the new canvas_session.json into Coolify env  !!
!!      CANVAS_SESSION_JSON and redeploy.                   !!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
"""


def pull_everything(
    cfg: Config, session_override: str | None = None
) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    """HTTP phase: fetch all data into memory. Raises SessionExpired."""
    today = datetime.now(timezone.utc).date()
    window_start = (today - timedelta(days=cfg.cal_window_days_back)).isoformat()
    window_end = (today - timedelta(days=cfg.cal_window_days_ahead)).isoformat()

    courses: list[dict] = []
    assignments: list[dict] = []
    events: list[dict] = []
    resource_links: list[dict] = []

    with open_canvas_request(session_override) as ctx:
        for c in iter_pages(
            ctx,
            "/api/v1/courses",
            params={"enrollment_state": "active", "include[]": "term"},
        ):
            courses.append(c)
        log.info("Pulled %d active course(s)", len(courses))

        for c in courses:
            cid = int(c["id"])
            cname = c.get("name") or f"course {cid}"

            n_assign = 0
            for a in iter_pages(ctx, f"/api/v1/courses/{cid}/assignments"):
                a["course_id"] = cid  # attached here; API omits it on this endpoint
                assignments.append(a)
                n_assign += 1
            log.info("  %-40s assignments: %d", cname[:40], n_assign)

            # Resource hub courses (e.g. SWCC Resources) expose curated links
            # through module pages instead of assignments.
            if is_resource_course(c.get("name")):
                resource_links += pull_resource_links(ctx, cid, cname)

        # VCCS 404s the per-course calendar_events endpoint entirely; the
        # account-level route with context_codes[] filters works fine and
        # covers every course in one paginated call.
        query = [
            ("type", "event"),  # assignment-type events would duplicate rows
            ("start_date", window_start),
            ("end_date", window_end),
            ("per_page", str(PER_PAGE)),
        ]
        query += [("context_codes[]", f"course_{int(c['id'])}") for c in courses]
        cal_url = "/api/v1/calendar_events?" + urlencode(query)
        for e in iter_pages(ctx, cal_url):
            cc = e.get("context_code") or ""
            if cc.startswith("course_"):
                try:
                    e["course_id"] = int(cc.split("_", 1)[1])
                except ValueError:
                    continue
                events.append(e)
        log.info("Calendar events (%s..%s): %d", window_start, window_end, len(events))

    return courses, assignments, events, resource_links


def pull_resource_links(ctx, cid: int, cname: str) -> list[dict]:
    """Scrape link pages from a resource course's modules into flat rows."""
    rows: list[dict] = []
    try:
        modules = api_get(ctx, f"/api/v1/courses/{cid}/modules", params={"include[]": "items"})
    except Exception as exc:  # noqa: BLE001 - a dead resource hub shouldn't fail the sync
        log.warning("  resource modules for %s failed: %s", cname, exc)
        return rows

    order = 0
    for mod in modules:
        for item in (mod or {}).get("items", []) or []:
            if (item or {}).get("type") != "Page":
                continue
            page_name = item.get("title")
            if not page_name:
                continue
            try:
                page = api_get(ctx, f"/api/v1/courses/{cid}/pages/{page_name}")
            except Exception as exc:  # noqa: BLE001
                log.warning("  resource page %r failed: %s", page_name, exc)
                continue
            body = (page or {}).get("body", "")
            for link in extract_links(body):
                rows.append({
                    "course_id": cid,
                    "category": page_name,
                    "title": link["title"],
                    "url": link["url"],
                    "sort_order": order,
                })
                order += 1
    log.info("  %-40s resource links: %d", cname[:40], len(rows))
    return rows


def main() -> int:
    started_at = datetime.now(timezone.utc)
    try:
        cfg = Config.from_env()
    except RuntimeError as exc:
        print(f"CONFIG ERROR: {exc}", file=sys.stderr)
        return 1

    logging.basicConfig(
        level=cfg.log_level,
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    log.setLevel(cfg.log_level)

    if not cfg.canvas_base_url:
        log.critical("CANVAS_BASE_URL is not set")
        return 1

    engine = None
    try:
        engine = db.make_engine(cfg.database_url)
        db.ensure_schema(engine)
        log.info("Schema OK (pgvector + tables verified)")

        # A self-service session saved from the dashboard wins over the env var.
        session_override = db.get_canvas_session_override(engine)
        if session_override:
            log.info("Using dashboard-saved Canvas session override")

        courses, assignments, events, resource_links = pull_everything(cfg, session_override)
        if not courses:
            log.warning("No active courses returned - nothing to sync. "
                        "Check enrollment_state or the account used to capture the session.")

        counts = db.write_sync(engine, started_at, courses, assignments, events)
        n_links = db.write_resource_links(engine, resource_links)
        counts["resource_links"] = n_links
        log.info("SYNC COMPLETE in %.1fs: %s",
                 (datetime.now(timezone.utc) - started_at).total_seconds(), counts)
        return 0

    except SessionExpired as exc:
        log.error(exc)
        print(BANNER, file=sys.stderr)
        if engine is not None:
            db.record_failure(engine, started_at, "session_expired", str(exc))
        return 2

    except Exception:
        log.exception("Sync failed with an unexpected error")
        if engine is not None:
            db.record_failure(engine, started_at, "failed",
                              logging.Formatter().formatException(sys.exc_info()))
        return 1


log = logging.getLogger("sync")

if __name__ == "__main__":
    sys.exit(main())
