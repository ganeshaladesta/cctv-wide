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

