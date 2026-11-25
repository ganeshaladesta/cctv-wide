-- ==============================================================================
-- SCC - EAGLE EYES: Migration 012 - Add Bidirectional UNRAS Sync Fields
-- Supports full extraction and bidirectional synchronization for all 24 mapped fields:
-- Adds missing source columns: tujuan, jarak_lokasi_unras, redaksi,
-- and outbound synchronization tracking fields.
-- ==============================================================================

ALTER TABLE public.protests
  ADD COLUMN IF NOT EXISTS tujuan TEXT,
  ADD COLUMN IF NOT EXISTS jarak_lokasi_unras TEXT,
  ADD COLUMN IF NOT EXISTS redaksi TEXT,
  ADD COLUMN IF NOT EXISTS last_outbound_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outbound_sync_status TEXT DEFAULT 'none';

-- Add index on kode_unras for outbound lookup if not already present
CREATE INDEX IF NOT EXISTS idx_protests_kode_unras ON public.protests(kode_unras);
CREATE INDEX IF NOT EXISTS idx_protests_outbound_sync ON public.protests(outbound_sync_status);

COMMENT ON COLUMN public.protests.tujuan IS 'Tujuan/sasaran institusional aksi dari Excel';
COMMENT ON COLUMN public.protests.jarak_lokasi_unras IS 'Jarak lokasi unras dari kantor/objek pengamanan dari Excel';
COMMENT ON COLUMN public.protests.redaksi IS 'Teks redaksi resmi dari kolom Redaksi Excel';
COMMENT ON COLUMN public.protests.last_outbound_synced_at IS 'Waktu terakhir data berhasil disinkronisasi ke Excel';
COMMENT ON COLUMN public.protests.outbound_sync_status IS 'Status sinkronisasi outbound ke Excel: none, pending, success, failed';

