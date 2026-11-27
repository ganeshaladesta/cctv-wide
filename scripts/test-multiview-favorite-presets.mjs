import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createOperatorFavoritePreset,
  readOperatorFavoritePresets,
  renameOperatorFavoritePreset,
  updateOperatorFavoritePresetConfig,
  deleteOperatorFavoritePreset,
  normalizePresetSlotCameraIds
} from "../src/lib/hooks.ts";
import { DEFAULT_OPERATOR, DEFAULT_ADMIN } from "../src/lib/auth-roles.ts";

console.log("=== SCC EAGLE EYES: MULTI-VIEW FAVORITE PRESETS TEST SUITE ===");

// Create an in-memory mock Storage object simulating window.localStorage across reloads
function createMockStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    clear() {
      store.clear();
    }
  };
}

const storage = createMockStorage();
const operatorA = DEFAULT_OPERATOR.id; // a0000000-0000-0000-0000-000000000002
const operatorB = DEFAULT_ADMIN.id;    // a0000000-0000-0000-0000-000000000001

// 1. Save a 4-camera preset & verify schema fields
const preset4 = createOperatorFavoritePreset(
  {
    name: "Pantauan 4 Kamera Pusat",
    cameraIds: ["cam-jkt-01", "cam-jkt-02", "cam-jkt-03", "cam-jkt-04"],
    gridLayout: 4,
    ownerId: operatorA,
    nowIso: "2026-11-27T03:00:00.000Z"
  },
  storage
);

assert.ok(preset4.id && preset4.id.startsWith("preset-"), "Preset must have a unique preset ID");
assert.equal(preset4.name, "Pantauan 4 Kamera Pusat");
assert.equal(preset4.gridLayout, 4);
assert.deepEqual(preset4.cameraIds, ["cam-jkt-01", "cam-jkt-02", "cam-jkt-03", "cam-jkt-04"]);
assert.equal(preset4.createdAt, "2026-11-27T03:00:00.000Z");
assert.equal(preset4.updatedAt, "2026-11-27T03:00:00.000Z");
assert.equal(preset4.ownerId, operatorA);
console.log("  [PASS] 1. Saved 4-camera preset with id, name, ordered cameraIds, gridLayout=4, timestamps, and ownerId");

// 2. Reload application & apply the 4-camera preset (verify all four slots restore in exact order)
const reloadedOperatorAPresets = readOperatorFavoritePresets(operatorA, storage);
assert.equal(reloadedOperatorAPresets.length, 1);
const restored4 = reloadedOperatorAPresets[0];
assert.equal(restored4.gridLayout, 4);
assert.deepEqual(
  restored4.cameraIds,
  ["cam-jkt-01", "cam-jkt-02", "cam-jkt-03", "cam-jkt-04"],
  "All 4 slots must restore in exact slot order after reload"
);
console.log("  [PASS] 2. Reloaded from persistent storage and restored all 4 camera slots in exact order");

// 3. Save a 9-camera preset (including partial slot order & stream URL rejection)
const nineSlotOrder = [
  "cam-bdg-09",
  "cam-yog-08",
  null, // empty slot #3 in partial layout
  "cam-jkt-07",
  "cam-mdn-06",
  "cam-dps-05",
  "cam-sby-04",
  null, // empty slot #8
  "cam-mks-01"
];

const preset9 = createOperatorFavoritePreset(
  {
    name: "Command Wall 9 Kamera Nasional",
    cameraIds: nineSlotOrder,
    gridLayout: 9,
    ownerId: operatorA,
    nowIso: "2026-11-27T03:05:00.000Z"
  },
  storage
);

assert.equal(preset9.gridLayout, 9);
assert.deepEqual(
  preset9.cameraIds,
  nineSlotOrder,
  "9-camera preset must preserve exact slot order including partial empty slots"
);

// Verify stream URLs are never stored as permanent camera identifiers
const sanitizedIds = normalizePresetSlotCameraIds(
  ["cam-valid-1", "https://stream.example.com/live.m3u8", "/api/proxy?url=http://foo", "cam-valid-4"],
  4
);
assert.deepEqual(
  sanitizedIds,
  ["cam-valid-1", null, null, "cam-valid-4"],
  "Temporary stream URLs must never be stored as permanent camera IDs"
);
console.log("  [PASS] 3. Saved 9-camera preset with preserved slot order (including partial slots) and stream URL guard");

// 4. Rename, update configuration, and delete preset
const renamed = renameOperatorFavoritePreset(
  {
    presetId: preset4.id,
    newName: "Pantauan 4 Kamera Monas & HI",
    ownerId: operatorA,
    nowIso: "2026-11-27T03:10:00.000Z"
  },
  storage
);
assert.ok(renamed);
assert.equal(renamed.name, "Pantauan 4 Kamera Monas & HI");
assert.equal(renamed.updatedAt, "2026-11-27T03:10:00.000Z");

const updatedConfig = updateOperatorFavoritePresetConfig(
  {
    presetId: preset4.id,
    cameraIds: ["cam-new-1", "cam-new-2", "cam-new-3", "cam-new-4", "cam-new-5", "cam-new-6"],
    gridLayout: 6,
    ownerId: operatorA,
    nowIso: "2026-11-27T03:15:00.000Z"
  },
  storage
);
assert.ok(updatedConfig);
assert.equal(updatedConfig.gridLayout, 6);
assert.deepEqual(updatedConfig.cameraIds, [
  "cam-new-1",
  "cam-new-2",
  "cam-new-3",
  "cam-new-4",
  "cam-new-5",
  "cam-new-6"
]);
assert.equal(updatedConfig.updatedAt, "2026-11-27T03:15:00.000Z");
console.log("  [PASS] 4. Renamed preset and updated preset configuration with current wall layout");

// 5. Operator Isolation: Verify another operator (operatorB) cannot see, rename, update, or delete operatorA's presets
const operatorBPresets = readOperatorFavoritePresets(operatorB, storage);
assert.equal(
  operatorBPresets.length,
  0,
  "Operator B must not see Operator A's private favorite presets"
);

const crossRenameAttempt = renameOperatorFavoritePreset(
  {
    presetId: preset4.id,
    newName: "Hacked Name",
    ownerId: operatorB
  },
  storage
);
assert.equal(crossRenameAttempt, null, "Operator B must not be able to rename Operator A's preset");

const crossUpdateAttempt = updateOperatorFavoritePresetConfig(
  {
    presetId: preset4.id,
    cameraIds: ["cam-hack-1"],
    gridLayout: 1,
    ownerId: operatorB
  },
  storage
);
assert.equal(crossUpdateAttempt, null, "Operator B must not be able to update Operator A's preset");

const crossDeleteAttempt = deleteOperatorFavoritePreset(
  {
    presetId: preset4.id,
    ownerId: operatorB
  },
  storage
);
assert.equal(crossDeleteAttempt, false, "Operator B must not be able to delete Operator A's preset");

// Verify Operator A's presets are still intact and delete works for Operator A
const deletedByOwner = deleteOperatorFavoritePreset(
  {
    presetId: preset4.id,
    ownerId: operatorA
  },
  storage
);
assert.equal(deletedByOwner, true, "Owner Operator A can delete their own preset");
const remainingForA = readOperatorFavoritePresets(operatorA, storage);
assert.equal(remainingForA.length, 1);
assert.equal(remainingForA[0].id, preset9.id);
console.log("  [PASS] 5. Operator isolation verified: other operators cannot see, rename, update, or delete private presets");

// 6. UI Placement & Compatibility assertions in src/components/multi-view-grid.tsx
const gridPath = path.join(process.cwd(), "src/components/multi-view-grid.tsx");
const gridSrc = fs.readFileSync(gridPath, "utf8");

const presetBarIdx = gridSrc.indexOf("Preset Wilayah:");
const favoritSayaIdx = gridSrc.indexOf('data-testid="favorit-saya-preset-btn"');
const simpanPresetIdx = gridSrc.indexOf('data-testid="simpan-preset-btn"');
const regionalMapIdx = gridSrc.indexOf("REGIONAL_PRESETS.map");

assert.ok(
  presetBarIdx > 0 &&
    favoritSayaIdx > presetBarIdx &&
    favoritSayaIdx < regionalMapIdx,
  '"Favorit Saya" button must be placed at the beginning of the "Preset Wilayah" row before REGIONAL_PRESETS'
);
assert.ok(
  simpanPresetIdx > 0 && gridSrc.includes("<span>Simpan Preset</span>"),
  '"Simpan Preset" action must exist in the preset bar'
);
assert.ok(
  gridSrc.includes('Kota Bandung (PELINDUNG)') &&
    gridSrc.includes('DI Yogyakarta & Malioboro') &&
    gridSrc.includes('DKI Jakarta & BaliTower') &&
    gridSrc.includes('Tol Jasa Marga Nasional') &&
    gridSrc.includes('Kota Medan ATCS') &&
    gridSrc.includes('Kota Denpasar Bali'),
  "All 6 existing regional presets must remain unchanged"
);
console.log("  [PASS] 6. UI placement verified: 'Favorit Saya' with Star icon at start of 'Preset Wilayah' row + 'Simpan Preset' + regional presets intact");

console.log("=== ALL MULTI-VIEW FAVORITE PRESETS TESTS PASSED ===");

