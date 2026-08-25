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

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from db import fetch_assignments, fetch_courses, fetch_resource_links, make_engine
import auth
import google_client
import google_routes

DATABASE_URL = (os.environ.get("DATABASE_URL") or "").strip()
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

engine = make_engine(DATABASE_URL)

app = FastAPI(title="StudyStation API", version="0.1.0")
app.state.engine = engine
app.include_router(google_routes.router)

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


@app.get("/api/resources")
def resources() -> list[dict]:
    try:
        return fetch_resource_links(engine)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"resources query failed: {exc}") from exc


@app.get("/api")
def api_root() -> JSONResponse:
    return JSONResponse({"endpoints": ["/api/courses", "/api/assignments", "/api/resources", "/api/health", "/api/auth/*", "/api/google/*"]})
