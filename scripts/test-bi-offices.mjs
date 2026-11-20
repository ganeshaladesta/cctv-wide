import { biOfficeStore } from "../src/lib/bi-office-store.ts";

async function runTests() {
  console.log("=== Testing Bank Indonesia Offices Master Data & GeoINT Engine ===");

  // Test 1: Fetch all offices
  const offices = await biOfficeStore.getAllOffices();
  console.log(`Total offices registered in database: ${offices.length}`);

  // Exactly 47 from CSV + 1 audited KPBI missing record = 48
  if (offices.length < 47) {
    throw new Error(`Expected at least 47 office records, got ${offices.length}`);
  }

  // Test 2: Verify coordinate normalization (no swapped values)
  for (const off of offices) {
    if (off.validation_status === "verified") {
      if (off.latitude === null || off.longitude === null) {
        throw new Error(`Verified office ${off.short_name} has null coordinates!`);
      }
      // Lat should be between -11.5 and 6.5
      if (off.latitude < -11.5 || off.latitude > 6.5) {
        throw new Error(`Invalid latitude for ${off.short_name}: ${off.latitude}`);
      }
      // Lng should be between 94.0 and 142.0
      if (off.longitude < 94.0 || off.longitude > 142.0) {
        throw new Error(`Invalid longitude for ${off.short_name}: ${off.longitude}`);
      }
    }
  }
  console.log("✓ All 47 verified office coordinates fall strictly within Indonesian geographical bounds.");

  // Test 3: KOPERBI IKN verification
  const ikn = offices.find((o) => o.short_name === "KOPERBI IKN");
  if (!ikn) {
    throw new Error("KOPERBI IKN not found in office list!");
  }
  console.log(`✓ KOPERBI IKN found: type=${ikn.office_type}, lat=${ikn.latitude}, lng=${ikn.longitude}, status=${ikn.validation_status}`);
  if (ikn.office_type !== "KOPERBI IKN" || !ikn.latitude || !ikn.longitude) {
    throw new Error("KOPERBI IKN metadata incorrect!");
  }

  // Test 4: KPBI headquarters audit check
  const kpbi = offices.find((o) => o.office_id === "KPBI-PUSAT");
  if (!kpbi) {
    throw new Error("KPBI audited record not found!");
  }
  console.log(`✓ KPBI Headquarter audited: status=${kpbi.validation_status}, lat=${kpbi.latitude}, lng=${kpbi.longitude}`);
  if (kpbi.latitude !== null || kpbi.longitude !== null || kpbi.validation_status !== "missing_coordinates") {
    throw new Error("CRITICAL RULE VIOLATION: KPBI coordinates must be null and marked missing_coordinates without fabrication!");
  }

  // Test 5: Proximity distance calculation
  // From Monas: -6.1754, 106.8272
  const monasLat = -6.1754;
  const monasLng = 106.8272;
  const nearest = await biOfficeStore.getNearestOfficeForCoordinates(monasLat, monasLng);
  console.log(`✓ Nearest BI Office from Monas: ${nearest?.short_name} (${nearest?.distance_meters}m)`);
  if (!nearest || nearest.short_name !== "Jakarta") {
    throw new Error(`Expected nearest office to be Jakarta, got ${nearest?.short_name}`);
  }
  if (nearest.distance_meters > 2000) {
    throw new Error(`Distance to KPw Jakarta should be ~1000m-1500m, got ${nearest.distance_meters}m`);
  }

  // Test 6: Audit validation report
  const audit = await biOfficeStore.getAuditReport();
  console.log("\n=== Coordinate Validation Audit Summary ===");
  console.log(`Total Records: ${audit.total_records}`);
  console.log(`Verified Count: ${audit.verified_count}`);
  console.log(`Missing Count: ${audit.missing_count}`);
  console.log(`Invalid Count: ${audit.invalid_count}`);
  console.log(`KPBI Status: ${audit.kpbi_status}`);

  if (audit.verified_count !== 47 || audit.missing_count !== 1) {
    throw new Error(`Expected exactly 47 verified and 1 missing, got verified=${audit.verified_count}, missing=${audit.missing_count}`);
  }

  console.log("\nALL 6 GEOINT MASTER DATA TESTS PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});

