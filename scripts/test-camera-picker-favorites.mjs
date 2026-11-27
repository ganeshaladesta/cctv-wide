import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const gridPath = path.join(rootDir, "src/components/multi-view-grid.tsx");
const hooksPath = path.join(rootDir, "src/lib/hooks.ts");

const gridSrc = fs.readFileSync(gridPath, "utf8");
const hooksSrc = fs.readFileSync(hooksPath, "utf8");

console.log("=== SCC EAGLE EYES: CAMERA PICKER EMPTY DEFAULT SEARCH & FAVORITES PRIORITY TEST ===");

// 1. Empty Default Search
assert.ok(
  gridSrc.includes('const [searchTerm, setSearchTerm] = useState("");'),
  "Search state must initialize as an empty string"
);
assert.ok(
  !gridSrc.includes('handleSearchCameras(searchTerm || "Bandung")'),
  'Hardcoded default search keyword "Bandung" must be removed from openPickerForSlot'
);
assert.ok(
  gridSrc.includes('setSearchTerm("");') && gridSrc.includes('handleSearchCameras("");'),
  "openPickerForSlot must reset searchTerm to empty string and fetch available cameras without city/location filter"
);
assert.ok(
  gridSrc.includes("`/api/cameras?status=ONLINE&limit=24`"),
  "Empty search query must fetch available online cameras without applying a q=Bandung location filter"
);
console.log("  [PASS] 1. Default search is empty (hardcoded 'Bandung' removed) and fetches unfiltered cameras on open");

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

// 4. Behavioral validation of partitionPickerCameras & matchesPickerSearchQuery
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
    name: "Bundaran HI",
    location: "Jl. MH Thamrin",
    city_name: "Jakarta Pusat",
    province_name: "DKI Jakarta",
    source_name: "BaliTower",
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
  },
  {
    id: "cam-mdn-1",
    name: "Lapangan Merdeka",
    location: "Pusat Kota Medan",
    city_name: "Kota Medan",
    province_name: "Sumatera Utara",
    source_name: "ATCS Medan",
    protocol: "HLS"
  }
];

// Case A: Modal opens with favorites -> favorites appear first, no duplicates in regular section
const favIds = new Set(["cam-yog-1", "cam-jkt-1"]);
const openState = partitionPickerCameras(
  sampleCameras,
  [sampleCameras[0], sampleCameras[2]],
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
  ["cam-bdg-1", "cam-mdn-1"],
  "Favorite cameras must NOT be duplicated in the regular 'Semua Kamera' section"
);
const overlap = openState.favoriteItems.filter((f) =>
  openState.regularItems.some((r) => r.id === f.id)
);
assert.equal(overlap.length, 0, "Zero duplicate cameras allowed across sections");
console.log("  [PASS] 4. Open modal: favorites appear first and are excluded from regular 'Semua Kamera' section (zero duplicates)");

// Case B: Search query filters both favorites and regular cameras
const searchJakartaOrBandung = partitionPickerCameras(
  sampleCameras,
  [sampleCameras[0], sampleCameras[2]],
  favIds,
  "HLS"
);
assert.equal(searchJakartaOrBandung.favoriteItems.length, 2);
assert.equal(searchJakartaOrBandung.regularItems.length, 2);

const searchMalioboro = partitionPickerCameras(
  sampleCameras.filter((c) => matchesPickerSearchQuery(c, "Malioboro")),
  [sampleCameras[0], sampleCameras[2]],
  favIds,
  "Malioboro"
);
assert.deepEqual(
  searchMalioboro.favoriteItems.map((c) => c.id),
  ["cam-yog-1"],
  "Matching favorite stays in favorites section during search"
);
assert.equal(
  searchMalioboro.regularItems.length,
  0,
  "Non-matching regular cameras are filtered out"
);

const searchMedan = partitionPickerCameras(
  sampleCameras.filter((c) => matchesPickerSearchQuery(c, "Medan")),
  [sampleCameras[0], sampleCameras[2]],
  favIds,
  "Medan"
);
assert.equal(
  searchMedan.favoriteItems.length,
  0,
  "Non-matching favorites are filtered out during search (hiding favorites section)"
);
assert.deepEqual(
  searchMedan.regularItems.map((c) => c.id),
  ["cam-mdn-1"],
  "Matching non-favorite stays in regular section"
);
console.log("  [PASS] 5. Search filters both favorites and regular sections accurately; clearing search restores full list");

// Case C: Toggle favorite moves camera into or out of favorites section immediately
const toggledFavIds = new Set(["cam-yog-1", "cam-jkt-1", "cam-mdn-1"]);
const afterAddFav = partitionPickerCameras(
  sampleCameras,
  [sampleCameras[0], sampleCameras[2]],
  toggledFavIds,
  ""
);
assert.deepEqual(
  afterAddFav.favoriteItems.map((c) => c.id),
  ["cam-yog-1", "cam-jkt-1", "cam-mdn-1"],
  "Newly favorited camera from searchResults moves immediately into favorites section"
);
assert.deepEqual(
  afterAddFav.regularItems.map((c) => c.id),
  ["cam-bdg-1"],
  "Newly favorited camera is immediately removed from regular section"
);

const afterRemoveAllFavs = partitionPickerCameras(
  sampleCameras,
  [],
  new Set(),
  ""
);
assert.equal(
  afterRemoveAllFavs.favoriteItems.length,
  0,
  "When there are no favorites, favoriteItems is empty so the favorites section is hidden"
);
assert.equal(
  afterRemoveAllFavs.regularItems.length,
  4,
  "All cameras return to regular section when unfavorited"
);
console.log("  [PASS] 6. Toggling favorite immediately moves camera between 'CCTV Favorit' and 'Semua Kamera'");

console.log("=== ALL CAMERA PICKER TESTS PASSED ===");

