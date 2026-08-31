"""StudyStation dashboard API.

Read-only REST endpoints over the Postgres data populated by the nightly
Canvas sync. FastAPI + SQLAlchemy Core (psycopg3).

Routes (all served under /api by nginx):
  GET /api/courses     -> [{ id, name, term, progress }]
  GET /api/assignments -> [{ id, courseId, name, dueAt, points, status }]
  GET /api/health      -> {"status":"ok"}
"""

from __future__ import annotations

import os
import urllib.request

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from db import (
    drop_course,
    fetch_assignments,
    fetch_courses,
    fetch_dropped_courses,
    fetch_drop_log,
    fetch_last_sync,
    fetch_resource_links,
    get_canvas_session,
    make_engine,
    restore_course,
    set_assignment_status,
    set_canvas_session,
)
import db as db_module
import auth
import gemini
import google_client
import google_routes
import docs_routes

DATABASE_URL = (os.environ.get("DATABASE_URL") or "").strip()
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

engine = make_engine(DATABASE_URL)

app = FastAPI(title="StudyStation API", version="0.1.0")
app.state.engine = engine
app.include_router(google_routes.router)
app.include_router(docs_routes.router)

# Paths that bypass PIN auth (login itself, health, and the Google OAuth
# callback which is hit by an external browser redirect without our header).
_PUBLIC_PATHS = {"/api/auth/login", "/api/health", "/api/google/callback"}


def _bearer(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return ""


@app.middleware("http")
async def pin_auth_middleware(request: Request, call_next):
    if not auth.pin_required() or request.url.path in _PUBLIC_PATHS:
        return await call_next(request)
    token = _bearer(request)
    if not auth.validate(engine, token):
        return JSONResponse({"detail": "unauthorized"}, status_code=401)
    return await call_next(request)


@app.on_event("startup")
def _startup() -> None:
    # Ensure owned tables exist before any request touches them.
    google_client.ensure_schema(engine)
    auth.ensure_schema(engine)
    db_module.ensure_schema(engine)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(body: dict):
    pin = (body or {}).get("pin", "")
    try:
        token = auth.create_session(engine, pin)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"token": token}


@app.get("/api/auth/status")
def auth_status(request: Request) -> dict:
    return {
        "pinRequired": auth.pin_required(),
        "authenticated": not auth.pin_required() or auth.validate(engine, _bearer(request)),
    }


@app.post("/api/auth/logout")
def logout(request: Request) -> dict:
    token = _bearer(request)
    if token:
        auth.revoke(engine, token)
    return {"authenticated": False}


@app.get("/api/sync/status")
def sync_status() -> dict:
    last = fetch_last_sync(engine)
    return {"last": last, "triggerAvailable": True}


@app.post("/api/sync")
def sync_now() -> dict:
    """Fire an on-demand Canvas sync via the sync container's trigger server."""
    url = os.environ.get("SYNC_TRIGGER_URL", "http://sync:8000/sync")
    try:
        req = urllib.request.Request(url, method="POST")
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"sync trigger failed: {exc}") from exc
    try:
        import json
        return json.loads(body)
    except Exception:  # noqa: BLE001
        return {"started": True, "raw": body[:1000]}


@app.get("/api/sync/session")
def canvas_session_status() -> dict:
    raw = get_canvas_session(engine)
    if not raw:
        return {"set": False, "cookies": 0}
    try:
        cookies = ((json.loads(raw) or {}).get("cookies") or [])
    except Exception:  # noqa: BLE001 - stored override is corrupt; UI will show it
        cookies = []
    return {"set": True, "cookies": len(cookies) if isinstance(cookies, list) else 0}


@app.post("/api/sync/session")
def canvas_session_upload(body: dict) -> dict:
    """Save (or clear) the self-service Canvas session override.

    session_json is the full minified JSON from capture_session.py. Empty
    string / None clears the override and reverts to CANVAS_SESSION_JSON.
    """
    raw = (body or {}).get("session_json")
    if raw is None:
        set_canvas_session(engine, None)
        return {"set": False, "cookies": 0}
    raw = str(raw).strip()
    if not raw:
        raise HTTPException(status_code=400, detail="session_json must not be empty")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Not valid JSON - paste the whole minified canvas_session.json "
                   "(it must start with { and end with }).",
        )
    cookies = (data or {}).get("cookies")
    if not isinstance(cookies, list) or not cookies:
        raise HTTPException(
            status_code=400,
            detail="storage_state must contain a non-empty 'cookies' list - "
                   "re-capture with capture_session.py.",
        )
    updated_at = set_canvas_session(engine, raw)
    return {"set": True, "cookies": len(cookies), "updatedAt": updated_at}


@app.get("/api/courses")
def courses() -> list[dict]:
    try:
        return fetch_courses(engine)
    except Exception as exc:  # noqa: BLE001 - surface as clean 500 to the UI
        raise HTTPException(status_code=500, detail=f"courses query failed: {exc}") from exc


@app.get("/api/assignments")
def assignments() -> list[dict]:
    try:
        return fetch_assignments(engine)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"assignments query failed: {exc}") from exc


@app.patch("/api/assignments/{assignment_id}/status")
def update_assignment_status(assignment_id: int, body: dict):
    status = (body or {}).get("status")
    try:
        result = set_assignment_status(engine, assignment_id, status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"status update failed: {exc}") from exc
    return {"id": str(assignment_id), "status": result}


@app.get("/api/resources")
def resources() -> list[dict]:
    try:
        return fetch_resource_links(engine)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"resources query failed: {exc}") from exc


@app.get("/api/courses/dropped")
def dropped_courses() -> dict:
    try:
        return {
            "dropped": fetch_dropped_courses(engine),
            "log": fetch_drop_log(engine),
        }
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"dropped courses failed: {exc}") from exc


@app.post("/api/courses/{course_id}/drop")
def drop(course_id: int) -> dict:
    try:
        name = drop_course(engine, course_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"id": str(course_id), "name": name, "dropped": True}


@app.post("/api/courses/{course_id}/restore")
def restore(course_id: int) -> dict:
    try:
        name = restore_course(engine, course_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"id": str(course_id), "name": name, "dropped": False}


@app.get("/api/chat/config")
def chat_config() -> dict:
    return {"configured": bool((os.environ.get("GEMINI_API_KEY") or "").strip())}


@app.post("/api/chat")
def chat(body: dict):
    message = (body or {}).get("message", "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")
    history = (body or {}).get("history") or []
    try:
        courses = fetch_courses(engine)
        assignments = fetch_assignments(engine)
        reply = gemini.chat(engine, courses, assignments, message, history)
    except gemini.GeminiNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Gemini call failed: {exc}") from exc
    return {"reply": reply}


@app.get("/api")
def api_root() -> JSONResponse:
    return JSONResponse({"endpoints": ["/api/courses", "/api/assignments", "/api/resources", "/api/health", "/api/auth/*", "/api/google/*"]})
