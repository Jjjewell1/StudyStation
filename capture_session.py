"""Capture a live Canvas session for StudyStation.

Run this ON YOUR DEV PC (it needs a real headed browser for SSO/MFA):

    pip install -r requirements-dev.txt
    playwright install chromium
    python capture_session.py            # uses CANVAS_BASE_URL from .env
    python capture_session.py https://yourschool.instructure.com   # or pass it

Log in through your school's SSO/MFA like a normal human. When your Canvas
dashboard has fully loaded, come back here and press Enter. The session
(storage_state) is saved to canvas_session.json.

That file contains LIVE LOGIN COOKIES - treat it like a password.
It is git-ignored; never commit or share it.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


def load_env_file() -> None:
    """Tiny .env loader so this script works without python-dotenv."""
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


def main() -> None:
    load_env_file()
    base_url = (
        sys.argv[1]
        if len(sys.argv) > 1
        else os.environ.get("CANVAS_BASE_URL", "").strip()
    )
    if not base_url:
        sys.exit(
            "No Canvas URL given.\n"
            "Usage: python capture_session.py https://yourschool.instructure.com\n"
            "or set CANVAS_BASE_URL in .env"
        )
    base_url = base_url.rstrip("/")
    out_path = Path(os.environ.get("SESSION_OUTPUT", "canvas_session.json")).resolve()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        print(f"Opening {base_url} ...")
        page.goto(base_url + "/")
        input(
            "\n>>> Log in via SSO/MFA. Once your Canvas dashboard is fully "
            "loaded, press Enter here to save the session... "
        )
        context.storage_state(path=str(out_path))
        browser.close()

    size_kb = out_path.stat().st_size / 1024
    print(f"\nSaved session -> {out_path} ({size_kb:.1f} KB)")
    print("Smoke-test it next:  python test_session.py")
    print("REMINDER: that file holds live cookies. Never commit it.")


if __name__ == "__main__":
    main()
