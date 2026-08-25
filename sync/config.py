"""Environment config for the sync job. Stdlib only - no pydantic."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    database_url: str
    canvas_base_url: str
    log_level: str
    cal_window_days_back: int
    cal_window_days_ahead: int

    @classmethod
    def from_env(cls) -> "Config":
        db = (os.environ.get("DATABASE_URL") or "").strip()
        if not db:
            raise RuntimeError(
                "DATABASE_URL is not set. In docker-compose it is built from "
                "POSTGRES_USER/PASSWORD/DB; for local dev set it manually, e.g.\n"
                "  postgresql://studystation:pass@localhost:5432/studystation"
            )
        if db.startswith("postgres://"):
            # SQLAlchemy 2 refuses the legacy scheme; normalize it.
            db = db.replace("postgres://", "postgresql://", 1)

        return cls(
            database_url=db,
            canvas_base_url=(os.environ.get("CANVAS_BASE_URL") or "").strip().rstrip("/"),
            log_level=(os.environ.get("LOG_LEVEL") or "INFO").upper(),
            cal_window_days_back=int(os.environ.get("CAL_WINDOW_DAYS_BACK", "120")),
            cal_window_days_ahead=int(os.environ.get("CAL_WINDOW_DAYS_AHEAD", "240")),
        )
