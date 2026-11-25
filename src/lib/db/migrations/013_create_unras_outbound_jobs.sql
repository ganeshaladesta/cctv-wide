-- ==============================================================================
-- SCC - EAGLE EYES: Migration 013 - Create Persistent Outbound Job Queue
-- Architecture: Asynchronous Outbound Sync from SCC to Excel Table3 via Power Automate
-- Table: public.unras_outbound_jobs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.unras_outbound_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protest_id UUID REFERENCES public.protests(id) ON DELETE CASCADE,
  kode_unras TEXT NOT NULL,
  id_kejadian TEXT,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ
);

-- Indexes for efficient claiming, polling, and lookup
CREATE INDEX IF NOT EXISTS idx_unras_outbound_jobs_status ON public.unras_outbound_jobs(status);
CREATE INDEX IF NOT EXISTS idx_unras_outbound_jobs_protest_id ON public.unras_outbound_jobs(protest_id);
CREATE INDEX IF NOT EXISTS idx_unras_outbound_jobs_kode_unras ON public.unras_outbound_jobs(kode_unras);
CREATE INDEX IF NOT EXISTS idx_unras_outbound_jobs_created_at ON public.unras_outbound_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_unras_outbound_jobs_next_retry ON public.unras_outbound_jobs(next_retry_at);

-- Comments
COMMENT ON TABLE public.unras_outbound_jobs IS 'Antrean pekerjaan latar belakang asinkron untuk sinkronisasi outbound SCC ke Excel Table3';
COMMENT ON COLUMN public.unras_outbound_jobs.status IS 'Status antrean: pending, processing, success, failed';
COMMENT ON COLUMN public.unras_outbound_jobs.attempts IS 'Jumlah percobaan pengiriman yang sudah dilakukan';
COMMENT ON COLUMN public.unras_outbound_jobs.max_attempts IS 'Batas maksimum percobaan ulang sebelum ditandai gagal permanen';
COMMENT ON COLUMN public.unras_outbound_jobs.locked_at IS 'Waktu kunci pekerja latar belakang untuk mencegah konkurensi ganda';

-- Enable Row Level Security
ALTER TABLE public.unras_outbound_jobs ENABLE ROW LEVEL SECURITY;

-- Service role full access policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'unras_outbound_jobs' AND policyname = 'unras_outbound_jobs_service_role'
  ) THEN
    CREATE POLICY unras_outbound_jobs_service_role ON public.unras_outbound_jobs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Helper RPC for atomic worker job claiming with SKIP LOCKED
CREATE OR REPLACE FUNCTION claim_unras_outbound_job()
RETURNS SETOF public.unras_outbound_jobs AS $$
BEGIN
  RETURN QUERY
  UPDATE public.unras_outbound_jobs
  SET status = 'processing',
      locked_at = NOW(),
      started_at = NOW(),
      attempts = attempts + 1,
      updated_at = NOW()
  WHERE id = (
    SELECT id FROM public.unras_outbound_jobs
    WHERE (
      status = 'pending'
      OR (status = 'failed' AND attempts < max_attempts AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
    )
    AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '5 minutes')
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Transactional RPC to atomically insert an outbound job and lock protest sync state
CREATE OR REPLACE FUNCTION enqueue_unras_outbound_job_atomic(
  p_protest_id UUID,
  p_kode_unras TEXT,
  p_id_kejadian TEXT,
  p_job_payload JSONB,
  p_correlation_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_job_id UUID := gen_random_uuid();
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Atomically update protest status to pending in the same transaction
  UPDATE public.protests
  SET outbound_sync_status = 'pending',
      updated_at = v_now
  WHERE id = p_protest_id;

  -- 2. Insert into outbound jobs queue in the exact same transaction
  INSERT INTO public.unras_outbound_jobs (
    id,
    protest_id,
    kode_unras,
    id_kejadian,
    payload,
    status,
    attempts,
    max_attempts,
    correlation_id,
    created_at,
    updated_at
  ) VALUES (
    v_job_id,
    p_protest_id,
    p_kode_unras,
    p_id_kejadian,
    p_job_payload,
    'pending',
    0,
    5,
    p_correlation_id,
    v_now,
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job_id,
    'protest_id', p_protest_id,
    'status', 'pending'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

