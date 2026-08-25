-- StudyStation schema (idempotent; applied by the sync job on every run)
-- NOTE: statements are split on ";" + newline by sync/db.py - keep every
-- statement terminated by a semicolon at end of line.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS courses (
    id          BIGINT PRIMARY KEY,          -- Canvas course id
    name        TEXT NOT NULL,
    course_code TEXT,
    term_name   TEXT,
    term_start  DATE,
    term_end    DATE,
    start_at    TIMESTAMPTZ,
    end_at      TIMESTAMPTZ,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    raw         JSONB NOT NULL DEFAULT '{}',
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignments (
    id               BIGINT PRIMARY KEY,     -- Canvas assignment id
    course_id        BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    description_html TEXT,
    due_at           TIMESTAMPTZ,
    unlock_at        TIMESTAMPTZ,
    lock_at          TIMESTAMPTZ,
    points_possible  NUMERIC(8,2),
    submission_types JSONB NOT NULL DEFAULT '[]',
    html_url         TEXT,
    published        BOOLEAN,
    raw              JSONB NOT NULL DEFAULT '{}',
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_course_due
    ON assignments (course_id, due_at);

-- One normalized timeline fed from both Canvas sources. Keyed on
-- (source_type, source_id) so re-syncs upsert instead of duplicating.
CREATE TABLE IF NOT EXISTS due_dates (
    id          BIGSERIAL PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('assignment', 'calendar_event')),
    source_id   BIGINT NOT NULL,
    course_id   BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title       TEXT,
    due_at      TIMESTAMPTZ NOT NULL,
    raw         JSONB NOT NULL DEFAULT '{}',
    UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_due_dates_when ON due_dates (due_at);

-- Local-only study state; the sync NEVER touches this table.
CREATE TABLE IF NOT EXISTS assignment_status (
    assignment_id BIGINT PRIMARY KEY REFERENCES assignments(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'not_started'
                  CHECK (status IN ('not_started', 'drafted', 'submitted')),
    notes         TEXT,
    updated_by    TEXT NOT NULL DEFAULT 'manual',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RAG chunks for later AI passes. Embedding dim is FIXED at 768
-- (nomic-embed-text via Ollama); changing models means re-embedding and
-- altering this column. Sync does not populate this table yet.
CREATE TABLE IF NOT EXISTS material_chunks (
    id          BIGSERIAL PRIMARY KEY,
    course_id   BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('syllabus', 'slides', 'reading', 'page', 'other')),
    source_ref  TEXT,
    title       TEXT,
    chunk_index INT NOT NULL DEFAULT 0,
    content     TEXT NOT NULL,
    embedding   vector(768),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course_id, source_type, source_ref, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding
    ON material_chunks USING hnsw (embedding vector_cosine_ops);

-- Curated links scraped from "resource" courses (e.g. SWCC Resources):
-- bookstore, tech support, tutorials, etc. Re-scraped each sync.
CREATE TABLE IF NOT EXISTS resource_links (
    id          BIGSERIAL PRIMARY KEY,
    course_id   BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    category    TEXT,                      -- page title, e.g. 'Canvas Tutorials'
    title       TEXT NOT NULL,             -- link text
    url         TEXT NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course_id, url)
);

-- Observability for the nightly cron: one row per run attempt.
CREATE TABLE IF NOT EXISTS sync_runs (
    id         BIGSERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status     TEXT NOT NULL CHECK (status IN ('success', 'failed', 'session_expired')),
    detail     TEXT,
    counts     JSONB
);
