-- ==============================================================================
-- SCC - EAGLE EYES: Migration 004 - Location Intelligence & Automatic Geocoding
-- Adds suggested coordinates, geocoding confidence, validation workflow status,
-- and alternative candidate coordinates to protests table.
-- ==============================================================================

-- 1. Add geocoding intelligence and location validation columns
ALTER TABLE public.protests
  ADD COLUMN IF NOT EXISTS suggested_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS suggested_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS suggested_address TEXT,
  ADD COLUMN IF NOT EXISTS geocoding_provider TEXT,
  ADD COLUMN IF NOT EXISTS geocoding_confidence TEXT CHECK (geocoding_confidence IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS location_validation_status TEXT NOT NULL DEFAULT 'unmapped' CHECK (location_validation_status IN ('unmapped', 'pending_validation', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS geocoding_alternatives JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_by_id UUID,
  ADD COLUMN IF NOT EXISTS validated_by_name TEXT;

-- 2. Backfill existing records: If validated_lat & validated_lng already exist, mark as 'verified'
UPDATE public.protests
SET location_validation_status = 'verified'
WHERE validated_lat IS NOT NULL 
  AND validated_lng IS NOT NULL 
  AND location_validation_status = 'unmapped';

-- 3. Create indexes for efficient filtering and review queues
CREATE INDEX IF NOT EXISTS idx_protests_loc_validation_status 
  ON public.protests(location_validation_status);

CREATE INDEX IF NOT EXISTS idx_protests_geocoding_confidence 
  ON public.protests(geocoding_confidence) 
  WHERE geocoding_confidence IS NOT NULL;

