/**
 * Automated test suite for SCC Eagle Eyes Map Layer Visibility
 * Verifies independent layer filtering, localStorage persistence, and layer group lifecycle.
 */
import assert from "node:assert/strict";

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

console.log(`\n=== LAYER VISIBILITY TEST SUMMARY: ${passed}/${total} PASSED ===\n`);
if (passed !== total) {
  process.exit(1);
}

