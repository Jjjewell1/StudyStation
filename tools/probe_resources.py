"""Probe the SWCC Resources course to see where its links live (modules/pages)."""
import os, sys, json
sys.path.insert(0, r"D:\Sites\StudyStation")
os.environ.setdefault("CANVAS_BASE_URL", "https://learn.vccs.edu")
from studystation.session import open_canvas_request, api_get

CID = 109223
with open_canvas_request() as ctx:
    # modules
    try:
        mods = api_get(ctx, f"/api/v1/courses/{CID}/modules", {"include[]": "items"})
        print("MODULES:", len(mods))
        for m in mods:
            print("  module:", m.get("name"))
            for it in m.get("items", []):
                print("     item:", it.get("type"), "|", it.get("title"), "|", it.get("html_url") or it.get("url") or "")
    except Exception as e:
        print("MODULES ERR:", e)
    # pages
    try:
        pages = api_get(ctx, f"/api/v1/courses/{CID}/pages")
        print("PAGES:", len(pages))
        for p in pages:
            print("  page:", p.get("title"), "|", p.get("url"))
    except Exception as e:
        print("PAGES ERR:", e)
