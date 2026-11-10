import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "pantau-nusantara.sqlite");
const schemaPath = path.join(root, "src", "lib", "db", "schema.sql");

console.log("=== Initializing SQLite Database (node:sqlite) ===");
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");

const schemaSql = fs.readFileSync(schemaPath, "utf8");
db.exec(schemaSql);

const provinces = JSON.parse(
  fs.readFileSync(path.join(dataDir, "provinces.json"), "utf8")
);
const cities = JSON.parse(
  fs.readFileSync(path.join(dataDir, "cities.json"), "utf8")
);
const sources = JSON.parse(
  fs.readFileSync(path.join(dataDir, "sources.json"), "utf8")
);
const cameras = JSON.parse(
  fs.readFileSync(path.join(dataDir, "cameras.json"), "utf8")
);

db.exec("BEGIN TRANSACTION;");

const insertProv = db.prepare(`
  INSERT INTO provinces (id, name, slug, island, latitude, longitude, total_cameras, online_cameras, offline_cameras, city_count, source_count)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const p of provinces) {
  insertProv.run(
    p.id,
    p.name,
    p.slug,
    p.island,
    p.lat,
    p.lng,
    p.total_cameras,
    p.online_cameras,
    p.offline_cameras,
    p.city_count,
    p.source_count
  );
}

const insertCity = db.prepare(`
  INSERT INTO cities (id, name, slug, province_id, province_name, latitude, longitude, total_cameras, online_cameras, offline_cameras)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const c of cities) {
  insertCity.run(
    c.id,
    c.name,
    c.slug,
    c.province_id,
    c.province_name,
    c.latitude,
    c.longitude,
    c.total_cameras,
    c.online_cameras,
    c.offline_cameras
  );
}

const insertSource = db.prepare(`
  INSERT INTO sources (id, name, slug, province_id, province_name, city_id, city_name, official_url, protocol, requires_proxy, total_cameras, online_cameras, offline_cameras, last_verified_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const s of sources) {
  insertSource.run(
    s.id,
    s.name,
    s.slug,
    s.province_id,
    s.province_name,
    s.city_id,
    s.city_name,
    s.official_url,
    s.protocol,
    s.requires_proxy ? 1 : 0,
    s.total_cameras,
    s.online_cameras,
    s.offline_cameras,
    s.last_verified_at
  );
}

const insertCam = db.prepare(`
  INSERT INTO cameras (id, name, province_id, province_name, city_id, city_name, source_id, source_name, location, latitude, longitude, stream_url, source_url, protocol, status, last_checked_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertStatus = db.prepare(`
  INSERT INTO camera_status (camera_id, status, http_status, latency_ms, error_reason, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

for (const cam of cameras) {
  insertCam.run(
    cam.id,
    cam.name,
    cam.province_id,
    cam.province_name,
    cam.city_id,
    cam.city_name,
    cam.source_id,
    cam.source_name,
    cam.location,
    cam.latitude,
    cam.longitude,
    cam.stream_url,
    cam.source_url,
    cam.protocol,
    cam.status,
    cam.last_checked_at,
    cam.created_at,
    cam.updated_at
  );
  insertStatus.run(
    cam.id,
    cam.status,
    cam.status === "ONLINE" ? 200 : 404,
    cam.status === "ONLINE" ? 120 : 0,
    null,
    cam.updated_at
  );
}

const insertSyncLog = db.prepare(`
  INSERT INTO source_sync_logs (source_id, discovered_count, online_count, status, synced_at)
  VALUES (?, ?, ?, ?, ?)
`);
for (const s of sources.slice(0, 50)) {
  insertSyncLog.run(
    s.id,
    s.total_cameras,
    s.online_cameras,
    "SUCCESS",
    new Date().toISOString()
  );
}

db.exec("COMMIT;");

const counts = {
  provinces: db.prepare("SELECT COUNT(*) AS c FROM provinces").get().c,
  cities: db.prepare("SELECT COUNT(*) AS c FROM cities").get().c,
  sources: db.prepare("SELECT COUNT(*) AS c FROM sources").get().c,
  cameras: db.prepare("SELECT COUNT(*) AS c FROM cameras").get().c,
  camera_status: db.prepare("SELECT COUNT(*) AS c FROM camera_status").get().c,
  source_sync_logs: db
    .prepare("SELECT COUNT(*) AS c FROM source_sync_logs")
    .get().c
};

console.log("[SQLite Seeded Successfully]:", counts);
db.close();
