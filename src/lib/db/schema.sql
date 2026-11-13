-- SCC - EAGLE EYES — Modular SQLite / Cloudflare D1 Schema
-- Copyright: Developed by Ganesha Ladesta

CREATE TABLE IF NOT EXISTS provinces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    island TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    total_cameras INTEGER NOT NULL DEFAULT 0,
    online_cameras INTEGER NOT NULL DEFAULT 0,
    offline_cameras INTEGER NOT NULL DEFAULT 0,
    city_count INTEGER NOT NULL DEFAULT 0,
    source_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    province_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    total_cameras INTEGER NOT NULL DEFAULT 0,
    online_cameras INTEGER NOT NULL DEFAULT 0,
    offline_cameras INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cities_province ON cities(province_id);

CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    province_name TEXT NOT NULL,
    city_id TEXT NOT NULL REFERENCES cities(id),
    city_name TEXT NOT NULL,
    official_url TEXT NOT NULL,
    protocol TEXT NOT NULL,
    requires_proxy INTEGER NOT NULL DEFAULT 0,
    total_cameras INTEGER NOT NULL DEFAULT 0,
    online_cameras INTEGER NOT NULL DEFAULT 0,
    offline_cameras INTEGER NOT NULL DEFAULT 0,
    last_verified_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_province ON sources(province_id);

CREATE TABLE IF NOT EXISTS cameras (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    province_id TEXT NOT NULL REFERENCES provinces(id),
    province_name TEXT NOT NULL,
    city_id TEXT NOT NULL REFERENCES cities(id),
    city_name TEXT NOT NULL,
    source_id TEXT NOT NULL REFERENCES sources(id),
    source_name TEXT NOT NULL,
    location TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    stream_url TEXT NOT NULL,
    source_url TEXT NOT NULL,
    protocol TEXT NOT NULL CHECK (protocol IN ('HLS', 'MJPEG', 'SNAPSHOT', 'WEBSOCKET', 'MP4', 'EMBED')),
    status TEXT NOT NULL CHECK (status IN ('ONLINE', 'OFFLINE')),
    last_checked_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cameras_province ON cameras(province_id);
CREATE INDEX IF NOT EXISTS idx_cameras_city ON cameras(city_id);
CREATE INDEX IF NOT EXISTS idx_cameras_source ON cameras(source_id);
CREATE INDEX IF NOT EXISTS idx_cameras_status ON cameras(status);
CREATE INDEX IF NOT EXISTS idx_cameras_protocol ON cameras(protocol);
CREATE INDEX IF NOT EXISTS idx_cameras_coords ON cameras(latitude, longitude);

CREATE TABLE IF NOT EXISTS camera_status (
    camera_id TEXT PRIMARY KEY REFERENCES cameras(id),
    status TEXT NOT NULL CHECK (status IN ('ONLINE', 'OFFLINE')),
    http_status INTEGER,
    latency_ms INTEGER,
    error_reason TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS camera_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id TEXT NOT NULL REFERENCES cameras(id),
    status TEXT NOT NULL,
    http_status INTEGER,
    latency_ms INTEGER,
    checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_camera_checks_cam ON camera_checks(camera_id);

CREATE TABLE IF NOT EXISTS source_sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL REFERENCES sources(id),
    discovered_count INTEGER NOT NULL,
    online_count INTEGER NOT NULL,
    status TEXT NOT NULL,
    synced_at TEXT NOT NULL
);

-- =============================================================================
-- UNJUK RASA (PROTEST) MONITORING MODULE (SQLite Local Mirror)
-- =============================================================================

CREATE TABLE IF NOT EXISTS protest_categories (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS protests (
    id TEXT PRIMARY KEY,
    id_kejadian TEXT NOT NULL UNIQUE,
    kode_unras TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    waktu_mulai TEXT,
    waktu_selesai TEXT,
    event_datetime TEXT,
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
    raw_source_payload TEXT DEFAULT '{}',

    -- Operator-Managed Fields
    status TEXT NOT NULL DEFAULT 'scheduled',
    urgency TEXT NOT NULL DEFAULT 'medium',
    category_id TEXT REFERENCES protest_categories(id),
    validated_lat REAL,
    validated_lng REAL,
    has_coordinates INTEGER NOT NULL DEFAULT 0,
    actual_crowd_size INTEGER,
    situation_summary TEXT,
    editorial_draft TEXT,
    editorial_final TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    completed_by_id TEXT,
    completed_by_name TEXT,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    last_synced_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_protests_id_kejadian ON protests(id_kejadian);
CREATE INDEX IF NOT EXISTS idx_protests_kode_unras ON protests(kode_unras);
CREATE INDEX IF NOT EXISTS idx_protests_tanggal ON protests(tanggal);
CREATE INDEX IF NOT EXISTS idx_protests_status ON protests(status);
CREATE INDEX IF NOT EXISTS idx_protests_urgency ON protests(urgency);
CREATE INDEX IF NOT EXISTS idx_protests_deleted ON protests(deleted_at);
CREATE INDEX IF NOT EXISTS idx_protests_coords ON protests(validated_lat, validated_lng);

CREATE TABLE IF NOT EXISTS protest_operator_reports (
    id TEXT PRIMARY KEY,
    protest_id TEXT NOT NULL REFERENCES protests(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_role TEXT NOT NULL DEFAULT 'operator',
    content TEXT NOT NULL,
    crowd_estimate INTEGER,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_protest_reports_protest ON protest_operator_reports(protest_id);

CREATE TABLE IF NOT EXISTS protest_status_history (
    id TEXT PRIMARY KEY,
    protest_id TEXT NOT NULL REFERENCES protests(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    reason TEXT,
    changed_by_id TEXT NOT NULL,
    changed_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_protest_history_protest ON protest_status_history(protest_id);

CREATE TABLE IF NOT EXISTS protest_camera_links (
    id TEXT PRIMARY KEY,
    protest_id TEXT NOT NULL REFERENCES protests(id) ON DELETE CASCADE,
    camera_id TEXT NOT NULL,
    camera_name TEXT NOT NULL,
    camera_stream_url TEXT,
    camera_protocol TEXT,
    camera_status TEXT,
    distance_meters REAL NOT NULL DEFAULT 0,
    notes TEXT,
    is_recommended INTEGER NOT NULL DEFAULT 0,
    linked_by_id TEXT NOT NULL,
    linked_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (protest_id, camera_id)
);
CREATE INDEX IF NOT EXISTS idx_protest_cameras_protest ON protest_camera_links(protest_id);

CREATE TABLE IF NOT EXISTS protest_attachments (
    id TEXT PRIMARY KEY,
    protest_id TEXT NOT NULL REFERENCES protests(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    uploaded_by_id TEXT NOT NULL,
    uploaded_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS protest_sync_logs (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    period_start TEXT,
    period_end TEXT,
    status TEXT NOT NULL,
    triggered_by TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_protest_sync_logs_started ON protest_sync_logs(started_at);


