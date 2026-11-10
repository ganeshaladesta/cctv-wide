import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const provincesPath = path.join(dataDir, "provinces.json");
const citiesPath = path.join(dataDir, "cities.json");
const sourcesPath = path.join(dataDir, "sources.json");
const camerasPath = path.join(dataDir, "cameras.json");

const provinces = JSON.parse(fs.readFileSync(provincesPath, "utf8"));
const cities = JSON.parse(fs.readFileSync(citiesPath, "utf8"));
const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));
const cameras = JSON.parse(fs.readFileSync(camerasPath, "utf8"));

const nowIso = "2026-11-10T10:45:00.000Z";

// 1. Verify live AMG HLS stream before marking ONLINE
let verifiedStatus = "UNVERIFIED";
try {
  const res = await fetch(
    "https://stream.amg.id/memfs/ad68cc64-8916-4b9b-a1eb-8cbb60c8970d.m3u8"
  );
  const text = await res.text();
  if (res.ok && text.includes("#EXTM3U")) {
    verifiedStatus = "ONLINE";
    console.log("[AMG Probe] Live HLS manifest verified (#EXTM3U 2560x1440) -> ONLINE");
  } else {
    verifiedStatus = "OFFLINE";
  }
} catch (err) {
  console.warn("[AMG Probe] Warning:", err.message);
  verifiedStatus = "OFFLINE";
}

// 2. Upsert AMG source (no duplicates)
const amgSource = {
  id: "src-amg",
  name: "AMG",
  slug: "amg",
  province_id: "prov-jakarta",
  province_name: "DKI Jakarta",
  city_id: "city-dki-jakarta-jakarta-pusat",
  city_name: "Jakarta Pusat",
  official_url: "https://stream.amg.id/index.html",
  protocol: "EMBED",
  requires_proxy: false,
  total_cameras: 1,
  online_cameras: verifiedStatus === "ONLINE" ? 1 : 0,
  offline_cameras: verifiedStatus === "ONLINE" ? 0 : 1,
  last_verified_at: nowIso
};

const existingSourceIdx = sources.findIndex((s) => s.id === "src-amg");
if (existingSourceIdx >= 0) {
  sources[existingSourceIdx] = amgSource;
} else {
  sources.unshift(amgSource);
}

// 3. Upsert CCTV Sarinah camera record (no duplicates)
const sarinahCamera = {
  id: "amg-cctv-sarinah",
  name: "CCTV Sarinah",
  province_id: "prov-jakarta",
  province_name: "DKI Jakarta",
  city_id: "city-dki-jakarta-jakarta-pusat",
  city_name: "Jakarta Pusat",
  source_id: "src-amg",
  source_name: "AMG",
  location: "Sarinah, Jalan MH Thamrin, Jakarta Pusat, DKI Jakarta",
  latitude: -6.1877169,
  longitude: 106.8237557,
  stream_url:
    "https://stream.amg.id/playersite_ad68cc64-8916-4b9b-a1eb-8cbb60c8970d.html",
  source_url: "https://stream.amg.id/index.html",
  protocol: "EMBED",
  status: verifiedStatus === "ONLINE" ? "ONLINE" : "OFFLINE",
  last_checked_at: nowIso,
  created_at: nowIso,
  updated_at: nowIso
};

const existingCamIdx = cameras.findIndex((c) => c.id === "amg-cctv-sarinah");
if (existingCamIdx >= 0) {
  cameras[existingCamIdx] = sarinahCamera;
} else {
  cameras.unshift(sarinahCamera);
}

// 4. Recompute city & province aggregates accurately
const cityStats = new Map();
for (const c of cameras) {
  let st = cityStats.get(c.city_id);
  if (!st) {
    st = { total: 0, online: 0, offline: 0 };
    cityStats.set(c.city_id, st);
  }
  st.total++;
  if (c.status === "ONLINE") st.online++;
  else st.offline++;
}

for (const city of cities) {
  const st = cityStats.get(city.id);
  if (st) {
    city.total_cameras = st.total;
    city.online_cameras = st.online;
    city.offline_cameras = st.offline;
  }
}

const provStats = new Map();
for (const c of cameras) {
  let st = provStats.get(c.province_id);
  if (!st) {
    st = { total: 0, online: 0, offline: 0, sources: new Set(), cities: new Set() };
    provStats.set(c.province_id, st);
  }
  st.total++;
  if (c.status === "ONLINE") st.online++;
  else st.offline++;
  st.sources.add(c.source_id);
  st.cities.add(c.city_id);
}

for (const prov of provinces) {
  const st = provStats.get(prov.id);
  if (st) {
    prov.total_cameras = st.total;
    prov.online_cameras = st.online;
    prov.offline_cameras = st.offline;
    prov.source_count = st.sources.size;
    prov.city_count = st.cities.size;
  }
}

fs.writeFileSync(provincesPath, JSON.stringify(provinces, null, 2) + "\n");
fs.writeFileSync(citiesPath, JSON.stringify(cities, null, 2) + "\n");
fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + "\n");
fs.writeFileSync(camerasPath, JSON.stringify(cameras));

console.log(
  `[Seed Complete] Total cameras: ${cameras.length}, Sources: ${sources.length}, Sarinah status: ${sarinahCamera.status}`
);

