-- Migration 011: Add source-owned status field (status_sumber) to protests
-- SCC Eagle Eyes

ALTER TABLE public.protests ADD COLUMN IF NOT EXISTS status_sumber TEXT;
CREATE INDEX IF NOT EXISTS idx_protests_status_sumber ON public.protests(status_sumber);

COMMENT ON COLUMN public.protests.status_sumber IS 'Status kejadian dari sumber Excel (Belum Berlangsung, Sedang Berlangsung, Selesai)';

