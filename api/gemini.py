"""Google Gemini chat for the StudyStation assistant.

Uses the Generative Language REST API (no extra SDK dep). The model reads a
compact context snapshot (courses + upcoming/overdue assignments) so it can
answer "what's due this week?" against real data.
"""

from __future__ import annotations

import json
import os
import urllib.request

API = "https://generativelanguage.googleapis.com/v1beta/models"

# Flash is fast and cheap; enough for a coursework Q&A assistant.
DEFAULT_MODEL = "gemini-2.5-flash"


class GeminiNotConfigured(RuntimeError):
    """GEMINI_API_KEY not set."""


def _api_key() -> str:
    key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not key:
        raise GeminiNotConfigured("GEMINI_API_KEY is not set")
    return key


def _model() -> str:
    return (os.environ.get("GEMINI_MODEL") or "").strip() or DEFAULT_MODEL


def _build_context(courses: list[dict], assignments: list[dict]) -> str:
    lines = ["The student has these courses:"]
    for c in courses:
        lines.append(f"- {c.get('short') or c.get('name')} ({c.get('term')})")
    now_ts = None
    from datetime import datetime, timezone
    now_ts = datetime.now(timezone.utc)

    upcoming = []
    overdue = []
    for a in assignments:
        if a.get("status") == "submitted":
            continue
        if not a.get("dueAt"):
            continue
        due = datetime.fromisoformat(a["dueAt"].replace("Z", "+00:00"))
        (overdue if due < now_ts else upcoming).append(a)
    upcoming.sort(key=lambda x: x["dueAt"])
    overdue.sort(key=lambda x: x["dueAt"])

    if overdue:
        lines.append("\nOverdue assignments:")
        for a in overdue[:10]:
            lines.append(f"- {a['name']} (due {a['dueAt'][:10]})")
    lines.append("\nUpcoming assignments (next, chronological):")
    for a in upcoming[:15]:
        lines.append(f"- {a['name']} (due {a['dueAt'][:10]})")
    return "\n".join(lines)


def chat(engine, courses: list[dict], assignments: list[dict],
         message: str, history: list[dict] | None = None) -> str:
    """One-turn chat against Gemini with a coursework context snapshot."""
    key = _api_key()
    model = _model()
    url = f"{API}/{model}:generateContent?key={key}"

    system = (
        "You are the StudyStation assistant, a friendly homework/coursework "
        "helper for a college student. Answer concisely using the student's real "
        "course data provided below. Prefer short, actionable answers. Use plain "
        "text (no markdown tables unless asked).\n\n"
        f"{_build_context(courses, assignments)}"
    )

    contents = []
    for h in (history or [])[-10:]:
        role = "model" if h.get("role") == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": h.get("text", "")}]})
    contents.append({"role": "user", "parts": [{"text": message}]})

    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 800},
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        if data.get("promptFeedback", {}).get("blockReason"):
            return "I couldn't answer that (blocked by safety filters)."
        return "I couldn't produce a response. Try rephrasing."
