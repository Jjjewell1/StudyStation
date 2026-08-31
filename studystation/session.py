"""Canvas session + API transport shared by dev scripts and the sync job.

Session replay strategy: we load the Playwright storage_state captured by
capture_session.py and hand it to a request-only APIRequestContext
(playwright.request.new_context). This sends the captured cookies on every
call WITHOUT launching a browser, so the sync container needs no chromium.
(Canvas authenticates API calls via cookies; localStorage origins in the
state file are irrelevant for pure HTTP calls.)

Auth-expiry contract: any 401/403, or a 200 that returns HTML instead of JSON
(happens when Canvas bounces a dead session through SSO), raises
SessionExpired. Callers translate that into a loud "rerun capture_session.py"
message rather than a silent crash.
"""

from __future__ import annotations

import json
import os
import re
from contextlib import contextmanager
from pathlib import Path

from playwright.sync_api import sync_playwright

PER_PAGE = 100          # Canvas max page size; user chose full pulls at this size
MAX_PAGES = 200         # runaway guard: 200 pages x 100 items is far past semester scale

_LINK_NEXT_RE = re.compile(r'<([^>]+)>;\s*rel="?next"?', re.IGNORECASE)


class SessionExpired(RuntimeError):
    """Captured Canvas session is missing, expired, or rejected."""


def canvas_base_url() -> str:
    base = (os.environ.get("CANVAS_BASE_URL") or "").strip().rstrip("/")
    if not base:
        raise RuntimeError(
            "CANVAS_BASE_URL is not set. Put it in .env "
            "(e.g. https://yourschool.instructure.com)."
        )
    return base


def load_storage_state(override: str | None = None) -> dict:
    """Return the captured storage_state dict from an override, env var, or file.

    Precedence: an explicit `override` (the dashboard's DB-backed session),
    then CANVAS_SESSION_JSON (how Coolify passes it), then
    CANVAS_SESSION_FILE (default ./canvas_session.json) from disk.
    """
    raw = (override or "").strip() or (os.environ.get("CANVAS_SESSION_JSON") or "").strip()
    if raw:
        try:
            state = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                "CANVAS_SESSION_JSON is set but is not valid JSON. "
                "Paste the whole minified canvas_session.json as ONE line."
            ) from exc
    else:
        path = Path(os.environ.get("CANVAS_SESSION_FILE", "canvas_session.json"))
        if not path.exists():
            raise SessionExpired(
                f"No session file at {path} and CANVAS_SESSION_JSON is empty. "
                "Run: python capture_session.py"
            )
        try:
            state = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"{path} is not valid JSON - recapture it.") from exc

    if not state.get("cookies"):
        raise SessionExpired(
            "storage_state has no cookies - recapture with capture_session.py."
        )
    return state


@contextmanager
def open_canvas_request(override: str | None = None):
    """Yield a Playwright APIRequestContext carrying the captured session."""
    base = canvas_base_url()
    state = load_storage_state(override)
    with sync_playwright() as pw:
        ctx = pw.request.new_context(
            storage_state=state,
            base_url=base,
            timeout=30_000,
        )
        try:
            yield ctx
        finally:
            # Persist refreshed cookies back to disk when running from a file;
            # Canvas rotates its session cookie, so this keeps local runs fresh.
            file_path = os.environ.get("CANVAS_SESSION_FILE", "")
            if file_path and Path(file_path).parent.exists():
                try:
                    fresh = ctx.storage_state()
                    Path(file_path).write_text(
                        json.dumps(fresh), encoding="utf-8"
                    )
                except Exception:
                    pass  # best-effort refresh; never block the sync over it
            ctx.dispose()


def _parse_json_response(resp) -> object:
    if resp.status in (401, 403):
        raise SessionExpired(
            f"Canvas returned HTTP {resp.status} - session cookie is dead or was "
            "rejected. Rerun capture_session.py."
        )
    ctype = resp.headers.get("content-type", "")
    if "application/json" not in ctype.lower():
        # Dead sessions often get redirected to the school's SSO login page.
        raise SessionExpired(
            f"Canvas returned {resp.status} {ctype.split(';')[0]!r} (expected JSON) - "
            "you were probably bounced to an SSO login page. Rerun capture_session.py."
        )
    body = resp.json()
    if isinstance(body, dict) and body.get("errors"):
        raise RuntimeError(f"Canvas API error: {json.dumps(body)[:500]}")
    return body


def api_get(ctx, path_or_url: str, params: dict | None = None):
    """Single authenticated GET returning parsed JSON."""
    resp = ctx.get(path_or_url, params=params)
    return _parse_json_response(resp)


def _api_get_with_link(ctx, path_or_url: str, params: dict | None):
    """GET returning (parsed_json, absolute_next_page_url_or_None)."""
    resp = ctx.get(path_or_url, params=params)
    data = _parse_json_response(resp)
    link = resp.headers.get("link", "") or ""
    m = _LINK_NEXT_RE.search(link)
    return data, (m.group(1) if m else None)


def iter_pages(ctx, path: str, params: dict | None = None):
    """Yield every item across all Link-header pages of a list endpoint.

    First call uses `path` + `params`; subsequent calls use the absolute
    'next' URL from the Link header verbatim (it already carries the query).
    """
    query = dict(params or {})
    query.setdefault("per_page", PER_PAGE)
    url: str | None = path
    first = True
    pages = 0
    while url:
        pages += 1
        if pages > MAX_PAGES:
            raise RuntimeError(
                f"Pagination guard tripped after {MAX_PAGES} pages on {path} - "
                "aborting rather than spinning forever."
            )
        data, next_url = _api_get_with_link(ctx, url, query if first else None)
        first = False
        if not isinstance(data, list):
            raise RuntimeError(f"Expected a JSON array from {path}, got {type(data).__name__}")
        yield from data
        url = next_url
