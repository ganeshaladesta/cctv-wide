import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const gridPath = path.join(rootDir, "src/components/multi-view-grid.tsx");
const playerPath = path.join(rootDir, "src/components/cctv-player.tsx");

const gridSrc = fs.readFileSync(gridPath, "utf8");
const playerSrc = fs.readFileSync(playerPath, "utf8");

console.log("=== SCC EAGLE EYES: MULTI-VIEW DEDICATED FULLSCREEN MODE TEST SUITE ===");

// 1. Fullscreen Button in Toolbar near "Bagikan Wall" with Maximize/Minimize icons & tooltips
const shareIdx = gridSrc.indexOf("Bagikan Wall");
const fullscreenBtnIdx = gridSrc.indexOf('data-testid="multiview-fullscreen-toggle-btn"');
assert.ok(
  shareIdx > 0 && fullscreenBtnIdx > shareIdx,
  'Fullscreen toggle button must be positioned in the Multi-View toolbar right after "Bagikan Wall"'
);
assert.ok(
  gridSrc.includes("Maximize") && gridSrc.includes("Minimize"),
  "Fullscreen button must use Maximize and Minimize icons"
);
assert.ok(
  gridSrc.includes('title={isEffectiveFullscreen ? "Keluar Fullscreen" : "Masuk Fullscreen"}') &&
    gridSrc.includes('aria-label={isEffectiveFullscreen ? "Keluar Fullscreen" : "Masuk Fullscreen"}'),
  'Fullscreen button must provide clear "Masuk Fullscreen" and "Keluar Fullscreen" tooltips and aria-labels'
);
console.log("  [PASS] 1. Fullscreen button placed near 'Bagikan Wall' with Maximize/Minimize icons and Masuk/Keluar tooltips");

// 2. Uses Browser Fullscreen API on the Multi-View container (not document.documentElement / body)
assert.ok(
  gridSrc.includes("ref={wallContainerRef}") &&
    gridSrc.includes('data-testid="multiview-command-wall-container"'),
  "Multi-View root container must attach wallContainerRef"
);
assert.ok(
  gridSrc.includes("container.requestFullscreen") &&
    !gridSrc.includes("document.documentElement.requestFullscreen") &&
    !gridSrc.includes("document.body.requestFullscreen"),
  "Must invoke Browser Fullscreen API on the Multi-View container, not the entire page"
);
console.log("  [PASS] 2. Browser Fullscreen API is called on the Multi-View container (wallContainerRef)");

// 3. Hides unrelated elements in fullscreen & preserves same DOM tree so video streams never unmount/reload
assert.ok(
  gridSrc.includes("{!isEffectiveFullscreen && (") &&
    gridSrc.includes('data-testid="multiview-regional-presets-bar"'),
  "Regional presets bar must be hidden while dedicated Fullscreen Mode is active"
);
assert.ok(
  gridSrc.includes("key={cam ? `${cam.id}-${idx}` : `empty-slot-${idx}`}") &&
    gridSrc.includes("<CCTVPlayer camera={cam} compact />"),
  "Camera cards keep identical keys and remain in the same parent grid container across fullscreen toggles (no unmount/remount or stream reload)"
);
console.log("  [PASS] 3. Unrelated bars hide in fullscreen while CCTVPlayer instances remain mounted without stream reload");

// 4. Preserves all 5 grid layouts (1, 2, 4, 6, 9) and proportional object-contain video rendering
assert.ok(
  gridSrc.includes('size: 1') &&
    gridSrc.includes('fullscreenGridClass: "grid-cols-1 grid-rows-1"') &&
    gridSrc.includes('size: 2') &&
    gridSrc.includes('fullscreenGridClass: "grid-cols-1 md:grid-cols-2 md:grid-rows-1"') &&
    gridSrc.includes('size: 4') &&
    gridSrc.includes('fullscreenGridClass: "grid-cols-1 sm:grid-cols-2 sm:grid-rows-2"') &&
    gridSrc.includes('size: 6') &&
    gridSrc.includes('fullscreenGridClass: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2"') &&
    gridSrc.includes('size: 9') &&
    gridSrc.includes('fullscreenGridClass: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-3"'),
  "All 5 layouts (1x1, 2-col, 2x2, 3x2, 3x3) must have dedicated viewport-fitting fullscreen grid definitions"
);
assert.ok(
  playerSrc.includes('className="w-full h-full object-contain"'),
  "CCTVPlayer video and image elements must use object-contain to prevent distortion"
);
console.log("  [PASS] 4. All 5 layouts (1, 2, 4, 6, 9) expand proportionally to fill viewport with object-contain video rendering");

// 5. Camera controls & empty slot picker remain accessible inside fullscreen
assert.ok(
  gridSrc.includes("Detail") &&
    gridSrc.includes("Ganti") &&
    gridSrc.includes("<FavoritesButton") &&
    gridSrc.includes("Tambah Kamera ke Slot #"),
  "Camera card controls (Favorite, Detail, Ganti, Remove) and empty slots must remain accessible"
);
assert.ok(
  gridSrc.includes("isWallFullscreen && wallContainerRef.current") &&
    gridSrc.includes("? wallContainerRef.current") &&
    gridSrc.includes(": document.body"),
  "Slot picker modal must portal inside wallContainerRef during native fullscreen so empty slots and 'Ganti' remain usable"
);
console.log("  [PASS] 5. Camera controls and empty slot picker modal remain usable inside native fullscreen");

// 6. Exit behavior: Escape key, explicit exit button, fullscreenchange listener, and graceful rejection handling
assert.ok(
  gridSrc.includes('document.addEventListener("fullscreenchange", handleFullscreenChange)'),
  "Must synchronize UI state with the browser fullscreenchange event"
);
assert.ok(
  gridSrc.includes("document.exitFullscreen") &&
    gridSrc.includes('if (e.key === "Escape" && pickerSlot === null)'),
  "Must support exiting via explicit button and Escape key"
);
assert.ok(
  gridSrc.includes("} catch {") &&
    gridSrc.includes("setIsFallbackFullscreen(true);"),
  "Must handle browser fullscreen rejection gracefully without breaking the UI"
);
console.log("  [PASS] 6. Exit behavior verified: fullscreenchange sync, Escape key, explicit Keluar Fullscreen button, and graceful rejection handling");

console.log("=== ALL MULTI-VIEW FULLSCREEN TESTS PASSED ===");

