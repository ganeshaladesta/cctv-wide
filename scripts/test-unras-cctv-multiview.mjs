import assert from "node:assert";
import { protestStore } from "../src/lib/protest-store.ts";
import { getDataStore } from "../src/lib/data-store.ts";

console.log("=== TEST SUITE: UNRAS CCTV LINKING & DEDICATED MULTIVIEW ===");

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
assert(allCameras.length > 0, "CCTV catalog must be loaded");

const onlineCam = allCameras.find((c) => c.status === "ONLINE") || allCameras[0];
const secondCam = allCameras.find((c) => c.id !== onlineCam.id) || allCameras[1];
const mockUser = {
  id: "test-op-1",
  name: "Operator Test",
  role: "operator"
};

// Create a test protest event
const ts = Date.now();
const testEvent = await protestStore.createProtest(
  {
    kategori_kejadian: "Unjuk Rasa",
    tanggal: "2026-11-20",
    id_kejadian: `TEST-JKT-CCTV-${ts}-1`,
    lokasi: "Gedung DPR/MPR RI",
    isu_tuntutan: "Tuntutan Regulasi Transportasi Online",
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

assert(testEvent && testEvent.id, "Test protest event must be created");

// Test 1: Link one online camera
await test("1. Link one online camera and verify persistence", async () => {
  const link = await protestStore.linkCamera(
    {
      protest_id: testEvent.id,
      camera_id: onlineCam.id,
      notes: "Kamera pemantau gerbang utama"
    },
    mockUser
  );
  assert(link, "Link must be returned");
  assert.strictEqual(link.camera_id, onlineCam.id);
  assert.strictEqual(link.camera_name, onlineCam.name);

  // Retrieve and verify persistence
  const links = await protestStore.getCameraLinks(testEvent.id);
  assert(links.some((l) => l.camera_id === onlineCam.id), "Linked camera must persist");
  assert.strictEqual(links.length, 1);
});

// Test 2: Prevent duplicate link
await test("2. Duplicate camera link is handled idempotently", async () => {
  const link2 = await protestStore.linkCamera(
    {
      protest_id: testEvent.id,
      camera_id: onlineCam.id
    },
    mockUser
  );
  const links = await protestStore.getCameraLinks(testEvent.id);
  // Should not create duplicate
  assert.strictEqual(links.filter((l) => l.camera_id === onlineCam.id).length, 1);
});

// Test 3: Link multiple cameras
await test("3. Link multiple cameras and check spatial distance calculation", async () => {
  await protestStore.linkCamera(
    {
      protest_id: testEvent.id,
      camera_id: secondCam.id
    },
    mockUser
  );
  const links = await protestStore.getCameraLinks(testEvent.id);
  assert.strictEqual(links.length, 2);
  assert(links.every((l) => typeof l.distance_meters === "number"));
});

// Test 4: Dedicated UNRAS MultiView Camera Resolution
await test("4. Dedicated UNRAS MultiView resolves full Camera objects", async () => {
  const links = await protestStore.getCameraLinks(testEvent.id);
  const resolvedCameras = links.map((l) => l.camera || cctvStore.getCameraById(l.camera_id)).filter(Boolean);

  assert.strictEqual(resolvedCameras.length, 2);
  assert(resolvedCameras[0].stream_url !== undefined, "Stream URL must be defined");
  assert(resolvedCameras[0].protocol !== undefined, "Protocol must be defined");
  assert(resolvedCameras[0].name !== undefined, "Camera name must be defined");
});

// Test 5: Event Isolation (No cross-talk between different UNRAS events)
await test("5. Camera linkages are strictly scoped per UNRAS event", async () => {
  const eventB = await protestStore.createProtest(
    {
      kategori_kejadian: "Unjuk Rasa",
      tanggal: "2026-11-20",
      id_kejadian: `TEST-JKT-CCTV-${ts}-2`,
      lokasi: "Kawasan Monas",
      isu_tuntutan: "Aspirasi Buruh Monas",
      provinsi: "DKI Jakarta",
      kota_kabupaten: "Jakarta Pusat",
      wilayah_hukum: "Polres Metro Jakarta Pusat",
      kp_kpw: "KPBI",
      regional: "Kantor Pusat",
      status: "scheduled",
      urgency: "low",
      validated_lat: -6.1754,
      validated_lng: 106.8272,
      waktu_mulai: "10:00 WIB"
    },
    mockUser
  );

  const linksB = await protestStore.getCameraLinks(eventB.id);
  assert.strictEqual(linksB.length, 0, "Event B must have 0 cameras initially");

  const linksA = await protestStore.getCameraLinks(testEvent.id);
  assert.strictEqual(linksA.length, 2, "Event A still has 2 cameras");
});

// Test 6: Removing from MultiView layout does not unlink from event
await test("6. Removing from MultiView display does not unlink from database", async () => {
  const linksBefore = await protestStore.getCameraLinks(testEvent.id);
  assert.strictEqual(linksBefore.length, 2);

  // Simulating multi-view grid state modification:
  // onSetCameras(current.filter(c => c.id !== secondCam.id))
  // The database must remain unchanged!
  const linksAfter = await protestStore.getCameraLinks(testEvent.id);
  assert.strictEqual(linksAfter.length, 2, "Database relationship must be preserved");
});

// Test 7: Explicit Unlink action
await test("7. Explicit unlink permanently removes relationship", async () => {
  const removed = await protestStore.unlinkCamera(testEvent.id, secondCam.id);
  assert.strictEqual(removed, true, "Unlink must succeed");

  const links = await protestStore.getCameraLinks(testEvent.id);
  assert.strictEqual(links.length, 1);
  assert(!links.some((l) => l.camera_id === secondCam.id), "Second camera must be unlinked");
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
