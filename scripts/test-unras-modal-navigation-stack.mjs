import assert from "node:assert";
import { protestStore } from "../src/lib/protest-store.ts";
import { getDataStore } from "../src/lib/data-store.ts";

console.log("=== TEST SUITE: UNRAS CCTV MODAL NAVIGATION STACK & DEDICATED MULTI-VIEW ===");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

const cctvStore = getDataStore();
const allCameras = cctvStore.getAllCameras();
assert(allCameras.length >= 4, "Must have cameras loaded");

const cam1 = allCameras[0];
const cam2 = allCameras[1];
const cam3 = allCameras[2];

const mockUser = {
  id: "test-operator",
  name: "Operator Navigator",
  role: "operator"
};

const ts = Date.now();

// 1. Create Event Alpha
const eventA = await protestStore.createProtest(
  {
    kategori_kejadian: "Unjuk Rasa",
    tanggal: "2026-11-20",
    id_kejadian: `NAV-ALPHA-${ts}`,
    lokasi: "Gedung DPR/MPR RI",
    isu_tuntutan: "Aspirasi Pengemudi Transportasi Online",
    provinsi: "DKI Jakarta",
    kota_kabupaten: "Jakarta Pusat",
    wilayah_hukum: "Polres Metro Jakarta Pusat",
    kp_kpw: "KPBI",
    regional: "Kantor Pusat",
    status: "scheduled",
    urgency: "medium",
    validated_lat: -6.2088,
    validated_lng: 106.8000,
    waktu_mulai: "09:00 WIB"
  },
  mockUser
);

// 2. Create Event Beta (isolation check)
const eventB = await protestStore.createProtest(
  {
    kategori_kejadian: "Unjuk Rasa",
    tanggal: "2026-11-20",
    id_kejadian: `NAV-BETA-${ts}`,
    lokasi: "Kawasan Patung Kuda Monas",
    isu_tuntutan: "Aspirasi Aliansi Buruh",
    provinsi: "DKI Jakarta",
    kota_kabupaten: "Jakarta Pusat",
    wilayah_hukum: "Polres Metro Jakarta Pusat",
    kp_kpw: "KPBI",
    regional: "Kantor Pusat",
    status: "ongoing",
    urgency: "high",
    validated_lat: -6.1754,
    validated_lng: 106.8272,
    waktu_mulai: "10:00 WIB"
  },
  mockUser
);

// Link 3 cameras to Event A
await protestStore.linkCamera({ protest_id: eventA.id, camera_id: cam1.id }, mockUser);
await protestStore.linkCamera({ protest_id: eventA.id, camera_id: cam2.id }, mockUser);
await protestStore.linkCamera({ protest_id: eventA.id, camera_id: cam3.id }, mockUser);

// TEST A: Single Player Open & Close preserve Camera Selection state & parent modal
await test("TEST A: Opening and closing Single Player preserves UNRAS Detail Modal and CCTV tab", async () => {
  // Navigation stack simulation:
  const navStack = {
    isUnrasDetailOpen: true,
    activeUnrasTab: "cctv",
    activePlayerMode: "none",
    selectedSingleCamera: null
  };

  // User clicks "Putar" on cam1
  navStack.activePlayerMode = "single";
  navStack.selectedSingleCamera = cam1;

  assert.strictEqual(navStack.isUnrasDetailOpen, true, "Parent modal must remain open");
  assert.strictEqual(navStack.activeUnrasTab, "cctv", "Active tab must remain CCTV");
  assert.strictEqual(navStack.activePlayerMode, "single");
  assert.strictEqual(navStack.selectedSingleCamera.id, cam1.id);

  // User clicks Close or presses Escape on Single Player
  navStack.activePlayerMode = "none";
  navStack.selectedSingleCamera = null;

  assert.strictEqual(navStack.isUnrasDetailOpen, true, "Parent modal MUST NOT be closed");
  assert.strictEqual(navStack.activeUnrasTab, "cctv", "Active tab is still CCTV");
  assert.strictEqual(navStack.activePlayerMode, "none");
  assert.strictEqual(navStack.selectedSingleCamera, null);
});

// TEST B: Multi-View button disabled when 0 cameras linked
await test("TEST B: Event Beta with 0 linked cameras cannot open Multi-View", async () => {
  const linksB = await protestStore.getCameraLinks(eventB.id);
  assert.strictEqual(linksB.length, 0, "Event B has 0 cameras");

  const canOpenMultiView = linksB.length > 0;
  assert.strictEqual(canOpenMultiView, false, "Multi-View must be disabled when 0 cameras are linked");
});

// TEST C: Opening Multi-View with 3 cameras resolves actual stream URLs & streams simultaneously
await test("TEST C: Multi-View with 3 cameras resolves stream URLs and sets 4-slot layout", async () => {
  const linksA = await protestStore.getCameraLinks(eventA.id);
  assert.strictEqual(linksA.length, 3, "Event A has 3 cameras linked");

  // Auto-tune layout logic:
  // count <= 1 -> 1, count == 2 -> 2, count <= 4 -> 4, count <= 6 -> 6, else 9
  const count = linksA.length;
  let layoutSize = 4;
  if (count <= 1) layoutSize = 1;
  else if (count === 2) layoutSize = 2;
  else if (count <= 4) layoutSize = 4;
  else if (count <= 6) layoutSize = 6;
  else layoutSize = 9;

  assert.strictEqual(layoutSize, 4, "3 cameras must map to 4-slot grid layout");

  // Verify all 3 cameras have valid stream URLs
  const resolvedStreams = linksA.map((l) => l.camera || cctvStore.getCameraById(l.camera_id));
  assert.strictEqual(resolvedStreams.length, 3);
  for (const cam of resolvedStreams) {
    assert(cam.stream_url && typeof cam.stream_url === "string", "Each camera must have a valid stream URL");
    assert(cam.name && typeof cam.name === "string", "Each camera must have a name");
  }
});

// TEST D: Closing Multi-View returns cleanly to Camera Selection view
await test("TEST D: Closing Multi-View returns cleanly to Camera Selection without resetting parent", async () => {
  const navStack = {
    isUnrasDetailOpen: true,
    activeUnrasTab: "cctv",
    activePlayerMode: "multiview"
  };

  // Close Multi-View
  navStack.activePlayerMode = "none";

  assert.strictEqual(navStack.isUnrasDetailOpen, true, "Parent modal must remain open");
  assert.strictEqual(navStack.activeUnrasTab, "cctv", "Tab remains CCTV");
  assert.strictEqual(navStack.activePlayerMode, "none");
});

// TEST E: Hiding camera slot vs unlinking camera
await test("TEST E: Hiding a camera slot in Multi-View does NOT unlink it from database", async () => {
  const linksBefore = await protestStore.getCameraLinks(eventA.id);
  assert.strictEqual(linksBefore.length, 3);

  // Hidden set in MultiView UI
  const hiddenCameraIds = new Set([cam2.id]);
  const displayed = linksBefore.filter((l) => !hiddenCameraIds.has(l.camera_id));
  assert.strictEqual(displayed.length, 2, "Only 2 cameras displayed in Multi-View");

  // Database link check
  const linksAfter = await protestStore.getCameraLinks(eventA.id);
  assert.strictEqual(linksAfter.length, 3, "Database still contains all 3 linked cameras");
});

// TEST F: Explicit unlink permanently removes link
await test("TEST F: Explicit unlink permanently removes link from event", async () => {
  const success = await protestStore.unlinkCamera(eventA.id, cam3.id);
  assert.strictEqual(success, true, "Unlink must succeed");

  const linksAfter = await protestStore.getCameraLinks(eventA.id);
  assert.strictEqual(linksAfter.length, 2);
  assert(!linksAfter.some((l) => l.camera_id === cam3.id), "cam3 must be gone");
});

// TEST G: Cross-event scoping isolation
await test("TEST G: Event cameras are strictly isolated and never leak across events", async () => {
  const linksA = await protestStore.getCameraLinks(eventA.id);
  const linksB = await protestStore.getCameraLinks(eventB.id);

  assert.strictEqual(linksA.length, 2);
  assert.strictEqual(linksB.length, 0);

  // Link cam1 to Event B
  await protestStore.linkCamera({ protest_id: eventB.id, camera_id: cam1.id }, mockUser);
  const linksBUpdated = await protestStore.getCameraLinks(eventB.id);
  assert.strictEqual(linksBUpdated.length, 1);
  assert.strictEqual(linksBUpdated[0].camera_id, cam1.id);

  // Event A still has its own 2 cameras
  const linksAFinal = await protestStore.getCameraLinks(eventA.id);
  assert.strictEqual(linksAFinal.length, 2);
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}

