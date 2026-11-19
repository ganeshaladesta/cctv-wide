-- ==============================================================================
-- SCC - EAGLE EYES: Migration 005 - Flexible User Attribution IDs
-- Allows both standard UUIDs and system actor identifiers (e.g. auth providers)
-- across all protest tables.
-- ==============================================================================

-- 1. Protests table: completed_by_id and validated_by_id
ALTER TABLE public.protests 
  ALTER COLUMN completed_by_id TYPE TEXT USING completed_by_id::TEXT;

ALTER TABLE public.protests 
  ALTER COLUMN validated_by_id TYPE TEXT USING validated_by_id::TEXT;

-- 2. Status History: changed_by_id
ALTER TABLE public.protest_status_history 
  ALTER COLUMN changed_by_id TYPE TEXT USING changed_by_id::TEXT;

-- 3. Operator Reports: author_id
ALTER TABLE public.protest_operator_reports 
  ALTER COLUMN author_id TYPE TEXT USING author_id::TEXT;

-- 4. Camera Links: linked_by_id
ALTER TABLE public.protest_camera_links 
  ALTER COLUMN linked_by_id TYPE TEXT USING linked_by_id::TEXT;
