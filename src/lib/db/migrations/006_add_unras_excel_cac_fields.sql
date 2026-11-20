-- ==============================================================================
-- SCC - EAGLE EYES: Migration 006 - Add Excel C:AC Columns to Protests Table
-- Supports full direct data entry of daily Unras records matching official
-- workbook worksheet 'NEW UNRAS 2022-2026' (Columns C through AC).
-- ==============================================================================

ALTER TABLE public.protests
  ADD COLUMN IF NOT EXISTS urutan_bulan INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tahun INTEGER,
  ADD COLUMN IF NOT EXISTS bulan TEXT,
  ADD COLUMN IF NOT EXISTS kategori_kejadian TEXT DEFAULT 'Unjuk Rasa',
  ADD COLUMN IF NOT EXISTS kp_kpw TEXT DEFAULT 'KPBI',
  ADD COLUMN IF NOT EXISTS regional TEXT DEFAULT 'Kantor Pusat',
  ADD COLUMN IF NOT EXISTS kategori_isu TEXT,
  ADD COLUMN IF NOT EXISTS dampak TEXT DEFAULT 'Tidak Ada',
  ADD COLUMN IF NOT EXISTS keterangan_dampak TEXT,
  ADD COLUMN IF NOT EXISTS nama_pelapor TEXT,
  ADD COLUMN IF NOT EXISTS info_awal TEXT,
  ADD COLUMN IF NOT EXISTS tindak_lanjut TEXT,
  ADD COLUMN IF NOT EXISTS progres_asistensi TEXT,
  ADD COLUMN IF NOT EXISTS realisasi TEXT DEFAULT 'Terealisasi';

-- Backfill tahun and bulan for existing records where tanggal is present
UPDATE public.protests
SET 
  tahun = EXTRACT(YEAR FROM tanggal)::INTEGER,
  bulan = CASE EXTRACT(MONTH FROM tanggal)::INTEGER
    WHEN 1 THEN 'Januari'
    WHEN 2 THEN 'Februari'
    WHEN 3 THEN 'Maret'
    WHEN 4 THEN 'April'
    WHEN 5 THEN 'Mei'
    WHEN 6 THEN 'Juni'
    WHEN 7 THEN 'Juli'
    WHEN 8 THEN 'Agustus'
    WHEN 9 THEN 'September'
    WHEN 10 THEN 'Oktober'
    WHEN 11 THEN 'November'
    WHEN 12 THEN 'Desember'
  END
WHERE tahun IS NULL AND tanggal IS NOT NULL;

-- Indexes for high performance filtering & reporting
CREATE INDEX IF NOT EXISTS idx_protests_regional ON public.protests(regional);
CREATE INDEX IF NOT EXISTS idx_protests_kp_kpw ON public.protests(kp_kpw);
CREATE INDEX IF NOT EXISTS idx_protests_kategori_isu ON public.protests(kategori_isu);
CREATE INDEX IF NOT EXISTS idx_protests_realisasi ON public.protests(realisasi);
CREATE INDEX IF NOT EXISTS idx_protests_dampak ON public.protests(dampak);
CREATE INDEX IF NOT EXISTS idx_protests_tahun_bulan ON public.protests(tahun, bulan);

