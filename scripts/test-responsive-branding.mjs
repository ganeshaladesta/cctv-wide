import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9231;
const APP_URL = "http://localhost:3000";

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

async function runResponsiveBrandingTests() {
  const userDataDir = path.join(process.cwd(), ".chrome-rebrand-profile");
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

    await sleep(2500);

    // 1. Verify Branding, Title, Favicon, and 3 Institutional Logos
    const brandingCheck = await evaluate(`(async () => {
      const title = document.title;
      const bodyText = document.body.innerText;
      const icons = Array.from(document.querySelectorAll('link[rel*="icon"]')).map(l => l.getAttribute('href'));
      const manifestHref = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
      const manifestRes = manifestHref ? await fetch(manifestHref).then(r => r.json()) : null;

      // Primary header brand icon
      const headerBrandImg = document.querySelector('header a[href="/"] img');
      const headerBrandSrc = headerBrandImg ? headerBrandImg.getAttribute('src') : null;

      // Institutional logos
      const instImgs = Array.from(document.querySelectorAll('[data-testid="institutional-logos"] img')).map(img => ({
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt'),
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
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
        instImgs
      };
    })()`);

    console.log("1. Branding & Logo Verification:", JSON.stringify(brandingCheck, null, 2));
    assert.equal(brandingCheck.title, "SCC - EAGLE EYES | Integrated Monitoring System");
    assert.equal(brandingCheck.hasNewBrand, true);
    assert.equal(brandingCheck.hasOldBrand, false, "Must have zero PANTAU NUSANTARA references in DOM");
    assert.equal(brandingCheck.hasCopyright, true);
    assert.equal(brandingCheck.headerBrandSrc, "/assets/logo-bank-indonesia.webp", "Header primary icon must be Bank Indonesia logo only");
    assert.ok(
      brandingCheck.icons.every((href) => href === "/assets/logo-bank-indonesia.webp"),
      "All favicon links must point exclusively to /assets/logo-bank-indonesia.webp"
    );
    assert.ok(
      brandingCheck.manifestIcons.every((src) => src === "/assets/logo-bank-indonesia.webp"),
      "All PWA manifest icons must point exclusively to /assets/logo-bank-indonesia.webp"
    );
    assert.ok(
      brandingCheck.instImgs.some((i) => i.src === "/assets/logo-bank-indonesia.webp" && i.naturalWidth > 0 && i.objectFit === "contain"),
      "Bank Indonesia logo must load with object-fit: contain"
    );
    assert.ok(
      brandingCheck.instImgs.some((i) => i.src === "/assets/logo-dlaf.png" && i.naturalWidth > 0 && i.objectFit === "contain"),
      "DLAF logo must load with object-fit: contain"
    );
    assert.ok(
      brandingCheck.instImgs.some((i) => i.src === "/assets/logo-pambi.png" && i.naturalWidth > 0 && i.objectFit === "contain"),
      "PAMBI logo must load with object-fit: contain"
    );

    // 2. Test all 10 viewports on Main Dashboard (Map, Multi-View, Mobile Drawer)
    const viewportResults = [];
    for (const vp of VIEWPORTS) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.mobile ? 2 : 1,
        mobile: vp.mobile
      });
      await sleep(350);

      const check = await evaluate(`(() => {
        const scrollWidth = document.documentElement.scrollWidth;
        const innerWidth = window.innerWidth;
        const overflowX = scrollWidth > innerWidth;
        const mapRect = document.querySelector('.leaflet-container')?.getBoundingClientRect();
        const counterText = document.querySelector('[data-testid="map-camera-counter"]')?.innerText.replace(/\\s+/g, ' ').trim() || '';
        return {
          viewport: "${vp.label}",
          innerWidth,
          scrollWidth,
          overflowX,
          mapWidth: Math.round(mapRect?.width || 0),
          mapHeight: Math.round(mapRect?.height || 0),
          counterText
        };
      })()`);

      viewportResults.push(check);
      assert.equal(
        check.overflowX,
        false,
        `Horizontal overflow detected at ${vp.label}: scrollWidth=${check.scrollWidth} > innerWidth=${check.innerWidth}`
      );
      assert.ok(check.mapWidth > 250 && check.mapHeight >= 400, `Map must be visible and properly sized at ${vp.label}`);
    }
    console.log("2. Viewport Audit Results (320px -> 1920px):", JSON.stringify(viewportResults, null, 2));

    // 3. Test Mobile Hamburger Drawer & Multi-View at 320px
    await send("Emulation.setDeviceMetricsOverride", {
      width: 320,
      height: 640,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(300);

    const mobileDrawerCheck = await evaluate(`(async () => {
      const btn = document.querySelector('[data-testid="mobile-menu-toggle"]');
      if (!btn) return { opened: false };
      btn.click();
      await new Promise(r => setTimeout(r, 250));
      const drawer = document.querySelector('[data-testid="mobile-navigation-drawer"]');
      const opened = !!drawer;
      const multiviewBtn = Array.from(drawer?.querySelectorAll('button') || []).find(b => b.innerText.includes('Multi-View'));
      if (multiviewBtn) multiviewBtn.click();
      await new Promise(r => setTimeout(r, 350));
      const overflowAfterMultiView = document.documentElement.scrollWidth > window.innerWidth;
      return {
        opened,
        overflowAfterMultiView,
        headingText: document.body.innerText.includes('Multi-View Command Wall')
      };
    })()`);
    console.log("3. Mobile Navigation & Multi-View Check at 320px:", JSON.stringify(mobileDrawerCheck, null, 2));
    assert.equal(mobileDrawerCheck.opened, true, "Mobile drawer must open on 320px");
    assert.equal(mobileDrawerCheck.overflowAfterMultiView, false, "Multi-View at 320px must have zero horizontal overflow");
    assert.equal(mobileDrawerCheck.headingText, true, "Multi-View wall must render after mobile nav click");

    // 4. Test Secondary Pages (/kamera and /about) at 320px and 1440px
    for (const route of ["/kamera", "/about"]) {
      await send("Page.navigate", { url: `${APP_URL}${route}` });
      await sleep(1200);
      for (const width of [320, 768, 1440]) {
        await send("Emulation.setDeviceMetricsOverride", {
          width,
          height: 800,
          deviceScaleFactor: 1,
          mobile: width < 1024
        });
        await sleep(250);
        const pageState = await evaluate(`(() => ({
          route: "${route}",
          width: ${width},
          overflowX: document.documentElement.scrollWidth > window.innerWidth,
          hasNewBrand: document.body.innerText.includes('SCC - EAGLE EYES'),
          hasOldBrand: document.body.innerText.includes('PANTAU NUSANTARA')
        }))()`);
        assert.equal(pageState.overflowX, false, `Overflow on ${route} at ${width}px`);
        assert.equal(pageState.hasNewBrand, true, `Missing SCC - EAGLE EYES on ${route}`);
        assert.equal(pageState.hasOldBrand, false, `Found old brand on ${route}`);
      }
    }

    console.log("4. Secondary Pages (/kamera, /about) Responsive & Brand Check: PASS");
    console.log("5. Console Errors:", JSON.stringify(consoleErrors));
    console.log("6. Page Exceptions:", JSON.stringify(pageExceptions));
    assert.equal(consoleErrors.length, 0, "Must have 0 console errors");
    assert.equal(pageExceptions.length, 0, "Must have 0 page exceptions");

    console.log("ALL REBRANDING & RESPONSIVE VIEWPORT TESTS PASSED!");
    ws.close();
  } finally {
    chrome.kill();
    await sleep(500);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

runResponsiveBrandingTests().catch((err) => {
  console.error("Responsive/Branding test failed:", err);
  process.exit(1);
});

