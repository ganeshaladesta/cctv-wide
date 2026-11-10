-- Migration 001: Integrate AMG CCTV Sarinah (Jakarta Pusat, DKI Jakarta)
-- Coordinates verified via OpenStreetMap Nominatim (way/97550317: Sarinah, Jl. M.H. Thamrin No. 11)

INSERT OR REPLACE INTO sources (
  id, name, slug, province_id, province_name, city_id, city_name,
  official_url, protocol, requires_proxy, total_cameras, online_cameras, offline_cameras, last_verified_at
) VALUES (
  'src-amg',
  'AMG',
  'amg',
  'prov-jakarta',
  'DKI Jakarta',
  'city-dki-jakarta-jakarta-pusat',
  'Jakarta Pusat',
  'https://stream.amg.id/index.html',
  'HLS',
  0,
  1,
  1,
  0,
  '2026-11-10T10:45:00.000Z'
);

INSERT OR REPLACE INTO cameras (
  id, name, province_id, province_name, city_id, city_name,
  source_id, source_name, location, latitude, longitude,
  stream_url, source_url, protocol, status,
  last_checked_at, created_at, updated_at
) VALUES (
  'amg-cctv-sarinah',
  'CCTV Sarinah',
  'prov-jakarta',
  'DKI Jakarta',
  'city-dki-jakarta-jakarta-pusat',
  'Jakarta Pusat',
  'src-amg',
  'AMG',
  'Sarinah, Jalan MH Thamrin, Jakarta Pusat, DKI Jakarta',
  -6.1877169,
  106.8237557,
  'https://stream.amg.id/memfs/ad68cc64-8916-4b9b-a1eb-8cbb60c8970d.m3u8',
  'https://stream.amg.id/index.html',
  'HLS',
  'ONLINE',
  '2026-11-10T10:45:00.000Z',
  '2026-11-10T10:45:00.000Z',
  '2026-11-10T10:45:00.000Z'
);

