"""Google integration routes: OAuth + Calendar + Tasks + Contacts + Mail.

All live under /api/google/*. Each handler builds a fresh authorized service
via google_client (which handles token refresh + persistence).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

import google_client as g

router = APIRouter(prefix="/api/google", tags=["google"])


def _engine(request: Request):
    # app.py stores the engine on the app; reach it through request.
    return request.app.state.engine


def _gservice(request: Request, factory):
    return factory(_engine(request))


# ---------- OAuth ----------

@router.get("/auth")
def auth(request: Request):
    try:
        url = g.build_auth_url(_engine(request))
    except g.GoogleNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return RedirectResponse(url)


@router.get("/callback")
def callback(request: Request, code: str, state: str | None = None, error: str | None = None):
    if error:
        raise HTTPException(status_code=400, detail=f"Google OAuth error: {error}")
    try:
        g.exchange_code(_engine(request), code, state)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"token exchange failed: {exc}") from exc
    return RedirectResponse("/?google=connected")


@router.get("/status")
def status(request: Request):
    try:
        connected = g.is_connected(_engine(request))
        email = g.get_email(_engine(request)) if connected else None
    except g.GoogleNotConfigured:
        return {"connected": False, "configured": False}
    return {"connected": connected, "configured": True, "email": email}


@router.post("/disconnect")
def disconnect(request: Request):
    g.disconnect(_engine(request))
    return {"connected": False}


# ---------- Calendar ----------

@router.get("/calendar/events")
def calendar_events(request: Request, timeMin: str | None = None, timeMax: str | None = None):
    try:
        svc = g.calendar_service(_engine(request))
        resp = svc.events().list(
            calendarId="primary",
            timeMin=timeMin,
            timeMax=timeMax,
            maxResults=250,
            singleEvents=True,
            orderBy="startTime",
        ).execute()
    except g.GoogleNotConnected as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    out = []
    for e in resp.get("items", []):
        start = e.get("start", {})
        end = e.get("end", {})
        out.append({
            "id": e.get("id"),
            "title": e.get("summary") or "(no title)",
            "start": start.get("dateTime") or start.get("date"),
            "end": end.get("dateTime") or end.get("date"),
            "allDay": "date" in start,
            "location": e.get("location"),
            "link": e.get("htmlLink"),
        })
    return out


@router.post("/calendar/events")
def calendar_create(request: Request, body: dict):
    try:
        svc = g.calendar_service(_engine(request))
    except g.GoogleNotConnected as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    title = (body.get("title") or "").strip()
    start = (body.get("start") or "").strip()
    end = (body.get("end") or "").strip()
    if not title or not start:
        raise HTTPException(status_code=400, detail="title and start are required")
    event = {"summary": title, "start": {"dateTime": start}, "end": {"dateTime": end or start}}
    created = svc.events().insert(calendarId="primary", body=event).execute()
    return {"id": created.get("id"), "link": created.get("htmlLink")}


# ---------- Tasks ----------

@router.get("/tasks/lists")
def task_lists(request: Request):
    try:
        svc = g.tasks_service(_engine(request))
        resp = svc.tasklists().list(maxResults=100).execute()
    except g.GoogleNotConnected as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return [
        {"id": t.get("id"), "title": t.get("title") or "Untitled"}
        for t in resp.get("items", [])
    ]


@router.get("/tasks/lists/{list_id}/tasks")
def tasks(request: Request, list_id: str, showCompleted: bool = True):
    try:
        svc = g.tasks_service(_engine(request))
        resp = svc.tasks().list(
            tasklist=list_id, showCompleted=showCompleted, showHidden=True, maxResults=100,
        ).execute()
    except g.GoogleNotConnected as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    out = []
    for t in resp.get("items", []):
        out.append({
            "id": t.get("id"),
            "title": t.get("title"),
            "notes": t.get("notes"),
            "due": t.get("due"),
            "status": t.get("status") or "needsAction",
            "completed": t.get("status") == "completed",
        })
    return out


@router.post("/tasks/lists/{list_id}/tasks")
def task_create(request: Request, list_id: str, body: dict):
    try:
        svc = g.tasks_service(_engine(request))
    except g.GoogleNotConnected as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    created = svc.tasks().insert(tasklist=list_id, body={"title": title}).execute()
    return {"id": created.get("id"), "title": created.get("title")}


@router.patch("/tasks/lists/{list_id}/tasks/{task_id}")
def task_update(request: Request, list_id: str, task_id: str, body: dict):
    try:
        svc = g.tasks_service(_engine(request))
    except g.GoogleNotConnected as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    patch = {}
    if "completed" in body:
        patch["status"] = "completed" if body["completed"] else "needsAction"
    if "title" in body:
        patch["title"] = body["title"]
    updated = svc.tasks().patch(tasklist=list_id, task=task_id, body=patch).execute()
    return {"id": updated.get("id"), "status": updated.get("status")}


@router.delete("/tasks/lists/{list_id}/tasks/{task_id}")
def task_delete(request: Request, list_id: str, task_id: str):
    try:
        svc = g.tasks_service(_engine(request))
        svc.tasks().delete(tasklist=list_id, task=task_id).execute()
    except g.GoogleNotConnected as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return {"deleted": True}


# ---------- Contacts ----------

@router.get("/contacts")
def contacts(request: Request, query: str | None = None):
    try:
        svc = g.people_service(_engine(request))
        resp = svc.people().connections().list(
            resourceName="people/me",
            personFields="names,emailAddresses,phoneNumbers",
            pageSize=2000,
            sortOrder="FIRST_NAME_ASCENDING",
        ).execute()
    except g.GoogleNotConnected as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    out = []
    for p in resp.get("connections", []):
        names = p.get("names") or [{}]
        emails = p.get("emailAddresses") or []
        phones = p.get("phoneNumbers") or []
        out.append({
            "resourceName": p.get("resourceName"),
            "name": names[0].get("displayName") or emails[0].get("value") or "(no name)",
            "email": emails[0].get("value") if emails else None,
            "phone": phones[0].get("value") if phones else None,
        })
    if query:
        q = query.lower()
        out = [c for c in out if q in c["name"].lower() or (c["email"] and q in c["email"].lower())]
    return out


@router.post("/contacts")
def contact_create(request: Request, body: dict):
    try:
        svc = g.people_service(_engine(request))
    except g.GoogleNotConnected as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip()
    phone = (body.get("phone") or "").strip()
    if not name and not email:
        raise HTTPException(status_code=400, detail="name or email is required")
    person = {}
    if name:
        person["names"] = [{"givenName": name}]
    if email:
        person["emailAddresses"] = [{"value": email}]
    if phone:
        person["phoneNumbers"] = [{"value": phone}]
    created = svc.people().createContact(body=person).execute()
    return {"resourceName": created.get("resourceName")}


# ---------- Mail ----------

def _mail_headers(payload: dict) -> dict:
    headers = {}
    for h in payload.get("headers", []):
        headers[h["name"].lower()] = h["value"]
    return headers


@router.get("/mail/messages")
def mail_messages(request: Request, q: str = "in:inbox", maxResults: int = 20, pageToken: str | None = None):
    try:
        svc = g.gmail_service(_engine(request))
        resp = svc.users().messages().list(
            userId="me", q=q, maxResults=maxResults, pageToken=pageToken,
        ).execute()
    except g.GoogleNotConnected as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    out = []
    for m in resp.get("messages", []):
        full = svc.users().messages().get(
            userId="me", id=m["id"], format="metadata",
            metadataHeaders=["From", "Subject", "Date"],
        ).execute()
        headers = _mail_headers(full.get("payload", {}))
        out.append({
            "id": full.get("id"),
            "threadId": full.get("threadId"),
            "from": headers.get("from"),
            "subject": headers.get("subject"),
            "date": headers.get("date"),
            "snippet": full.get("snippet"),
            "unread": "UNREAD" in (full.get("labelIds") or []),
        })
    return {"messages": out, "nextPageToken": resp.get("nextPageToken")}


@router.get("/mail/messages/{message_id}")
def mail_message(request: Request, message_id: str):
    try:
        svc = g.gmail_service(_engine(request))
        full = svc.users().messages().get(userId="me", id=message_id, format="full").execute()
    except g.GoogleNotConnected as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    payload = full.get("payload", {})
    headers = _mail_headers(payload)
    body = _extract_body(payload)
    return {
        "id": full.get("id"),
        "from": headers.get("from"),
        "to": headers.get("to"),
        "subject": headers.get("subject"),
        "date": headers.get("date"),
        "snippet": full.get("snippet"),
        "body": body,
        "unread": "UNREAD" in (full.get("labelIds") or []),
    }


def _extract_body(payload: dict) -> str:
    import base64
    parts = payload.get("parts") or []
    # Prefer text/plain, fall back to text/html (strip tags roughly).
    plain = html = None
    if payload.get("mimeType") == "text/plain" and payload.get("body", {}).get("data"):
        plain = payload["body"]["data"]
    if payload.get("mimeType") == "text/html" and payload.get("body", {}).get("data"):
        html = payload["body"]["data"]
    for part in parts:
        mt = part.get("mimeType")
        data = part.get("body", {}).get("data")
        if mt == "text/plain" and data and not plain:
            plain = data
        elif mt == "text/html" and data and not html:
            html = data

    def _decode(data: str) -> str:
        try:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            return ""

    if plain:
        return _decode(plain)
    if html:
        import re
        text = _decode(html)
        text = re.sub(r"<style.*?</style>", " ", text, flags=re.S | re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        return re.sub(r"\s+", " ", text).strip()
    return ""


@router.post("/mail/messages/{message_id}/read")
def mail_mark_read(request: Request, message_id: str, body: dict | None = None):
    read = bool((body or {}).get("read", True))
    try:
        svc = g.gmail_service(_engine(request))
        mod = {"addLabelIds": [] if read else ["UNREAD"],
               "removeLabelIds": ["UNREAD"] if read else []}
        svc.users().messages().modify(userId="me", id=message_id, body=mod).execute()
    except g.GoogleNotConnected as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return {"read": read}
