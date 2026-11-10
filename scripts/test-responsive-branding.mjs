import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEBUG_PORT = 9231;
const SERVER_PORT = 3457;
const APP_URL = `http://127.0.0.1:${SERVER_PORT}`;

const VIEWPORTS = [
  { width: 320, height: 640, mobile: true, label: "320px mobile" },
  { width: 360, height: 740, mobile: true, label: "360px mobile" },
  { width: 375, height: 812, mobile: true, label: "375px mobile" },
  { width: 390, height: 844, mobile: true, label: "390px mobile" },
  { width: 430, height: 932, mobile: true, label: "430px mobile" },
  { width: 768, height: 1024, mobile: true, label: "768px tablet" },
  { width: 1024, height: 768, mobile: false, label: "1024px tablet/laptop" },
  { width: 1280, height: 800, mobile: false, label: "1280px desktop" },
  { width: 1440, height: 900, mobile: false, label: "1440px desktop" },
  { width: 1920, height: 1080, mobile: false, label: "1920px large desktop" }
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${APP_URL}/api/stats`);
      if (r.ok) return;
    } catch {}
    await sleep(350);
  }
  throw new Error("Server did not start in time");
}

async function runResponsiveBrandingTests() {
  console.log("Starting Next.js production server on port", SERVER_PORT);
  const server = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "start", "-p", String(SERVER_PORT)],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: true
    }
  );

  const userDataDir = path.join(process.cwd(), ".chrome-rebrand-profile");
  let chrome = null;

  try {
    await waitForServer();
    console.log("Server ready. Launching headless Chrome...");

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
        APP_URL
      ],
      { stdio: "ignore" }
    );

    let targets = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
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

    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
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
    await send("Page.navigate", { url: APP_URL });

    // Poll until Framer LoadingOverlay & telemetry status list are active
    let loadingOverlayCheck = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      await sleep(250);
      loadingOverlayCheck = await evaluate(`(() => {
        const overlay = document.querySelector('[data-testid="eagle-eyes-loading-overlay"]');
        const statusList = overlay?.querySelector('[aria-label="Loading status list"]');
        const cs = overlay ? getComputedStyle(overlay) : null;
        return {
          overlayPresent: !!overlay,
          statusListPresent: !!statusList,
          backgroundColor: cs ? cs.backgroundColor : null,
          zIndex: cs ? cs.zIndex : null,
          hasBrandText: overlay ? overlay.innerText.includes('SCC - EAGLE EYES') : false
        };
      })()`);
      if (loadingOverlayCheck.overlayPresent && loadingOverlayCheck.statusListPresent) {
        break;
      }
    }
    console.log("1. LoadingOverlay Check:", JSON.stringify(loadingOverlayCheck));
    assert.equal(loadingOverlayCheck.overlayPresent, true);
    assert.equal(loadingOverlayCheck.statusListPresent, true);
    assert.equal(loadingOverlayCheck.backgroundColor, "rgb(9, 11, 16)");
    assert.equal(loadingOverlayCheck.zIndex, "2000");

    // Dismiss or wait for loading overlay
    await evaluate(`(() => {
      const skip = document.querySelector('[data-testid="skip-loading-overlay"]');
      if (skip) skip.click();
    })()`);
    await sleep(600);

    // 2. Verify Kota/Kabupaten Dropdown Layering Above OSM Map Controls
    const dropdownLayeringCheck = await evaluate(`(async () => {
      const cityTrigger = document.querySelector('[data-testid="filter-city-trigger"]');
      if (!cityTrigger) return { opened: false };
      cityTrigger.click();
      await new Promise(r => setTimeout(r, 300));

      const menu = document.querySelector('[data-testid="filter-city-menu"]');
      const isPortaledToBody = menu?.parentElement === document.body;
      const optionCount = menu ? menu.querySelectorAll('[role="option"]').length : 0;
      const searchInput = document.querySelector('[data-testid="filter-city-search"]');
      const mapContainer = document.querySelector('[data-testid="map-container"]');
      const osmSwitcher = document.querySelector('[data-testid="osm-basemap-switcher"]');

      const triggerZ = getComputedStyle(cityTrigger).zIndex;
      const menuZ = menu ? getComputedStyle(menu).zIndex : null;
      const mapZ = mapContainer ? getComputedStyle(mapContainer).zIndex : null;
      const mapIsolation = mapContainer ? getComputedStyle(mapContainer).isolation : null;
      const osmZ = osmSwitcher ? getComputedStyle(osmSwitcher).zIndex : null;

      // Check hit-testing at the center of the open Kota/Kabupaten dropdown menu
      const menuRect = menu.getBoundingClientRect();
      const hitEl = document.elementFromPoint(
        menuRect.left + menuRect.width / 2,
        menuRect.top + Math.min(120, menuRect.height / 2)
      );
      const dropdownCoversUnderlyingElements = menu.contains(hitEl) || hitEl === menu;

      // Close dropdown via Escape and verify OSM controls work
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 600));
      const closed = !document.querySelector('[data-testid="filter-city-menu"]');

      const osmStdBtn = document.querySelector('[data-testid="osm-standard-btn"]');
      const osmDarkBtn = document.querySelector('[data-testid="osm-dark-btn"]');
      if (osmStdBtn) osmStdBtn.click();
      await new Promise(r => setTimeout(r, 150));
      const stdActive = !mapContainer.classList.contains('osm-dark-tiles');
      if (osmDarkBtn) osmDarkBtn.click();
      await new Promise(r => setTimeout(r, 150));
      const darkActive = mapContainer.classList.contains('osm-dark-tiles');

      return {
        opened: !!menu,
        isPortaledToBody,
        hasSearchInput: !!searchInput,
        optionCount,
        triggerZ,
        menuZ,
        mapZ,
        mapIsolation,
        osmZ,
        dropdownCoversUnderlyingElements,
        closed,
        stdActive,
        darkActive
      };
    })()`);
    console.log("2. Kota/Kabupaten Dropdown vs OSM Map Controls Check:", JSON.stringify(dropdownLayeringCheck, null, 2));
    assert.equal(dropdownLayeringCheck.opened, true);
    assert.equal(dropdownLayeringCheck.isPortaledToBody, true);
    assert.equal(dropdownLayeringCheck.hasSearchInput, true);
    assert.ok(dropdownLayeringCheck.optionCount > 10, "City dropdown must list cities");
    assert.equal(dropdownLayeringCheck.triggerZ, "300");
    assert.equal(dropdownLayeringCheck.menuZ, "400");
    assert.equal(dropdownLayeringCheck.mapZ, "0");
    assert.equal(dropdownLayeringCheck.mapIsolation, "isolate");
    assert.equal(dropdownLayeringCheck.osmZ, "20");
    assert.equal(dropdownLayeringCheck.dropdownCoversUnderlyingElements, true, "Dropdown must visually cover underlying map/OSM controls");
    assert.equal(dropdownLayeringCheck.closed, true);
    assert.equal(dropdownLayeringCheck.stdActive, true);
    assert.equal(dropdownLayeringCheck.darkActive, true);

    // 3. Test Camera Directory Interaction & Modal Stacking Over Map Controls (CCTV Sarinah Direct HLS)
    const directoryInteractionCheck = await evaluate(`(async () => {
      const sarinahBtn = document.querySelector('[data-testid="directory-camera-btn-amg-cctv-sarinah"]');
      if (!sarinahBtn) return { foundSarinahInDirectory: false };
      sarinahBtn.click();
      await new Promise(r => setTimeout(r, 400));

      const modalBackdrop = document.querySelector('[data-testid="camera-detail-modal-backdrop"]');
      const modalDialog = document.querySelector('[data-testid="camera-detail-modal"]');
      const mapPreview = document.querySelector('[data-testid="map-camera-popup"]');
      const backdropZ = modalBackdrop ? getComputedStyle(modalBackdrop).zIndex : null;
      const modalZ = modalDialog ? getComputedStyle(modalDialog).zIndex : null;

      // Verify Direct HLS Only is active and no playback mode switcher or iframe exists
      const modeSwitcher = modalDialog?.querySelector('[data-testid="amg-playback-switcher"]');
      const videoEl = modalDialog?.querySelector('video');
      const iframeEl = modalDialog?.querySelector('iframe');

      // Check hit-test at the exact screen coordinates of the OSM Basemap Switcher while modal is open
      const osmSwitcher = document.querySelector('[data-testid="osm-basemap-switcher"]');
      const osmRect = osmSwitcher.getBoundingClientRect();
      const topHitAtOsmCoords = document.elementFromPoint(
        osmRect.left + osmRect.width / 2,
        osmRect.top + osmRect.height / 2
      );
      const modalOrBackdropCoversOsm =
        modalBackdrop.contains(topHitAtOsmCoords) || topHitAtOsmCoords === modalBackdrop;

      const bodyOverflowLocked = document.body.style.overflow === 'hidden';

      // Toggle Favorite button inside modal
      const favBtn = modalDialog?.querySelector('[data-testid="favorite-btn-amg-cctv-sarinah"]');
      if (favBtn) favBtn.click();
      await new Promise(r => setTimeout(r, 200));
      const favPressed = favBtn?.getAttribute('aria-pressed') === 'true';
      if (favBtn) favBtn.click(); // toggle back
      await new Promise(r => setTimeout(r, 150));

      // Close modal
      const closeBtn = document.querySelector('[data-testid="close-camera-detail-modal"]');
      if (closeBtn) closeBtn.click();
      await new Promise(r => setTimeout(r, 450));

      const modalClosed = !document.querySelector('[data-testid="camera-detail-modal"]');
      const bodyOverflowRestored = document.body.style.overflow !== 'hidden';

      return {
        foundSarinahInDirectory: true,
        modalOpened: !!modalDialog,
        mapPreviewOpenedSimultaneously: !!mapPreview,
        backdropZ,
        modalZ,
        noModeSwitcher: !modeSwitcher,
        hasVideoElement: !!videoEl,
        hasIframeElement: !!iframeEl,
        modalOrBackdropCoversOsm,
        bodyOverflowLocked,
        favPressed,
        modalClosed,
        bodyOverflowRestored
      };
    })()`);
    console.log("3. Directory Click -> Full Modal Only + Direct HLS Only + Z-Index Check:", JSON.stringify(directoryInteractionCheck, null, 2));
    assert.equal(directoryInteractionCheck.foundSarinahInDirectory, true);
    assert.equal(directoryInteractionCheck.modalOpened, true);
    assert.equal(
      directoryInteractionCheck.mapPreviewOpenedSimultaneously,
      false,
      "CRITICAL: Directory click must NOT open map preview card"
    );
    assert.equal(directoryInteractionCheck.backdropZ, "900");
    assert.equal(directoryInteractionCheck.modalZ, "1000");
    assert.equal(directoryInteractionCheck.noModeSwitcher, true, "Sarinah must NOT display a playback mode selector");
    assert.equal(directoryInteractionCheck.hasVideoElement, true);
    assert.equal(directoryInteractionCheck.hasIframeElement, false, "Must NOT initialize Embed Resmi iframe");
    assert.equal(directoryInteractionCheck.modalOrBackdropCoversOsm, true, "Modal backdrop/dialog must completely cover OSM controls");
    assert.equal(directoryInteractionCheck.bodyOverflowLocked, true);
    assert.equal(directoryInteractionCheck.favPressed, true);
    assert.equal(directoryInteractionCheck.modalClosed, true);
    assert.equal(directoryInteractionCheck.bodyOverflowRestored, true);

    // 4. Test Map Marker Click -> Compact Map Preview ONLY -> "Detail Kamera" -> Full Detail Modal ONLY
    const mapMarkerInteractionCheck = await evaluate(`(async () => {
      // Search amg-cctv-sarinah so the single Sarinah marker is rendered directly on the map
      const searchInput = document.querySelector('[data-testid="global-camera-search"]');
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputValueSetter.call(searchInput, 'amg-cctv-sarinah');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 800));

      const markerPin = document.querySelector('.leaflet-marker-icon.cctv-marker-pin') || document.querySelector('.cctv-marker-pin');
      if (!markerPin) return { markerFound: false };
      markerPin.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 450));

      const mapPreview = document.querySelector('[data-testid="map-camera-popup"]');
      const modalWhilePreview = document.querySelector('[data-testid="camera-detail-modal"]');
      const previewSwitcher = mapPreview?.querySelector('[data-testid="amg-playback-switcher"]');
      const previewVideo = mapPreview?.querySelector('video');
      const previewIframe = mapPreview?.querySelector('iframe');

      // Click "Detail Kamera" inside the compact map preview
      const detailBtn = document.querySelector('[data-testid="map-preview-detail-btn"]');
      if (detailBtn) detailBtn.click();
      await new Promise(r => setTimeout(r, 450));

      const previewAfterTransition = document.querySelector('[data-testid="map-camera-popup"]');
      const modalAfterTransition = document.querySelector('[data-testid="camera-detail-modal"]');
      const modalContainsSarinah = modalAfterTransition?.innerText.includes('CCTV Sarinah') || false;

      // Close modal and clear search
      const closeBtn = document.querySelector('[data-testid="close-camera-detail-modal"]');
      if (closeBtn) closeBtn.click();
      await new Promise(r => setTimeout(r, 450));

      nativeInputValueSetter.call(searchInput, '');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 500));

      return {
        markerFound: true,
        previewOpenedOnly: !!mapPreview && !modalWhilePreview,
        previewNoSwitcher: !previewSwitcher,
        previewHasVideo: !!previewVideo,
        previewNoIframe: !previewIframe,
        transitionClosedPreview: !previewAfterTransition,
        transitionOpenedModal: !!modalAfterTransition,
        modalContainsSarinah
      };
    })()`);
    console.log("4. Map Marker Click -> Compact Preview Only -> Detail Kamera Transition:", JSON.stringify(mapMarkerInteractionCheck, null, 2));
    assert.equal(mapMarkerInteractionCheck.markerFound, true);
    assert.equal(
      mapMarkerInteractionCheck.previewOpenedOnly,
      true,
      "CRITICAL: Map marker click must open ONLY compact map preview, NOT full detail modal"
    );
    assert.equal(mapMarkerInteractionCheck.previewNoSwitcher, true, "Compact map preview must NOT show a mode selector");
    assert.equal(mapMarkerInteractionCheck.previewHasVideo, true);
    assert.equal(mapMarkerInteractionCheck.previewNoIframe, true);
    assert.equal(mapMarkerInteractionCheck.transitionClosedPreview, true, "Clicking Detail Kamera must close compact map preview");
    assert.equal(mapMarkerInteractionCheck.transitionOpenedModal, true, "Clicking Detail Kamera must open full Camera Detail Modal");
    assert.equal(mapMarkerInteractionCheck.modalContainsSarinah, true);

    // 5. Responsive Validation Across All 10 Viewports (320px -> 1920px)
    for (const vp of VIEWPORTS) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.mobile ? 2 : 1,
        mobile: vp.mobile
      });
      await sleep(250);

      const check = await evaluate(`(() => {
        const scrollWidth = document.documentElement.scrollWidth;
        const innerWidth = window.innerWidth;
        const overflowX = scrollWidth > innerWidth;
        const mapRect = document.querySelector('.leaflet-container')?.getBoundingClientRect();
        return {
          viewport: "${vp.label}",
          overflowX,
          mapWidth: Math.round(mapRect?.width || 0),
          mapHeight: Math.round(mapRect?.height || 0)
        };
      })()`);

      assert.equal(check.overflowX, false, `Horizontal overflow at ${vp.label}`);
      assert.ok(check.mapWidth > 250 && check.mapHeight >= 400, `Map visible at ${vp.label}`);
    }
    console.log("5. 10-Viewport Responsive Validation (320px -> 1920px): PASS");

    console.log("6. Console Errors:", JSON.stringify(consoleErrors));
    console.log("7. Page Exceptions:", JSON.stringify(pageExceptions));
    assert.equal(consoleErrors.length, 0, "Must have 0 console errors");
    assert.equal(pageExceptions.length, 0, "Must have 0 page exceptions");

    console.log("=== ALL STACKING CONTEXT, INTERACTION FLOW, DIRECT HLS & RESPONSIVE TESTS PASSED ===");
    ws.close();
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
}

runResponsiveBrandingTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
