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

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from db import fetch_assignments, fetch_courses, make_engine

DATABASE_URL = (os.environ.get("DATABASE_URL") or "").strip()
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

engine = make_engine(DATABASE_URL)

app = FastAPI(title="StudyStation API", version="0.1.0")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


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


@app.get("/api")
def api_root() -> JSONResponse:
    return JSONResponse({"endpoints": ["/api/courses", "/api/assignments", "/api/health"]})
