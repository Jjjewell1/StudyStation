"""Class document upload + AI Q&A routes.

Endpoints under /api/courses/{course_id}/documents:

  POST   /documents          multipart upload (one or more files)
  GET    /documents          list metadata for the course
  GET    /documents/{id}/download   raw file bytes
  DELETE /documents/{id}     remove document + its chunks
  POST   /documents/ask      answer a question from the course's documents

Uploaded bytes live in Postgres (documents.data); the extracted text is
chunked (document_chunks) with a tsvector column so retrieval can rank chunks
by relevance with plain Postgres full-text search. Gemini answers with the
top-ranked chunks as context.
"""

from __future__ import annotations

import io
from urllib.parse import quote

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from db import (
    course_name,
    delete_document,
    get_document,
    insert_document,
    list_documents,
    ordered_document_chunks,
    ranked_document_chunks,
)
from doc_parser import EmptyExtractionError, UnsupportedDocError, chunk_text, extract_text
import gemini

router = APIRouter(tags=["documents"])

MAX_FILE_BYTES = 50 * 1024 * 1024  # matches nginx client_max_body_size / Cloudflare 100 MB
MAX_SOURCE_CHARS = 200_000         # char budget handed to the model (~50k tokens)
MAX_CHUNKS = 16


def _engine(request: Request):
    return request.app.state.engine


def _require_course(engine, course_id: int) -> str:
    name = course_name(engine, course_id)
    if not name:
        raise HTTPException(status_code=404, detail=f"course {course_id} not found")
    return name


@router.post("/api/courses/{course_id}/documents")
async def upload_documents(course_id: int, request: Request,
                           files: list[UploadFile] = File(...)):
    engine = _engine(request)
    _require_course(engine, course_id)

    saved: list[dict] = []
    errors: list[dict] = []
    for file in files:
        filename = (file.filename or "document").strip() or "document"
        data = await file.read(MAX_FILE_BYTES + 1)
        if len(data) > MAX_FILE_BYTES:
            errors.append({
                "filename": filename,
                "error": f"file exceeds {MAX_FILE_BYTES // (1024 * 1024)} MB limit",
            })
            continue
        try:
            text = await run_in_threadpool(extract_text, filename, data)
        except (UnsupportedDocError, EmptyExtractionError) as exc:
            errors.append({"filename": filename, "error": str(exc)})
            continue
        except Exception as exc:  # noqa: BLE001
            errors.append({"filename": filename, "error": f"could not parse file: {exc}"})
            continue
        chunks = chunk_text(text)
        if not chunks:
            errors.append({"filename": filename, "error": "no readable text extracted"})
            continue
        mime = file.content_type or "application/octet-stream"
        doc_id = insert_document(engine, course_id, filename, mime, data, chunks)
        saved.append({
            "id": str(doc_id),
            "filename": filename,
            "mime": mime,
            "sizeBytes": len(data),
            "chunkCount": len(chunks),
        })

    if not saved and errors:
        raise HTTPException(status_code=400, detail={"saved": saved, "errors": errors})
    return {"saved": saved, "errors": errors}


@router.get("/api/courses/{course_id}/documents")
def documents(course_id: int, request: Request):
    engine = _engine(request)
    _require_course(engine, course_id)
    return {"courseId": str(course_id), "documents": list_documents(engine, course_id)}


@router.get("/api/courses/{course_id}/documents/{document_id}/download")
def download_document(course_id: int, document_id: int, request: Request):
    engine = _engine(request)
    doc = get_document(engine, course_id, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="document not found")
    disposition = f'attachment; filename="{quote(doc["filename"])}"'
    return StreamingResponse(
        io.BytesIO(doc["data"]),
        media_type=doc["mime"] or "application/octet-stream",
        headers={"Content-Disposition": disposition},
    )


@router.delete("/api/courses/{course_id}/documents/{document_id}")
def delete(course_id: int, document_id: int, request: Request):
    engine = _engine(request)
    filename = delete_document(engine, course_id, document_id)
    if filename is None:
        raise HTTPException(status_code=404, detail="document not found")
    return {"id": str(document_id), "filename": filename, "deleted": True}


@router.post("/api/courses/{course_id}/documents/ask")
def ask(course_id: int, body: dict, request: Request):
    engine = _engine(request)
    course = _require_course(engine, course_id)

    message = (body or {}).get("message", "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")
    history = (body or {}).get("history") or []

    ranked = ranked_document_chunks(engine, course_id, message, limit=MAX_CHUNKS)
    chunks = ranked if ranked else ordered_document_chunks(engine, course_id, limit=MAX_CHUNKS)
    if not chunks:
        raise HTTPException(
            status_code=404,
            detail="No uploaded documents for this course yet. Upload a PDF, DOCX or text file first.",
        )

    # Pack the ranked chunks into the model context, respecting a char budget.
    parts: list[str] = []
    total = 0
    for chunk in chunks:
        block = f"[Document: {chunk['filename']}]\n{chunk['content']}"
        if total + len(block) > MAX_SOURCE_CHARS and parts:
            break
        parts.append(block)
        total += len(block)

    try:
        reply = gemini.chat_on_source(
            f"'{course}' course documents",
            "\n\n".join(parts),
            message,
            history,
        )
    except gemini.GeminiNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Gemini call failed: {exc}") from exc
    return {"reply": reply}