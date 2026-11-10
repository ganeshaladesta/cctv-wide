import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const PORT = 3456;
const BASE = `http://127.0.0.1:${PORT}`;

console.log("Starting SCC - EAGLE EYES production server on port", PORT);
const server = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "start", "-p", String(PORT)],
  {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    shell: true
  }
);

let ready = false;
server.stdout.on("data", (chunk) => {
  const s = chunk.toString();
  if (s.includes("Ready") || s.includes(String(PORT))) {
    ready = true;
  }
});

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (ready) return;
    try {
      const r = await fetch(`${BASE}/api/stats`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Server did not become ready in time");
}

try {
  await waitForServer();
  console.log("[E2E] Server ready. Running endpoint, caching & page assertions...");

  // 1. /api/stats + Cache-Control (1m)
  const statsRes = await fetch(`${BASE}/api/stats`);
  assert.equal(statsRes.status, 200);
  assert.ok(
    (statsRes.headers.get("cache-control") || "").includes("max-age=60"),
    "Stats should have max-age=60"
  );
  const stats = await statsRes.json();
  assert.equal(stats.total_provinces, 38);
  assert.equal(stats.total_cameras, 23356);
  console.log(
    `[PASS] GET /api/stats -> ${stats.total_cameras} cameras, ${stats.online_cameras} online, ${stats.total_provinces} provinces (Cache-Control: ${statsRes.headers.get("cache-control")})`
  );

  // 2. /api/provinces + Cache-Control (24h)
  const provRes = await fetch(`${BASE}/api/provinces`);
  assert.equal(provRes.status, 200);
  assert.ok(
    (provRes.headers.get("cache-control") || "").includes("max-age=86400"),
    "Provinces should have max-age=86400"
  );
  const provJson = await provRes.json();
  assert.equal(provJson.total, 38);
  console.log(
    `[PASS] GET /api/provinces -> ${provJson.total} provinces (Cache-Control: ${provRes.headers.get("cache-control")})`
  );

  // 2b. /api/cities + Cache-Control (24h)
  const cityRes = await fetch(`${BASE}/api/cities?province_id=prov-dki-jakarta`);
  assert.equal(cityRes.status, 200);
  assert.ok(
    (cityRes.headers.get("cache-control") || "").includes("max-age=86400"),
    "Cities should have max-age=86400"
  );

  // 3. /api/cameras?q=Sarinah + Cache-Control (5m)
  const sarinahRes = await fetch(`${BASE}/api/cameras?q=Sarinah`);
  assert.equal(sarinahRes.status, 200);
  assert.ok(
    (sarinahRes.headers.get("cache-control") || "").includes("max-age=300"),
    "Cameras should have max-age=300"
  );
  const sarinahJson = await sarinahRes.json();
  assert.ok(sarinahJson.total >= 1, "Should find CCTV Sarinah");
  assert.equal(sarinahJson.data[0].id, "amg-cctv-sarinah");
  console.log(
    `[PASS] GET /api/cameras?q=Sarinah -> found ${sarinahJson.data[0].name} (${sarinahJson.data[0].source_name})`
  );

  // 4. /api/cameras?mode=markers
  const markRes = await fetch(`${BASE}/api/cameras?mode=markers`);
  assert.equal(markRes.status, 200);
  const markJson = await markRes.json();
  assert.equal(markJson.total, 23356);
  console.log(`[PASS] GET /api/cameras?mode=markers -> ${markJson.total} compact markers`);

  // 5. /api/sources + Cache-Control (1h)
  const srcRes = await fetch(`${BASE}/api/sources`);
  assert.equal(srcRes.status, 200);
  assert.ok(
    (srcRes.headers.get("cache-control") || "").includes("max-age=3600"),
    "Sources should have max-age=3600"
  );
  const srcJson = await srcRes.json();
  assert.equal(srcJson.adapters.length, 7);
  console.log(
    `[PASS] GET /api/sources -> ${srcJson.total} sources, ${srcJson.adapters.length} modular provider adapters`
  );

  // 6. /api/health + Cache-Control (30s)
  const healthRes = await fetch(`${BASE}/api/health?id=amg-cctv-sarinah`);
  assert.equal(healthRes.status, 200);
  assert.ok(
    (healthRes.headers.get("cache-control") || "").includes("max-age=30"),
    "Health should have max-age=30"
  );
  const healthJson = await healthRes.json();
  assert.equal(healthJson.status, "ONLINE");
  console.log(
    `[PASS] GET /api/health?id=amg-cctv-sarinah -> ${healthJson.status} (${healthJson.latencyMs}ms)`
  );

  // 7. /api/proxy live HLS manifest rewrite test + no-store
  const proxyRes = await fetch(
    `${BASE}/api/proxy?url=${encodeURIComponent(
      "https://cctvjss.jogjakota.go.id/atcs/ATCS_apmd.stream/playlist.m3u8"
    )}`
  );
  assert.equal(proxyRes.status, 200);
  assert.ok(
    (proxyRes.headers.get("cache-control") || "").includes("no-store"),
    "Live stream proxy must never cache aggressively"
  );
  const proxyText = await proxyRes.text();
  assert.ok(proxyText.includes("#EXTM3U"), "Proxy should return rewritten #EXTM3U");
  assert.ok(proxyText.includes("/api/proxy?url="), "Proxy should rewrite nested playlist URLs");
  console.log("[PASS] GET /api/proxy -> Live HLS manifest fetched & rewritten with no-store");

  // 8. Static Assets & Favicons + Immutable Caching
  const assetPaths = [
    "/assets/scc-eagle-eyes-logo.png",
    "/assets/scc-eagle-eyes-logo.webp",
    "/favicon.ico",
    "/favicon-16x16.png",
    "/favicon-32x32.png",
    "/apple-touch-icon.png",
    "/icon-192.png",
    "/icon-512.png"
  ];
  for (const asset of assetPaths) {
    const res = await fetch(`${BASE}${asset}`);
    assert.equal(res.status, 200, `Asset ${asset} must return HTTP 200`);
    const cc = res.headers.get("cache-control") || "";
    assert.ok(
      cc.includes("max-age=31536000") && cc.includes("immutable"),
      `Asset ${asset} should have immutable 1-year Cache-Control, got: ${cc}`
    );
  }
  console.log(
    `[PASS] Verified ${assetPaths.length} Eagle Eyes logo & icon variants with immutable caching`
  );

  // 9. HTML Pages: /, /favorites, /about, /kamera, /kamera/dki-jakarta/amg-cctv-sarinah
  for (const route of [
    "/",
    "/favorites",
    "/about",
    "/kamera",
    "/kamera/dki-jakarta/amg-cctv-sarinah"
  ]) {
    const htmlRes = await fetch(`${BASE}${route}`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes("SCC - EAGLE EYES"));
    assert.ok(html.includes("Ganesha Ladesta"));
    assert.ok(html.includes("scc-eagle-eyes-logo"));
    console.log(`[PASS] GET ${route} -> HTTP 200 (${html.length} bytes)`);
  }

  console.log("=== ALL E2E TESTS PASSED SUCCESSFULLY ===");
} finally {
  server.kill();
  process.exit(0);
}
