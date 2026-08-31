"""Auto-capture when the StudyStation sync reports an expired Canvas session.

Intended to be run on a schedule (Windows Task Scheduler): it checks the
dashboard's last sync status and, if it's session_expired, launches the local
capture_session.py browser flow so you can just log in. It only fires the
browser when a fresh capture is actually needed.

Usage:
    .venv\\Scripts\\python.exe tools\\autocapture.py          # one check
    .venv\\Scripts\\python.exe tools\\autocapture.py --install  # add a scheduled task

The scheduled task runs every N minutes; a small marker file prevents it from
firing the browser more than once per session so it won't nag you repeatedly.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKER = ROOT / ".autocapture_asked"
COOLDOWN_S = 60 * 60  # don't re-prompt within an hour of asking


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


def get_sync_status() -> str | None:
    base = os.environ.get("STUDYSTATION_BASE_URL", "").strip().rstrip("/")
    if not base:
        print("STUDYSTATION_BASE_URL not set in .env")
        return None
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"}
    req = urllib.request.Request(base + "/api/sync/status", headers={**headers, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return (data.get("last") or {}).get("status")
    except Exception as exc:  # noqa: BLE001
        print(f"Could not read sync status: {exc}")
        return None


def install() -> None:
    py = str(ROOT / ".venv" / "Scripts" / "python.exe")
    if not Path(py).exists():
        py = sys.executable
    task = "StudyStation-AutoCapture"
    cmd = f'SchTasks /Create /F /TN {task} /TR "{py} {ROOT / "tools" / "autocapture.py"}" /SC MINUTE /MO 10'
    print("Creating scheduled task (runs every 10 min)...")
    print(cmd)
    os.system(cmd)
    print("Done. Autocapture will now open a browser for you only when the sync is expired.")


def main() -> None:
    load_env_file()
    ap = argparse.ArgumentParser()
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--force", action="store_true", help="ignore the cooldown marker")
    args = ap.parse_args()
    if args.install:
        install()
        return

    if MARKER.exists() and not args.force:
        age = time.time() - MARKER.stat().st_mtime
        if age < COOLDOWN_S:
            return  # already asked recently; stay quiet

    status = get_sync_status()
    print(f"sync status: {status}")
    if status != "session_expired":
        if MARKER.exists():
            MARKER.unlink()
        return

    MARKER.touch()
    print("Session is expired - launching capture. Complete the login in the browser window.")
    py = ROOT / ".venv" / "Scripts" / "python.exe"
    if not py.exists():
        py = "python"
    try:
        subprocess.Popen(
            [str(py), str(ROOT / "capture_session.py")],
            cwd=str(ROOT),
            creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0),
        )
    except Exception as exc:  # noqa: BLE001
        print(f"Failed to launch capture: {exc}")


if __name__ == "__main__":
    main()