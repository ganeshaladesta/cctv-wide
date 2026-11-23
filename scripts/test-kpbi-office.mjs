/**
 * SCC - EAGLE EYES: Kantor Pusat Bank Indonesia (KPBI) Verification Suite
 * Grounded in official coordinates: Lat -6.1817, Lng 106.8207194
 */

import assert from "node:assert/strict";
import { biOfficeStore } from "../src/lib/bi-office-store.ts";
import { calculateDistanceMeters } from "../src/lib/protest-store.ts";

const results = [];

function recordTest(num, name, passed, details = "") {
  results.push({ num, name, passed, details });
  const status = passed ? "✔ PASS" : "✖ FAIL";
  console.log(`[Test ${String(num).padStart(2, "0")}/08] ${status} - ${name}`);
  if (details) {
    console.log(`          ${details}`);
  }
}

async function runKpbiTests() {
  console.log("================================================================================");
  console.log("=== SCC - EAGLE EYES: KPBI GEOSPATIAL LOCATION VERIFICATION SUITE           ===");
  console.log("================================================================================\n");

  const allOffices = await biOfficeStore.getAllOffices();

  // Test 1: KPBI exists in offices dataset
  const kpbi = allOffices.find(
    (o) => o.office_id === "KPBI" || o.id === "bi-off-kpbi-pusat" || o.office_type === "Kantor Pusat"
  );
  const test1Pass = kpbi !== undefined;
  recordTest(1, "KPBI exists in BI office dataset", test1Pass, `Office ID: ${kpbi?.office_id}, Name: ${kpbi?.office_name}`);

  // Test 2: Exactly one KPBI record exists (no duplicates)
  const kpbiList = allOffices.filter(
    (o) => o.office_id === "KPBI" || o.office_type === "Kantor Pusat" || o.office_name.includes("Kantor Pusat Bank Indonesia")
  );
  const test2Pass = kpbiList.length === 1;
  recordTest(2, "No duplicate KPBI record exists", test2Pass, `Count: ${kpbiList.length} (Expected: 1)`);

  // Test 3: Exact official coordinates (-6.1817, 106.8207194)
  const exactLat = kpbi?.latitude === -6.1817;
  const exactLng = kpbi?.longitude === 106.8207194;
  const test3Pass = exactLat && exactLng;
  recordTest(3, "Exact official coordinates match (-6.1817, 106.8207194)", test3Pass, `Lat: ${kpbi?.latitude}, Lng: ${kpbi?.longitude}`);

  // Test 4: Validation status is verified
  const test4Pass = kpbi?.validation_status === "verified";
  recordTest(4, "KPBI validation status is 'verified'", test4Pass, `Status: ${kpbi?.validation_status}, Reason: ${kpbi?.validation_reason}`);

  // Test 5: Total verified offices is 48 (47 regional + 1 headquarters)
  const verifiedOffices = allOffices.filter((o) => o.validation_status === "verified");
  const test5Pass = verifiedOffices.length === 48;
  recordTest(5, "Total verified BI offices equals 48 (47 regional + 1 KPBI)", test5Pass, `Verified count: ${verifiedOffices.length}`);

  // Test 6: Audit report surfaces kpbi_status as 'available'
  const report = await biOfficeStore.getAuditReport();
  const test6Pass = report.kpbi_status === "available" && report.verified_count === 48;
  recordTest(6, "Audit report reflects kpbi_status 'available'", test6Pass, `kpbi_status: ${report.kpbi_status}, Verified: ${report.verified_count}/${report.total_records}`);

  // Test 7: Distance and proximity analysis to Monas (~900m)
  // Monas coordinates: -6.1753924, 106.8271528
  const monasLat = -6.1753924;
  const monasLng = 106.8271528;
  const distToMonas = calculateDistanceMeters(monasLat, monasLng, kpbi.latitude, kpbi.longitude);
  const test7Pass = distToMonas > 500 && distToMonas < 1500;
  recordTest(7, "Proximity calculation to Monas Jakarta (~900m) works correctly", test7Pass, `Calculated distance: ${Math.round(distToMonas)} meters`);

  // Test 8: Nearby office query includes KPBI for Central Jakarta coordinates
  const nearby = await biOfficeStore.getNearbyOfficesForCoordinates(monasLat, monasLng, 3);
  const kpbiInNearby = nearby.some((n) => n.office_type === "Kantor Pusat");
  const test8Pass = kpbiInNearby && nearby.length >= 1;
  recordTest(8, "Nearby office query includes KPBI for Central Jakarta coordinates", test8Pass, `Nearest office: ${nearby[0]?.short_name} (${nearby[0]?.distance_meters}m)`);

  console.log("\n================================================================================");
  const allPassed = results.every((r) => r.passed);
  console.log(`=== HASIL AKHIR: ${results.filter((r) => r.passed).length}/${results.length} PENGUJIAN BERHASIL (${allPassed ? "PASS" : "FAIL"})                         ===`);
  console.log("================================================================================\n");

  if (!allPassed) {
    process.exit(1);
  }
}

runKpbiTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
