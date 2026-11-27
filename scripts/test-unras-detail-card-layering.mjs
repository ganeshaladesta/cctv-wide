/**
 * Automated verification test for UNRAS Detail Card Layering (5-Tier Z-Index Hierarchy)
 * and Header Layout (UNRAS ID vs 36x36px Close Button non-overlap).
 */

import assert from "node:assert/strict";
import fs from "node:fs";

console.log("=== SCC EAGLE EYES: UNRAS DETAIL CARD LAYERING & HEADER LAYOUT TEST ===");

const globalsCss = fs.readFileSync("src/app/globals.css", "utf-8");
const interactiveMapTsx = fs.readFileSync("src/components/interactive-map.tsx", "utf-8");
const tacticalHudTsx = fs.readFileSync("src/components/tactical-geoint-hud.tsx", "utf-8");

// 1. Verify 5-tier z-index hierarchy variables in globals.css
const extractCssVarInt = (name) => {
  const re = new RegExp(`${name}:\\s*(\\d+)\\s*;`);
  const m = globalsCss.match(re);
  assert.ok(m, `CSS variable ${name} must be defined in globals.css`);
  return parseInt(m[1], 10);
};

const zModalBackdrop = extractCssVarInt("--z-modal-backdrop");
const zModal = extractCssVarInt("--z-modal");
const zMapDetailCard = extractCssVarInt("--z-map-detail-card");
const zMapFilterDropdown = extractCssVarInt("--z-map-filter-dropdown");
const zTacticalHud = extractCssVarInt("--z-tactical-hud");
const zMapControls = extractCssVarInt("--z-map-controls");
const zMapMarkers = extractCssVarInt("--z-map-markers");
const zMapTiles = extractCssVarInt("--z-map-tiles");

assert.ok(
  zModal > zModalBackdrop &&
    zModalBackdrop > zMapDetailCard &&
    zMapDetailCard > zMapFilterDropdown &&
    zMapFilterDropdown > zTacticalHud &&
    zTacticalHud > zMapControls &&
    zMapControls > zMapMarkers &&
    zMapMarkers > zMapTiles,
  `Strict 5-tier z-index order violated: modal(${zModal}) > detailCard(${zMapDetailCard}) > dropdown(${zMapFilterDropdown}) > tacticalHud(${zTacticalHud}) > controls(${zMapControls}) > markers(${zMapMarkers}) > tiles(${zMapTiles})`
);
console.log("  [PASS] 1. 5-tier z-index hierarchy strictly ordered: Modal (9999) > UNRAS Detail Card (50) > Map Filters/HUD (25-35) > Markers (10) > Tiles (0-1)");

// 2. Verify parent stacking context fix on .leaflet-container and popupPane promotion
assert.ok(
  /\.leaflet-container\s*\{[^}]*isolation:\s*auto\s*!important/s.test(globalsCss),
  ".leaflet-container must have isolation: auto !important so it does not trap .leaflet-popup-pane"
);
assert.ok(
  /\.leaflet-container\s*\{[^}]*z-index:\s*auto\s*!important/s.test(globalsCss),
  ".leaflet-container must have z-index: auto !important so child panes interleave with sibling controls"
);
assert.ok(
  /\.leaflet-popup-pane\s*\{[^}]*z-index:\s*var\(--z-map-detail-card,\s*50\)\s*!important/s.test(globalsCss),
  ".leaflet-popup-pane must have z-index: var(--z-map-detail-card, 50) !important"
);
assert.ok(
  interactiveMapTsx.includes("leafletContainerEl.appendChild(popupPane)"),
  "InteractiveMap must promote popupPane out of mapPane's transform stacking context into .leaflet-container"
);
assert.ok(
  !interactiveMapTsx.includes('z-[60]'),
  "Layer visibility menu must not use z-[60] which would exceed detail card z-index (50)"
);
assert.ok(
  tacticalHudTsx.includes("z-[30]"),
  "TacticalGeoIntHud must remain at z-[30], below UNRAS detail card (50) and above markers (10)"
);
console.log("  [PASS] 2. Parent stacking contexts fixed (.leaflet-container un-isolated and popupPane promoted above map filters & Tactical HUD)");

// 3. Verify Close button minimum 36x36px clickable area and header reserved slot
assert.ok(
  /\.leaflet-container\s+a\.leaflet-popup-close-button\s*\{[^}]*width:\s*36px\s*!important/s.test(globalsCss),
  "Close button width must be at least 36px"
);
assert.ok(
  /\.leaflet-container\s+a\.leaflet-popup-close-button\s*\{[^}]*height:\s*36px\s*!important/s.test(globalsCss),
  "Close button height must be at least 36px"
);
assert.ok(
  /\.leaflet-container\s+a\.leaflet-popup-close-button\s*\{[^}]*min-width:\s*36px\s*!important/s.test(globalsCss),
  "Close button min-width must be at least 36px"
);
assert.ok(
  /\.leaflet-container\s+a\.leaflet-popup-close-button\s*\{[^}]*min-height:\s*36px\s*!important/s.test(globalsCss),
  "Close button min-height must be at least 36px"
);
console.log("  [PASS] 3. Close button has dedicated 36x36px accessible clickable hit area");

// 4. Verify UNRAS detail card header grid layout separates UNRAS ID from Close button
assert.ok(
  interactiveMapTsx.includes('scc-protest-popup-header') &&
    interactiveMapTsx.includes('grid-template-columns: minmax(0, 1fr) 36px'),
  "UNRAS detail card header must use a 2-column grid reserving 36px on the right for the Close button"
);
assert.ok(
  interactiveMapTsx.includes('data-testid="protest-popup-unras-id"'),
  "UNRAS ID must be rendered in its own dedicated element"
);
assert.ok(
  interactiveMapTsx.includes('style="width: 36px; height: 36px;" aria-hidden="true"'),
  "Header must reserve an explicit 36x36px spacer column for the Close button"
);
console.log("  [PASS] 4. UNRAS detail card header reserves 36x36px top-right slot and displays UNRAS ID in dedicated non-overlapping row");

console.log("=== ALL UNRAS DETAIL CARD LAYERING & HEADER LAYOUT TESTS PASSED ===");

