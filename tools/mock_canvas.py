"""Tiny mock Canvas API for local pipeline testing (no real school involved).

Serves canned JSON with proper content-types and exercises Link-header
pagination. Auth is ignored - any cookie passes.

Run standalone:   python tools/mock_canvas.py [port]
Run in docker (see StudyStation test flow): mount at /srv and
    python /srv/mock_canvas.py 8000
"""

from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

COURSES_PAGE1 = [
    {"id": 101, "name": "Data Structures", "course_code": "CS 201",
     "start_at": "2026-08-20T05:00:00Z", "end_at": "2026-12-12T05:59:59Z",
     "term": {"name": "Fall 2026", "start_at": "2026-08-20T05:00:00Z",
              "end_at": "2026-12-12T05:59:59Z"}},
    {"id": 102, "name": "Linear Algebra", "course_code": "MATH 210",
     "term": {"name": "Fall 2026"}},
]
COURSES_PAGE2: list = []

ASSIGNMENTS = {
    101: [
        {"id": 9001, "name": "HW1: Linked Lists", "due_at": "2026-09-05T05:59:00Z",
         "points_possible": 25, "submission_types": ["online_text_entry"],
         "html_url": "https://example.com/courses/101/assignments/9001",
         "published": True, "description": "<p>Implement a linked list.</p>"},
        {"id": 9002, "name": "Reading: Ch. 3", "due_at": None,
         "published": True},
    ],
    102: [
        {"id": 9010, "name": "Problem Set 1", "due_at": "2026-09-08T06:59:00Z",
         "points_possible": 50, "submission_types": ["online_upload"],
         "published": True},
    ],
}

EVENTS = {
    101: [{"id": "7001", "title": "Midterm Exam", "start_at": "2026-10-15T14:00:00Z",
           "end_at": "2026-10-15T15:30:00Z"}],
    102: [],
}


class Handler(BaseHTTPRequestHandler):
    def _send(self, payload, next_url=None):
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        if next_url:
            self.send_header("Link", f'<{next_url}>; rel="next"')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path, query = parsed.path, parsed.query
        if path == "/api/v1/courses":
            page = (parse_qs(query).get("page") or ["1"])[0]
            if page != "1":
                self._send(COURSES_PAGE2)
            else:
                self._send(COURSES_PAGE1, next_url=f"http://{self.headers['Host']}/api/v1/courses?page=2")
            return
        parts = path.strip("/").split("/")  # api/v1/courses/:id/<what>
        if len(parts) == 5 and parts[2] == "courses":
            cid, what = int(parts[3]), parts[4]
            if what == "assignments":
                self._send(ASSIGNMENTS.get(cid, []))
                return
            if what == "calendar_events":
                self._send(EVENTS.get(cid, []))
                return
        self.send_response(404)
        self.end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("mock-canvas: " + fmt % args + "\n")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
