import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const PORT = 3456;
const BASE = `http://127.0.0.1:${PORT}`;

console.log("Starting PANTAU NUSANTARA production server on port", PORT);
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
  console.log("[E2E] Server ready. Running endpoint & page assertions...");

  // 1. /api/stats
  const statsRes = await fetch(`${BASE}/api/stats`);
  assert.equal(statsRes.status, 200);
  const stats = await statsRes.json();
  assert.equal(stats.total_provinces, 38);
  assert.equal(stats.total_cameras, 23356);
  console.log(
    `[PASS] GET /api/stats -> ${stats.total_cameras} cameras, ${stats.online_cameras} online, ${stats.total_provinces} provinces`
  );

  // 2. /api/provinces
  const provRes = await fetch(`${BASE}/api/provinces`);
  assert.equal(provRes.status, 200);
  const provJson = await provRes.json();
  assert.equal(provJson.total, 38);
  console.log(`[PASS] GET /api/provinces -> ${provJson.total} provinces`);

  // 3. /api/cameras?q=Sarinah
  const sarinahRes = await fetch(`${BASE}/api/cameras?q=Sarinah`);
  assert.equal(sarinahRes.status, 200);
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

  // 5. /api/sources
  const srcRes = await fetch(`${BASE}/api/sources`);
  assert.equal(srcRes.status, 200);
  const srcJson = await srcRes.json();
  assert.equal(srcJson.adapters.length, 7);
  console.log(
    `[PASS] GET /api/sources -> ${srcJson.total} sources, ${srcJson.adapters.length} modular provider adapters`
  );

  // 6. /api/proxy live HLS manifest rewrite test
  const proxyRes = await fetch(
    `${BASE}/api/proxy?url=${encodeURIComponent(
      "https://cctvjss.jogjakota.go.id/atcs/ATCS_apmd.stream/playlist.m3u8"
    )}`
  );
  assert.equal(proxyRes.status, 200);
  const proxyText = await proxyRes.text();
  assert.ok(proxyText.includes("#EXTM3U"), "Proxy should return rewritten #EXTM3U");
  assert.ok(proxyText.includes("/api/proxy?url="), "Proxy should rewrite nested playlist URLs");
  console.log("[PASS] GET /api/proxy -> Live HLS manifest fetched & rewritten with ACAO=*");

  // 7. HTML Pages: /, /kamera, /kamera/dki-jakarta/amg-cctv-sarinah
  for (const route of ["/", "/kamera", "/kamera/dki-jakarta/amg-cctv-sarinah"]) {
    const htmlRes = await fetch(`${BASE}${route}`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes("SCC - EAGLE EYES"));
    assert.ok(html.includes("Ganesha Ladesta"));
    console.log(`[PASS] GET ${route} -> HTTP 200 (${html.length} bytes)`);
  }

  console.log("=== ALL E2E TESTS PASSED SUCCESSFULLY ===");
} finally {
  server.kill();
  process.exit(0);
}

