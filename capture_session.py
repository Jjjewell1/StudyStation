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
import time
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

    wait_seconds = int(os.environ.get("CAPTURE_TIMEOUT", "600"))
    print(f"Opening {base_url} - complete SSO/MFA in the browser window...")
    print(f"(auto-saves when your dashboard loads; giving up after {wait_seconds}s)")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto(base_url + "/", wait_until="domcontentloaded")

        deadline = time.time() + wait_seconds
        authenticated = False
        while time.time() < deadline:
            try:
                # Ground truth: does this browser session actually authenticate
                # against the Canvas API? (canvas_session cookie exists even
                # pre-login, so cookie presence alone proves nothing.)
                probe = page.evaluate(
                    "async () => { const r = await fetch('/api/v1/users/self',"
                    "{ headers: { accept: 'application/json' } });"
                    "return r.status; }"
                )
                if probe == 200:
                    try:
                        page.wait_for_load_state("networkidle", timeout=8000)
                    except Exception:
                        pass
                    authenticated = True
                    break
            except Exception as exc:
                print(f"(waiting: {exc.__class__.__name__})")
            page.wait_for_timeout(2500)

        if not authenticated:
            browser.close()
            sys.exit(f"Timed out after {wait_seconds}s without detecting a login.")

        context.storage_state(path=str(out_path))
        browser.close()

    size_kb = out_path.stat().st_size / 1024
    print(f"\nSaved session -> {out_path} ({size_kb:.1f} KB)")
    print("REMINDER: that file holds live cookies. Never commit it.")


if __name__ == "__main__":
    main()
