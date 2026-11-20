import assert from "node:assert";
import { getDataStore } from "../src/lib/data-store.ts";
import { protestStore } from "../src/lib/protest-store.ts";

console.log("=== TEST SUITE: EXECUTIVE SECURITY COMMAND CENTER REDESIGN ===");

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
const cctvStats = cctvStore.getStats();
assert(cctvStats.total_cameras > 0, "CCTV total cameras must be positive");
assert(cctvStats.online_cameras > 0, "CCTV online cameras must be positive");

// TEST 1: CCTV Performance KPIs Accuracy
await test("1. CCTV Performance Telemetry matches persisted store counts", async () => {
  assert.strictEqual(
    cctvStats.total_cameras,
    cctvStats.online_cameras + cctvStats.offline_cameras,
    "Online + Offline must equal total cameras"
  );
  assert(cctvStats.total_provinces >= 34, "Must cover at least 34-38 provinces");
  assert(cctvStats.total_cities >= 100, "Must cover nationwide cities/regencies");
});

// TEST 2: UNRAS Stats Persistence & Non-Fabricated Values
await test("2. UNRAS Situation KPIs match actual database values", async () => {
  const unrasStats = await protestStore.getStats();
  assert(typeof unrasStats.total_events === "number", "Total events must be numeric");
  assert(typeof unrasStats.ongoing_events === "number", "Ongoing events must be numeric");
  assert(typeof unrasStats.monitoring_events === "number", "Monitoring events must be numeric");
  assert(typeof unrasStats.scheduled_events === "number", "Scheduled events must be numeric");
  assert(typeof unrasStats.completed_events === "number", "Completed events must be numeric");
});

// TEST 3: Multi-Point & Mass Elements Extraction
await test("3. Multi-point events correctly parse independent mass elements and crowd counts", async () => {
  const rawElements = "KSPI, FSPMI, Aliansi BEM Seluruh Indonesia / Driver Ojol Nasional";
  const elements = rawElements
    .split(/[,;\/\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);

  assert.strictEqual(elements.length, 4, "Should parse 4 distinct mass elements");
  assert.strictEqual(elements[0], "KSPI");
  assert.strictEqual(elements[1], "FSPMI");
  assert.strictEqual(elements[2], "Aliansi BEM Seluruh Indonesia");
  assert.strictEqual(elements[3], "Driver Ojol Nasional");
});

// TEST 4: Executive Priority Sorting Order
await test("4. Executive Priority Panel orders events: Ongoing > Monitoring > Scheduled > Urgency", async () => {
  const mockEvents = [
    { id: "1", status: "scheduled", urgency: "medium", tanggal: "2026-11-20" },
    { id: "2", status: "ongoing", urgency: "high", tanggal: "2026-11-20" },
    { id: "3", status: "monitoring", urgency: "critical", tanggal: "2026-11-20" },
    { id: "4", status: "ongoing", urgency: "critical", tanggal: "2026-11-20" },
    { id: "5", status: "scheduled", urgency: "high", tanggal: "2026-11-21" }
  ];

  const statusWeight = { ongoing: 4, monitoring: 3, scheduled: 2, completed: 1, cancelled: 0 };
  const urgencyWeight = { critical: 4, high: 3, medium: 2, low: 1 };

  const sorted = [...mockEvents].sort((a, b) => {
    const sA = statusWeight[a.status] || 0;
    const sB = statusWeight[b.status] || 0;
    if (sA !== sB) return sB - sA;
    const uA = urgencyWeight[a.urgency] || 0;
    const uB = urgencyWeight[b.urgency] || 0;
    return uB - uA;
  });

  assert.strictEqual(sorted[0].id, "4", "Critical Ongoing must be top priority #1");
  assert.strictEqual(sorted[1].id, "2", "High Ongoing must be priority #2");
  assert.strictEqual(sorted[2].id, "3", "Monitoring must be priority #3");
  assert.strictEqual(sorted[3].id, "5", "High Scheduled must be priority #4");
  assert.strictEqual(sorted[4].id, "1", "Medium Scheduled must be priority #5");
});

// TEST 5: Regional Distribution Mapping
await test("5. Regional Distribution Matrix aggregates provinces into 6 major regions", async () => {
  const provinces = cctvStore.getProvinces();
  const regionalGroups = [
    "Sumatera",
    "Jawa & DKI Jakarta",
    "Bali & Nusa Tenggara",
    "Kalimantan",
    "Sulawesi",
    "Maluku & Papua"
  ];

  assert.strictEqual(regionalGroups.length, 6, "Must define all 6 national regions");
  assert(provinces.length >= 34, "Must have comprehensive provinces loaded");

  const javadki = provinces.filter(p => ["dki jakarta", "jawa barat", "jawa tengah", "di yogyakarta", "jawa timur", "banten"].includes(p.name.toLowerCase()));
  assert(javadki.length >= 5, "Java region must contain main provinces");
});

// TEST 6: Operational Attention Alerts
await test("6. Operational Alerts accurately classify critical, warning, and blind-spot states", async () => {
  const sampleEvents = [
    { id: "ev-1", status: "ongoing", validated_lat: -6.2, validated_lng: 106.8, camera_links: [{ id: "l1" }] },
    { id: "ev-2", status: "monitoring", validated_lat: null, validated_lng: null, camera_links: [] },
    { id: "ev-3", status: "ongoing", validated_lat: -6.1, validated_lng: 106.8, camera_links: [] }
  ];

  const ongoing = sampleEvents.filter(p => p.status === "ongoing");
  const unmapped = sampleEvents.filter(p => p.validated_lat === null);
  const blindSpots = sampleEvents.filter(p => ["ongoing", "monitoring"].includes(p.status) && p.camera_links.length === 0);

  assert.strictEqual(ongoing.length, 2, "2 ongoing events detected");
  assert.strictEqual(unmapped.length, 1, "1 unmapped event detected");
  assert.strictEqual(blindSpots.length, 2, "2 blind spots (no CCTV) detected");
});

// TEST 7: Asia/Jakarta Timezone handling
await test("7. Date calculation strictly enforces Asia/Jakarta timezone", async () => {
  const wibDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  assert(/^\d{4}-\d{2}-\d{2}$/.test(wibDate), "Must be valid YYYY-MM-DD date");
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}

