-- =============================================================================
-- SCC - EAGLE EYES — Unjuk Rasa (Protest) Monitoring Module
-- Migration: 003_add_source_type_to_protests.sql
-- Adds provenance column (manual vs excel_sync) to distinguish source
-- =============================================================================

ALTER TABLE public.protests ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'excel_sync';
CREATE INDEX IF NOT EXISTS idx_protests_source_type ON public.protests(source_type);

COMMENT ON COLUMN public.protests.source_type IS 'Identifies data origin: manual (created by operator/admin in UI) or excel_sync (ingested from OneDrive worksheet)';
