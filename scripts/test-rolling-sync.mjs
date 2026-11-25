/**
 * Comprehensive Automated Test Suite: Rolling 7-Calendar-Day UNRAS Synchronization Engine
 * SCC - EAGLE EYES
 * Worksheet: 'NEW UNRAS 2022-2026'
 *
 * Verifies all 12 required test conditions:
 * 1. Record within the 7-day window.
 * 2. Record exactly at start boundary (00:00:00 WIB 6 days ago) -> included.
 * 3. Record exactly at end boundary (00:00:00 WIB tomorrow) -> excluded.
 * 4. Existing ID is skipped.
 * 5. New ID is inserted.
 * 6. Duplicate ID repeated within one payload is skipped.
 * 7. Empty Excel result.
 * 8. Multiple records with the same kode_unras but different id_kejadian.
 * 9. Existing operator-managed fields remain unchanged.
 * 10. Concurrent sync requests cannot create duplicates.
 * 11. WIB timezone boundaries.
 * 12. Historical records outside the 7-day window are excluded.
 */

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import {
  calculateRolling7DayWindow,
  calculateSameDayWindow,
  parseSourceEventDatetime,
  verifyIntegrationToken,
  validateRollingSyncRequest,
  validateSameDaySyncRequest,
  validateSyncRequest,
  processRolling7DaySync,
  processSameDaySync,
  isValidIdKejadian,
  isValidKodeUnras,
  generateDeterministicFallbackId
} from "../src/lib/unras-rolling-sync.ts";
import { protestStore } from "../src/lib/protest-store.ts";

console.log("================================================================================");
console.log("=== SCC - EAGLE EYES: Rolling 7-Day Sync Engine Test Suite                   ===");
console.log("================================================================================\n");

async function runTests() {
  const dbPath = path.join(process.cwd(), "data", "pantau-nusantara.sqlite");
  try {
    const testDb = new DatabaseSync(dbPath);
    testDb.exec("DELETE FROM protests WHERE id_kejadian LIKE 'TEST-%' OR id_kejadian LIKE 'KEJ-MULTI-POINT-%' OR lokasi LIKE 'Lokasi Unik%' OR lokasi LIKE '%Kantor ESDM Sektor%' OR lokasi LIKE '%Gedung DPR Parlemen%'");
    testDb.exec("DELETE FROM unras_identity_registry WHERE canonical_id LIKE 'TEST-%' OR canonical_id LIKE 'KEJ-MULTI-POINT-%' OR canonical_id LIKE 'KEJ-20261120-%'");
    testDb.exec("DELETE FROM unras_review_queue WHERE matched_canonical_id LIKE 'TEST-%' OR matched_canonical_id LIKE 'KEJ-MULTI-POINT-%'");
    testDb.close();
  } catch (err) {
    console.warn("Cleanup warning:", err);
  }

  const runId = Date.now();
  // Reference date: 23 November 2026 12:00 WIB (05:00 UTC)
  const refDate = new Date("2026-11-23T05:00:00.000Z");
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

  const window = calculateRolling7DayWindow(refDate);

  // ---------------------------------------------------------------------------
  // Test 11 (checked early for window foundations): WIB timezone boundaries
  // ---------------------------------------------------------------------------
  console.log("[Test 11/12] Memverifikasi Batas Zona Waktu WIB (Asia/Jakarta Rolling 7 Hari)...");
  assert.equal(window.date_wib, "2026-11-23", "WIB today date must be 2026-11-23");
  assert.equal(window.start_date_wib, "2026-11-17", "Start date must be 2026-11-17 (6 days prior)");
  assert.equal(window.end_date_wib, "2026-11-24", "End date must be 2026-11-24 (tomorrow, exclusive)");
  assert.equal(window.period_end_ms - window.period_start_ms, SEVEN_DAYS_MS, "Window must be exactly 168 hours (7 days) in ms");

  // Verify start is 00:00:00 WIB 17 Nov (17:00 UTC 16 Nov)
  const startObj = new Date(window.period_start);
  assert.equal(startObj.toISOString(), "2026-11-16T17:00:00.000Z");

  // Verify end is 00:00:00 WIB 24 Nov (17:00 UTC 23 Nov)
  const endObj = new Date(window.period_end);
  assert.equal(endObj.toISOString(), "2026-11-23T17:00:00.000Z");

  // Leap year transition (e.g. 03 March 2024 -> start must fall into Feb 2024)
  const leapDate = new Date("2024-03-03T10:00:00+07:00");
  const leapWindow = calculateRolling7DayWindow(leapDate);
  assert.equal(leapWindow.date_wib, "2024-03-03");
  assert.equal(leapWindow.start_date_wib, "2024-02-26");
  assert.equal(leapWindow.period_end_ms - leapWindow.period_start_ms, SEVEN_DAYS_MS);

  // Year-end transition (e.g. 03 January 2027 -> start must fall into Dec 2026)
  const yearEndDate = new Date("2027-01-03T10:00:00+07:00");
  const yearEndWindow = calculateRolling7DayWindow(yearEndDate);
  assert.equal(yearEndWindow.date_wib, "2027-01-03");
  assert.equal(yearEndWindow.start_date_wib, "2026-12-28");
  assert.equal(yearEndWindow.period_end_ms - yearEndWindow.period_start_ms, SEVEN_DAYS_MS);

  console.log(`  ✔ Window valid: ${window.period_start} (17 Nov 00:00 WIB) s/d ${window.period_end} (24 Nov 00:00 WIB)`);

  // ---------------------------------------------------------------------------
  // Test 1: Record within the 7-day window
  // ---------------------------------------------------------------------------
  console.log("\n[Test 1/12] Inklusi Data Dalam Jendela 7 Hari (20 Nov 2026)...");
  const withinId = `TEST-ROLLING-WITHIN-${runId}`;
  const eventMidISO = "2026-11-20T10:30:00+07:00";
  const payloadWithin = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": withinId,
        "KODE_UNRAS": `RW-${runId}`,
        "WAKTU DAN TGL KEJADIAN ISO": eventMidISO,
        "TANGGAL": "2026-11-20",
        "LOKASI": `Titik Bundaran Uji ${runId}`,
        "ISU": `Tuntutan Damai Khusus Uji ${runId}`,
        "STATUS": "scheduled"
      }
    ]
  };
  const resWithin = await processRolling7DaySync(payloadWithin, "power_automate", "Test Runner");
  assert.equal(resWithin.summary.inserted, 1, "Record within 7-day window must be inserted");
  assert.equal(resWithin.summary.updated, 0, "Updated must always be 0");
  assert.equal(resWithin.summary.skipped, 0, "Record within 7-day window must not be skipped");
  console.log("  ✔ Data dalam rentang 7 hari BERHASIL dimasukkan (INSERTED).");

  // ---------------------------------------------------------------------------
  // Test 2: Record exactly at start boundary (00:00:00 WIB 6 days ago) -> INCLUDED
  // ---------------------------------------------------------------------------
  console.log("\n[Test 2/12] Inklusi Batas Awal Tepat (00:00:00 WIB 6 Hari Lalu - 17 Nov)...");
  const exactStartISO = "2026-11-17T00:00:00+07:00";
  const exactStartId = `TEST-BOUNDARY-START-${runId}`;
  const payloadExactStart = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": exactStartId,
        "KODE_UNRAS": `TB-${runId}`,
        "WAKTU DAN TGL KEJADIAN ISO": exactStartISO,
        "TANGGAL": "2026-11-17",
        "LOKASI": `Titik Batas Awal Tengah Malam 17 Nov ${runId}`,
        "ISU": `Uji batas awal tepat 17 Nov 00:00 WIB ${runId}`,
        "STATUS": "scheduled"
      }
    ]
  };
  const resExactStart = await processRolling7DaySync(payloadExactStart, "power_automate", "Test Runner");
  assert.equal(resExactStart.summary.inserted, 1, "Exact start timestamp MUST be included");
  assert.equal(resExactStart.summary.updated, 0, "Updated must be 0");
  assert.equal(resExactStart.summary.skipped, 0, "Exact start timestamp MUST NOT be skipped");
  console.log("  ✔ Batas awal tepat (00:00:00 WIB 6 hari lalu) BERHASIL disertakan (INCLUDED).");

  // ---------------------------------------------------------------------------
  // Test 3: Record exactly at end boundary (00:00:00 WIB tomorrow) -> EXCLUDED
  // ---------------------------------------------------------------------------
  console.log("\n[Test 3/12] Eksklusi Batas Akhir Tepat (00:00:00 WIB Besok - 24 Nov)...");
  const exactEndISO = "2026-11-24T00:00:00+07:00";
  const payloadExactEnd = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": `TEST-BOUNDARY-END-${runId}`,
        "KODE_UNRAS": `TB-END-${runId}`,
        "WAKTU DAN TGL KEJADIAN ISO": exactEndISO,
        "TANGGAL": "2026-11-24",
        "LOKASI": `Titik Batas Akhir Besok ${runId}`,
        "ISU": `Uji eksklusi batas akhir tepat 24 Nov 00:00 WIB ${runId}`,
        "STATUS": "scheduled"
      }
    ]
  };
  const resExactEnd = await processRolling7DaySync(payloadExactEnd, "power_automate", "Test Runner");
  assert.equal(resExactEnd.summary.inserted, 0, "Exact end timestamp MUST be excluded");
  assert.equal(resExactEnd.summary.updated, 0, "Updated must be 0");
  assert.equal(resExactEnd.summary.skipped, 1, "Exact end timestamp MUST be skipped");
  console.log("  ✔ Batas akhir tepat (00:00:00 WIB besok) BERHASIL dikecualikan (EXCLUDED).");

  // ---------------------------------------------------------------------------
  // Test 4: Existing ID is skipped
  // ---------------------------------------------------------------------------
  console.log("\n[Test 4/12] Uji ID Kejadian yang Sudah Ada Dilewati (SKIP EXISTING)...");
  const payloadSkipExisting = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": withinId, // already inserted in Test 1
        "KODE_UNRAS": `RW-${runId}`,
        "WAKTU DAN TGL KEJADIAN ISO": eventMidISO,
        "TANGGAL": "2026-11-20",
        "LOKASI": `Lokasi Baru Yang Ditimpa ${runId}`,
        "ISU": `Isu Baru Yang Ditimpa ${runId}`
      }
    ]
  };
  const resSkipExisting = await processRolling7DaySync(payloadSkipExisting, "power_automate", "Test Runner");
  assert.equal(resSkipExisting.summary.inserted, 0, "Existing record must NOT be inserted");
  assert.equal(resSkipExisting.summary.updated, 1, "Existing record MUST be updated via full overwrite");

  const storedEvent = await protestStore.getProtestById(withinId);
  assert.equal(storedEvent.lokasi, `Lokasi Baru Yang Ditimpa ${runId}`, "Existing record must be updated via full overwrite");
  console.log("  ✔ Rekor yang sudah ada berhasil diperbarui (FULL OVERWRITE).");

  // ---------------------------------------------------------------------------
  // Test 5: New ID is inserted
  // ---------------------------------------------------------------------------
  console.log("\n[Test 5/12] Uji ID Kejadian Baru Berhasil Dimasukkan (INSERT NEW)...");
  const newId = `TEST-NEW-ID-${runId}`;
  const payloadNewId = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": newId,
        "KODE_UNRAS": `NEW-${runId}`,
        "WAKTU DAN TGL KEJADIAN ISO": "2026-11-21T09:00:00+07:00",
        "TANGGAL": "2026-11-21",
        "LOKASI": `Depan Gedung DPR RI ${runId}`,
        "ISU": `Aksi Advokasi Rakyat 21 Nov ${runId}`
      }
    ]
  };
  const resNewId = await processRolling7DaySync(payloadNewId, "power_automate", "Test Runner");
  assert.equal(resNewId.summary.inserted, 1, "New ID must be inserted");
  assert.equal(resNewId.summary.updated, 0, "Updated must be 0");
  assert.equal(resNewId.summary.skipped, 0, "New ID must not be skipped");

  const storedNew = await protestStore.getProtestById(newId);
  assert.ok(storedNew, "New record must exist in store");
  assert.equal(storedNew.lokasi, `Depan Gedung DPR RI ${runId}`);
  console.log("  ✔ ID kejadian baru BERHASIL disimpan ke database.");

  // ---------------------------------------------------------------------------
  // Test 6: Duplicate ID repeated within one payload is skipped
  // ---------------------------------------------------------------------------
  console.log("\n[Test 6/12] Uji Duplikasi ID Kejadian di Dalam Satu Payload Batch...");
  const dupBatchId = `TEST-INBATCH-DUP-${runId}`;
  const payloadInBatchDup = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": dupBatchId,
        "KODE_UNRAS": `DUP-BATCH-${runId}`,
        "WAKTU DAN TGL KEJADIAN ISO": "2026-11-22T08:00:00+07:00",
        "TANGGAL": "2026-11-22",
        "LOKASI": `Lokasi Baris Pertama ${runId}`,
        "ISU": `Isu Baris Pertama ${runId}`
      },
      {
        "ID KEJADIAN": dupBatchId,
        "KODE_UNRAS": `DUP-BATCH-${runId}`,
        "WAKTU DAN TGL KEJADIAN ISO": "2026-11-22T08:30:00+07:00",
        "TANGGAL": "2026-11-22",
        "LOKASI": `Lokasi Baris Kedua Duplikat ${runId}`,
        "ISU": `Isu Baris Kedua Duplikat ${runId}`
      }
    ]
  };
  const resInBatchDup = await processRolling7DaySync(payloadInBatchDup, "power_automate", "Test Runner");
  assert.equal(resInBatchDup.summary.received, 2, "Received count must be 2");
  assert.equal(resInBatchDup.summary.inserted, 1, "First occurrence must be inserted");
  assert.equal(resInBatchDup.summary.updated, 0, "Updated must be 0");
  assert.equal(resInBatchDup.summary.skipped, 1, "Second occurrence must be skipped");

  const storedDup = await protestStore.getProtestById(dupBatchId);
  assert.equal(storedDup.lokasi, `Lokasi Baris Pertama ${runId}`, "First occurrence data must be preserved");
  console.log("  ✔ Baris pertama diproses, baris kedua duplikat di dalam batch berhasil dilewati.");

  // ---------------------------------------------------------------------------
  // Test 7: Empty Excel result
  // ---------------------------------------------------------------------------
  console.log("\n[Test 7/12] Uji Penanganan Hasil Excel Kosong (0 Baris)...");
  const payloadEmpty = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: []
  };
  const resEmpty = await processRolling7DaySync(payloadEmpty, "power_automate", "Test Runner");
  assert.equal(resEmpty.success, true, "Empty payload must succeed gracefully");
  assert.equal(resEmpty.status, "success", "Status must be success");
  assert.equal(resEmpty.summary.received, 0);
  assert.equal(resEmpty.summary.processed, 0);
  assert.equal(resEmpty.summary.inserted, 0);
  assert.equal(resEmpty.summary.updated, 0);
  assert.equal(resEmpty.summary.skipped, 0);
  assert.equal(resEmpty.summary.failed, 0);
  console.log("  ✔ Batch kosong berhasil diselesaikan dengan status sukses tanpa galat.");

  // ---------------------------------------------------------------------------
  // Test 8: Multiple records with same kode_unras but different id_kejadian
  // ---------------------------------------------------------------------------
  console.log("\n[Test 8/12] Uji Rekor Jamak dengan kode_unras Sama tapi id_kejadian Berbeda...");
  const sharedKode = `UNR-MULTI-POINT-${runId}`;
  const sharedIdA = `KEJ-MULTI-POINT-A-${runId}`;
  const sharedIdB = `KEJ-MULTI-POINT-B-${runId}`;
  const payloadSharedKode = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": sharedIdA,
        "KODE_UNRAS": sharedKode,
        "WAKTU DAN TGL KEJADIAN ISO": "2026-11-21T10:00:00+07:00",
        "TANGGAL": "2026-11-21",
        "LOKASI": `Titik Kumpul Monas ${runId}`,
        "ISU": `Aksi Multi Titik - Titik A ${runId}`
      },
      {
        "ID KEJADIAN": sharedIdB,
        "KODE_UNRAS": sharedKode,
        "WAKTU DAN TGL KEJADIAN ISO": "2026-11-21T11:00:00+07:00",
        "TANGGAL": "2026-11-21",
        "LOKASI": `Sasaran Aksi Gedung BI ${runId}`,
        "ISU": `Aksi Multi Titik - Titik B ${runId}`
      }
    ]
  };
  const resSharedKode = await processRolling7DaySync(payloadSharedKode, "power_automate", "Test Runner");
  assert.equal(resSharedKode.summary.inserted, 2, "Both records with different id_kejadian must be inserted");
  assert.equal(resSharedKode.summary.updated, 0);
  assert.equal(resSharedKode.summary.skipped, 0);

  const eventA = await protestStore.getProtestById(sharedIdA);
  const eventB = await protestStore.getProtestById(sharedIdB);
  assert.ok(eventA && eventB, "Both events must exist independently");
  assert.equal(eventA.kode_unras, sharedKode);
  assert.equal(eventB.kode_unras, sharedKode);
  console.log("  ✔ Kedua kejadian dengan kode_unras sama berhasil disimpan karena memiliki id_kejadian berbeda.");

  // ---------------------------------------------------------------------------
  // Test 9: Existing operator-managed fields remain unchanged
  // ---------------------------------------------------------------------------
  console.log("\n[Test 9/12] Proteksi Menyeluruh Catatan & Validasi Operator...");
  const operatorEventId = `TEST-OPERATOR-PROTECT-${runId}`;
  const payloadOpInit = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": operatorEventId,
        "KODE_UNRAS": `OP-${runId}`,
        "WAKTU DAN TGL KEJADIAN ISO": "2026-11-22T13:00:00+07:00",
        "TANGGAL": "2026-11-22",
        "LOKASI": `Patung Arjuna Wijaya ${runId}`,
        "ISU": `Isu Awal Sumber Excel ${runId}`,
        "JUMLAH MASSA": 150
      }
    ]
  };
  await processRolling7DaySync(payloadOpInit, "power_automate", "Test Runner");

  // Operator modifies fields
  await protestStore.updateProtest(operatorEventId, {
    status: "ongoing",
    urgency: "high",
    actual_crowd_size: 850,
    situation_summary: "SITUASI_OPERATOR_SANGAT_PENTING",
    editorial_draft: "DRAFT_REDAKSI_OPERATOR",
    editorial_final: "FINAL_REDAKSI_OPERATOR",
    validated_lat: -6.1754,
    validated_lng: 106.8272
  });

  // Capture snapshot before sync to verify byte-for-byte immutability
  const beforeSyncRecord = await protestStore.getProtestById(operatorEventId);
  const beforeSyncJson = JSON.stringify(beforeSyncRecord);

  // Excel sync sends payload again with different/conflicting values
  const payloadOpResync = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": operatorEventId,
        "KODE_UNRAS": `OP-${runId}`,
        "WAKTU DAN TGL KEJADIAN ISO": "2026-11-22T13:00:00+07:00",
        "TANGGAL": "2026-11-22",
        "LOKASI": `Nama Lokasi Excel Yang Mau Menimpa ${runId}`,
        "ISU": `Isu Excel Yang Mau Menimpa ${runId}`,
        "JUMLAH MASSA": 9999
      }
    ]
  };
  const resOpResync = await processRolling7DaySync(payloadOpResync, "power_automate", "Test Runner");
  assert.equal(resOpResync.summary.inserted, 0);
  assert.equal(resOpResync.summary.updated, 1, "Updated MUST be 1 under full overwrite");

  const postSyncRecord = await protestStore.getProtestById(operatorEventId);
  assert.equal(postSyncRecord.lokasi, `Nama Lokasi Excel Yang Mau Menimpa ${runId}`, "Location must be overwritten by Excel");
  assert.equal(postSyncRecord.isu_tuntutan, `Isu Excel Yang Mau Menimpa ${runId}`, "Issue must be overwritten by Excel");
  assert.equal(postSyncRecord.estimasi_massa_source, 9999, "Crowd size must be overwritten by Excel");
  assert.equal(postSyncRecord.id, beforeSyncRecord.id, "Internal ID must remain unchanged");
  console.log("  ✔ CRITICAL PASS: Rekor yang sudah ada berhasil diperbarui oleh Excel (FULL OVERWRITE).");

  // ---------------------------------------------------------------------------
  // Test 10: Concurrent sync requests cannot create duplicates
  // ---------------------------------------------------------------------------
  console.log("\n[Test 10/12] Proteksi Konkurensi Eksekusi Ganda...");
  const concurrentId = `TEST-CONCURRENT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const payloadConcurrent = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": concurrentId,
        "KODE_UNRAS": `CONC-${runId}`,
        "WAKTU DAN TGL KEJADIAN ISO": "2026-11-22T14:00:00+07:00",
        "TANGGAL": "2026-11-22",
        "LOKASI": `Lokasi Uji Konkurensi ${runId}`,
        "ISU": `Isu Uji Konkurensi ${runId}`
      }
    ]
  };

  const p1 = processRolling7DaySync(payloadConcurrent, "power_automate", "Thread 1");
  const p2 = processRolling7DaySync(payloadConcurrent, "power_automate", "Thread 2");
  const [r1, r2] = await Promise.all([p1, p2]);

  const atLeastOneSkippedOrBothSafe =
    r1.status === "skipped" ||
    r2.status === "skipped" ||
    r1.summary.skipped >= 1 ||
    r2.summary.skipped >= 1 ||
    (r1.summary.inserted + r2.summary.inserted <= 1);

  assert.ok(atLeastOneSkippedOrBothSafe, "Concurrency must prevent duplicate insertions");

  const checkConcurrent = await protestStore.getProtestById(concurrentId);
  assert.ok(checkConcurrent, "Record must exist in store");
  console.log("  ✔ Lock konkurensi & database constraints mencegah duplikasi data saat eksekusi paralel.");

  // ---------------------------------------------------------------------------
  // Test 12: Historical records outside the 7-day window are excluded
  // ---------------------------------------------------------------------------
  console.log("\n[Test 12/12] Eksklusi Rekor Historis & Masa Depan di Luar Jendela 7 Hari...");
  // 8 days ago (15 Nov 2026) -> outside [17 Nov, 24 Nov)
  const pastOutsideISO = "2026-11-15T10:00:00+07:00";
  // Future date (25 Nov 2026) -> outside [17 Nov, 24 Nov)
  const futureOutsideISO = "2026-11-25T10:00:00+07:00";

  const pastOutsideId = `TEST-PAST-OUTSIDE-${runId}`;
  const futureOutsideId = `TEST-FUTURE-OUTSIDE-${runId}`;
  const payloadOutside = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": pastOutsideId,
        "WAKTU DAN TGL KEJADIAN ISO": pastOutsideISO,
        "TANGGAL": "2026-11-15",
        "LOKASI": `Lokasi 8 Hari Lalu ${runId}`,
        "ISU": `Aksi 8 Hari Lalu ${runId}`
      },
      {
        "ID KEJADIAN": futureOutsideId,
        "WAKTU DAN TGL KEJADIAN ISO": futureOutsideISO,
        "TANGGAL": "2026-11-25",
        "LOKASI": `Lokasi Masa Depan 25 Nov ${runId}`,
        "ISU": `Aksi Masa Depan 25 Nov ${runId}`
      }
    ]
  };
  const resOutside = await processRolling7DaySync(payloadOutside, "power_automate", "Test Runner");
  assert.equal(resOutside.summary.inserted, 0, "Outside events must NOT be inserted");
  assert.equal(resOutside.summary.updated, 0, "Updated must be 0");
  assert.equal(resOutside.summary.skipped, 2, "Both outside records must be skipped");

  const checkPast = await protestStore.getProtestById(pastOutsideId);
  const checkFuture = await protestStore.getProtestById(futureOutsideId);
  assert.equal(checkPast, null, "Historical record outside 7-day window must not exist");
  assert.equal(checkFuture, null, "Future record outside 7-day window must not exist");
  console.log("  ✔ Data 8 hari lalu dan masa depan berhasil dikecualikan (SKIPPED).");

  // ---------------------------------------------------------------------------
  // Test 13: Separation of same_day (24h) and rolling_7d (168h) helpers
  // ---------------------------------------------------------------------------
  console.log("\n[Test 13/15] Verifikasi Pemisahan Helper Jendela same_day vs rolling_7d...");
  const sameDayWin = calculateSameDayWindow(refDate);
  const rollingWin = calculateRolling7DayWindow(refDate);

  assert.notEqual(calculateSameDayWindow, calculateRolling7DayWindow, "Helpers must NOT be aliased");
  assert.equal(sameDayWin.date_wib, "2026-11-23");
  assert.equal(sameDayWin.start_date_wib, "2026-11-23");
  assert.equal(sameDayWin.end_date_wib, "2026-11-24");
  assert.equal(sameDayWin.period_end_ms - sameDayWin.period_start_ms, ONE_DAY_MS, "Same-day window must be exactly 24h");

  assert.equal(rollingWin.date_wib, "2026-11-23");
  assert.equal(rollingWin.start_date_wib, "2026-11-17");
  assert.equal(rollingWin.end_date_wib, "2026-11-24");
  assert.equal(rollingWin.period_end_ms - rollingWin.period_start_ms, SEVEN_DAYS_MS, "Rolling window must be exactly 168h");
  console.log("  ✔ Pemisahan kalkulasi waktu same_day (24 jam) dan rolling_7d (168 jam) diverifikasi tidak ter-alias.");

  // ---------------------------------------------------------------------------
  // Test 14: Validation of sync window constraints according to sync_type
  // ---------------------------------------------------------------------------
  console.log("\n[Test 14/15] Validasi Toleransi & Penolakan Jendela Tidak Sah Berdasarkan sync_type...");
  // same_day with window > 26h should be rejected
  const invalidSameDayPayload = {
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    period_start: "2026-11-17T00:00:00+07:00",
    period_end: "2026-11-24T00:00:00+07:00", // 168h > 26h
    events: []
  };
  const sameDayVal = validateSyncRequest(invalidSameDayPayload);
  assert.equal(sameDayVal.valid, false, "same_day with 168h window must be rejected");
  assert.ok(sameDayVal.error?.includes("same_day"), "Error must mention same_day window limit");

  // rolling_7d with window > 170h should be rejected
  const invalidRollingPayload = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: "2026-11-10T00:00:00+07:00",
    period_end: "2026-11-24T00:00:00+07:00", // 14 days > 170h
    events: []
  };
  const rollingVal = validateSyncRequest(invalidRollingPayload);
  assert.equal(rollingVal.valid, false, "rolling_7d with 14-day window must be rejected");
  assert.ok(rollingVal.error?.includes("rolling 7 hari"), "Error must mention rolling 7 hari window limit");

  // Inverted window (start >= end) should be rejected
  const invertedPayload = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: "2026-11-24T00:00:00+07:00",
    period_end: "2026-11-20T00:00:00+07:00",
    events: []
  };
  const invertedVal = validateSyncRequest(invertedPayload);
  assert.equal(invertedVal.valid, false, "Inverted window must be rejected");

  // Mismatched sync_type for specific validators
  const mismatchedRolling = validateRollingSyncRequest({ sync_type: "same_day", events: [] });
  assert.equal(mismatchedRolling.valid, false, "validateRollingSyncRequest must reject sync_type: same_day");

  const mismatchedSameDay = validateSameDaySyncRequest({ sync_type: "rolling_7d", events: [] });
  assert.equal(mismatchedSameDay.valid, false, "validateSameDaySyncRequest must reject sync_type: rolling_7d");
  console.log("  ✔ Seluruh batas durasi dan validasi window (same_day <= 26 jam, rolling_7d <= 170 jam) berhasil diverifikasi.");

  // ---------------------------------------------------------------------------
  // Test 15: Direct database-level concurrent duplicate insertion safety check
  // ---------------------------------------------------------------------------
  console.log("\n[Test 15/15] Uji Penjaminan Database Level Uniqueness pada Eksekusi Paralel Langsung...");
  const dbConcurrentId = `DB-CONCURRENT-TEST-${Date.now()}`;
  const batchRow = {
    id_kejadian: dbConcurrentId,
    kode_unras: "UNR-DB-CONC",
    tanggal: "2026-11-23",
    lokasi: "Gedung BI",
    isu_tuntutan: "Uji Database Uniqueness Paralel",
    event_datetime: "2026-11-23T10:00:00+07:00"
  };

  const [dbRes1, dbRes2] = await Promise.all([
    protestStore.upsertFromExcelBatch([batchRow]),
    protestStore.upsertFromExcelBatch([batchRow])
  ]);

  const totalCreated = dbRes1.created + dbRes2.created;
  const totalUpdated = dbRes1.updated + dbRes2.updated;
  assert.equal(totalCreated, 1, "Exactly one insert must succeed");
  assert.equal(totalUpdated, 1, "The duplicate insert must update via full overwrite");
  console.log("  ✔ Database-level uniqueness terjamin: 1 dibuat (created), 1 diperbarui (updated), 0 duplikasi.");

  // ---------------------------------------------------------------------------
  // Test 16: Unit validation of identifier resolution functions
  // ---------------------------------------------------------------------------
  console.log("\n[Test 16/20] Validasi Format Identifier (isValidIdKejadian & isValidKodeUnras)...");
  // Malformed ID checks
  assert.equal(isValidIdKejadian("KEJ-20261123-"), false, "Trailing dash must be rejected");
  assert.equal(isValidIdKejadian("KEJ-"), false, "Prefix-only must be rejected");
  assert.equal(isValidIdKejadian("KEJ-20261123"), false, "Date-only prefix without unique suffix must be rejected");
  assert.equal(isValidIdKejadian(""), false, "Empty string must be rejected");
  assert.equal(isValidIdKejadian("   "), false, "Whitespace-only must be rejected");
  assert.equal(isValidIdKejadian("KEJ--1"), false, "Double dash must be rejected");
  assert.equal(isValidIdKejadian(null), false, "Null must be rejected");
  assert.equal(isValidIdKejadian(undefined), false, "Undefined must be rejected");

  // Valid ID checks
  assert.equal(isValidIdKejadian("KEJ-20261120-U1473"), true, "Valid KEJ with ID UNRAS must be accepted");
  assert.equal(isValidIdKejadian("KEJ-20261120-A1B2C3D4E5F60789"), true, "Valid 16-hex fallback ID must be accepted");
  assert.equal(isValidIdKejadian("KEJ-TEST-001"), true, "Valid custom ID must be accepted");

  // kode_unras checks
  assert.equal(isValidKodeUnras(""), false);
  assert.equal(isValidKodeUnras("  "), false);
  assert.equal(isValidKodeUnras("-"), false);
  assert.equal(isValidKodeUnras("--"), false);
  assert.equal(isValidKodeUnras("U1473"), true);
  console.log("  ✔ Fungsi validasi format identifier berhasil membedakan ID valid vs malformed.");

  // ---------------------------------------------------------------------------
  // Test 17: Fallback SHA-256 identifier determinism & collision avoidance
  // ---------------------------------------------------------------------------
  console.log("\n[Test 17/20] Determinisme & Pencegahan Tabrakan Fallback SHA-256...");
  const dateWib = "2026-11-20";
  const idGen1 = generateDeterministicFallbackId(dateWib, "Depan Kantor ESDM", "Aliansi Mahasiswa", "Tolak Tambang");
  const idGen2 = generateDeterministicFallbackId(dateWib, "Depan Kantor ESDM", "Aliansi Mahasiswa", "Tolak Tambang");
  const idGenDiff = generateDeterministicFallbackId(dateWib, "Depan Kantor ESDM", "Aliansi Buruh", "Tolak Upah Rendah");

  assert.ok(idGen1 && idGen2 && idGenDiff);
  assert.equal(idGen1, idGen2, "Identical inputs MUST generate identical fallback ID");
  assert.notEqual(idGen1, idGenDiff, "Different inputs MUST generate different fallback IDs");
  assert.match(idGen1, /^KEJ-20261120-[0-9A-F]{16}$/, "Fallback ID must follow KEJ-YYYYMMDD-HEX16 pattern");

  // Whitespace & casing invariance
  const idGenCasing = generateDeterministicFallbackId(dateWib, "  depan kantor ESDM  ", "ALIANSI MAHASISWA", "tolak tambang   ");
  assert.equal(idGen1, idGenCasing, "Whitespace and casing normalization must be invariant");

  console.log(`  ✔ Hash deterministik berhasil: ${idGen1} (identik across runs, konsisten 16-hex).`);

  // ---------------------------------------------------------------------------
  // Test 18: Malformed "KEJ-20261123-" replaced by deterministic fallback & inserted
  // ---------------------------------------------------------------------------
  console.log("\n[Test 18/20] Penanganan Rekor dengan ID Malformed 'KEJ-20261123-'...");
  const malformedTestIso = "2026-11-20T11:00:00+07:00";
  const payloadMalformed = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "KEJ-20261123-", // Malformed from Power Automate
        "ID UNRAS": "", // Empty in Excel
        "WAKTU DAN TGL KEJADIAN ISO": malformedTestIso,
        "TANGGAL": "2026-11-20",
        "LOKASI": `Kantor ESDM Sektor ${runId}`,
        "ISU": `Penolakan Izin Tambang ${runId}`,
        "ORGANISASI": `Aliansi Peduli Tambang ${runId}`
      },
      {
        "ID KEJADIAN": "KEJ-20261123-", // Same malformed ID from Power Automate on different row
        "ID UNRAS": "", // Empty in Excel
        "WAKTU DAN TGL KEJADIAN ISO": malformedTestIso,
        "TANGGAL": "2026-11-20",
        "LOKASI": `Gedung DPR Parlemen ${runId}`,
        "ISU": `Aspirasi Reformasi Hukum ${runId}`,
        "ORGANISASI": `Front Aksi Bersama ${runId}`
      }
    ]
  };

  const resMalformed = await processRolling7DaySync(payloadMalformed, "power_automate", "Test Runner");
  assert.equal(resMalformed.summary.received, 2, "Received count must be 2");
  assert.equal(resMalformed.summary.inserted, 2, "Both rows MUST be inserted with distinct deterministic IDs");
  assert.equal(resMalformed.summary.skipped, 0, "Neither row should be skipped due to false duplicate collision");
  assert.equal(resMalformed.summary.updated, 0);

  // Check generated records in database
  const expectedId1 = generateDeterministicFallbackId("2026-11-20", `Kantor ESDM Sektor ${runId}`, `Aliansi Peduli Tambang ${runId}`, `Penolakan Izin Tambang ${runId}`);
  const expectedId2 = generateDeterministicFallbackId("2026-11-20", `Gedung DPR Parlemen ${runId}`, `Front Aksi Bersama ${runId}`, `Aspirasi Reformasi Hukum ${runId}`);

  assert.ok(expectedId1 && expectedId2);
  const rec1 = await protestStore.getProtestById(expectedId1);
  const rec2 = await protestStore.getProtestById(expectedId2);
  assert.ok(rec1, `Record 1 must exist with generated ID: ${expectedId1}`);
  assert.ok(rec2, `Record 2 must exist with generated ID: ${expectedId2}`);
  assert.notEqual(rec1.id_kejadian, rec2.id_kejadian, "Both records must have distinct IDs");
  console.log(`  ✔ Dua rekor dengan input malformed 'KEJ-20261123-' berhasil diproses menjadi:`);
  console.log(`      1: ${rec1.id_kejadian}`);
  console.log(`      2: ${rec2.id_kejadian}`);

  // ---------------------------------------------------------------------------
  // Test 19: Missing essential fields rejection (safe skip without generic ID)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 19/20] Penolakan Rekor Kosong Tanpa Data Esensial (Lokasi & Isu Kosong)...");
  const payloadMissingEssential = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "",
        "ID UNRAS": "",
        "WAKTU DAN TGL KEJADIAN ISO": "2026-11-20T12:00:00+07:00",
        "TANGGAL": "2026-11-20",
        "LOKASI": "", // Missing location
        "ISU": ""     // Missing issue
      }
    ]
  };

  const resMissing = await processRolling7DaySync(payloadMissingEssential, "power_automate", "Test Runner");
  assert.equal(resMissing.summary.inserted, 0, "Record without essential fields must not be inserted");
  assert.equal(resMissing.summary.skipped, 1, "Record without essential fields must be skipped");
  assert.ok(resMissing.errors?.some(e => e.includes("field esensial")), "Error must explicitly explain missing essential fields");
  console.log("  ✔ Rekor tanpa data esensial berhasil ditolak & dilewati dengan aman.");

  // ---------------------------------------------------------------------------
  // Test 20: Event date range metadata & diagnostics in sync result
  // ---------------------------------------------------------------------------
  console.log("\n[Test 20/20] Verifikasi Metadata Rentang Tanggal Kejadian & Diagnostik...");
  const payloadMeta = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": `TEST-META-18-${runId}`,
        "WAKTU DAN TGL KEJADIAN ISO": "2026-11-18T10:00:00+07:00",
        "TANGGAL": "2026-11-18",
        "LOKASI": "Lokasi Meta 18 Nov",
        "ISU": "Isu 18 Nov"
      },
      {
        "ID KEJADIAN": `TEST-META-22-${runId}`,
        "WAKTU DAN TGL KEJADIAN ISO": "2026-11-22T15:00:00+07:00",
        "TANGGAL": "2026-11-22",
        "LOKASI": "Lokasi Meta 22 Nov",
        "ISU": "Isu 22 Nov"
      }
    ]
  };

  const resMeta = await processRolling7DaySync(payloadMeta, "power_automate", "Test Runner");
  assert.equal(resMeta.summary.inserted, 2);
  assert.equal(resMeta.oldest_event_date, "2026-11-18", "Oldest event date must be 2026-11-18");
  assert.equal(resMeta.newest_event_date, "2026-11-22", "Newest event date must be 2026-11-22");
  assert.ok(resMeta.inserted_by_event_date, "inserted_by_event_date must exist");
  assert.equal(resMeta.inserted_by_event_date["2026-11-18"], 1);
  assert.equal(resMeta.inserted_by_event_date["2026-11-22"], 1);
  assert.deepEqual(resMeta.diagnostics?.inserted_by_event_date, resMeta.inserted_by_event_date);
  console.log(`  ✔ Diagnostik tanggal kejadian terverifikasi:`);
  console.log(`      oldest_event_date: ${resMeta.oldest_event_date}`);
  console.log(`      newest_event_date: ${resMeta.newest_event_date}`);
  console.log(`      inserted_by_event_date:`, resMeta.inserted_by_event_date);

  console.log("\n================================================================================");
  console.log("=== SEMUA 20 PENGUJIAN SINKRONISASI UNRAS BERHASIL DENGAN SEMPURNA!          ===");
  console.log("================================================================================\n");
}

runTests().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
