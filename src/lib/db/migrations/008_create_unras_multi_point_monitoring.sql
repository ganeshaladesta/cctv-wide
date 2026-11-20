-- ============================================================================
-- MIGRATION 008: UNRAS DAILY MULTI-POINT SITUATIONAL MONITORING
-- Supports multiple physical points per day/event, arbitrary mass elements,
-- historical crowd observation logs, and point-level CCTV stream linking.
-- ============================================================================

-- 1. Protest Points Table
CREATE TABLE IF NOT EXISTS protest_points (
    id TEXT PRIMARY KEY,
    protest_id TEXT NOT NULL REFERENCES protests(id) ON DELETE CASCADE,
    point_name TEXT NOT NULL,
    location_address TEXT,
    provinsi TEXT,
    kota_kabupaten TEXT,
    regional TEXT,
    latitude REAL,
    longitude REAL,
    status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'ongoing', 'monitoring', 'completed', 'cancelled'
    urgency TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_protest_points_protest_id ON protest_points(protest_id);
CREATE INDEX IF NOT EXISTS idx_protest_points_status ON protest_points(status);
CREATE INDEX IF NOT EXISTS idx_protest_points_coords ON protest_points(latitude, longitude);

-- 2. Protest Elements Table (Organizations, Alliances, Groups)
CREATE TABLE IF NOT EXISTS protest_elements (
    id TEXT PRIMARY KEY,
    point_id TEXT NOT NULL REFERENCES protest_points(id) ON DELETE CASCADE,
    protest_id TEXT NOT NULL REFERENCES protests(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    leader_name TEXT,
    demand_summary TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'disbanded', 'merged'
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_protest_elements_point_id ON protest_elements(point_id);
CREATE INDEX IF NOT EXISTS idx_protest_elements_protest_id ON protest_elements(protest_id);

-- 3. Protest Crowd Observation History Table (Immutable observation timeline)
CREATE TABLE IF NOT EXISTS protest_crowd_observations (
    id TEXT PRIMARY KEY,
    point_id TEXT NOT NULL REFERENCES protest_points(id) ON DELETE CASCADE,
    element_id TEXT REFERENCES protest_elements(id) ON DELETE SET NULL,
    element_name TEXT NOT NULL,
    crowd_estimate INTEGER NOT NULL,
    observation_timestamp TEXT NOT NULL,
    observer_source TEXT,
    verification_status TEXT NOT NULL DEFAULT 'unverified', -- 'verified', 'unverified'
    notes TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crowd_obs_point_id ON protest_crowd_observations(point_id);
CREATE INDEX IF NOT EXISTS idx_crowd_obs_element_id ON protest_crowd_observations(element_id);
CREATE INDEX IF NOT EXISTS idx_crowd_obs_timestamp ON protest_crowd_observations(observation_timestamp);

-- 4. Point-level association for CCTV camera links
-- SQLite does not fail if column already exists with ALTER TABLE handled programmatically

