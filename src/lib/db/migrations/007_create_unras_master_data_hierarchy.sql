-- ==============================================================================
-- SCC EAGLE EYES - UNRAS MASTER DATA HIERARCHY MIGRATION
-- Migration: 007_create_unras_master_data_hierarchy.sql
-- Description: Cascading master data hierarchy for KP/KPw -> Regional -> Provinsi -> Lokasi
-- ==============================================================================

-- 1. Master KP / KPw
CREATE TABLE IF NOT EXISTS master_kp_kpw (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Master Regional
CREATE TABLE IF NOT EXISTS master_regional (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kp_kpw_id UUID NOT NULL REFERENCES master_kp_kpw(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_regional_per_kp UNIQUE(kp_kpw_id, normalized_name)
);

-- 3. Master Provinsi
CREATE TABLE IF NOT EXISTS master_provinsi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    regional_id UUID NOT NULL REFERENCES master_regional(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_provinsi_per_regional UNIQUE(regional_id, normalized_name)
);

-- 4. Master Lokasi
CREATE TABLE IF NOT EXISTS master_lokasi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provinsi_id UUID NOT NULL REFERENCES master_provinsi(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_lokasi_per_provinsi UNIQUE(provinsi_id, normalized_name)
);

-- 5. Master Data Audit Review (For suspicious combinations, typos, legacy variants)
CREATE TABLE IF NOT EXISTS master_data_audit_review (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    row_number INTEGER,
    source_id_kejadian TEXT,
    raw_kp_kpw TEXT,
    raw_regional TEXT,
    raw_provinsi TEXT,
    raw_lokasi TEXT,
    normalized_kp_kpw TEXT,
    normalized_regional TEXT,
    normalized_provinsi TEXT,
    normalized_lokasi TEXT,
    issues TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'pending_review',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create Indexes for fast cascading queries
CREATE INDEX IF NOT EXISTS idx_regional_kp_kpw ON master_regional(kp_kpw_id);
CREATE INDEX IF NOT EXISTS idx_provinsi_regional ON master_provinsi(regional_id);
CREATE INDEX IF NOT EXISTS idx_lokasi_provinsi ON master_lokasi(provinsi_id);
CREATE INDEX IF NOT EXISTS idx_audit_review_status ON master_data_audit_review(review_status);

-- Enable RLS
ALTER TABLE master_kp_kpw ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_regional ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_provinsi ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_lokasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_data_audit_review ENABLE ROW LEVEL SECURITY;

-- Read Policies: Everyone authenticated/anonymous can read active master data
DROP POLICY IF EXISTS "Public read access for master_kp_kpw" ON master_kp_kpw;
CREATE POLICY "Public read access for master_kp_kpw" ON master_kp_kpw FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public read access for master_regional" ON master_regional;
CREATE POLICY "Public read access for master_regional" ON master_regional FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public read access for master_provinsi" ON master_provinsi;
CREATE POLICY "Public read access for master_provinsi" ON master_provinsi FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public read access for master_lokasi" ON master_lokasi;
CREATE POLICY "Public read access for master_lokasi" ON master_lokasi FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Staff read access for master_audit" ON master_data_audit_review;
CREATE POLICY "Staff read access for master_audit" ON master_data_audit_review FOR SELECT USING (true);

