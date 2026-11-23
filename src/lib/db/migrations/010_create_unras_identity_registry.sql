-- =============================================================================
-- SCC - EAGLE EYES — Unjuk Rasa Identity Registry & Review Queue
-- Migration: 010_create_unras_identity_registry.sql
-- Copyright: Developed by Ganesha Ladesta
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Persistent Incident Identity Registry
-- Stores canonical incident mapping and deduplication fingerprints
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.unras_identity_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_id TEXT NOT NULL,
    identity_type TEXT NOT NULL CHECK (identity_type IN ('source_id', 'fingerprint_exact', 'fingerprint_semantic', 'alias')),
    identity_key TEXT NOT NULL UNIQUE,
    event_date DATE NOT NULL,
    confidence TEXT NOT NULL DEFAULT 'confirmed' CHECK (confidence IN ('confirmed', 'probable', 'ambiguous')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unras_identity_key ON public.unras_identity_registry(identity_key);
CREATE INDEX IF NOT EXISTS idx_unras_identity_canonical ON public.unras_identity_registry(canonical_id);
CREATE INDEX IF NOT EXISTS idx_unras_identity_date ON public.unras_identity_registry(event_date);

-- -----------------------------------------------------------------------------
-- 2. Ambiguous Incidents Review Queue
-- Holds ambiguous or low-confidence records for operator review before insertion
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.unras_review_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_row_hash TEXT NOT NULL,
    tanggal DATE NOT NULL,
    waktu TIME,
    lokasi TEXT NOT NULL,
    organisasi_kelompok TEXT,
    isu_tuntutan TEXT NOT NULL,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    ambiguity_reason TEXT NOT NULL,
    matched_canonical_id TEXT,
    similarity_score DOUBLE PRECISION,
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'merged')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_unras_review_queue_date ON public.unras_review_queue(tanggal);
CREATE INDEX IF NOT EXISTS idx_unras_review_queue_status ON public.unras_review_queue(status);

