import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "data");

console.log("=== PANTAU NUSANTARA Automated Verification Suite ===");

// 1. Verify Dataset Files
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

assert.equal(provinces.length, 38, "Must cover all 38 Indonesian provinces");
for (const p of provinces) {
  assert.ok(
    p.total_cameras > 0,
    `Province ${p.name} must have at least 1 camera`
  );
}
assert.ok(cities.length >= 400, "Must have at least 400 cities/regencies");
assert.ok(sources.length >= 500, "Must have at least 500 CCTV sources");
assert.ok(cameras.length >= 20000, "Must have at least 20,000 Indonesian cameras");

// 2. Verify Camera Schema Integrity
for (let i = 0; i < Math.min(500, cameras.length); i++) {
  const c = cameras[i];
  assert.ok(c.id && c.name, "Camera must have id and name");
  assert.ok(
    c.latitude >= -11.5 && c.latitude <= 6.5,
    `Invalid latitude: ${c.latitude}`
  );
  assert.ok(
    c.longitude >= 94.5 && c.longitude <= 141.5,
    `Invalid longitude: ${c.longitude}`
  );
  assert.ok(c.stream_url.length > 0, "Camera must have stream_url");
}

console.log(
  `[PASS] Datasets Verified: ${provinces.length} Provinces, ${cities.length} Cities, ${sources.length} Sources, ${cameras.length} Cameras.`
);

// 3. Verify Live Public Stream Endpoints
const sampleStreams = [
  {
    name: "Pemkot Yogyakarta (Jogja ATCS)",
    url: "https://cctvjss.jogjakota.go.id/atcs/ATCS_apmd.stream/playlist.m3u8"
  },
  {
    name: "Pemprov DI Yogyakarta (Kominfo Sleman)",
    url: "https://cctv.jogjaprov.go.id/cctv-proxy/cctv-kominfosleman/streams/Perempatan_Tempel2.stream.m3u8"
  },
  {
    name: "Diskominfo Kota Bandung (PELINDUNG)",
    url: "https://pelindung.bandung.go.id:3443/video/PANDANG/centralpark.m3u8"
  },
  {
    name: "PT Jasa Marga (Tol Jogja-Solo)",
    url: "https://jmlive.jasamarga.com/hls/42/20ed177f-83c4-4105-ab1a-ab960116a696/index.m3u8"
  }
];

for (const sample of sampleStreams) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(sample.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36"
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    console.log(
      `[STREAM PROBE] ${sample.name}: HTTP ${res.status} (${
        res.headers.get("content-type") || "unknown"
      }) ACAO=${res.headers.get("access-control-allow-origin") || "none"}`
    );
  } catch (err) {
    console.log(`[STREAM PROBE] ${sample.name}: ${err.message}`);
  }
}

console.log("=== ALL ASSERTIONS PASSED ===");

