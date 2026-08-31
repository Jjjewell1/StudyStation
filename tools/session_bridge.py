"""Local session-capture bridge for StudyStation.

Run this on YOUR PC (the one with a real browser / Playwright). It polls the
StudyStation dashboard; when you click "Capture session on this PC" in the
Settings -> Sync tab, this bridge detects the pending request and launches the
normal capture_session.py flow (opens a browser, you log in, it auto-uploads
and syncs).

Usage:
    .venv\\Scripts\\python.exe tools\\session_bridge.py

It reads STUDYSTATION_BASE_URL and STUDYSTATION_PIN from .env. Runs forever
until Ctrl+C. Safe to leave running in the background.

A one-time setup creates a Windows scheduled task so the bridge auto-starts on
login (see ->oh-oh; do it manually, or use /install):
    .venv\\Scripts\\python.exe tools\\session_bridge.py --install
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POLL_INTERVAL = 5  # seconds
TTL = 120  # a request older than this is ignored


def load_env_file() -> None:
    env_path = ROOT / ".env"
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


def request(method: str, path: str, payload: dict | None = None, base: str | None = None):
    url = (base or os.environ["STUDYSTATION_BASE_URL"]).rstrip("/") + path
    token = os.environ.get("STUDYSTATION_PIN", "").strip()
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
        ),
        "Accept": "application/json",
    }
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    if token:
        # Obtain a bearer token first if we have a PIN.
        try:
            with urllib.request.urlopen(
                urllib.request.Request(
                    url + "/api/auth/login",
                    data=json.dumps({"pin": token}).encode("utf-8"),
                    method="POST",
                    headers={**headers, "Content-Type": "application/json"},
                ),
                timeout=20,
            ) as resp:
                token = json.loads(resp.read().decode("utf-8"))["token"]
            headers["Authorization"] = f"Bearer {token}"
        except Exception:
            token = None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8")


def capture_once() -> bool:
    """Run the real capture as a subprocess. Returns True if it started."""
    py = ROOT / ".venv" / "Scripts" / "python.exe"
    if not py.exists():
        py = "python"
    try:
        subprocess.Popen(
            [str(py), str(ROOT / "capture_session.py")],
            cwd=str(ROOT),
            creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0),
        )
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"Failed to launch capture: {exc}")
        return False


def main() -> None:
    load_env_file()
    base = os.environ.get("STUDYSTATION_BASE_URL", "").strip().rstrip("/")
    if not base:
        print("STUDYSTATION_BASE_URL not set in .env - nothing to do.")
        sys.exit(1)

    last_seen: str | None = None
    print(f"Session bridge running. Polling {base} every {POLL_INTERVAL}s (Ctrl+C to stop)...")
    while True:
        try:
            st, body = request("GET", "/api/sync/capture/request", base=base)
            if st != 200:
                print(f"  poll error HTTP {st}")
            else:
                req = json.loads(body)
                if req.get("pending"):
                    rid = req.get("id")
                    if rid != last_seen:
                        last_seen = rid
                        print(f"  Capture requested ({rid}) - launching browser...")
                        capture_once()
        except Exception as exc:  # noqa: BLE001
            print(f"  poll exception: {exc}")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()