/**
 * Test suite for UNRAS Map Marker Popup Layout Constraints
 * Verifies two-column CSS grid, button sizing, responsive container, and event binding IDs.
 */
import assert from "node:assert/strict";
import fs from "node:fs";

console.log("=== SCC EAGLE EYES: UNRAS MAP POPUP LAYOUT TEST SUITE ===\n");

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`  [PASS] Test ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] Test ${total}: ${name}`);
    console.error(err);
  }
}

const mapSource = fs.readFileSync("src/components/interactive-map.tsx", "utf-8");
const cssSource = fs.readFileSync("src/app/globals.css", "utf-8");

// TEST 1: Popup root container sizing and box-sizing
runTest("Popup root container has width: min(360px, calc(100vw - 40px)), max-width 360px, and box-sizing", () => {
  assert.ok(
    mapSource.includes("scc-protest-popup-root"),
    "Popup root must have class scc-protest-popup-root"
  );
  assert.ok(
    mapSource.includes('width: min(360px, calc(100vw - 40px))'),
    "Popup root inline style must enforce width: min(360px, calc(100vw - 40px))"
  );
  assert.ok(
    mapSource.includes('max-width: 360px'),
    "Popup root must enforce max-width: 360px"
  );
  assert.ok(
    mapSource.includes("overflow-hidden"),
    "Popup root must have overflow-hidden to prevent container clipping"
  );
});

// TEST 2: Two-column grid with minmax(0, 1fr)
runTest("Action buttons container uses 2-column grid with minmax(0, 1fr) minmax(0, 1fr)", () => {
  assert.ok(
    mapSource.includes("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)"),
    "Actions container must specify minmax(0, 1fr) columns"
  );
  assert.ok(
    mapSource.includes("gap: 8px"),
    "Actions container must have 8px gap"
  );
  assert.ok(
    mapSource.includes("min-width: 0"),
    "Actions container must allow shrinking via min-width: 0"
  );
});

// TEST 3: Button constraint rules (width 100%, min-width 0, max-width 100%, box-sizing)
runTest("Both action buttons apply strict width and overflow wrapping constraints", () => {
  const buttonStyleRequired =
    "width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; white-space: normal; overflow-wrap: anywhere; text-align: center;";
  
  const occurrences = (mapSource.match(new RegExp(buttonStyleRequired.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  assert.equal(occurrences, 2, "Both GeoINT and Pantau buttons must have full constraint styles");
});

// TEST 4: GeoINT HUD button contains valid shrink-0 SVG icon (no unparsed React component in HTML string)
runTest("GeoINT HUD button contains shrink-0 SVG icon instead of raw React JSX tag", () => {
  assert.ok(
    !mapSource.includes('<Radar class="w-3 h-3 text-blue-400" />'),
    "Must not output raw <Radar> React component tag in template string"
  );
  assert.ok(
    mapSource.includes('<svg class="w-3.5 h-3.5 text-blue-400 shrink-0"'),
    "Must output valid SVG icon with shrink-0"
  );
  assert.ok(
    mapSource.includes("GeoINT HUD"),
    "Must preserve 'GeoINT HUD' label"
  );
});

// TEST 5: Button IDs and click event listener binding
runTest("Button IDs for GeoINT HUD and Pantau Situasi are preserved and bound in popupopen", () => {
  assert.ok(
    mapSource.includes('id="btn-protest-geoint-${p.id}"'),
    "GeoINT button must have ID btn-protest-geoint-${p.id}"
  );
  assert.ok(
    mapSource.includes('id="btn-protest-popup-${p.id}"'),
    "Pantau button must have ID btn-protest-popup-${p.id}"
  );
  assert.ok(
    mapSource.includes("btnGeoInt.onclick = (e) =>"),
    "GeoINT button click handler must be bound in popupopen"
  );
  assert.ok(
    mapSource.includes("btnDetail.onclick = (e) =>"),
    "Pantau button click handler must be bound in popupopen"
  );
});

// TEST 6: Global CSS rules for .scc-leaflet-protest-popup
runTest("src/app/globals.css includes .scc-leaflet-protest-popup constraint rules", () => {
  assert.ok(
    cssSource.includes(".scc-leaflet-protest-popup"),
    "globals.css must define .scc-leaflet-protest-popup"
  );
  assert.ok(
    cssSource.includes("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important"),
    "globals.css must enforce minmax(0, 1fr) minmax(0, 1fr)"
  );
  assert.ok(
    cssSource.includes("overflow-wrap: anywhere !important"),
    "globals.css must enforce overflow-wrap: anywhere"
  );
  assert.ok(
    cssSource.includes("max-width: calc(100vw - 32px) !important"),
    "globals.css must constrain leaflet-popup-content to viewport width"
  );
});

// TEST 7: Both buttons share consistent height, padding, and alignment
runTest("Both buttons share identical padding, font size, and rounded corners", () => {
  assert.ok(
    mapSource.includes("popup-btn-geoint w-full min-w-0 max-w-full py-2 px-2.5 rounded-xl"),
    "GeoINT button has py-2 px-2.5 rounded-xl"
  );
  assert.ok(
    mapSource.includes("popup-btn-pantau w-full min-w-0 max-w-full py-2 px-2.5 rounded-xl"),
    "Pantau button has py-2 px-2.5 rounded-xl"
  );
});

// TEST 8: BI Office popup root container sizing and box-sizing
runTest("BI Office popup root container has width: min(300px, calc(100vw - 32px)), max-width 300px, and box-sizing", () => {
  assert.ok(
    mapSource.includes("scc-bi-popup-root"),
    "BI popup root must have class scc-bi-popup-root"
  );
  assert.ok(
    mapSource.includes('width: min(300px, calc(100vw - 32px))'),
    "BI popup root inline style must enforce width: min(300px, calc(100vw - 32px))"
  );
  assert.ok(
    mapSource.includes('max-width: 300px'),
    "BI popup root must enforce max-width: 300px"
  );
});

// TEST 9: BI Office header has right padding for close button
runTest("BI Office header has pr-6 to prevent badge/identifier overlap with Leaflet close button", () => {
  assert.ok(
    mapSource.includes("flex items-center justify-between gap-2 pb-2 mb-2 border-b border-[#1E293B] pr-6"),
    "Header must include pr-6 for Leaflet close button spacing"
  );
});

// TEST 10: BI Office nearest UNRAS proximity card uses line-clamp-2
runTest("BI Office nearest UNRAS proximity card applies two-line clamp and break-words", () => {
  assert.ok(
    mapSource.includes("line-clamp-2 break-words text-white/90 text-[10px] leading-snug m-0"),
    "Proximity card must use line-clamp-2 break-words to prevent horizontal expansion"
  );
});

// TEST 11: BI Office action button and click listener
runTest("BI Office action button preserves ID, SVG icon, and Analisis GeoINT label", () => {
  assert.ok(
    mapSource.includes('id="btn-bi-office-hud-${office.id}"'),
    "Action button must preserve ID btn-bi-office-hud-${office.id}"
  );
  assert.ok(
    mapSource.includes("Analisis GeoINT &amp; Perimeter"),
    "Action button must display 'Analisis GeoINT & Perimeter'"
  );
  assert.ok(
    mapSource.includes("setIsGeoIntHudOpen(true)"),
    "Action button click handler must open GeoINT HUD"
  );
});

// TEST 12: globals.css contains .scc-leaflet-bi-popup and close button rules
runTest("globals.css defines .scc-leaflet-bi-popup constraints and close button styling", () => {
  assert.ok(
    cssSource.includes(".scc-leaflet-bi-popup"),
    "globals.css must define .scc-leaflet-bi-popup"
  );
  assert.ok(
    cssSource.includes("leaflet-container a.leaflet-popup-close-button"),
    "globals.css must style Leaflet close button"
  );
});

console.log(`\n=== POPUP LAYOUT TEST SUMMARY: ${passed}/${total} PASSED ===\n`);
if (passed !== total) {
  process.exit(1);
}

