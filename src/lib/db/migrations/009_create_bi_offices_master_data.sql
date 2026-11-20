-- ============================================================================
-- MIGRATION 009: BANK INDONESIA OFFICE MASTER DATA & GEOSPATIAL INTELLIGENCE
-- Supports 47 normalized BI offices with validated coordinates, radius visualization,
-- proximity distance queries, and coordinate swap auditing.
-- ============================================================================

CREATE TABLE IF NOT EXISTS bi_offices (
    id TEXT PRIMARY KEY,
    office_id TEXT UNIQUE NOT NULL,
    office_name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    office_type TEXT NOT NULL, -- 'Kantor Pusat', 'KPwDN', 'KOPERBI IKN'
    regional TEXT NOT NULL,    -- 'Sumatera', 'Jawa', 'KTI', 'Kantor Pusat'
    island_group TEXT NOT NULL,-- 'Sumatera', 'Jawa', 'Kalimantan', 'Sulawesi', 'Bali & Nusa Tenggara', 'Maluku & Papua'
    latitude REAL,
    longitude REAL,
    address TEXT NOT NULL,
    postal_code TEXT,
    phone TEXT,
    fax TEXT,
    administrative_code TEXT,
    source TEXT NOT NULL DEFAULT 'koordinat (1).csv',
    validation_status TEXT NOT NULL DEFAULT 'verified', -- 'verified', 'unverified', 'missing_coordinates', 'invalid_coordinates'
    validation_reason TEXT,
    raw_coordinates_text TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bi_offices_type ON bi_offices(office_type);
CREATE INDEX IF NOT EXISTS idx_bi_offices_regional ON bi_offices(regional);
CREATE INDEX IF NOT EXISTS idx_bi_offices_coords ON bi_offices(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_bi_offices_validation ON bi_offices(validation_status);

