-- =============================================================================
-- SCC - EAGLE EYES — Unjuk Rasa (Protest) Monitoring Module
-- Migration: 002_create_protest_monitoring_schema.sql
-- Copyright: Developed by Ganesha Ladesta
-- Target: PostgreSQL / Supabase
-- =============================================================================

-- Enable pgcrypto / uuid extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. Protest Categories
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.protest_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed standard categories
INSERT INTO public.protest_categories (code, name, description, color) VALUES
    ('BURUH', 'Ketenagakerjaan & Buruh', 'Aksi serikat buruh, upah, PHK, dan jaminan sosial', '#F59E0B'),
    ('MAHASISWA', 'Mahasiswa & Pemuda', 'Aksi BEM, elemen kampus, dan kepemudaan', '#3B82F6'),
    ('MASYARAKAT', 'Masyarakat & Warga', 'Aksi warga sipil, lingkungan, dan agraria', '#10B981'),
    ('POLITIK', 'Politik & Demokrasi', 'Aksi kebijakan pemerintah, pemilu, dan hukum', '#8B5CF6'),
    ('AGRARIA', 'Agraria & Lingkungan', 'Sengketa tanah, AMDAL, dan perusakan alam', '#059669'),
    ('LAINNYA', 'Lainnya / Umum', 'Aksi di luar kategori utama', '#6B7280')
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Core Protests Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.protests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source Excel Ingested Fields (worksheet: NEW UNRAS 2022-2026)
    id_kejadian TEXT NOT NULL UNIQUE,
    kode_unras TEXT NOT NULL,
    tanggal DATE NOT NULL,
    waktu_mulai TIME,
    waktu_selesai TIME,
    event_datetime TIMESTAMPTZ,
    lokasi TEXT NOT NULL,
    titik_kumpul TEXT,
    sasaran_aksi TEXT,
    isu_tuntutan TEXT NOT NULL,
    estimasi_massa_source INTEGER,
    organisasi_kelompok TEXT,
    korlap_pimpinan TEXT,
    wilayah_hukum TEXT,
    provinsi TEXT,
    kota_kabupaten TEXT,
    keterangan_source TEXT,
    raw_source_payload JSONB DEFAULT '{}'::jsonb,

    -- Operator-Managed Fields (NEVER overwritten by Excel synchronization)
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ongoing', 'monitoring', 'completed', 'cancelled')),
    urgency TEXT NOT NULL DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    category_id UUID REFERENCES public.protest_categories(id) ON DELETE SET NULL,
    validated_lat DOUBLE PRECISION,
    validated_lng DOUBLE PRECISION,
    has_coordinates BOOLEAN GENERATED ALWAYS AS (validated_lat IS NOT NULL AND validated_lng IS NOT NULL) STORED,
    actual_crowd_size INTEGER,
    situation_summary TEXT,
    editorial_draft TEXT,
    editorial_final TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    completed_by_id UUID,
    completed_by_name TEXT,

    -- Timestamps & Soft Delete
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ
);

-- Indexes for high-performance filtering & spatial queries
CREATE INDEX IF NOT EXISTS idx_protests_id_kejadian ON public.protests(id_kejadian);
CREATE INDEX IF NOT EXISTS idx_protests_kode_unras ON public.protests(kode_unras);
CREATE INDEX IF NOT EXISTS idx_protests_tanggal ON public.protests(tanggal);
CREATE INDEX IF NOT EXISTS idx_protests_event_datetime ON public.protests(event_datetime);
CREATE INDEX IF NOT EXISTS idx_protests_status ON public.protests(status);
CREATE INDEX IF NOT EXISTS idx_protests_urgency ON public.protests(urgency);
CREATE INDEX IF NOT EXISTS idx_protests_category ON public.protests(category_id);
CREATE INDEX IF NOT EXISTS idx_protests_archived ON public.protests(is_archived);
CREATE INDEX IF NOT EXISTS idx_protests_deleted ON public.protests(deleted_at);
CREATE INDEX IF NOT EXISTS idx_protests_coords ON public.protests(validated_lat, validated_lng) WHERE validated_lat IS NOT NULL AND validated_lng IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_protests_provinsi ON public.protests(provinsi);
CREATE INDEX IF NOT EXISTS idx_protests_kota ON public.protests(kota_kabupaten);

-- -----------------------------------------------------------------------------
-- 3. Operator Reports Timeline
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.protest_operator_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protest_id UUID NOT NULL REFERENCES public.protests(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL CHECK (report_type IN ('initial', 'progress', 'summary')),
    author_id UUID NOT NULL,
    author_name TEXT NOT NULL,
    author_role TEXT NOT NULL DEFAULT 'operator',
    content TEXT NOT NULL,
    crowd_estimate INTEGER,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_protest_reports_protest ON public.protest_operator_reports(protest_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Status Transition History Audit Trail
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.protest_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protest_id UUID NOT NULL REFERENCES public.protests(id) ON DELETE CASCADE,
    from_status TEXT CHECK (from_status IS NULL OR from_status IN ('scheduled', 'ongoing', 'monitoring', 'completed', 'cancelled')),
    to_status TEXT NOT NULL CHECK (to_status IN ('scheduled', 'ongoing', 'monitoring', 'completed', 'cancelled')),
    reason TEXT,
    changed_by_id UUID NOT NULL,
    changed_by_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_protest_history_protest ON public.protest_status_history(protest_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 5. CCTV Camera Linkage
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.protest_camera_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protest_id UUID NOT NULL REFERENCES public.protests(id) ON DELETE CASCADE,
    camera_id TEXT NOT NULL, -- references CCTV camera ID in Eagle Eyes catalog
    camera_name TEXT NOT NULL,
    camera_stream_url TEXT,
    camera_protocol TEXT,
    camera_status TEXT,
    distance_meters DOUBLE PRECISION NOT NULL DEFAULT 0,
    notes TEXT,
    is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
    linked_by_id UUID NOT NULL,
    linked_by_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (protest_id, camera_id)
);
CREATE INDEX IF NOT EXISTS idx_protest_cameras_protest ON public.protest_camera_links(protest_id);
CREATE INDEX IF NOT EXISTS idx_protest_cameras_cam ON public.protest_camera_links(camera_id);

-- -----------------------------------------------------------------------------
-- 6. Attachments Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.protest_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protest_id UUID NOT NULL REFERENCES public.protests(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    uploaded_by_id UUID NOT NULL,
    uploaded_by_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_protest_attachments_protest ON public.protest_attachments(protest_id);

-- -----------------------------------------------------------------------------
-- 7. Sync Logs (OneDrive / Microsoft Graph Audit)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.protest_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed', 'skipped')),
    triggered_by TEXT NOT NULL DEFAULT 'power_automate' CHECK (triggered_by IN ('power_automate', 'scheduler_cron', 'manual_admin', 'system')),
    triggered_by_user TEXT,
    source_worksheet TEXT NOT NULL DEFAULT 'NEW UNRAS 2022-2026',
    records_received INTEGER NOT NULL DEFAULT 0,
    records_processed INTEGER NOT NULL DEFAULT 0,
    records_created INTEGER NOT NULL DEFAULT 0,
    records_updated INTEGER NOT NULL DEFAULT 0,
    records_skipped INTEGER NOT NULL DEFAULT 0,
    records_failed INTEGER NOT NULL DEFAULT 0,
    error_details TEXT,
    duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_protest_sync_logs_started ON public.protest_sync_logs(started_at DESC);

-- -----------------------------------------------------------------------------
-- 8. Triggers for updated_at Auto-Refresh
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_protest_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protests_updated_at ON public.protests;
CREATE TRIGGER trg_protests_updated_at
    BEFORE UPDATE ON public.protests
    FOR EACH ROW
    EXECUTE FUNCTION public.set_protest_updated_at();

DROP TRIGGER IF EXISTS trg_protest_reports_updated_at ON public.protest_operator_reports;
CREATE TRIGGER trg_protest_reports_updated_at
    BEFORE UPDATE ON public.protest_operator_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.set_protest_updated_at();

-- -----------------------------------------------------------------------------
-- 9. Row Level Security (RLS) & Access Control
-- -----------------------------------------------------------------------------
ALTER TABLE public.protest_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protest_operator_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protest_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protest_camera_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protest_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protest_sync_logs ENABLE ROW LEVEL SECURITY;

-- Helper to extract user role from auth JWT
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
BEGIN
    RETURN COALESCE(
        current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role',
        current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'role',
        'viewer'
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- VIEWERS, OPERATORS, ADMINS can SELECT non-deleted protests
CREATE POLICY "Viewers can read active protests"
    ON public.protests FOR SELECT
    USING (deleted_at IS NULL);

-- OPERATORS & ADMINS can INSERT protests
CREATE POLICY "Operators and admins can create protests"
    ON public.protests FOR INSERT
    WITH CHECK (public.current_user_role() IN ('admin', 'operator'));

-- OPERATORS & ADMINS can UPDATE protests
CREATE POLICY "Operators and admins can update protests"
    ON public.protests FOR UPDATE
    USING (public.current_user_role() IN ('admin', 'operator') AND deleted_at IS NULL);

-- ONLY ADMINS can SOFT DELETE protests
CREATE POLICY "Only admins can delete protests"
    ON public.protests FOR DELETE
    USING (public.current_user_role() = 'admin');

-- OPERATOR REPORTS RLS
CREATE POLICY "Anyone can read reports"
    ON public.protest_operator_reports FOR SELECT
    USING (TRUE);

CREATE POLICY "Operators and admins can insert reports"
    ON public.protest_operator_reports FOR INSERT
    WITH CHECK (public.current_user_role() IN ('admin', 'operator'));

-- CAMERA LINKS RLS
CREATE POLICY "Anyone can read camera links"
    ON public.protest_camera_links FOR SELECT
    USING (TRUE);

CREATE POLICY "Operators and admins can manage camera links"
    ON public.protest_camera_links FOR ALL
    USING (public.current_user_role() IN ('admin', 'operator'));

-- SYNC LOGS RLS: ONLY ADMINS & OPERATORS can view, only ADMIN/SERVICE can write
CREATE POLICY "Operators and admins can view sync logs"
    ON public.protest_sync_logs FOR SELECT
    USING (public.current_user_role() IN ('admin', 'operator'));

CREATE POLICY "Admin or service role can manage sync logs"
    ON public.protest_sync_logs FOR ALL
    USING (public.current_user_role() = 'admin' OR auth.role() = 'service_role');

