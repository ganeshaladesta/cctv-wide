import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SERVER_PORT = 3458;
const DEBUG_PORT = 9232;
const APP_URL = `http://127.0.0.1:${SERVER_PORT}`;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${APP_URL}/api/stats`);
      if (r.ok) return;
    } catch {}
    await sleep(300);
  }
  throw new Error("Server did not start in time");
}

async function main() {
  console.log("=== Bandwidth Optimization & Security Verification ===");
  const server = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "start", "-p", String(SERVER_PORT)],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], shell: true }
  );

  const userDataDir = path.join(process.cwd(), ".chrome-bw-profile");
  let chrome = null;

  try {
    await waitForServer();
    console.log("[1] Server ready. Running API payload & proxy security checks...");

    // 1. Marker payload measurement
    const markerRes = await fetch(`${APP_URL}/api/cameras?mode=markers`);
    assert.equal(markerRes.status, 200);
    const markerCC = markerRes.headers.get("cache-control") || "";
    assert.ok(markerCC.includes("s-maxage="), `Expected s-maxage on markers, got: ${markerCC}`);
    const markerText = await markerRes.text();
    const markerRawBytes = Buffer.byteLength(markerText, "utf8");
    const markerGzipBytes = zlib.gzipSync(Buffer.from(markerText, "utf8")).byteLength;
    const markerJson = JSON.parse(markerText);
    assert.equal(markerJson.total, 23356);
    assert.equal(markerJson.markers.length, 23356);
    assert.equal(markerJson.markers[0].length, 4, "Marker tuple must only contain 4 fields [id,lat,lng,status]");
    assert.ok(markerRawBytes < 1_300_000, `Expected marker payload < 1.3MB raw, got ${markerRawBytes}`);
    console.log(
      `[PASS] Markers (${markerJson.total}): raw=${markerRawBytes.toLocaleString()} bytes (${(
        markerRawBytes / 1e6
      ).toFixed(3)} MB), gzip=${markerGzipBytes.toLocaleString()} bytes (${(
        markerGzipBytes / 1024
      ).toFixed(1)} KB)`
    );

    // Check Cities & Sources caching headers & sizes
    const citiesRes = await fetch(`${APP_URL}/api/cities`);
    assert.equal(citiesRes.status, 200);
    assert.ok((citiesRes.headers.get("cache-control") || "").includes("s-maxage="));
    const citiesBytes = Buffer.byteLength(await citiesRes.text(), "utf8");
    const sourcesRes = await fetch(`${APP_URL}/api/sources`);
    assert.equal(sourcesRes.status, 200);
    assert.ok((sourcesRes.headers.get("cache-control") || "").includes("s-maxage="));
    const sourcesBytes = Buffer.byteLength(await sourcesRes.text(), "utf8");
    console.log(
      `[PASS] Cities=${citiesBytes.toLocaleString()} bytes, Sources=${sourcesBytes.toLocaleString()} bytes (both s-maxage enabled)`
    );

    // 2. Legacy URL normalization check
    const legacyCamRes = await fetch(`${APP_URL}/api/cameras/asahan-cctv-gambirbaru`);
    assert.equal(legacyCamRes.status, 200);
    const legacyCam = (await legacyCamRes.json()).data;
    assert.ok(
      legacyCam.stream_url.startsWith("https://atcsindonesia.com/api/proxy/cctv/"),
      `Expected normalized HTTPS upstream URL, got: ${legacyCam.stream_url}`
    );
    console.log(`[PASS] Legacy URL normalized: ${legacyCam.stream_url}`);

    // 3. Proxy binary blocking & SSRF security tests
    const securityCases = [
      {
        name: "Reject .ts binary video segment",
        url: `${APP_URL}/api/proxy?url=${encodeURIComponent(
          "https://cctvjss.jogjakota.go.id/atcs/ATCS_apmd.stream/media_w1_0.ts"
        )}`,
        expected: 403
      },
      {
        name: "Reject .m4s binary video segment",
        url: `${APP_URL}/api/proxy?url=${encodeURIComponent(
          "https://stream.amg.id/memfs/seg0.m4s"
        )}`,
        expected: 403
      },
      {
        name: "Reject continuous MJPEG stream",
        url: `${APP_URL}/api/proxy?url=${encodeURIComponent(
          "https://pantau-cctv.banggaikab.go.id/zm2/cgi-bin/nph-zms?mode=jpeg"
        )}`,
        expected: 403
      },
      {
        name: "Reject arbitrary unapproved external domain (open-proxy check)",
        url: `${APP_URL}/api/proxy?url=${encodeURIComponent(
          "https://example.com/test.m3u8"
        )}`,
        expected: 403
      },
      {
        name: "Reject localhost SSRF",
        url: `${APP_URL}/api/proxy?url=${encodeURIComponent(
          "http://127.0.0.1:8080/secret.m3u8"
        )}`,
        expected: 403
      },
      {
        name: "Reject metadata IP 169.254.169.254 SSRF",
        url: `${APP_URL}/api/proxy?url=${encodeURIComponent(
          "http://169.254.169.254/latest/meta-data/"
        )}`,
        expected: 403
      },
      {
        name: "Reject RFC1918 172.16.0.1 SSRF",
        url: `${APP_URL}/api/proxy?url=${encodeURIComponent(
          "http://172.16.0.1/internal.m3u8"
        )}`,
        expected: 403
      },
      {
        name: "Reject IPv6 [::1] SSRF",
        url: `${APP_URL}/api/proxy?url=${encodeURIComponent(
          "http://[::1]/internal.m3u8"
        )}`,
        expected: 403
      }
    ];
    for (const tc of securityCases) {
      const r = await fetch(tc.url);
      assert.equal(r.status, tc.expected, `${tc.name}: expected HTTP ${tc.expected}, got ${r.status}`);
      console.log(`[PASS] Proxy Security: ${tc.name} -> HTTP ${r.status}`);
    }

    // 4. Live HLS manifest rewriting check (nested .m3u8 stays proxied; .ts segments stay direct!)
    const masterRes = await fetch(
      `${APP_URL}/api/proxy?url=${encodeURIComponent(
        "https://cctvjss.jogjakota.go.id/atcs/ATCS_apmd.stream/playlist.m3u8"
      )}`
    );
    assert.equal(masterRes.status, 200);
    const masterText = await masterRes.text();
    const nestedLine = masterText
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith("/api/proxy?url="));
    assert.ok(nestedLine, "Master playlist must rewrite nested chunklist .m3u8 via /api/proxy");

    const chunkRes = await fetch(`${APP_URL}${nestedLine.trim()}`);
    assert.equal(chunkRes.status, 200);
    const chunkText = await chunkRes.text();
    const segmentLines = chunkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    assert.ok(segmentLines.length > 0, "Chunklist must contain media segments");
    for (const seg of segmentLines) {
      assert.ok(
        seg.startsWith("https://cctvjss.jogjakota.go.id/"),
        `Segment must point directly to upstream provider, got: ${seg}`
      );
      assert.ok(!seg.includes("/api/proxy"), `Segment must NOT pass through /api/proxy: ${seg}`);
    }
    console.log(
      `[PASS] HLS Chunklist Rewrite: ${segmentLines.length} media segments all point directly to upstream (${segmentLines[0]})`
    );

    // 5. Token-exchange wrapper (balitower-m) via /api/proxy resolves directly to upstream .ts segments
    const baliRes = await fetch(
      `${APP_URL}/api/proxy?url=${encodeURIComponent(
        "https://atcsindonesia.com/api/proxy/cctv/balitower-m/10"
      )}`
    );
    if (baliRes.status === 200) {
      const baliText = await baliRes.text();
      const baliSegs = baliText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
      assert.ok(baliSegs.length > 0);
      for (const seg of baliSegs) {
        assert.ok(
          seg.startsWith("https://atcsindonesia.com/") && !seg.includes("/api/proxy?url="),
          `Balitower segment must bypass our proxy: ${seg}`
        );
      }
      console.log(
        `[PASS] Balitower token wrapper -> direct upstream .ts segments (${baliSegs.length} segments)`
      );
    }

    // 6. Browser Request & Functional Verification (Chrome CDP)
    console.log("[2] Launching headless Chrome to measure API request counts...");
    chrome = spawn(
      CHROME_PATH,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${userDataDir}`,
        "--window-size=1440,900",
        "about:blank"
      ],
      { stdio: "ignore" }
    );

    let target = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
        if (res.ok) {
          const list = await res.json();
          target = list.find((t) => t.type === "page");
          if (target) break;
        }
      } catch {}
      await sleep(250);
    }
    assert.ok(target, "Chrome target must exist");

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", reject);
    });

    let msgId = 0;
    const pending = new Map();
    const apiRequests = [];

    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method === "Network.requestWillBeSent") {
        const u = msg.params.request.url;
        if (u.startsWith(APP_URL + "/api/")) {
          apiRequests.push({
            method: msg.params.request.method,
            path: u.slice(APP_URL.length)
          });
        }
      }
    });

    function send(method, params = {}) {
      const id = ++msgId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression) {
      const res = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.exceptionDetails) {
        throw new Error(`Eval Error: ${res.exceptionDetails.text}`);
      }
      return res.result.value;
    }

    await send("Network.enable");
    await send("Page.enable");
    await send("Runtime.enable");

    await send("Page.navigate", { url: APP_URL });
    await sleep(1600);

    // Skip loading overlay if shown
    await evaluate(`(() => {
      const s = document.querySelector('[data-testid="skip-loading-overlay"]');
      if (s) s.click();
    })()`);
    await sleep(600);

    const initialSummary = {
      total: apiRequests.length,
      markers: apiRequests.filter((r) => r.path.includes("mode=markers")).length,
      listPage1: apiRequests.filter((r) => r.path.includes("page=1")).length,
      cities: apiRequests.filter((r) => r.path.startsWith("/api/cities")).length,
      sources: apiRequests.filter((r) => r.path.startsWith("/api/sources")).length,
      telemetryPosts: apiRequests.filter((r) => r.method === "POST" && r.path.startsWith("/api/cameras/")).length
    };
    console.log("[PASS] Initial Load API counts:", JSON.stringify(initialSummary));
    assert.equal(initialSummary.listPage1, 0, "Should reuse SSR initialCameras without duplicate page=1 fetch");
    assert.equal(initialSummary.markers, 1, "Should fetch markers once on initial load");
    assert.equal(initialSummary.cities, 1, "Should fetch /api/cities once on initial load");
    assert.equal(initialSummary.sources, 1, "Should fetch /api/sources once on initial load");
    assert.equal(initialSummary.telemetryPosts, 0, "Should send 0 POST /api/cameras/[id] telemetry requests");

    // Test pagination (clicking Berikutnya)
    const beforePagMarkers = apiRequests.filter((r) => r.path.includes("mode=markers")).length;
    const beforePagLists = apiRequests.filter((r) => r.path.includes("limit=24")).length;

    await evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const nextBtn = buttons.find(b => b.innerText.includes('Berikutnya'));
      if (nextBtn) nextBtn.click();
    })()`);
    await sleep(600);

    const afterPagMarkers = apiRequests.filter((r) => r.path.includes("mode=markers")).length;
    const afterPagLists = apiRequests.filter((r) => r.path.includes("limit=24")).length;
    assert.equal(afterPagLists - beforePagLists, 1, "Pagination must fetch page 2 camera list");
    assert.equal(afterPagMarkers - beforePagMarkers, 0, "Pagination MUST NOT re-fetch markers");
    console.log("[PASS] Pagination: 1 list fetch, 0 marker fetches");

    // Test Province/City dropdown filter changes do NOT re-fetch /api/cities or /api/sources
    const beforeCities = apiRequests.filter((r) => r.path.startsWith("/api/cities")).length;
    const beforeSources = apiRequests.filter((r) => r.path.startsWith("/api/sources")).length;

    await evaluate(`(async () => {
      const provTrigger = document.querySelector('[data-testid="filter-province-trigger"]');
      if (provTrigger) provTrigger.click();
      await new Promise(r => setTimeout(r, 250));
      const opts = Array.from(document.querySelectorAll('[data-testid="filter-province-menu"] [role="option"]'));
      const dki = opts.find(o => o.innerText.toLowerCase().includes('dki jakarta'));
      if (!dki) throw new Error('DKI Jakarta province option not found');
      dki.click();
      await new Promise(r => setTimeout(r, 400));
      const cityTrigger = document.querySelector('[data-testid="filter-city-trigger"]');
      if (cityTrigger) cityTrigger.click();
      await new Promise(r => setTimeout(r, 250));
    })()`);
    const cityOptsAfterDki = await evaluate(`document.querySelectorAll('[data-testid="filter-city-menu"] [role="option"]').length`);
    await evaluate(`(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const srcTrigger = document.querySelector('[data-testid="filter-source-trigger"]');
      if (srcTrigger) srcTrigger.click();
      await new Promise(r => setTimeout(r, 250));
    })()`);
    const sourceOptsAfterDki = await evaluate(`document.querySelectorAll('[data-testid="filter-source-menu"] [role="option"]').length`);
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await sleep(300);

    const afterCities = apiRequests.filter((r) => r.path.startsWith("/api/cities")).length;
    const afterSources = apiRequests.filter((r) => r.path.startsWith("/api/sources")).length;
    assert.ok(
      cityOptsAfterDki >= 20 && cityOptsAfterDki <= 30,
      `DKI Jakarta city options must narrow client-side (~24), got ${cityOptsAfterDki}`
    );
    assert.ok(
      sourceOptsAfterDki >= 10 && sourceOptsAfterDki <= 20,
      `DKI Jakarta source options must narrow client-side (~14), got ${sourceOptsAfterDki}`
    );
    assert.equal(afterCities - beforeCities, 0, "Province change MUST NOT re-fetch /api/cities");
    assert.equal(afterSources - beforeSources, 0, "Province change MUST NOT re-fetch /api/sources");
    console.log(
      `[PASS] Client-side Cities & Sources filtering: ${cityOptsAfterDki} DKI cities & ${sourceOptsAfterDki} DKI sources with 0 extra /api/cities or /api/sources requests`
    );

    // Test Search Debounce + Direct HLS Check (Simpang APMD Jogja) + On-demand detail hydration
    // Clear DKI Jakarta province filter first
    await evaluate(`(async () => {
      const provTrigger = document.querySelector('[data-testid="filter-province-trigger"]');
      if (provTrigger) provTrigger.click();
      await new Promise(r => setTimeout(r, 200));
      const allOpt = Array.from(document.querySelectorAll('[data-testid="filter-province-menu"] [role="option"]'))
        .find(o => o.innerText.includes('Semua 38 Provinsi'));
      if (allOpt) allOpt.click();
      await new Promise(r => setTimeout(r, 400));
    })()`);

    const beforeSearchLists = apiRequests.filter((r) => r.path.includes("limit=24")).length;
    const beforeDetailGets = apiRequests.filter(
      (r) => r.method === "GET" && /^\/api\/cameras\/[^?]+/.test(r.path)
    ).length;
    await evaluate(`(async () => {
      const searchInput = document.querySelector('[data-testid="global-camera-search"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      // Fast typing simulation (250ms debounce should collapse into 1 request)
      setter.call(searchInput, 'Simpang');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 80));
      setter.call(searchInput, 'Simpang APMD');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 100));
        const btn = document.querySelector('[data-testid="directory-camera-btn-jogja-1"]');
        if (btn) {
          btn.click();
          break;
        }
      }
      await new Promise(r => setTimeout(r, 500));
    })()`);
    const modalCheck = await evaluate(`(() => {
      const modal = document.querySelector('[data-testid="camera-detail-modal"]');
      const hasVideo = !!modal?.querySelector('video');
      const title = modal?.innerText || '';
      const closeBtn = document.querySelector('[data-testid="close-camera-detail-modal"]');
      if (closeBtn) closeBtn.click();
      return { hasModal: !!modal, hasVideo, hasApmd: title.toLowerCase().includes('apmd') };
    })()`);
    await sleep(350);
    const afterSearchLists = apiRequests.filter((r) => r.path.includes("limit=24")).length;
    const afterDetailGets = apiRequests.filter(
      (r) => r.method === "GET" && /^\/api\/cameras\/[^?]+/.test(r.path)
    ).length;
    assert.equal(afterSearchLists - beforeSearchLists, 1, "Debounced typing should issue only 1 list request");
    assert.equal(modalCheck.hasModal, true, "Camera detail modal should open for Jogja Simpang APMD");
    assert.equal(modalCheck.hasApmd, true, "Modal should show Simpang APMD after resetting province");
    assert.equal(modalCheck.hasVideo, true, "HLS video player should mount for Jogja Simpang APMD");
    console.log(
      `[PASS] Debounced Search (1 list req) + Camera Detail Hydration (detail fetches=${afterDetailGets - beforeDetailGets}, video mounted=${modalCheck.hasVideo})`
    );

    // Check Multi-View 4 simultaneous cameras and zero player POST telemetry
    const beforePostCount = apiRequests.filter((r) => r.method === "POST" && r.path.startsWith("/api/cameras/")).length;
    await evaluate(`(() => {
      const navBtns = Array.from(document.querySelectorAll('button'));
      const mv = navBtns.find(b => b.innerText.includes('Multi-View'));
      if (mv) mv.click();
    })()`);
    await sleep(1500);
    const mvVideos = await evaluate(`document.querySelectorAll('video').length`);
    const afterPostCount = apiRequests.filter((r) => r.method === "POST" && r.path.startsWith("/api/cameras/")).length;
    assert.ok(mvVideos >= 4, `Multi-View should mount 4 players, found ${mvVideos}`);
    assert.equal(afterPostCount - beforePostCount, 0, "Multi-View mount MUST send 0 POST telemetry requests");
    console.log(`[PASS] Multi-View 4-camera mount: ${mvVideos} video elements mounted with 0 POST telemetry requests`);

    ws.close();
    console.log("=== ALL BANDWIDTH & SECURITY VERIFICATION PASSED ===");
  } finally {
    if (chrome && chrome.pid) {
      spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
    }
    if (server && server.pid) {
      spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    }
    await sleep(500);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
