// ==============================================================================
// SCC - EAGLE EYES: Comprehensive Full Functionality Audit Test Suite
// Verifies status transitions, UUID normalization, time normalization,
// operator reports, CCTV links, geocoding validation, and database safety.
// ==============================================================================

import { ensureValidUuid, DEFAULT_OPERATOR, DEFAULT_ADMIN, DEFAULT_VIEWER } from "../src/lib/auth-roles.js";
import { normalizeTimeString } from "../src/lib/time-normalization.js";
import { protestStore } from "../src/lib/protest-store.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(`  ✔ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ✖ FAIL: ${testName} ${details ? `(${details})` : ""}`);
    failCount++;
  }
}

async function runAudit() {
  console.log("================================================================================");
  console.log("=== SCC - EAGLE EYES: Comprehensive Functional Audit - Unjuk Rasa Module    ===");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // 1. Audit UUID Normalization & Schema Protection
  // ---------------------------------------------------------------------------
  console.log("--- TEST SUITE 1: UUID Normalization & Defense-in-Depth ---");
  {
    const opUuid = ensureValidUuid("usr-operator-001");
    assert(UUID_REGEX.test(opUuid), "ensureValidUuid converts 'usr-operator-001' to valid UUID", opUuid);

    const adminUuid = ensureValidUuid("usr-admin-001");
    assert(UUID_REGEX.test(adminUuid), "ensureValidUuid converts 'usr-admin-001' to valid UUID", adminUuid);

    const viewerUuid = ensureValidUuid("usr-viewer-001");
    assert(UUID_REGEX.test(viewerUuid), "ensureValidUuid converts 'usr-viewer-001' to valid UUID", viewerUuid);

    const standardUuid = "c9b0e123-4567-489a-bcde-0123456789ab";
    assert(ensureValidUuid(standardUuid) === standardUuid, "ensureValidUuid preserves valid UUIDs untouched");

    const customActor = ensureValidUuid("operator-lapangan-jakarta-pusat");
    assert(UUID_REGEX.test(customActor), "ensureValidUuid hashes arbitrary actor string into valid UUID", customActor);

    assert(UUID_REGEX.test(DEFAULT_OPERATOR.id), "DEFAULT_OPERATOR.id is valid UUID", DEFAULT_OPERATOR.id);
    assert(UUID_REGEX.test(DEFAULT_ADMIN.id), "DEFAULT_ADMIN.id is valid UUID", DEFAULT_ADMIN.id);
    assert(UUID_REGEX.test(DEFAULT_VIEWER.id), "DEFAULT_VIEWER.id is valid UUID", DEFAULT_VIEWER.id);
  }

  // ---------------------------------------------------------------------------
  // 2. Audit Time Normalization
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST SUITE 2: Time Normalization for PostgreSQL TIME Columns ---");
  {
    assert(normalizeTimeString("09:00 WIB").time === "09:00:00", "Normalizes '09:00 WIB' to '09:00:00'");
    assert(normalizeTimeString("14:30 WITA").time === "14:30:00", "Normalizes '14:30 WITA' to '14:30:00'");
    assert(normalizeTimeString("08:15:30 WIT").time === "08:15:30", "Normalizes '08:15:30 WIT' to '08:15:30'");
    assert(normalizeTimeString("09:00").time === "09:00:00", "Normalizes '09:00' to '09:00:00'");
    assert(normalizeTimeString("   15:45   ").time === "15:45:00", "Trims whitespace and normalizes to '15:45:00'");
    assert(normalizeTimeString("").time === null, "Empty time string produces null");
    assert(normalizeTimeString("NIHIL").time === null, "Invalid time string 'NIHIL' safely produces null");
  }

  // ---------------------------------------------------------------------------
  // 3. Audit Protest Lifecycle Status Transitions
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST SUITE 3: Protest Lifecycle Status Transitions ---");
  {
    const testId = `AUDIT-${Date.now()}`;
    const initialEvent = await protestStore.createProtest({
      id_kejadian: testId,
      kode_unras: `UR-AUDIT-${Date.now().toString().slice(-4)}`,
      tanggal: new Date().toISOString().split("T")[0],
      waktu_mulai: "09:00 WIB",
      lokasi: "Gedung DPR/MPR RI, Jakarta Pusat",
      isu_tuntutan: "Aksi Pengujian Audit Fungsional Siklus Status",
      status: "scheduled",
      urgency: "high"
    }, DEFAULT_OPERATOR);

    assert(initialEvent.status === "scheduled", "Initial event created with status 'scheduled'");
    assert(!initialEvent.is_archived, "Initial event is not archived");

    // Transition 1: scheduled -> ongoing
    const ongoingEvent = await protestStore.updateProtestStatus(
      initialEvent.id,
      "ongoing",
      "Massa telah tiba di lokasi titik unras",
      DEFAULT_OPERATOR
    );
    assert(ongoingEvent?.status === "ongoing", "Successfully transitioned to 'ongoing'");
    assert(ongoingEvent?.is_archived === false, "Event 'ongoing' has is_archived = false");

    // Transition 2: ongoing -> monitoring
    const monitoringEvent = await protestStore.updateProtestStatus(
      initialEvent.id,
      "monitoring",
      "Eskalasi mereda, pemantauan intensif kamera diaktifkan",
      DEFAULT_OPERATOR
    );
    assert(monitoringEvent?.status === "monitoring", "Successfully transitioned to 'monitoring'");
    assert(monitoringEvent?.is_archived === false, "Event 'monitoring' has is_archived = false");

    // Transition 3: monitoring -> completed (The exact bug reported by user!)
    const completedEvent = await protestStore.updateProtestStatus(
      initialEvent.id,
      "completed",
      "Massa telah membubarkan diri dengan tertib. Situasi kondusif.",
      DEFAULT_OPERATOR
    );
    assert(completedEvent?.status === "completed", "CRITICAL FIX VERIFIED: Event status transitioned to 'completed'");
    assert(completedEvent?.is_archived === true, "Completed event is correctly marked as archived (is_archived = true)");
    assert(completedEvent?.completed_at !== null, "Completed event has valid completed_at timestamp");
    assert(UUID_REGEX.test(completedEvent?.completed_by_id), "completed_by_id is valid UUID", completedEvent?.completed_by_id);

    // Transition 4: Audit Status History Trail
    const history = await protestStore.getStatusHistory(initialEvent.id);
    assert(history.length >= 3, `Status audit trail recorded ${history.length} transition logs`);
    const lastLog = history[0]; // ordered DESC
    assert(lastLog.to_status === "completed", "Last history entry records transition to 'completed'");
    assert(UUID_REGEX.test(lastLog.changed_by_id), "Status history changed_by_id is valid UUID", lastLog.changed_by_id);
    assert(Boolean(lastLog.reason), "Status history preserves required transition reason");

    // Transition 5: Reopen completed -> ongoing
    const reopenedEvent = await protestStore.updateProtestStatus(
      initialEvent.id,
      "ongoing",
      "Massa kembali berkumpul, status dibuka kembali",
      DEFAULT_OPERATOR
    );
    assert(reopenedEvent?.status === "ongoing", "Reopened event transitioned back to 'ongoing'");
    assert(reopenedEvent?.is_archived === false, "Reopened event is unarchived (is_archived = false)");

    // Transition 6: ongoing -> cancelled
    const cancelledEvent = await protestStore.updateProtestStatus(
      initialEvent.id,
      "cancelled",
      "Aksi dibatalkan oleh korlap",
      DEFAULT_OPERATOR
    );
    assert(cancelledEvent?.status === "cancelled", "Event transitioned to 'cancelled'");
    assert(cancelledEvent?.is_archived === true, "Cancelled event is archived (is_archived = true)");
  }

  // ---------------------------------------------------------------------------
  // 4. Audit Operator Reports Timeline
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST SUITE 4: Operator Reports & Situational Timeline ---");
  {
    const testId = `AUDIT-REP-${Date.now()}`;
    const protest = await protestStore.createProtest({
      id_kejadian: testId,
      kode_unras: `UR-REP-${Date.now().toString().slice(-4)}`,
      tanggal: new Date().toISOString().split("T")[0],
      lokasi: "Kawasan Monas, Jakarta",
      isu_tuntutan: "Aksi Pengujian Laporan Petugas",
      status: "ongoing"
    }, DEFAULT_OPERATOR);

    const report1 = await protestStore.addOperatorReport({
      protest_id: protest.id,
      report_type: "initial",
      content: "Petugas intelkam tiba di lokasi. Estimasi massa awal 150 orang.",
      crowd_estimate: 150
    }, DEFAULT_OPERATOR);

    assert(report1.content.includes("150 orang"), "Report 1 created with content");
    assert(UUID_REGEX.test(report1.author_id), "Report author_id is valid UUID", report1.author_id);
    assert(report1.author_role === "operator", "Report author_role is operator");

    const report2 = await protestStore.addOperatorReport({
      protest_id: protest.id,
      report_type: "progress",
      content: "Massa bertambah menjadi 300 orang. Orasi berjalan damai.",
      crowd_estimate: 300
    }, DEFAULT_OPERATOR);

    const reports = await protestStore.getOperatorReports(protest.id);
    assert(reports.length === 2, `Retrieved ${reports.length} reports successfully`);
    assert(reports[0].report_type === "progress", "Newest report is first in timeline (DESC order)");
  }

  // ---------------------------------------------------------------------------
  // 5. Audit CCTV Camera Linkage (Isolation from Protest Status)
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST SUITE 5: CCTV Camera Linkage & Status Isolation ---");
  {
    const testId = `AUDIT-CAM-${Date.now()}`;
    const protest = await protestStore.createProtest({
      id_kejadian: testId,
      kode_unras: `UR-CAM-${Date.now().toString().slice(-4)}`,
      tanggal: new Date().toISOString().split("T")[0],
      lokasi: "Simpang Sarinah Thamrin, Jakarta Pusat",
      isu_tuntutan: "Aksi Pengujian CCTV Linkage",
      status: "ongoing",
      validated_lat: -6.1875,
      validated_lng: 106.8241
    }, DEFAULT_OPERATOR);

    // Link a camera
    const link = await protestStore.linkCamera({
      protest_id: protest.id,
      camera_id: "cctv-sarinah-01",
      notes: "Kamera mengarah langsung ke gerbang utama",
      is_recommended: true
    }, DEFAULT_OPERATOR);

    assert(link !== null, "CCTV camera link established successfully");
    assert(UUID_REGEX.test(link.linked_by_id), "linked_by_id is valid UUID", link.linked_by_id);

    // Verify protest status did NOT change
    const checkProtest = await protestStore.getProtestById(protest.id);
    assert(checkProtest?.status === "ongoing", "Linking CCTV does not alter protest status (status remains 'ongoing')");

    // Unlink camera
    const unlinked = await protestStore.unlinkCamera(protest.id, "cctv-sarinah-01");
    assert(unlinked === true, "CCTV camera unlinked successfully");

    const linksAfter = await protestStore.getCameraLinks(protest.id);
    assert(linksAfter.length === 0, "Camera links list is empty after unlinking");
  }

  // ---------------------------------------------------------------------------
  // 6. Audit Location Intelligence & Review Status
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST SUITE 6: Location Intelligence & Verification Workflow ---");
  {
    const testId = `AUDIT-GEO-${Date.now()}`;
    const protest = await protestStore.createProtest({
      id_kejadian: testId,
      kode_unras: `UR-GEO-${Date.now().toString().slice(-4)}`,
      tanggal: new Date().toISOString().split("T")[0],
      lokasi: "Gedung Sate Bandung",
      isu_tuntutan: "Aksi Uji Geocoding",
      suggested_lat: -6.9024,
      suggested_lng: 107.6186,
      suggested_address: "Gedung Sate, Bandung, Jawa Barat",
      location_validation_status: "pending_validation"
    }, DEFAULT_OPERATOR);

    assert(protest.location_validation_status === "pending_validation", "Initial geocoding status is 'pending_validation'");

    // Operator verifies coordinates
    const verified = await protestStore.updateProtest(protest.id, {
      validated_lat: protest.suggested_lat,
      validated_lng: protest.suggested_lng,
      location_validation_status: "verified"
    }, DEFAULT_OPERATOR);

    assert(verified?.location_validation_status === "verified", "Location status updated to 'verified'");
    assert(verified?.has_coordinates === true, "has_coordinates flag is true");
  }

  // ---------------------------------------------------------------------------
  // 7. Audit Dashboard KPIs & Statistics
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST SUITE 7: Dashboard Statistics & KPIs ---");
  {
    const stats = await protestStore.getStats();
    assert(typeof stats.total_events === "number" && stats.total_events >= 0, "KPI: total_events is valid number", stats.total_events);
    assert(typeof stats.ongoing_events === "number" && stats.ongoing_events >= 0, "KPI: ongoing_events is valid number", stats.ongoing_events);
    assert(typeof stats.scheduled_events === "number" && stats.scheduled_events >= 0, "KPI: scheduled_events is valid number", stats.scheduled_events);
    assert(typeof stats.completed_events === "number" && stats.completed_events >= 0, "KPI: completed_events is valid number", stats.completed_events);
    assert(typeof stats.events_without_coords === "number" && stats.events_without_coords >= 0, "KPI: events_without_coords is valid number", stats.events_without_coords);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`=== AUDIT SUMMARY: ${passCount} PASSED, ${failCount} FAILED ===`);
  console.log("================================================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error("Audit script failed with unhandled exception:", err);
  process.exit(1);
});
