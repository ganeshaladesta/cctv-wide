/**
 * Test Suite: Source-Owned UNRAS Status Synchronization
 *
 * Verifies:
 * 1. Initial insert with status_sumber maps status_sumber and initial operator status
 * 2. Status transitions (Belum Berlangsung -> Sedang Berlangsung -> Selesai)
 * 3. Idempotent repeated sync (same status -> updated: 0)
 * 4. Unknown/unrecognized status is rejected/ignored (status not overwritten)
 * 5. Null or empty status is ignored
 * 6. Protection of operator-managed fields (status, urgency, coords, summary)
 * 7. Older registered incidents outside 7d window receive status update without re-insertion
 * 8. Older unregistered incidents are skipped
 * 9. Daily H-0 and Rolling 7-day share identical identity resolution & status mechanism
 * 10. Audit history logging in protest_status_history
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { protestStore } from "../src/lib/protest-store.ts";
import {
  processRolling7DaySync,
  processSameDaySync,
  calculateRolling7DayWindow,
  calculateSameDayWindow
} from "../src/lib/unras-rolling-sync.ts";
import { mapSourceStatus, mapSourceStatusToProtestStatus } from "../src/lib/unras-helpers.ts";

const DB_PATH = path.join(process.cwd(), "data", "pantau-nusantara.sqlite");

async function cleanupTestData() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const db = new DatabaseSync(DB_PATH);
      db.exec("DELETE FROM protest_status_history WHERE protest_id LIKE 'TEST-STATUS-%'");
      db.exec("DELETE FROM unras_identity_registry WHERE canonical_id LIKE 'TEST-STATUS-%'");
      db.exec("DELETE FROM protests WHERE id_kejadian LIKE 'TEST-STATUS-%'");
      db.close();
    } catch (e) {
      // ignore
    }
  }
}

async function runTests() {
  console.log("=== STARTING SOURCE STATUS SYNCHRONIZATION TESTS ===");

  await cleanupTestData();

  const rollingWin = calculateRolling7DayWindow();
  const sameDayWin = calculateSameDayWindow();
  const todayWib = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  // --------------------------------------------------------------------------
  // Test 1: Unit Mapping Functions
  // --------------------------------------------------------------------------
  console.log("\n[Test 1] Testing status mapping helpers...");
  assert.equal(mapSourceStatus("Belum Berlangsung"), "Belum Berlangsung");
  assert.equal(mapSourceStatus("sedang berlangsung"), "Sedang Berlangsung");
  assert.equal(mapSourceStatus("SELESAI"), "Selesai");
  assert.equal(mapSourceStatus("scheduled"), "Belum Berlangsung");
  assert.equal(mapSourceStatus("ongoing"), "Sedang Berlangsung");
  assert.equal(mapSourceStatus("completed"), "Selesai");
  assert.equal(mapSourceStatus(null), null);
  assert.equal(mapSourceStatus(""), null);
  assert.equal(mapSourceStatus("   "), null);
  assert.equal(mapSourceStatus("STATUS_RANDOM_XYZ"), null);

  assert.equal(mapSourceStatusToProtestStatus("Belum Berlangsung"), "scheduled");
  assert.equal(mapSourceStatusToProtestStatus("Sedang Berlangsung"), "ongoing");
  assert.equal(mapSourceStatusToProtestStatus("Selesai"), "completed");
  assert.equal(mapSourceStatusToProtestStatus(null), "scheduled");
  console.log("✓ Status mapping helpers work as expected");

  // --------------------------------------------------------------------------
  // Test 2: Initial Insert with status_sumber
  // --------------------------------------------------------------------------
  console.log("\n[Test 2] Testing initial insert with status_sumber...");
  const testId1 = `TEST-STATUS-001`;
  const insertPayload = {
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    events: [
      {
        "ID KEJADIAN": testId1,
        "ID UNRAS": "U9001",
        "TANGGAL": todayWib,
        "WAKTU DAN TGL KEJADIAN ISO": `${todayWib}T09:00:00+07:00`,
        "LOKASI": "Depan Gedung Bank Indonesia Test",
        "ISU": "Aksi Damai Uji Status Sumber",
        "ORGANISASI": "Aliansi Status Test",
        "status_sumber": "Belum Berlangsung"
      }
    ]
  };

  const res1 = await processRolling7DaySync(insertPayload, "power_automate", "Test Runner");
  assert.equal(res1.summary.inserted, 1, "Should insert 1 new record");
  assert.equal(res1.summary.updated, 0, "Updated should be 0 on insert");

  const protest1 = await protestStore.getProtestById(testId1);
  assert.ok(protest1, "Record should exist in database");
  assert.equal(protest1.status_sumber, "Belum Berlangsung");
  assert.equal(protest1.status, "scheduled");
  console.log("✓ Initial insert correctly stores status_sumber and initial status");

  // --------------------------------------------------------------------------
  // Test 3: Status Transition to "Sedang Berlangsung"
  // --------------------------------------------------------------------------
  console.log("\n[Test 3] Testing status transition to 'Sedang Berlangsung'...");
  const updatePayload1 = {
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    events: [
      {
        "ID KEJADIAN": testId1,
        "ID UNRAS": "U9001",
        "TANGGAL": todayWib,
        "WAKTU DAN TGL KEJADIAN ISO": `${todayWib}T09:00:00+07:00`,
        "LOKASI": "Depan Gedung Bank Indonesia Test",
        "ISU": "Aksi Damai Uji Status Sumber",
        "ORGANISASI": "Aliansi Status Test",
        "status_sumber": "Sedang Berlangsung"
      }
    ]
  };

  const res2 = await processRolling7DaySync(updatePayload1, "power_automate", "Test Runner");
  assert.equal(res2.summary.inserted, 0, "Should not re-insert existing record");
  assert.equal(res2.summary.updated, 1, "Should report 1 updated record");
  assert.equal(res2.summary.status_updated, 1, "Should report 1 status updated");

  const protestAfterOngoing = await protestStore.getProtestById(testId1);
  assert.equal(protestAfterOngoing.status_sumber, "Sedang Berlangsung");

  // Check audit log in protest_status_history
  const history1 = await protestStore.getStatusHistory(protestAfterOngoing.id);
  assert.ok(history1.length >= 1, "Audit history record should be created");
  assert.equal(history1[0].to_status, "ongoing");
  assert.ok(history1[0].reason.includes("Sedang Berlangsung"), "Audit reason should reflect source status");
  console.log("✓ Transition to 'Sedang Berlangsung' updated status_sumber and wrote audit log");

  // --------------------------------------------------------------------------
  // Test 4: Status Transition to "Selesai"
  // --------------------------------------------------------------------------
  console.log("\n[Test 4] Testing status transition to 'Selesai'...");
  const updatePayload2 = {
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    events: [
      {
        "ID KEJADIAN": testId1,
        "ID UNRAS": "U9001",
        "TANGGAL": todayWib,
        "WAKTU DAN TGL KEJADIAN ISO": `${todayWib}T09:00:00+07:00`,
        "LOKASI": "Depan Gedung Bank Indonesia Test",
        "ISU": "Aksi Damai Uji Status Sumber",
        "ORGANISASI": "Aliansi Status Test",
        "status_sumber": "Selesai"
      }
    ]
  };

  const res3 = await processRolling7DaySync(updatePayload2, "power_automate", "Test Runner");
  assert.equal(res3.summary.inserted, 0);
  assert.equal(res3.summary.updated, 1);
  assert.equal(res3.summary.status_updated, 1);

  const protestAfterCompleted = await protestStore.getProtestById(testId1);
  assert.equal(protestAfterCompleted.status_sumber, "Selesai");
  console.log("✓ Transition to 'Selesai' updated status_sumber");

  // --------------------------------------------------------------------------
  // Test 5: Idempotency (Repeated Sync with Same Status)
  // --------------------------------------------------------------------------
  console.log("\n[Test 5] Testing idempotency on repeated sync...");
  const res4 = await processRolling7DaySync(updatePayload2, "power_automate", "Test Runner");
  assert.equal(res4.summary.inserted, 0);
  assert.equal(res4.summary.updated, 0, "Repeated sync with same status must have updated: 0");
  assert.equal(res4.summary.status_updated, 0);

  const historyAfterRepeat = await protestStore.getStatusHistory(protestAfterCompleted.id);
  assert.equal(historyAfterRepeat.length, 2, "No duplicate audit history row added on unchanged status");
  console.log("✓ Repeated sync is strictly idempotent (updated: 0, no duplicate audit row)");

  // --------------------------------------------------------------------------
  // Test 6: Unknown or Unrecognized Status Rejected
  // --------------------------------------------------------------------------
  console.log("\n[Test 6] Testing rejection of unrecognized status...");
  const unknownPayload = {
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    events: [
      {
        "ID KEJADIAN": testId1,
        "ID UNRAS": "U9001",
        "TANGGAL": todayWib,
        "WAKTU DAN TGL KEJADIAN ISO": `${todayWib}T09:00:00+07:00`,
        "LOKASI": "Depan Gedung Bank Indonesia Test",
        "ISU": "Aksi Damai Uji Status Sumber",
        "ORGANISASI": "Aliansi Status Test",
        "status_sumber": "STATUS_TIDAK_DIKENAL"
      }
    ]
  };

  const resUnknown = await processRolling7DaySync(unknownPayload, "power_automate", "Test Runner");
  assert.equal(resUnknown.summary.updated, 0, "Unknown status must NOT trigger update");
  const protestAfterUnknown = await protestStore.getProtestById(testId1);
  assert.equal(protestAfterUnknown.status_sumber, "Selesai", "status_sumber must remain unchanged");
  console.log("✓ Unknown status safely ignored without overwriting data");

  // --------------------------------------------------------------------------
  // Test 7: Null or Empty Status Ignored
  // --------------------------------------------------------------------------
  console.log("\n[Test 7] Testing empty or null status ignored...");
  const emptyStatusPayload = {
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    events: [
      {
        "ID KEJADIAN": testId1,
        "ID UNRAS": "U9001",
        "TANGGAL": todayWib,
        "WAKTU DAN TGL KEJADIAN ISO": `${todayWib}T09:00:00+07:00`,
        "LOKASI": "Depan Gedung Bank Indonesia Test",
        "ISU": "Aksi Damai Uji Status Sumber",
        "ORGANISASI": "Aliansi Status Test",
        "status_sumber": ""
      }
    ]
  };

  const resEmpty = await processRolling7DaySync(emptyStatusPayload, "power_automate", "Test Runner");
  assert.equal(resEmpty.summary.updated, 0, "Empty status must NOT trigger update");
  const protestAfterEmpty = await protestStore.getProtestById(testId1);
  assert.equal(protestAfterEmpty.status_sumber, "Selesai", "status_sumber must remain unchanged");
  console.log("✓ Empty status safely ignored");

  // --------------------------------------------------------------------------
  // Test 8: Protection of Operator-Managed Fields
  // --------------------------------------------------------------------------
  console.log("\n[Test 8] Testing operator-managed fields remain untouched during status update...");
  // Simulate operator modifications on protest1
  await protestStore.updateProtest(testId1, {
    status: "monitoring",
    urgency: "critical",
    validated_lat: -6.175392,
    validated_lng: 106.827153,
    situation_summary: "Situasi kondusif, aparat berjaga di gerbang barat",
    actual_crowd_size: 450
  });

  const protestOpBefore = await protestStore.getProtestById(testId1);
  assert.equal(protestOpBefore.status, "monitoring");
  assert.equal(protestOpBefore.urgency, "critical");
  assert.equal(protestOpBefore.validated_lat, -6.175392);
  assert.equal(protestOpBefore.situation_summary, "Situasi kondusif, aparat berjaga di gerbang barat");

  // Sync comes in with a status transition to "Sedang Berlangsung"
  const syncToOngoing = {
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    events: [
      {
        "ID KEJADIAN": testId1,
        "ID UNRAS": "U9001",
        "TANGGAL": todayWib,
        "WAKTU DAN TGL KEJADIAN ISO": `${todayWib}T09:00:00+07:00`,
        "LOKASI": "Depan Gedung Bank Indonesia Test (Nama Berubah di Excel)",
        "ISU": "Aksi Damai Uji Status Sumber (Teks Baru)",
        "ORGANISASI": "Aliansi Status Test",
        "status_sumber": "Sedang Berlangsung"
      }
    ]
  };

  const resOpSync = await processRolling7DaySync(syncToOngoing, "power_automate", "Test Runner");
  assert.equal(resOpSync.summary.updated, 1, "Status update should succeed");

  const protestOpAfter = await protestStore.getProtestById(testId1);
  // status_sumber changed:
  assert.equal(protestOpAfter.status_sumber, "Sedang Berlangsung");
  // Operator fields strictly preserved:
  assert.equal(protestOpAfter.status, "monitoring", "Operator status must NOT be overwritten");
  assert.equal(protestOpAfter.urgency, "critical", "Operator urgency must NOT be overwritten");
  assert.equal(protestOpAfter.validated_lat, -6.175392, "Operator validated_lat must NOT be overwritten");
  assert.equal(protestOpAfter.validated_lng, 106.827153, "Operator validated_lng must NOT be overwritten");
  assert.equal(protestOpAfter.situation_summary, "Situasi kondusif, aparat berjaga di gerbang barat", "Operator situation_summary must NOT be overwritten");
  assert.equal(protestOpAfter.actual_crowd_size, 450, "Operator actual_crowd_size must NOT be overwritten");
  console.log("✓ All operator-managed fields remain 100% untouched when source status syncs");

  // --------------------------------------------------------------------------
  // Test 9: Older Registered Incident Outside 7-Day Window receives status update
  // --------------------------------------------------------------------------
  console.log("\n[Test 9] Testing older registered incident outside 7-day window receives status update...");
  const oldTestId = `TEST-STATUS-OLD-01`;
  // Create an incident dated 14 days ago directly in store
  const oldDateObj = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const oldDateWib = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(oldDateObj);

  await protestStore.upsertFromExcelBatch([
    {
      id_kejadian: oldTestId,
      kode_unras: "U9099",
      tanggal: oldDateWib,
      event_datetime: `${oldDateWib}T10:00:00+07:00`,
      lokasi: "Gedung Sate Lama Test",
      isu_tuntutan: "Aksi 14 Hari Lalu",
      status_sumber: "Belum Berlangsung"
    }
  ]);

  const oldBefore = await protestStore.getProtestById(oldTestId);
  assert.ok(oldBefore, "Older incident must exist in database");
  assert.equal(oldBefore.status_sumber, "Belum Berlangsung");

  // Now, incoming rolling 7-day sync contains this older incident with status "Selesai"
  const oldSyncPayload = {
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    events: [
      {
        "ID KEJADIAN": oldTestId,
        "ID UNRAS": "U9099",
        "TANGGAL": oldDateWib,
        "WAKTU DAN TGL KEJADIAN ISO": `${oldDateWib}T10:00:00+07:00`,
        "LOKASI": "Gedung Sate Lama Test",
        "ISU": "Aksi 14 Hari Lalu",
        "status_sumber": "Selesai"
      }
    ]
  };

  const resOldSync = await processRolling7DaySync(oldSyncPayload, "power_automate", "Test Runner");
  assert.equal(resOldSync.summary.inserted, 0, "Older incident must NOT be inserted again");
  assert.equal(resOldSync.summary.updated, 1, "Older incident status MUST be updated");

  const oldAfter = await protestStore.getProtestById(oldTestId);
  assert.equal(oldAfter.status_sumber, "Selesai", "Older incident status_sumber must update to Selesai");
  console.log("✓ Older registered incident outside 7d window successfully updated without re-insertion");

  // --------------------------------------------------------------------------
  // Test 10: Older Unregistered Incident Outside 7-Day Window is Skipped
  // --------------------------------------------------------------------------
  console.log("\n[Test 10] Testing older unregistered incident is skipped...");
  const unregisteredOldPayload = {
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    events: [
      {
        "ID KEJADIAN": "TEST-STATUS-OLD-UNREGISTERED",
        "ID UNRAS": "U9999",
        "TANGGAL": oldDateWib,
        "WAKTU DAN TGL KEJADIAN ISO": `${oldDateWib}T10:00:00+07:00`,
        "LOKASI": "Unregistered Old Place",
        "ISU": "Unregistered Old Issue",
        "status_sumber": "Selesai"
      }
    ]
  };

  const resUnregistered = await processRolling7DaySync(unregisteredOldPayload, "power_automate", "Test Runner");
  assert.equal(resUnregistered.summary.inserted, 0);
  assert.equal(resUnregistered.summary.updated, 0);
  assert.equal(resUnregistered.summary.skipped, 1);
  const unregisteredInDb = await protestStore.getProtestById("TEST-STATUS-OLD-UNREGISTERED");
  assert.equal(unregisteredInDb, null, "Must not be inserted");
  console.log("✓ Older unregistered incident is skipped cleanly");

  // --------------------------------------------------------------------------
  // Test 11: Shared Mechanism between Daily H-0 and Manual Rolling 7-day
  // --------------------------------------------------------------------------
  console.log("\n[Test 11] Testing shared mechanism in Daily H-0 sync...");
  const h0Payload = {
    period_start: sameDayWin.period_start,
    period_end: sameDayWin.period_end,
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    events: [
      {
        "ID KEJADIAN": testId1,
        "ID UNRAS": "U9001",
        "TANGGAL": todayWib,
        "WAKTU DAN TGL KEJADIAN ISO": `${todayWib}T09:00:00+07:00`,
        "LOKASI": "Depan Gedung Bank Indonesia Test",
        "ISU": "Aksi Damai Uji Status Sumber",
        "status_sumber": "Selesai"
      }
    ]
  };

  const resH0 = await processSameDaySync(h0Payload, "power_automate", "Scheduled Sync H-0");
  assert.equal(resH0.summary.inserted, 0, "No duplicate in H-0");
  assert.equal(resH0.summary.updated, 1, "Status updated in H-0");
  const protestAfterH0 = await protestStore.getProtestById(testId1);
  assert.equal(protestAfterH0.status_sumber, "Selesai");
  console.log("✓ Daily H-0 sync shares identical identity and status sync mechanism");

  await cleanupTestData();
  console.log("\n=== ALL SOURCE STATUS SYNCHRONIZATION TESTS PASSED ===");
}

runTests().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
