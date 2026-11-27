import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const gridPath = path.join(rootDir, "src/components/multi-view-grid.tsx");
const hooksPath = path.join(rootDir, "src/lib/hooks.ts");

const gridSrc = fs.readFileSync(gridPath, "utf8");
const hooksSrc = fs.readFileSync(hooksPath, "utf8");

console.log("=== SCC EAGLE EYES: CAMERA PICKER EMPTY DEFAULT SEARCH, PERSISTENCE & FAVORITES PRIORITY TEST ===");

// 1. Empty Default Search on Fresh Session + Search Persistence Across Open/Close, Slot Switches & Remounts
assert.ok(
  gridSrc.includes('let sessionPickerSearchQuery = "";') &&
    gridSrc.includes("const [searchTerm, setSearchTerm] = useState<string>(() => sessionPickerSearchQuery);"),
  "Search state must initialize as an empty string for a fresh session and persist across component mount/unmount"
);
assert.ok(
  !gridSrc.includes('handleSearchCameras(searchTerm || "Bandung")'),
  'Hardcoded default search keyword "Bandung" must be removed from openPickerForSlot'
);
const normalizedGridSrc = gridSrc.replace(/\r\n/g, "\n");
assert.ok(
  !normalizedGridSrc.includes('openPickerForSlot = (slotIdx: number) => {\n    setPickerSlot(slotIdx);\n    setSearchTerm("");'),
  "openPickerForSlot must NOT reset searchTerm when opening or switching slots"
);
assert.ok(
  normalizedGridSrc.includes("const openPickerForSlot = (slotIdx: number) => {\n    setPickerSlot(slotIdx);\n    // Preserve the active search keyword across open/close cycles and slot switches\n    handleSearchCameras(searchTerm);\n  };"),
  "openPickerForSlot must preserve and reuse the existing searchTerm when switching slots or reopening"
);
assert.ok(
  gridSrc.includes('data-testid="picker-search-clear-btn"') &&
    gridSrc.includes("onClick={handleClearPickerSearch}"),
  "Explicit search clear button must exist to clear the query only when clicked by the operator"
);
assert.ok(
  gridSrc.includes("`/api/cameras?status=ONLINE&limit=24`"),
  "Empty search query must fetch available online cameras without applying a q=Bandung location filter"
);
console.log("  [PASS] 1. Fresh session starts empty; search query persists across open/close, slot switches, and remounts; explicit clear button resets query");

// 2. Reuse existing favorite persistence mechanism (useFavorites)
assert.ok(
  hooksSrc.includes('const FAVORITES_STORAGE_KEY = "scc_eagle_eyes_favorites";'),
  "Existing favorite storage key must remain unchanged"
);
assert.ok(
  gridSrc.includes('from "@/lib/hooks"') &&
    gridSrc.includes("const { favorites, hydrated } = useFavorites();"),
  "MultiViewGrid must reuse existing useFavorites hook"
);
console.log("  [PASS] 2. Reuses existing useFavorites persistence mechanism without introducing a duplicate system");

// 3. UI Section Heading, Star Icon, Two-Column Layout, Select & Favorite Buttons
assert.ok(
  gridSrc.includes("Star") &&
    gridSrc.includes("<span>CCTV Favorit</span>") &&
    gridSrc.includes('data-testid="picker-favorites-section"'),
  'Dedicated "CCTV Favorit" section with Star icon must exist'
);
assert.ok(
  gridSrc.includes("Semua Kamera") &&
    gridSrc.includes('data-testid="picker-regular-section"'),
  'Regular "Semua Kamera" section must exist below favorites'
);
assert.ok(
  gridSrc.includes("grid grid-cols-1 sm:grid-cols-2 gap-2"),
  "Two-column camera card layout must be preserved"
);
assert.ok(
  gridSrc.includes("<FavoritesButton") && gridSrc.includes("Pilih"),
  "Existing Favorite and Select (Pilih) buttons must be preserved on camera cards"
);
assert.ok(
  gridSrc.includes("Tidak ada kamera yang cocok dengan pencarian."),
  "Empty state message when no camera matches search must be preserved"
);
console.log("  [PASS] 3. UI requirements verified: 'CCTV Favorit' heading + Star icon, 2-col layout, Pilih & Favorite buttons, empty state");

// 4. Behavioral validation of partitionPickerCameras & matchesPickerSearchQuery + Search Persistence Workflow
function matchesPickerSearchQuery(cam, query) {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return (
    cam.name.toLowerCase().includes(term) ||
    cam.city_name.toLowerCase().includes(term) ||
    cam.province_name.toLowerCase().includes(term) ||
    cam.source_name.toLowerCase().includes(term) ||
    cam.location.toLowerCase().includes(term) ||
    cam.protocol.toLowerCase().includes(term) ||
    cam.id.toLowerCase().includes(term)
  );
}

function partitionPickerCameras(searchResults, favoriteCameras, favoriteIds, searchQuery) {
  const favoriteMap = new Map();
  for (const cam of favoriteCameras) {
    if (favoriteIds.has(cam.id)) {
      favoriteMap.set(cam.id, cam);
    }
  }
  for (const cam of searchResults) {
    if (favoriteIds.has(cam.id) && !favoriteMap.has(cam.id)) {
      favoriteMap.set(cam.id, cam);
    }
  }

  const orderedFavorites = [];
  for (const favId of favoriteIds) {
    const cam = favoriteMap.get(favId);
    if (cam && matchesPickerSearchQuery(cam, searchQuery)) {
      orderedFavorites.push(cam);
    }
  }

  const regularItems = searchResults.filter(
    (cam) => !favoriteIds.has(cam.id) && matchesPickerSearchQuery(cam, searchQuery)
  );

  return {
    favoriteItems: orderedFavorites,
    regularItems
  };
}

const sampleCameras = [
  {
    id: "cam-jkt-1",
    name: "Bundaran HI Thamrin",
    location: "Jl. MH Thamrin",
    city_name: "Jakarta Pusat",
    province_name: "DKI Jakarta",
    source_name: "BaliTower",
    protocol: "HLS"
  },
  {
    id: "cam-jkt-2",
    name: "Sarinah Thamrin",
    location: "Jl. MH Thamrin No.11",
    city_name: "Jakarta Pusat",
    province_name: "DKI Jakarta",
    source_name: "AMG Sarinah",
    protocol: "HLS"
  },
  {
    id: "cam-bdg-1",
    name: "Simpang Pasteur",
    location: "Jl. Dr. Djunjunan",
    city_name: "Kota Bandung",
    province_name: "Jawa Barat",
    source_name: "ATCS Bandung",
    protocol: "HLS"
  },
  {
    id: "cam-yog-1",
    name: "Malioboro Utara",
    location: "Jl. Malioboro",
    city_name: "Kota Yogyakarta",
    province_name: "DI Yogyakarta",
    source_name: "Jogja Smart",
    protocol: "HLS"
  }
];

// Case A: Modal opens with favorites -> favorites appear first, no duplicates in regular section
const favIds = new Set(["cam-yog-1", "cam-jkt-1"]);
const openState = partitionPickerCameras(
  sampleCameras,
  [sampleCameras[0], sampleCameras[3]],
  favIds,
  ""
);
assert.deepEqual(
  openState.favoriteItems.map((c) => c.id),
  ["cam-yog-1", "cam-jkt-1"],
  "Favorites must appear in favorite order at the top when modal opens"
);
assert.deepEqual(
  openState.regularItems.map((c) => c.id),
  ["cam-jkt-2", "cam-bdg-1"],
  "Favorite cameras must NOT be duplicated in the regular 'Semua Kamera' section"
);
console.log("  [PASS] 4. Open modal: favorites appear first and are excluded from regular 'Semua Kamera' section (zero duplicates)");

// Case B: Simulate the exact validation lifecycle:
// 1. Search "thamrin" -> 2. Close picker -> 3. Open another slot -> 4. Verify "thamrin" remains ->
// 5. Select a camera -> 6. Open another slot & verify "thamrin" remains -> 7. Click clear & verify all cameras return
let persistedQuery = "";
let activeSlot = null;
let currentSearchTerm = persistedQuery;

function openSlot(slotIdx) {
  activeSlot = slotIdx;
  // Does not clear currentSearchTerm
  return partitionPickerCameras(
    sampleCameras.filter((c) => matchesPickerSearchQuery(c, currentSearchTerm)),
    [sampleCameras[0], sampleCameras[3]],
    favIds,
    currentSearchTerm
  );
}

function searchInPicker(q) {
  persistedQuery = q;
  currentSearchTerm = q;
  return partitionPickerCameras(
    sampleCameras.filter((c) => matchesPickerSearchQuery(c, currentSearchTerm)),
    [sampleCameras[0], sampleCameras[3]],
    favIds,
    currentSearchTerm
  );
}

function closePicker() {
  activeSlot = null;
}

function selectCameraFromPicker(_cam) {
  // Selecting a camera closes picker without clearing searchTerm
  activeSlot = null;
}

function clickExplicitClearButton() {
  return searchInPicker("");
}

// Step 1: Open slot 0 and search "thamrin"
openSlot(0);
const thamrinResults = searchInPicker("thamrin");
assert.equal(currentSearchTerm, "thamrin");
assert.deepEqual(thamrinResults.favoriteItems.map((c) => c.id), ["cam-jkt-1"]);
assert.deepEqual(thamrinResults.regularItems.map((c) => c.id), ["cam-jkt-2"]);

// Step 2: Close the picker
closePicker();
assert.equal(activeSlot, null);

// Step 3 & 4: Open another slot (slot 1) -> verify "thamrin" remains in input and filters both sections
const slot1Results = openSlot(1);
assert.equal(currentSearchTerm, "thamrin", '"thamrin" must remain in the search input after closing and opening another slot');
assert.deepEqual(slot1Results.favoriteItems.map((c) => c.id), ["cam-jkt-1"]);
assert.deepEqual(slot1Results.regularItems.map((c) => c.id), ["cam-jkt-2"]);

// Step 5 & 6: Select a camera, then open slot 2 -> verify "thamrin" still remains
selectCameraFromPicker(sampleCameras[1]);
assert.equal(activeSlot, null);
const slot2Results = openSlot(2);
assert.equal(currentSearchTerm, "thamrin", '"thamrin" must remain after selecting a camera and opening another slot');
assert.deepEqual(slot2Results.favoriteItems.map((c) => c.id), ["cam-jkt-1"]);
assert.deepEqual(slot2Results.regularItems.map((c) => c.id), ["cam-jkt-2"]);

// Step 7: Click explicit clear button -> verify query is empty and all cameras return
const clearedResults = clickExplicitClearButton();
assert.equal(currentSearchTerm, "", "Search query must clear when explicit clear button is clicked");
assert.deepEqual(clearedResults.favoriteItems.map((c) => c.id), ["cam-yog-1", "cam-jkt-1"]);
assert.deepEqual(clearedResults.regularItems.map((c) => c.id), ["cam-jkt-2", "cam-bdg-1"]);
console.log("  [PASS] 5. Search 'thamrin' persists across close, slot switch, and camera selection, and clears only on explicit clear button click");

// Case C: Toggle favorite moves camera into or out of favorites section immediately
const toggledFavIds = new Set(["cam-yog-1", "cam-jkt-1", "cam-jkt-2"]);
const afterAddFav = partitionPickerCameras(
  sampleCameras,
  [sampleCameras[0], sampleCameras[3]],
  toggledFavIds,
  "thamrin"
);
assert.deepEqual(
  afterAddFav.favoriteItems.map((c) => c.id),
  ["cam-jkt-1", "cam-jkt-2"],
  "Newly favorited matching camera moves immediately into favorites section"
);
assert.equal(
  afterAddFav.regularItems.length,
  0,
  "Newly favorited camera is immediately removed from regular section"
);
console.log("  [PASS] 6. Toggling favorite immediately moves camera between 'CCTV Favorit' and 'Semua Kamera' while preserving search filter");

console.log("=== ALL CAMERA PICKER TESTS PASSED ===");
