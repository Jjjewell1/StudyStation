"""Smoke-test the captured Canvas session.

Run from the repo root after capture_session.py:

    python test_session.py

Reads CANVAS_BASE_URL + session from .env / canvas_session.json (same rules as
the production sync job), pulls /api/v1/courses page 1, and prints what it
sees. Exits non-zero with a clear message if the session is dead.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from studystation.session import (
    SessionExpired,
    api_get,
    canvas_base_url,
    open_canvas_request,
)


def load_env_file() -> None:
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def main() -> int:
    load_env_file()
    try:
        base = canvas_base_url()
        with open_canvas_request() as ctx:
            courses = api_get(
                ctx,
                "/api/v1/courses",
                params={"enrollment_state": "active", "per_page": 100},
            )
    except SessionExpired as exc:
        print(f"\nSESSION DEAD: {exc}")
        return 2
    except Exception as exc:  # network, bad URL, etc.
        print(f"\nFAILED: {exc}")
        return 1

    if not isinstance(courses, list):
        print(f"Unexpected response type: {type(courses).__name__}")
        return 1

    print(f"\nOK - authenticated against {base}")
    print(f"Active courses visible to this session: {len(courses)}")
    for c in courses:
        term = (c.get("term") or {}).get("name", "?")
        print(f"  [{c.get('id')}] {c.get('name')} ({c.get('course_code')}) - term: {term}")
    if not courses:
        print("  (none - check enrollment_state filter or the account you logged into)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
