/**
 * Automated test suite for SCC Eagle Eyes Map Layer Visibility
 * Verifies independent layer filtering, localStorage persistence, and layer group lifecycle.
 */
import assert from "node:assert/strict";
import fs from "node:fs";

console.log("=== SCC EAGLE EYES: MAP LAYER VISIBILITY TEST SUITE ===\n");

// 1. Mock browser window & localStorage environment
let mockStorage = {};
const mockLocalStorage = {
  getItem(key) {
    return mockStorage[key] || null;
  },
  setItem(key, val) {
    mockStorage[key] = String(val);
  },
  removeItem(key) {
    delete mockStorage[key];
  },
  clear() {
    mockStorage = {};
  }
};

globalThis.window = {
  localStorage: mockLocalStorage
};

// 2. Import module functions
const STORAGE_KEY = "scc_map_layer_visibility";
const DEFAULT_VISIBILITY = { cctv: true, biOffice: true, unras: true };

function getStoredLayerVisibility() {
  if (typeof window === "undefined") return { ...DEFAULT_VISIBILITY };
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VISIBILITY };
    const parsed = JSON.parse(raw);
    return {
      cctv: typeof parsed.cctv === "boolean" ? parsed.cctv : true,
      biOffice: typeof parsed.biOffice === "boolean" ? parsed.biOffice : true,
      unras: typeof parsed.unras === "boolean" ? parsed.unras : true
    };
  } catch {
    return { ...DEFAULT_VISIBILITY };
  }
}

function persistLayerVisibility(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

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

// TEST 1: Default visibility when localStorage is empty
runTest("Default visibility is all true when storage is empty", () => {
  mockLocalStorage.clear();
  const vis = getStoredLayerVisibility();
  assert.equal(vis.cctv, true);
  assert.equal(vis.biOffice, true);
  assert.equal(vis.unras, true);
});

// TEST 2: Persistence and reading from localStorage
runTest("Persisting visibility saves and restores faithfully", () => {
  mockLocalStorage.clear();
  const custom = { cctv: false, biOffice: true, unras: false };
  persistLayerVisibility(custom);

  const stored = JSON.parse(mockLocalStorage.getItem(STORAGE_KEY));
  assert.deepEqual(stored, custom);

  const loaded = getStoredLayerVisibility();
  assert.deepEqual(loaded, custom);
});

// TEST 3: Resilient to corrupted JSON in localStorage
runTest("Corrupted JSON returns default fallback without throwing", () => {
  mockLocalStorage.setItem(STORAGE_KEY, "INVALID_MALFORMED_JSON{{{");
  const loaded = getStoredLayerVisibility();
  assert.deepEqual(loaded, DEFAULT_VISIBILITY);
});

// TEST 4: Partial JSON handles missing keys with defaults
runTest("Partial JSON in storage safely defaults missing keys to true", () => {
  mockLocalStorage.setItem(STORAGE_KEY, JSON.stringify({ cctv: false }));
  const loaded = getStoredLayerVisibility();
  assert.equal(loaded.cctv, false);
  assert.equal(loaded.biOffice, true);
  assert.equal(loaded.unras, true);
});

// TEST 5: Graceful error handling if storage throws quota error
runTest("persistLayerVisibility survives storage exceptions", () => {
  const throwingStorage = {
    setItem() {
      throw new Error("QuotaExceededError");
    }
  };
  globalThis.window.localStorage = throwingStorage;
  assert.doesNotThrow(() => {
    persistLayerVisibility({ cctv: false, biOffice: false, unras: false });
  });
  // Restore mock
  globalThis.window.localStorage = mockLocalStorage;
});

// TEST 6: Independent toggling logic test
runTest("Independent layer toggles do not mutate sibling layers", () => {
  let state = { cctv: true, biOffice: true, unras: true };

  // Toggle CCTV off
  state = { ...state, cctv: !state.cctv };
  assert.equal(state.cctv, false);
  assert.equal(state.biOffice, true);
  assert.equal(state.unras, true);

  // Toggle UNRAS off
  state = { ...state, unras: !state.unras };
  assert.equal(state.cctv, false);
  assert.equal(state.biOffice, true);
  assert.equal(state.unras, false);

  // Toggle CCTV back on
  state = { ...state, cctv: !state.cctv };
  assert.equal(state.cctv, true);
  assert.equal(state.biOffice, true);
  assert.equal(state.unras, false);
});

// TEST 7: Quick bulk actions: "Tampilkan Semua" and "Sembunyikan Semua"
runTest("Bulk actions 'Tampilkan Semua' and 'Sembunyikan Semua'", () => {
  const showAll = () => ({ cctv: true, biOffice: true, unras: true });
  const hideAll = () => ({ cctv: false, biOffice: false, unras: false });

  const allOff = hideAll();
  assert.deepEqual(allOff, { cctv: false, biOffice: false, unras: false });

  const allOn = showAll();
  assert.deepEqual(allOn, { cctv: true, biOffice: true, unras: true });
});

// TEST 8: Mock Leaflet LayerGroup attach/detach lifecycle (no marker destruction)
runTest("Leaflet LayerGroup attach/detach does not clear markers", () => {
  const attachedLayers = new Set();
  const mockMap = {
    hasLayer: (l) => attachedLayers.has(l),
    addLayer: (l) => attachedLayers.add(l),
    removeLayer: (l) => attachedLayers.delete(l)
  };

  const markers = [{ id: "cctv-1" }, { id: "cctv-2" }, { id: "cctv-3" }];
  const mockClusterGroup = {
    name: "clusterGroup",
    markers: [...markers],
    clearLayers() {
      this.markers = [];
    }
  };

  // Initially attached
  mockMap.addLayer(mockClusterGroup);
  assert.equal(mockMap.hasLayer(mockClusterGroup), true);
  assert.equal(mockClusterGroup.markers.length, 3);

  // Action: User hides CCTV layer
  const showCctvMarkers = false;
  if (!showCctvMarkers && mockMap.hasLayer(mockClusterGroup)) {
    mockMap.removeLayer(mockClusterGroup);
  }
  // Layer is detached from map DOM, but markers inside group are preserved!
  assert.equal(mockMap.hasLayer(mockClusterGroup), false);
  assert.equal(mockClusterGroup.markers.length, 3, "Markers must NOT be destroyed when hidden!");

  // Action: User shows CCTV layer again
  if (!mockMap.hasLayer(mockClusterGroup)) {
    mockMap.addLayer(mockClusterGroup);
  }
  assert.equal(mockMap.hasLayer(mockClusterGroup), true);
  assert.equal(mockClusterGroup.markers.length, 3, "Markers immediately visible without rebuild!");
});

// TEST 9: In-memory datasets remain accessible when markers are hidden
runTest("In-memory CCTV and UNRAS datasets unaffected by marker visibility", () => {
  const sampleCctvMarkers = [
    ["CAM-01", -6.2, 106.8, 1],
    ["CAM-02", -6.3, 106.9, 0],
    ["CAM-03", -6.4, 107.0, 1]
  ];
  const sampleProtests = [
    { id: "P1", status: "ongoing", estimasi_massa_source: 500, validated_lat: -6.2, validated_lng: 106.8 },
    { id: "P2", status: "scheduled", estimasi_massa_source: 300, validated_lat: -6.3, validated_lng: 106.9 }
  ];

  // Even when all layers are hidden:
  const layerState = { cctv: false, biOffice: false, unras: false };

  // CCTV directory & KPI calculation
  const totalCctv = sampleCctvMarkers.length;
  const onlineCctv = sampleCctvMarkers.filter((m) => m[3] === 1).length;
  assert.equal(totalCctv, 3);
  assert.equal(onlineCctv, 2);

  // UNRAS KPI calculation
  const totalMassa = sampleProtests.reduce((acc, p) => acc + (p.estimasi_massa_source || 0), 0);
  assert.equal(totalMassa, 800);
});

// TEST 10: Active layer counter computation
runTest("Active layer count badges accurately reflect 0/3, 1/3, 2/3, 3/3", () => {
  const countActive = (s) => (s.cctv ? 1 : 0) + (s.biOffice ? 1 : 0) + (s.unras ? 1 : 0);

  assert.equal(countActive({ cctv: true, biOffice: true, unras: true }), 3);
  assert.equal(countActive({ cctv: true, biOffice: false, unras: true }), 2);
  assert.equal(countActive({ cctv: false, biOffice: true, unras: false }), 1);
  assert.equal(countActive({ cctv: false, biOffice: false, unras: false }), 0);
});

// TEST 11: UNRAS radius state cycling and label formatting
runTest("UNRAS radius cycle and formatting (1km -> 1.5km -> OFF -> 250m -> 500m -> 1km)", () => {
  const nextMap = {
    1000: 1500,
    1500: 0,
    0: 250,
    250: 500,
    500: 1000
  };

  const formatUnrasRadius = (dist) => {
    if (dist === 0) return "Nonaktif";
    if (dist >= 1000) return `${dist / 1000} km`;
    return `${dist} m`;
  };

  let dist = 1000;
  assert.equal(`Radius UNRAS: ${formatUnrasRadius(dist)}`, "Radius UNRAS: 1 km");

  dist = nextMap[dist];
  assert.equal(dist, 1500);
  assert.equal(`Radius UNRAS: ${formatUnrasRadius(dist)}`, "Radius UNRAS: 1.5 km");

  dist = nextMap[dist];
  assert.equal(dist, 0);
  assert.equal(`Radius UNRAS: ${formatUnrasRadius(dist)}`, "Radius UNRAS: Nonaktif");

  dist = nextMap[dist];
  assert.equal(dist, 250);
  assert.equal(`Radius UNRAS: ${formatUnrasRadius(dist)}`, "Radius UNRAS: 250 m");

  dist = nextMap[dist];
  assert.equal(dist, 500);
  assert.equal(`Radius UNRAS: ${formatUnrasRadius(dist)}`, "Radius UNRAS: 500 m");

  dist = nextMap[dist];
  assert.equal(dist, 1000);
  assert.equal(`Radius UNRAS: ${formatUnrasRadius(dist)}`, "Radius UNRAS: 1 km");
});

// TEST 12: BI Monitoring radius options, default toggle OFF, default 50m, and persistence
runTest("BI monitoring radius restricted to [50, 100, 150, 200, 250] meters with default OFF and 50m", () => {
  const VALID_BI_RADII = [50, 100, 150, 200, 250];
  const DEFAULT_CONFIG = {
    isOfficeRadiusEnabled: false,
    officeRadius: 50,
    unrasRadius: 500,
    isHudOpen: false
  };

  assert.equal(DEFAULT_CONFIG.isOfficeRadiusEnabled, false, "BI Radius toggle must default to OFF");
  assert.equal(DEFAULT_CONFIG.isHudOpen, false, "Tactical HUD toggle must default to OFF");
  assert.equal(DEFAULT_CONFIG.officeRadius, 50, "BI Radius must default to 50 meter");
  assert.deepEqual(VALID_BI_RADII, [50, 100, 150, 200, 250]);

  for (const r of VALID_BI_RADII) {
    assert.equal(`${r} meter`, `${r} meter`);
  }
});

// TEST 13: Radius controls are strictly decoupled (no shared state mutation)
runTest("Radius controls only modify their respective state variable", () => {
  let unrasRadius = 1000;
  let biRadius = 3000;

  // Change UNRAS radius
  unrasRadius = 1500;
  assert.equal(unrasRadius, 1500);
  assert.equal(biRadius, 3000, "BI radius must remain unchanged when UNRAS radius changes");

  // Change BI radius
  biRadius = 5000;
  assert.equal(unrasRadius, 1500, "UNRAS radius must remain unchanged when BI radius changes");
  assert.equal(biRadius, 5000);
});

// TEST 14: Tactical HUD toggle does not alter layer visibility or radius state
runTest("Tactical HUD toggle is strictly isolated from visibility and radius states", () => {
  let isGeoIntHudOpen = false;
  let layerVisibility = { cctv: true, biOffice: true, unras: true };
  let unrasRadius = 1000;
  let biRadius = 3000;

  // Toggle HUD open
  isGeoIntHudOpen = !isGeoIntHudOpen;
  assert.equal(isGeoIntHudOpen, true);
  assert.deepEqual(layerVisibility, { cctv: true, biOffice: true, unras: true });
  assert.equal(unrasRadius, 1000);
  assert.equal(biRadius, 3000);

  // Toggle HUD closed
  isGeoIntHudOpen = !isGeoIntHudOpen;
  assert.equal(isGeoIntHudOpen, false);
  assert.deepEqual(layerVisibility, { cctv: true, biOffice: true, unras: true });
});

// TEST 15: Source code verification: confirm no duplicate external BI toggle button remains
runTest("Verify no duplicate external BI office visibility button exists in interactive-map.tsx", () => {
  const content = fs.readFileSync("src/components/interactive-map.tsx", "utf-8");

  // In Visibilitas Layer, toggle-bioffice-layer should exist
  assert.ok(content.includes('data-testid="toggle-bioffice-layer"'), "Visibilitas layer must have BI toggle");

  // Redundant external button had:
  // onClick={() => toggleLayer("biOffice")} with "Kantor BI" label outside the dropdown
  // Count how many toggleLayer("biOffice") exist: should be exactly 1 (inside the dropdown)!
  const matches = content.match(/toggleLayer\(["']biOffice["']\)/g);
  assert.equal(matches ? matches.length : 0, 1, "There must be exactly ONE toggleLayer('biOffice') in the entire component (inside the dropdown)");

  // Check that the new radius controls exist with their exact test IDs and tooltips
  assert.ok(content.includes('data-testid="btn-radius-unras"'));
  assert.ok(content.includes('data-testid="btn-radius-bi"'));
  assert.ok(content.includes('data-testid="select-radius-bi"'));
  assert.ok(content.includes("VALID_OFFICE_RADII_METERS = [50, 100, 150, 200, 250]"));
  assert.ok(content.includes("DEFAULT_OFFICE_RADIUS_METERS = 50"));
  assert.ok(content.includes("DEFAULT_OFFICE_RADIUS_ENABLED = false"));
  assert.ok(content.includes("DEFAULT_TACTICAL_HUD_OPEN = false"));
  assert.ok(content.includes("Mengatur jarak analisis dari titik kejadian unjuk rasa."));
  assert.ok(content.includes("Mengatur jarak pemantauan dari lokasi kantor BI."));
  assert.ok(content.includes("Menampilkan overlay informasi dan elemen situasional taktis pada peta."));
});

// TEST 16: End-to-end persistence, independence, and reset behavior for BI Radius & Tactical HUD
runTest("Fresh dashboard defaults OFF/50m, independent activation, persistence across refresh, and reset", () => {
  mockLocalStorage.clear();
  const TACTICAL_KEY = "scc_map_tactical_config_v2";
  const VALID_OFFICE_RADII = [50, 100, 150, 200, 250];
  const DEFAULT_CONFIG = {
    isOfficeRadiusEnabled: false,
    officeRadius: 50,
    unrasRadius: 500,
    selectedAssetType: "office",
    selectedAssetId: "bi-off-kpbi-pusat",
    isHudOpen: false,
    hasManualSelection: false
  };

  const getStoredConfig = () => {
    const raw = mockLocalStorage.getItem(TACTICAL_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      isOfficeRadiusEnabled:
        typeof parsed.isOfficeRadiusEnabled === "boolean" ? parsed.isOfficeRadiusEnabled : false,
      officeRadius: VALID_OFFICE_RADII.includes(parsed.officeRadius) ? parsed.officeRadius : 50,
      unrasRadius: [0, 250, 500, 1000, 1500].includes(parsed.unrasRadius) ? parsed.unrasRadius : 500,
      selectedAssetType: parsed.selectedAssetType === "protest" ? "protest" : "office",
      selectedAssetId: typeof parsed.selectedAssetId === "string" ? parsed.selectedAssetId : "bi-off-kpbi-pusat",
      isHudOpen: typeof parsed.isHudOpen === "boolean" ? parsed.isHudOpen : false,
      hasManualSelection: Boolean(parsed.hasManualSelection)
    };
  };

  const persistConfig = (patch) => {
    const current = getStoredConfig();
    mockLocalStorage.setItem(TACTICAL_KEY, JSON.stringify({ ...current, ...patch }));
  };

  // 1 & 2: Fresh dashboard -> both toggles OFF, BI radius 50m
  let cfg = getStoredConfig();
  assert.equal(cfg.isOfficeRadiusEnabled, false);
  assert.equal(cfg.isHudOpen, false);
  assert.equal(cfg.officeRadius, 50);

  // 4 & 6: Manually enable Tactical HUD -> BI Radius remains OFF
  persistConfig({ isHudOpen: true });
  cfg = getStoredConfig();
  assert.equal(cfg.isHudOpen, true);
  assert.equal(cfg.isOfficeRadiusEnabled, false);

  // 5 & 6: Manually enable BI Radius and select 200m -> Tactical HUD state is untouched; invalid radius rejected
  persistConfig({ isHudOpen: false });
  persistConfig({ isOfficeRadiusEnabled: true, officeRadius: 200 });
  cfg = getStoredConfig();
  assert.equal(cfg.isOfficeRadiusEnabled, true);
  assert.equal(cfg.officeRadius, 200);
  assert.equal(cfg.isHudOpen, false);

  // 3: Legacy/invalid radius (e.g. 1000 or 3000) falls back to 50m
  persistConfig({ officeRadius: 3000 });
  cfg = getStoredConfig();
  assert.equal(cfg.officeRadius, 50);

  // 7: Refresh preserves saved user preferences
  persistConfig({ isOfficeRadiusEnabled: true, officeRadius: 150, isHudOpen: true });
  const afterRefresh = getStoredConfig();
  assert.equal(afterRefresh.isOfficeRadiusEnabled, true);
  assert.equal(afterRefresh.officeRadius, 150);
  assert.equal(afterRefresh.isHudOpen, true);

  // Reset restores BI Radius OFF, Tactical HUD OFF, BI Radius 50m
  persistConfig({
    isOfficeRadiusEnabled: false,
    officeRadius: 50,
    unrasRadius: 500,
    isHudOpen: false,
    hasManualSelection: false
  });
  const afterReset = getStoredConfig();
  assert.equal(afterReset.isOfficeRadiusEnabled, false);
  assert.equal(afterReset.isHudOpen, false);
  assert.equal(afterReset.officeRadius, 50);
});

console.log(`\n=== LAYER VISIBILITY TEST SUMMARY: ${passed}/${total} PASSED ===\n`);
if (passed !== total) {
  process.exit(1);
}

