"""On-demand sync trigger server.

Runs alongside supercronic inside the sync container. POST /sync executes
main.py as a subprocess (the exact path cron uses) and streams its output
back. GET /health for liveness. Stdlib only - no new deps.
"""

from __future__ import annotations

import json
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"status": "ok"})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/sync":
            self._send(404, {"error": "not found"})
            return
        # Run the sync synchronously so the caller gets the real exit code.
        proc = subprocess.run(
            [sys.executable, "-u", "/app/main.py"],
            capture_output=True,
            text=True,
        )
        self._send(200, {
            "exit_code": proc.returncode,
            "stdout": proc.stdout[-8000:],
            "stderr": proc.stderr[-8000:],
        })

    def log_message(self, *args):  # silence access logs
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[trigger] sync trigger listening on :{PORT}", flush=True)
    server.serve_forever()
