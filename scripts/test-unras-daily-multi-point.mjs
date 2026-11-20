import { protestStore } from "../src/lib/protest-store.ts";

async function runTests() {
  console.log("=== Testing UNRAS Daily Multi-Point Situational Monitoring ===");

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  console.log(`Operational Date (Asia/Jakarta): ${todayStr}`);

  // Test 1: Daily situation overview on current date
  const overviewInitial = await protestStore.getDailySituationOverview(todayStr);
  console.log(`Initial Situation Overview for ${todayStr}:`);
  console.log(`- Total Events: ${overviewInitial.total_events}`);
  console.log(`- Total Points: ${overviewInitial.total_points}`);
  console.log(`- Active Points: ${overviewInitial.total_active_points}`);
  console.log(`- Total Crowd: ${overviewInitial.total_estimated_crowd}`);
  console.log(`- Elements Identified: ${overviewInitial.total_identified_elements}`);
  console.log(`- Affected Provinces: ${overviewInitial.affected_provinces.join(", ") || "None"}`);

  // Test 2: Create a multi-point test event
  const testEvent = await protestStore.createProtest(
    {
      id_kejadian: `UNRAS-TEST-${Date.now()}`,
      kode_unras: `KODE-TEST-${Date.now()}`,
      tanggal: todayStr,
      waktu_mulai: "09:00 WIB",
      lokasi: "Kawasan Monas & Istana Merdeka",
      isu_tuntutan: "Aksi Nasional Penyesuaian Tarif dan Kesejahteraan",
      organisasi_kelompok: "Serikat Buruh A, Aliansi Mahasiswa B, Paguyuban Pengemudi C",
      status: "ongoing",
      urgency: "high",
      provinsi: "DKI Jakarta",
      kota_kabupaten: "Jakarta Pusat",
      regional: "Jawa",
      validated_lat: -6.1754,
      validated_lng: 106.8272
    },
    { id: "usr-admin", name: "Super Admin", role: "admin", email: "admin@scc.go.id" }
  );
  console.log(`\nCreated test event: ${testEvent.id} (${testEvent.isu_tuntutan})`);

  // Test 3: Legacy fallback synthesis when no points exist yet
  const initialPoints = await protestStore.getPointsByProtestId(testEvent.id);
  console.log(`Points in DB before adding explicit points: ${initialPoints.length}`);
  const synthesized = protestStore.synthesizePointsForLegacyEvent(testEvent);
  console.log(`Synthesized fallback points count: ${synthesized.length}`);
  console.log(`Synthesized elements count: ${synthesized[0].elements?.length}`);
  if (synthesized[0].elements?.length !== 3) {
    throw new Error(`Expected 3 synthesized elements from comma-separated string, got ${synthesized[0].elements?.length}`);
  }

  // Test 4: Create explicit distinct physical points for the event
  const point1 = await protestStore.createPoint({
    protest_id: testEvent.id,
    point_name: "Pintu Barat Daya Monas (Patung Kuda)",
    location_address: "Jl. Medan Merdeka Barat No. 1",
    provinsi: "DKI Jakarta",
    kota_kabupaten: "Jakarta Pusat",
    regional: "Jawa",
    latitude: -6.1783,
    longitude: 106.8222,
    status: "ongoing",
    urgency: "high"
  });

  const point2 = await protestStore.createPoint({
    protest_id: testEvent.id,
    point_name: "Depan Gerbang Utama Gedung DPR/MPR RI",
    location_address: "Jl. Gatot Subroto No. 1",
    provinsi: "DKI Jakarta",
    kota_kabupaten: "Jakarta Pusat",
    regional: "Jawa",
    latitude: -6.2104,
    longitude: 106.8001,
    status: "monitoring",
    urgency: "medium"
  });
  console.log(`\nCreated Point 1: ${point1.id} (${point1.point_name})`);
  console.log(`Created Point 2: ${point2.id} (${point2.point_name})`);

  // Test 5: Add distinct mass elements per point
  const el1 = await protestStore.createElement({
    point_id: point1.id,
    protest_id: testEvent.id,
    name: "Serikat Buruh Transportasi Indonesia",
    leader_name: "Agus Santoso"
  });
  const el2 = await protestStore.createElement({
    point_id: point1.id,
    protest_id: testEvent.id,
    name: "Aliansi Mitra Komuter Sejahtera",
    leader_name: "Hendra Wijaya"
  });
  const el3 = await protestStore.createElement({
    point_id: point2.id,
    protest_id: testEvent.id,
    name: "Front Mahasiswa Peduli Regulasi",
    leader_name: "Budi Pratama"
  });
  console.log(`Added elements: [${el1.name}], [${el2.name}] to Point 1; [${el3.name}] to Point 2.`);

  // Test 6: Crowd Observation Timeline & Delta Tracking
  // Point 1 - Element 1: First observation (350), Second observation (500 -> delta +150)
  await protestStore.addCrowdObservation({
    point_id: point1.id,
    element_id: el1.id,
    element_name: el1.name,
    crowd_estimate: 350,
    observation_timestamp: "2026-11-20T09:00:00Z",
    verification_status: "verified",
    notes: "Penghitungan awal CCTV Patung Kuda"
  });
  await protestStore.addCrowdObservation({
    point_id: point1.id,
    element_id: el1.id,
    element_name: el1.name,
    crowd_estimate: 500,
    observation_timestamp: "2026-11-20T10:30:00Z",
    verification_status: "verified",
    notes: "Massa bertambah dari konvoi arah Harmoni"
  });

  // Point 1 - Element 2: Single observation (200)
  await protestStore.addCrowdObservation({
    point_id: point1.id,
    element_id: el2.id,
    element_name: el2.name,
    crowd_estimate: 200,
    observation_timestamp: "2026-11-20T10:00:00Z",
    verification_status: "verified",
    notes: "Tiba di lokasi"
  });

  // Point 2 - Element 3: 450 -> 400 (delta -50)
  await protestStore.addCrowdObservation({
    point_id: point2.id,
    element_id: el3.id,
    element_name: el3.name,
    crowd_estimate: 450,
    observation_timestamp: "2026-11-20T09:30:00Z",
    verification_status: "verified"
  });
  await protestStore.addCrowdObservation({
    point_id: point2.id,
    element_id: el3.id,
    element_name: el3.name,
    crowd_estimate: 400,
    observation_timestamp: "2026-11-20T11:00:00Z",
    verification_status: "verified"
  });

  // Test 7: Verify point 1 metrics
  const p1Loaded = await protestStore.getPointById(point1.id);
  console.log(`\nPoint 1 Loaded Metrics:`);
  console.log(`- Current Crowd Total: ${p1Loaded?.current_crowd_total} (Expected: 700)`);
  console.log(`- Crowd Delta: ${p1Loaded?.crowd_change_delta} (Expected: +150)`);
  console.log(`- Trend: ${p1Loaded?.crowd_trend} (Expected: up)`);
  if (p1Loaded?.current_crowd_total !== 700) {
    throw new Error(`Expected Point 1 crowd total 700, got ${p1Loaded?.current_crowd_total}`);
  }
  if (p1Loaded?.crowd_change_delta !== 150) {
    throw new Error(`Expected Point 1 crowd delta 150, got ${p1Loaded?.crowd_change_delta}`);
  }

  // Test 8: Verify point 2 metrics
  const p2Loaded = await protestStore.getPointById(point2.id);
  console.log(`\nPoint 2 Loaded Metrics:`);
  console.log(`- Current Crowd Total: ${p2Loaded?.current_crowd_total} (Expected: 400)`);
  console.log(`- Crowd Delta: ${p2Loaded?.crowd_change_delta} (Expected: -50)`);
  console.log(`- Trend: ${p2Loaded?.crowd_trend} (Expected: down)`);
  if (p2Loaded?.current_crowd_total !== 400) {
    throw new Error(`Expected Point 2 crowd total 400, got ${p2Loaded?.current_crowd_total}`);
  }
  if (p2Loaded?.crowd_change_delta !== -50) {
    throw new Error(`Expected Point 2 crowd delta -50, got ${p2Loaded?.crowd_change_delta}`);
  }

  // Test 9: Point-level CCTV linking
  const cctvLink = await protestStore.linkCamera(
    {
      protest_id: testEvent.id,
      point_id: point1.id,
      camera_id: "balitower-m-507",
      notes: "CCTV pengawasan perimeter Patung Kuda"
    },
    { id: "usr-admin", name: "Super Admin", role: "admin", email: "admin@scc.go.id" }
  );
  console.log(`\nLinked Camera to Point 1: ${cctvLink?.camera_id} (Distance: ${cctvLink?.distance_meters}m)`);
  if (!cctvLink || cctvLink.point_id !== point1.id) {
    throw new Error(`Failed to link camera to point 1 with point_id!`);
  }

  // Test 10: Verify Daily Situation Overview with Multi-Point data
  const updatedOverview = await protestStore.getDailySituationOverview(todayStr);
  console.log(`\nUpdated Daily Situation Overview for ${todayStr}:`);
  console.log(`- Total Events: ${updatedOverview.total_events}`);
  console.log(`- Total Points: ${updatedOverview.total_points}`);
  console.log(`- Ongoing Points: ${updatedOverview.ongoing_points_count}`);
  console.log(`- Monitoring Points: ${updatedOverview.monitoring_points_count}`);
  console.log(`- Total Crowd: ${updatedOverview.total_estimated_crowd.toLocaleString("id-ID")} org`);
  console.log(`- Total Elements: ${updatedOverview.total_identified_elements}`);
  console.log(`- Linked CCTV Count: ${updatedOverview.linked_cctv_count}`);

  if (updatedOverview.total_estimated_crowd < 1100) {
    throw new Error(`Expected total crowd >= 1100, got ${updatedOverview.total_estimated_crowd}`);
  }

  // Cleanup test event
  await protestStore.deletePoint(point1.id);
  await protestStore.deletePoint(point2.id);
  protestStore.softDeleteProtest(testEvent.id);
  console.log(`\nCleaned up test records successfully.`);
  console.log(`\nALL 10 TESTS PASSED SUCCESSFULLY!`);
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
