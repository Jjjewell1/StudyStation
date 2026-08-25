"""Probe calendar_events variants against live Canvas to find what works."""
import os
from studystation.session import _api_get_with_link, SessionExpired, load_storage_state
from playwright.sync_api import sync_playwright

BASE = "https://learn.vccs.edu"
CID = 835537

tests = [
    ("per-course, type=event+window", f"/api/v1/courses/{CID}/calendar_events",
     {"type": "event", "start_date": "2026-04-27", "end_date": "2027-04-22", "per_page": 100}),
    ("per-course, no params", f"/api/v1/courses/{CID}/calendar_events", None),
    ("account-level context_codes", "/api/v1/calendar_events",
     {"type": "event", "context_codes[]": f"course_{CID}", "start_date": "2026-04-27",
      "end_date": "2027-04-22", "per_page": 100}),
]

state = load_storage_state()
with sync_playwright() as pw:
    ctx = pw.request.new_context(storage_state=state, base_url=BASE, timeout=30000)
    for label, path, params in tests:
        try:
            data, nxt = _api_get_with_link(ctx, path, params)
            n = len(data) if isinstance(data, list) else "?"
            print(f"OK   {label}: {n} items, next={bool(nxt)}")
            if isinstance(data, list) and data:
                print(f"     sample: {str(data[0])[:160]}")
        except SessionExpired as e:
            print(f"AUTH {label}: {e}")
        except Exception as e:
            print(f"ERR  {label}: {e}")
    ctx.dispose()
