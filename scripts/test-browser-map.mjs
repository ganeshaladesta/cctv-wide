import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9229;
const APP_URL = "http://localhost:3000";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBrowserTests() {
  const userDataDir = path.join(process.cwd(), ".chrome-test-profile");
  const chrome = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      "--window-size=1440,900",
      APP_URL
    ],
    { stdio: "ignore" }
  );

  try {
    let targets = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        if (res.ok) {
          targets = await res.json();
          const page = targets.find(
            (t) => t.type === "page" && t.url.startsWith(APP_URL)
          );
          if (page) break;
        }
      } catch {}
      await sleep(300);
    }

    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    targets = await res.json();
    const pageTarget =
      targets.find((t) => t.type === "page" && t.url.startsWith(APP_URL)) ||
      targets.find((t) => t.type === "page");
    assert.ok(pageTarget, "Chrome page target must exist");

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", reject);
    });

    let msgId = 0;
    const pending = new Map();
    const consoleErrors = [];
    const pageExceptions = [];

    ws.addEventListener("message", (ev) => {
      const data = JSON.parse(ev.data);
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      } else if (data.method === "Runtime.consoleAPICalled") {
        if (data.params.type === "error") {
          const text = data.params.args
            .map((a) => a.value || a.description || "")
            .join(" ");
          consoleErrors.push(text);
        }
      } else if (data.method === "Runtime.exceptionThrown") {
        pageExceptions.push(data.params.exceptionDetails?.text || "Exception");
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
        throw new Error(`JS Eval Error: ${res.exceptionDetails.text}`);
      }
      return res.result.value;
    }

    await send("Runtime.enable");
    await send("Page.enable");

    console.log("Waiting for initial map and 23,355 markers to render...");
    let initialState = null;
    for (let i = 0; i < 40; i++) {
      initialState = await evaluate(`(() => {
        const counterEl = document.querySelector('[data-testid="map-camera-counter"]');
        const tiles = Array.from(document.querySelectorAll('.leaflet-tile-pane img')).map(img => img.src);
        const clusters = document.querySelectorAll('.cctv-cluster-icon').length;
        const pins = document.querySelectorAll('.cctv-marker-pin').length;
        const attribution = document.querySelector('.leaflet-control-attribution')?.innerText || '';
        return {
          counterText: counterEl ? counterEl.innerText.replace(/\\s+/g, ' ').trim() : '',
          tileCount: tiles.length,
          sampleTiles: tiles.slice(0, 3),
          hasCartoTile: tiles.some(t => t.includes('carto')),
          allOsmTiles: tiles.length > 0 && tiles.every(t => t.startsWith('https://tile.openstreetmap.org/')),
          clusters,
          pins,
          attribution
        };
      })()`);
      if (
        initialState.counterText.includes("23.355") &&
        (initialState.clusters > 0 || initialState.pins > 0) &&
        initialState.tileCount > 0
      ) {
        break;
      }
      await sleep(300);
    }

    console.log("1. Initial Map State:", JSON.stringify(initialState, null, 2));
    assert.equal(initialState.hasCartoTile, false, "Must have zero CARTO tiles");
    assert.equal(initialState.allOsmTiles, true, "All tiles must load from https://tile.openstreetmap.org/");
    assert.ok(initialState.counterText.includes("23.355"), "Initial map count must be 23.355");
    assert.ok(initialState.clusters > 0, "MarkerCluster must render cluster icons");

    // Test 2: Province Filtering (DKI Jakarta -> prov-jakarta = 4.601 cameras)
    await evaluate(`(() => {
      const sel = document.querySelector('select[aria-label="Filter Provinsi"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, 'prov-jakarta');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);

    let jakartaState = null;
    for (let i = 0; i < 20; i++) {
      await sleep(250);
      jakartaState = await evaluate(`(() => {
        const counterEl = document.querySelector('[data-testid="map-camera-counter"]');
        const clusters = document.querySelectorAll('.cctv-cluster-icon').length;
        const pins = document.querySelectorAll('.cctv-marker-pin').length;
        const cityOptions = document.querySelectorAll('select[aria-label="Filter Kota/Kabupaten"] option').length;
        return {
          counterText: counterEl ? counterEl.innerText.replace(/\\s+/g, ' ').trim() : '',
          clusters,
          pins,
          cityOptions
        };
      })()`);
      if (jakartaState.counterText.includes("4.601") && jakartaState.cityOptions > 1) {
        break;
      }
    }
    console.log("2. Province Filter (DKI Jakarta):", JSON.stringify(jakartaState, null, 2));
    assert.ok(jakartaState.counterText.includes("4.601"), "DKI Jakarta province filter must show 4.601 cameras on map");
    assert.ok(jakartaState.cityOptions > 1, "Cities dropdown must populate for DKI Jakarta");

    // Test 3: City Filtering (Select first city in DKI Jakarta)
    const selectedCityInfo = await evaluate(`(() => {
      const sel = document.querySelector('select[aria-label="Filter Kota/Kabupaten"]');
      const firstCityOpt = sel.options[1];
      const val = firstCityOpt?.value || '';
      const label = firstCityOpt?.text || '';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, val);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return { val, label };
    })()`);

    await sleep(1000);
    const cityState = await evaluate(`(() => {
      const counterEl = document.querySelector('[data-testid="map-camera-counter"]');
      return {
        counterText: counterEl ? counterEl.innerText.replace(/\\s+/g, ' ').trim() : ''
      };
    })()`);
    console.log("3. City Filter State:", JSON.stringify({ ...selectedCityInfo, ...cityState }, null, 2));
    assert.ok(!cityState.counterText.includes("4.601"), "City filter must narrow down map markers count");

    // Test 4: Reset province/city and test Status Filtering (OFFLINE = 2.317)
    await evaluate(`(() => {
      const provSel = document.querySelector('select[aria-label="Filter Provinsi"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(provSel, '');
      provSel.dispatchEvent(new Event('change', { bubbles: true }));

      const statusSel = document.querySelector('select[aria-label="Filter Status Kamera"]');
      setter.call(statusSel, 'OFFLINE');
      statusSel.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);

    await sleep(1200);
    const offlineState = await evaluate(`(() => {
      const counterEl = document.querySelector('[data-testid="map-camera-counter"]');
      return {
        counterText: counterEl ? counterEl.innerText.replace(/\\s+/g, ' ').trim() : ''
      };
    })()`);
    console.log("4. Status Filter (OFFLINE):", JSON.stringify(offlineState, null, 2));
    assert.ok(offlineState.counterText.includes("2.317"), "OFFLINE status filter must show 2.317 cameras on map");

    // Test 5: Status Filter ONLINE (21.038) & Marker Click Interaction
    await evaluate(`(() => {
      const statusSel = document.querySelector('select[aria-label="Filter Status Kamera"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(statusSel, 'ONLINE');
      statusSel.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await sleep(1200);

    const onlineState = await evaluate(`(() => {
      const counterEl = document.querySelector('[data-testid="map-camera-counter"]');
      return {
        counterText: counterEl ? counterEl.innerText.replace(/\\s+/g, ' ').trim() : ''
      };
    })()`);
    console.log("5. Status Filter (ONLINE):", JSON.stringify(onlineState, null, 2));
    assert.ok(onlineState.counterText.includes("21.038"), "ONLINE status filter must show 21.038 cameras on map");

    // Click clusters until an individual marker pin appears and click it
    const popupInfo = await evaluate(`(async () => {
      for (let step = 0; step < 6; step++) {
        const pin = document.querySelector('.cctv-marker-pin');
        if (pin) {
          pin.click();
          await new Promise(r => setTimeout(r, 400));
          break;
        }
        const cluster = document.querySelector('.cctv-cluster-icon');
        if (cluster) {
          cluster.click();
          await new Promise(r => setTimeout(r, 700));
        }
      }
      const popup = document.querySelector('[data-testid="map-camera-popup"]');
      if (!popup) return null;
      const detailLink = popup.querySelector('a[href^="/kamera/"]');
      return {
        text: popup.innerText.replace(/\\s+/g, ' ').trim(),
        detailHref: detailLink ? detailLink.getAttribute('href') : null
      };
    })()`);
    console.log("6. Marker Click Popup:", JSON.stringify(popupInfo, null, 2));
    assert.ok(popupInfo && popupInfo.detailHref, "Clicking a marker must open camera popup with detail page link");

    // Test 7: Mobile Viewport Responsiveness (375x812)
    await send("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(600);
    const mobileCheck = await evaluate(`(() => {
      const mapEl = document.querySelector('.leaflet-container');
      const rect = mapEl ? mapEl.getBoundingClientRect() : null;
      return {
        mapVisible: !!rect && rect.width > 280 && rect.height >= 400,
        width: rect?.width,
        height: rect?.height
      };
    })()`);
    console.log("7. Mobile Responsiveness (375x812):", JSON.stringify(mobileCheck, null, 2));
    assert.equal(mobileCheck.mapVisible, true, "Map must remain responsive on mobile viewport");

    console.log("8. Console Errors:", JSON.stringify(consoleErrors));
    console.log("9. Page Exceptions:", JSON.stringify(pageExceptions));
    assert.equal(consoleErrors.length, 0, "Browser console must have 0 errors");
    assert.equal(pageExceptions.length, 0, "Page must have 0 uncaught exceptions");

    console.log("ALL E2E BROWSER MAP TESTS PASSED!");
    ws.close();
  } finally {
    chrome.kill();
    await sleep(500);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

runBrowserTests().catch((err) => {
  console.error("Browser test failed:", err);
  process.exit(1);
});
