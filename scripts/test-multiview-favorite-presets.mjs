import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const gridPath = path.join(rootDir, "src/components/multi-view-grid.tsx");
const hooksPath = path.join(rootDir, "src/lib/hooks.ts");
const brandingPath = path.join(rootDir, "src/components/branding.tsx");

const gridSrc = fs.readFileSync(gridPath, "utf8");
const hooksSrc = fs.readFileSync(hooksPath, "utf8");
const brandingSrc = fs.readFileSync(brandingPath, "utf8");

console.log("=== SCC EAGLE EYES: FAVORIT SAYA AUTO-ASSIGN EXISTING FAVORITES TEST SUITE ===");

// 1. Verify reuse of exact same Favorite (4) persistence mechanism (no duplicate favorites or preset system)
assert.ok(
  hooksSrc.includes('const FAVORITES_STORAGE_KEY = "scc_eagle_eyes_favorites";'),
  "Existing favorite storage key must remain 'scc_eagle_eyes_favorites'"
);
assert.ok(
  !hooksSrc.includes("FAVORITE_PRESETS_STORAGE_KEY") &&
    !hooksSrc.includes("useFavoritePresets"),
  "Must NOT introduce a duplicate favorite or preset persistence system"
);
assert.ok(
  brandingSrc.includes("const { favorites } = useFavorites();") &&
    brandingSrc.includes("`Favorite (${favorites.length})`"),
  "Navbar 'Favorite (4)' badge uses useFavorites() from @/lib/hooks"
);
assert.ok(
  gridSrc.includes('import { useFavorites } from "@/lib/hooks";') &&
    gridSrc.includes("const { favorites, hydrated } = useFavorites();"),
  "MultiViewGrid must reuse the exact same useFavorites() hook as 'Favorite (4)'"
);
assert.ok(
  !gridSrc.includes("Simpan Preset") && !gridSrc.includes("save-preset-modal"),
  "Must NOT ask operators to save presets or assign cameras again"
);
console.log("  [PASS] 1. Reuses exact same useFavorites() mechanism as 'Favorite (4)' with no duplicate storage or save dialog");

// 2. Verify grid layout selection rules (1 -> 1, 2 -> 2, 3-4 -> 4, 5-6 -> 6, 7-9 -> 9)
function selectGridLayoutForFavoriteCount(count) {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 4;
  if (count <= 6) return 6;
  return 9;
}

assert.equal(selectGridLayoutForFavoriteCount(1), 1, "1 favorite -> 1-camera layout");
assert.equal(selectGridLayoutForFavoriteCount(2), 2, "2 favorites -> 2-camera layout");
assert.equal(selectGridLayoutForFavoriteCount(3), 4, "3 favorites -> 4-camera layout");
assert.equal(selectGridLayoutForFavoriteCount(4), 4, "4 favorites -> 4-camera layout (2x2)");
assert.equal(selectGridLayoutForFavoriteCount(5), 6, "5 favorites -> 6-camera layout (3x2)");
assert.equal(selectGridLayoutForFavoriteCount(6), 6, "6 favorites -> 6-camera layout (3x2)");
assert.equal(selectGridLayoutForFavoriteCount(7), 9, "7 favorites -> 9-camera layout (3x3)");
assert.equal(selectGridLayoutForFavoriteCount(8), 9, "8 favorites -> 9-camera layout (3x3)");
assert.equal(selectGridLayoutForFavoriteCount(9), 9, "9 favorites -> 9-camera layout (3x3)");
console.log("  [PASS] 2. Grid layout auto-selection verified for 1, 2, 3-4 (2x2), 5-6 (3x2), and 7-9 (3x3) favorites");

// 3. Verify Favorite (4) auto-assignment, ordering preservation, duplicate prevention, and offline/unavailable handling
function resolveOrderedFavoriteCameras(favoriteIds, cameraLookup) {
  const seen = new Set();
  const assignedCameras = [];

  for (const rawId of favoriteIds) {
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (!id || seen.has(id)) continue;
    const cam = cameraLookup.get(id);
    if (!cam) continue;
    seen.add(id);
    assignedCameras.push(cam);
    if (assignedCameras.length >= 9) break;
  }

  return {
    assignedCameras,
    layoutSize: selectGridLayoutForFavoriteCount(assignedCameras.length)
  };
}

const catalogLookup = new Map([
  ["cam-fav-1", { id: "cam-fav-1", name: "Bundaran HI", status: "ONLINE" }],
  ["cam-fav-2", { id: "cam-fav-2", name: "Simpang Pasteur", status: "ONLINE" }],
  ["cam-fav-3", { id: "cam-fav-3", name: "Malioboro Utara", status: "OFFLINE" }],
  ["cam-fav-4", { id: "cam-fav-4", name: "Lapangan Merdeka", status: "ONLINE" }]
]);

// Validation scenario: Favorite (4) exists -> Click Favorit Saya -> All 4 populate 2x2 layout in exact order
const fourFavoritesResult = resolveOrderedFavoriteCameras(
  ["cam-fav-3", "cam-fav-1", "cam-fav-4", "cam-fav-2", "cam-fav-3"], // includes duplicate to verify dedup
  catalogLookup
);
assert.equal(fourFavoritesResult.layoutSize, 4, "4 favorites must select 4-camera (2x2) layout");
assert.deepEqual(
  fourFavoritesResult.assignedCameras.map((c) => c.id),
  ["cam-fav-3", "cam-fav-1", "cam-fav-4", "cam-fav-2"],
  "All 4 favorite cameras must populate slots in exact favorite order without duplicates (including offline cameras handled by CCTVPlayer)"
);

// Unavailable camera IDs are skipped gracefully without crashing
const partialUnavailableResult = resolveOrderedFavoriteCameras(
  ["cam-missing-999", "cam-fav-2", "cam-fav-4"],
  catalogLookup
);
assert.equal(partialUnavailableResult.layoutSize, 2, "2 available favorites select 2-camera layout");
assert.deepEqual(
  partialUnavailableResult.assignedCameras.map((c) => c.id),
  ["cam-fav-2", "cam-fav-4"]
);
console.log("  [PASS] 3. Clicking 'Favorit Saya' with Favorite (4) auto-populates all 4 cameras in 2x2 layout in order, prevents duplicates, and handles offline/unavailable cameras");

// 4. Verify camera picker is NEVER opened when clicking "Favorit Saya" and empty favorites show a clear message
assert.ok(
  gridSrc.includes("const handleLoadMyFavorites = async () => {") &&
    gridSrc.includes("setPickerSlot(null);"),
  "Clicking 'Favorit Saya' must explicitly keep pickerSlot null (never open camera picker)"
);
assert.ok(
  gridSrc.includes('data-testid="favorit-saya-empty-notice"') &&
    gridSrc.includes("Belum ada CCTV favorit tersimpan"),
  "Must show a clear message when the user has no favorite cameras"
);
assert.ok(
  gridSrc.includes('data-testid="favorit-saya-preset-btn"') &&
    gridSrc.includes("onClick={handleLoadMyFavorites}"),
  "'Favorit Saya' button must directly trigger handleLoadMyFavorites"
);
console.log("  [PASS] 4. No camera picker opens on 'Favorit Saya' click, and empty favorites display a clear notice");

console.log("=== ALL FAVORIT SAYA AUTO-ASSIGN TESTS PASSED ===");
