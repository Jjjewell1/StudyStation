"""Capture a live Canvas session for StudyStation.

Run this ON YOUR DEV PC (it needs a real headed browser for SSO/MFA):

    pip install -r requirements-dev.txt
    playwright install chromium
    python capture_session.py            # uses CANVAS_BASE_URL from .env
    python capture_session.py https://yourschool.instructure.com   # or pass it

Log in through your school's SSO/MFA like a normal human. When your Canvas
dashboard has fully loaded, the session (storage_state) is auto-saved to
canvas_session.json.

If STUDYSTATION_BASE_URL is set (e.g. https://studystation.jewellcore.com),
the new session is ALSO uploaded straight to the StudyStation dashboard and a
sync is triggered - no copy/paste, no redeploy. If ACCESS_PIN is configured
on the dashboard, put it in STUDYSTATION_PIN.

That file contains LIVE LOGIN COOKIES - treat it like a password.
It is git-ignored; never commit or share it.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
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


def upload_session(out_path: Path) -> None:
    """POST the fresh session to the StudyStation dashboard, then trigger a sync.

    Only runs when STUDYSTATION_BASE_URL is configured. Best-effort: any
    failure prints instructions instead of blocking the local save.
    """
    base = os.environ.get("STUDYSTATION_BASE_URL", "").strip().rstrip("/")
    if not base:
        print(
            "\nSession saved -> paste it once in the dashboard:"
            "\n  Settings -> Sync -> Re-capture session."
            f"\n  (Or set STUDYSTATION_BASE_URL to auto-upload next time.)"
        )
        return

    raw = out_path.read_text(encoding="utf-8")
    # Cloudflare on Coolify's proxy blocks urllib's default UA (Error 1010),
    # so every request wears a plain browser User-Agent.
    headers_base = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
        ),
        "Accept": "application/json",
    }

    def post(path: str, payload: dict, auth_token: str | None) -> int:
        headers = dict(headers_base)
        headers["Content-Type"] = "application/json"
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"
        req = urllib.request.Request(
            base + path,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers=headers,
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status
        except urllib.error.HTTPError as exc:
            return exc.code
        except Exception as exc:  # noqa: BLE001 - network hiccup, tell the user
            print(f"\nCould not reach {base}: {exc}")
            return -1

    token = None
    status = post("/api/sync/session", {"session_json": raw}, None)
    if status == 401:
        pin = os.environ.get("STUDYSTATION_PIN", "").strip()
        if not pin:
            print(f"\nDashboard asked for auth (HTTP 401). Set STUDYSTATION_PIN.")
            return
        try:
            with urllib.request.urlopen(
                urllib.request.Request(
                    base + "/api/auth/login",
                    data=json.dumps({"pin": pin}).encode("utf-8"),
                    method="POST",
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        **headers_base,
                    },
                ),
                timeout=30,
            ) as resp:
                token = json.loads(resp.read().decode("utf-8"))["token"]
        except Exception as exc:  # noqa: BLE001
            print(f"\nDashboard login failed: {exc}")
            return
        status = post("/api/sync/session", {"session_json": raw}, token)

    if status == 200:
        print(f"\nSession uploaded to {base} - used from the next sync.")
        sync_status = post("/api/sync", {}, token)
        if sync_status == 200:
            print("Sync triggered on the server.")
        else:
            print("(sync trigger returned HTTP "
                  f"{sync_status} - you can click 'Sync now' in the dashboard instead.)")
    else:
        print(
            f"\nUpload failed (HTTP {status}). Paste {out_path.name} manually in"
            " Settings -> Sync -> Re-capture session, then click 'Sync now'."
        )


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
    upload_session(out_path)


if __name__ == "__main__":
    main()
