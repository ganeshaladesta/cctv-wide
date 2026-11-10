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
    await sleep(1800);

    // 1. Verify 5-Second Framer Motion First-Load Overlay
    const loadingOverlayCheck = await evaluate(`(() => {
      const overlay = document.querySelector('[data-testid="eagle-eyes-loading-overlay"]');
      const radar = document.querySelector('[data-testid="loading-radar-sweep"]');
      const bg = overlay ? getComputedStyle(overlay).backgroundColor : null;
      return {
        overlayPresentAt1_3s: !!overlay,
        radarPresentAt1_3s: !!radar,
        backgroundColor: bg,
        hasBrandText: overlay ? overlay.innerText.includes('SCC - EAGLE EYES') : false
      };
    })()`);
    console.log(
      "1. Framer Motion 5s LoadingOverlay Check (at ~1.3s):",
      JSON.stringify(loadingOverlayCheck, null, 2)
    );
    assert.equal(loadingOverlayCheck.overlayPresentAt1_3s, true);
    assert.equal(loadingOverlayCheck.radarPresentAt1_3s, true);
    assert.equal(loadingOverlayCheck.backgroundColor, "rgb(9, 11, 16)");
    assert.equal(loadingOverlayCheck.hasBrandText, true);

    // Wait for 5.0s total duration to complete and verify fade-out + sessionStorage persistence
    await sleep(4300);
    const after5sCheck = await evaluate(`(() => ({
      overlayStillPresent: !!document.querySelector('[data-testid="eagle-eyes-loading-overlay"]'),
      sessionFlag: sessionStorage.getItem('scc_eagle_eyes_first_load_done')
    }))()`);
    console.log("1b. After 5.0s LoadingOverlay Fade-Out:", JSON.stringify(after5sCheck));
    assert.equal(after5sCheck.overlayStillPresent, false, "Loading overlay must fade out after 5 seconds");
    assert.equal(after5sCheck.sessionFlag, "1", "First-load state must persist in sessionStorage");

    // 2. Verify Eagle Eyes Logo Replacement, Favicons, Manifest, and Institutional Logos
    const brandingCheck = await evaluate(`(async () => {
      const title = document.title;
      const bodyText = document.body.innerText;
      const icons = Array.from(document.querySelectorAll('link[rel*="icon"]')).map(l => l.getAttribute('href'));
      const manifestHref = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
      const manifestRes = manifestHref ? await fetch(manifestHref).then(r => r.json()) : null;

      const headerBrandImg = document.querySelector('[data-testid="eagle-eyes-logo-img"]');
      const headerBrandSrc = headerBrandImg ? headerBrandImg.getAttribute('src') : null;
      const headerBrandFit = headerBrandImg ? getComputedStyle(headerBrandImg).objectFit : null;

      const instImgs = Array.from(document.querySelectorAll('[data-testid="institutional-logos"] img')).map(img => ({
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt'),
        naturalWidth: img.naturalWidth,
        objectFit: getComputedStyle(img).objectFit
      }));

      return {
        title,
        hasNewBrand: bodyText.includes('SCC - EAGLE EYES'),
        hasOldBrand: bodyText.includes('PANTAU NUSANTARA'),
        hasCopyright: bodyText.includes('Developed by Ganesha Ladesta'),
        icons,
        manifestName: manifestRes?.name,
        manifestIcons: manifestRes?.icons?.map(i => i.src) || [],
        headerBrandSrc,
        headerBrandFit,
        instImgs
      };
    })()`);

    console.log("2. Eagle Eyes Branding & Logo Verification:", JSON.stringify(brandingCheck, null, 2));
    assert.equal(brandingCheck.title, "SCC - EAGLE EYES | Integrated Monitoring System");
    assert.equal(brandingCheck.hasNewBrand, true);
    assert.equal(brandingCheck.hasOldBrand, false);
    assert.equal(brandingCheck.headerBrandSrc, "/assets/scc-eagle-eyes-logo.png");
    assert.equal(brandingCheck.headerBrandFit, "contain");
    assert.ok(brandingCheck.icons.includes("/favicon.ico"));
    assert.ok(brandingCheck.icons.includes("/favicon-32x32.png"));
    assert.ok(brandingCheck.icons.includes("/favicon-16x16.png"));
    assert.ok(brandingCheck.icons.includes("/apple-touch-icon.png"));
    assert.ok(brandingCheck.manifestIcons.includes("/icon-192.png"));
    assert.ok(brandingCheck.manifestIcons.includes("/icon-512.png"));
    assert.ok(brandingCheck.instImgs.length >= 3, "Must keep all 3 institutional logos in their dedicated section");
    assert.ok(brandingCheck.instImgs.some(i => i.src === "/assets/logo-bank-indonesia.webp" && i.naturalWidth > 0 && i.objectFit === "contain"));
    assert.ok(brandingCheck.instImgs.some(i => i.src === "/assets/logo-dlaf.png" && i.naturalWidth > 0 && i.objectFit === "contain"));
    assert.ok(brandingCheck.instImgs.some(i => i.src === "/assets/logo-pambi.png" && i.naturalWidth > 0 && i.objectFit === "contain"));

    // 3. Verify Framer Motion Morph Dropdowns (AnimatedDropdown)
    const dropdownCheck = await evaluate(`(async () => {
      const trigger = document.querySelector('[data-testid="filter-province-trigger"]');
      if (!trigger) return { opened: false };
      trigger.click();
      await new Promise(r => setTimeout(r, 250));
      const menu = document.querySelector('[data-testid="filter-province-menu"]');
      const opened = !!menu;
      const optionCount = menu ? menu.querySelectorAll('[role="option"]').length : 0;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 500));
      const closedOnEscape = !document.querySelector('[data-testid="filter-province-menu"]');
      return { opened, optionCount, closedOnEscape };
    })()`);
    console.log("3. Framer Motion Morph Dropdown Check:", JSON.stringify(dropdownCheck));
    assert.equal(dropdownCheck.opened, true);
    assert.equal(dropdownCheck.optionCount, 39, "38 provinces + 'Semua 38 Provinsi'");
    assert.equal(dropdownCheck.closedOnEscape, true);

    // 4. Verify Favorites Feature (Add -> Persist in localStorage -> View in Favorite CCTV tab -> Remove -> Empty state)
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(300);

    const favoritesCheck = await evaluate(`(async () => {
      localStorage.removeItem('scc_eagle_eyes_favorites');
      const firstFavBtn = document.querySelector('[data-testid^="favorite-btn-"]');
      if (!firstFavBtn) return { foundBtn: false };
      const testId = firstFavBtn.getAttribute('data-testid');
      const cameraId = testId.replace('favorite-btn-', '');
      firstFavBtn.click();
      await new Promise(r => setTimeout(r, 250));

      const rawStorage = localStorage.getItem('scc_eagle_eyes_favorites');
      const parsedStorage = rawStorage ? JSON.parse(rawStorage) : [];

      const navFavTab = document.querySelector('[data-testid="nav-tab-favorites"]');
      if (navFavTab) navFavTab.click();
      await new Promise(r => setTimeout(r, 600));

      const favCardPresent = !!document.querySelector('[data-testid="favorite-camera-card-' + cameraId + '"]');
      const removeBtn = document.querySelector('[data-testid="remove-favorite-' + cameraId + '"]');
      if (removeBtn) removeBtn.click();
      await new Promise(r => setTimeout(r, 350));

      const emptyStateEl = document.querySelector('[data-testid="favorites-empty-state"]');
      const emptyStateText = emptyStateEl ? emptyStateEl.innerText : '';

      // Switch back to map tab for viewport audit
      const mapTabBtn = Array.from(document.querySelectorAll('header nav button')).find(b => b.innerText.includes('Peta Interaktif'));
      if (mapTabBtn) mapTabBtn.click();
      await new Promise(r => setTimeout(r, 350));

      return {
        foundBtn: true,
        cameraId,
        savedCount: parsedStorage.length,
        hasAddedAt: Boolean(parsedStorage[0]?.addedAt),
        favCardPresent,
        emptyStateExactMatch: emptyStateText.includes('Belum ada CCTV favorit. Tambahkan kamera favorit untuk mengaksesnya lebih cepat.')
      };
    })()`);
    console.log("4. Favorites Feature Verification:", JSON.stringify(favoritesCheck, null, 2));
    assert.equal(favoritesCheck.foundBtn, true);
    assert.equal(favoritesCheck.savedCount, 1);
    assert.equal(favoritesCheck.hasAddedAt, true);
    assert.equal(favoritesCheck.favCardPresent, true);
    assert.equal(favoritesCheck.emptyStateExactMatch, true);

    // 5. Test all 10 viewports on Main Dashboard
    const viewportResults = [];
    for (const vp of VIEWPORTS) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.mobile ? 2 : 1,
        mobile: vp.mobile
      });
      await sleep(300);

      const check = await evaluate(`(() => {
        const scrollWidth = document.documentElement.scrollWidth;
        const innerWidth = window.innerWidth;
        const overflowX = scrollWidth > innerWidth;
        const mapRect = document.querySelector('.leaflet-container')?.getBoundingClientRect();
        return {
          viewport: "${vp.label}",
          innerWidth,
          scrollWidth,
          overflowX,
          mapWidth: Math.round(mapRect?.width || 0),
          mapHeight: Math.round(mapRect?.height || 0)
        };
      })()`);

      viewportResults.push(check);
      assert.equal(
        check.overflowX,
        false,
        `Horizontal overflow at ${vp.label}: scrollWidth=${check.scrollWidth} > innerWidth=${check.innerWidth}`
      );
      assert.ok(
        check.mapWidth > 250 && check.mapHeight >= 400,
        `Map must be visible at ${vp.label}`
      );
    }
    console.log("5. 10-Viewport Audit Results (320px -> 1920px): PASS");

    // 6. Test Secondary Pages (/favorites, /kamera, /about, /kamera/dki-jakarta/amg-cctv-sarinah)
    for (const route of [
      "/favorites",
      "/kamera",
      "/about",
      "/kamera/dki-jakarta/amg-cctv-sarinah"
    ]) {
      await send("Page.navigate", { url: `${APP_URL}${route}` });
      await sleep(1000);
      for (const width of [320, 768, 1440]) {
        await send("Emulation.setDeviceMetricsOverride", {
          width,
          height: 800,
          deviceScaleFactor: 1,
          mobile: width < 1024
        });
        await sleep(200);
        const pageState = await evaluate(`(() => ({
          route: "${route}",
          width: ${width},
          overflowX: document.documentElement.scrollWidth > window.innerWidth,
          hasNewBrand: document.body.innerText.includes('SCC - EAGLE EYES'),
          hasEagleLogo: !!document.querySelector('[data-testid="eagle-eyes-logo-img"]'),
          overlayReplayed: !!document.querySelector('[data-testid="eagle-eyes-loading-overlay"]')
        }))()`);
        assert.equal(pageState.overflowX, false, `Overflow on ${route} at ${width}px`);
        assert.equal(pageState.hasNewBrand, true, `Missing SCC - EAGLE EYES on ${route}`);
        assert.equal(pageState.hasEagleLogo, true, `Missing Eagle Eyes logo on ${route}`);
        assert.equal(pageState.overlayReplayed, false, `Loading overlay must not replay on ${route}`);
      }
    }

    console.log("6. Secondary Pages (/favorites, /kamera, /about, /kamera/dki-jakarta/amg-cctv-sarinah): PASS");
    console.log("7. Console Errors:", JSON.stringify(consoleErrors));
    console.log("8. Page Exceptions:", JSON.stringify(pageExceptions));
    assert.equal(consoleErrors.length, 0, "Must have 0 console errors");
    assert.equal(pageExceptions.length, 0, "Must have 0 page exceptions");

    console.log("ALL BRANDING, LOADING OVERLAY, FAVORITES, MORPH DROPDOWN & 10-VIEWPORT TESTS PASSED!");
    ws.close();
  } finally {
    if (chrome) chrome.kill();
    server.kill();
    await sleep(400);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

runResponsiveBrandingTests().catch((err) => {
  console.error("Responsive/Branding test failed:", err);
  process.exit(1);
});
