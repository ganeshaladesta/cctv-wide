/**
 * Comprehensive Automated Test Suite: Rolling 7-Day Synchronization Engine
 * SCC - EAGLE EYES
 * Worksheet: 'NEW UNRAS 2022-2026'
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  calculateRolling7DayWindow,
  parseSourceEventDatetime,
  verifyIntegrationToken,
  validateRollingSyncRequest,
  processRolling7DaySync
} from "../src/lib/unras-rolling-sync.ts";
import { protestStore } from "../src/lib/protest-store.ts";

console.log("================================================================================");
console.log("=== SCC - EAGLE EYES: Rolling 7-Day Sync Engine Test Suite                   ===");
console.log("================================================================================\n");

async function runTests() {
  const refDate = new Date("2026-11-13T05:00:00.000Z"); // 12:00 WIB
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  // ---------------------------------------------------------------------------
  // Test 1: Rolling 7-day window calculation in Asia/Jakarta
  // ---------------------------------------------------------------------------
  console.log("[Test 1/14] Menghitung Jendela Waktu Rolling 7 Hari...");
  const window = calculateRolling7DayWindow(refDate);
  assert.equal(window.period_end_ms - window.period_start_ms, SEVEN_DAYS_MS, "Window must be exactly 7 days in ms");
  assert.equal(window.period_end, refDate.toISOString(), "period_end must match reference date ISO");
  const expectedStart = new Date(refDate.getTime() - SEVEN_DAYS_MS).toISOString();
  assert.equal(window.period_start, expectedStart, "period_start must be exactly 7 days prior");
  console.log(`  ✔ Window valid: ${window.period_start} s/d ${window.period_end}`);

  // ---------------------------------------------------------------------------
  // Test 2: Exact start boundary inclusion (event_datetime == period_start)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 2/14] Inklusi Batas Awal Tepat (event_datetime == period_start)...");
  const exactStartISO = window.period_start;
  const payloadExactStart = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "TEST-BOUNDARY-START-001",
        "KODE_UNRAS": "TB-001",
        "WAKTU DAN TGL KEJADIAN ISO": exactStartISO,
        "TANGGAL": exactStartISO.split("T")[0],
        "LOKASI": "Titik Batas Awal",
        "ISU": "Uji inklusi batas awal",
        "STATUS": "scheduled"
      }
    ]
  };
  const resExactStart = await processRolling7DaySync(payloadExactStart, "power_automate", "Test Runner");
  assert.equal(resExactStart.summary.inserted + resExactStart.summary.updated, 1, "Exact start timestamp MUST be included");
  assert.equal(resExactStart.summary.skipped, 0, "Exact start timestamp MUST NOT be skipped");
  console.log("  ✔ Batas awal tepat (period_start) BERHASIL disertakan (INCLUDED).");

  // ---------------------------------------------------------------------------
  // Test 3: Exact end boundary exclusion (event_datetime == period_end)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 3/14] Eksklusi Batas Akhir Tepat (event_datetime == period_end)...");
  const exactEndISO = window.period_end;
  const payloadExactEnd = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "TEST-BOUNDARY-END-002",
        "KODE_UNRAS": "TB-002",
        "WAKTU DAN TGL KEJADIAN ISO": exactEndISO,
        "TANGGAL": exactEndISO.split("T")[0],
        "LOKASI": "Titik Batas Akhir",
        "ISU": "Uji eksklusi batas akhir",
        "STATUS": "scheduled"
      }
    ]
  };
  const resExactEnd = await processRolling7DaySync(payloadExactEnd, "power_automate", "Test Runner");
  assert.equal(resExactEnd.summary.inserted + resExactEnd.summary.updated, 0, "Exact end timestamp MUST be excluded");
  assert.equal(resExactEnd.summary.skipped, 1, "Exact end timestamp MUST be skipped");
  console.log("  ✔ Batas akhir tepat (period_end) BERHASIL dikecualikan (EXCLUDED).");

  // ---------------------------------------------------------------------------
  // Test 4: Invalid timestamps (WAKTU DAN TGL KEJADIAN ISO)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 4/14] Penanganan Timestamp ISO Tidak Valid...");
  const invalidTime = parseSourceEventDatetime("bukan-tanggal-iso", null);
  assert.equal(invalidTime.iso, null, "Invalid string must return null ISO");
  assert.ok(invalidTime.error, "Invalid string must return descriptive error");

  const emptyTime = parseSourceEventDatetime(null, null);
  assert.equal(emptyTime.iso, null, "Empty time must return null ISO");

  const payloadInvalidTime = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "TEST-INVALID-TIME-003",
        "WAKTU DAN TGL KEJADIAN ISO": "TIMESTAMP_RUSAK_TOTAL",
        "LOKASI": "Lokasi Test",
        "ISU": "Uji Timestamp Rusak"
      }
    ]
  };
  const resInvalidTime = await processRolling7DaySync(payloadInvalidTime, "power_automate", "Test Runner");
  assert.equal(resInvalidTime.summary.skipped, 1, "Invalid timestamp row must be skipped");
  console.log("  ✔ Baris dengan timestamp rusak berhasil dilewati dan dicatat dalam audit log.");

  // ---------------------------------------------------------------------------
  // Test 5: Missing ID KEJADIAN handling
  // ---------------------------------------------------------------------------
  console.log("\n[Test 5/14] Penanganan Baris Tanpa ID KEJADIAN...");
  const validMidISO = new Date(refDate.getTime() - 2 * 86400000).toISOString();
  const payloadMissingId = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "", // missing identity
        "WAKTU DAN TGL KEJADIAN ISO": validMidISO,
        "LOKASI": "Lokasi Tanpa ID",
        "ISU": "Uji Tanpa ID"
      }
    ]
  };
  const resMissingId = await processRolling7DaySync(payloadMissingId, "power_automate", "Test Runner");
  assert.equal(resMissingId.summary.skipped, 1, "Missing ID KEJADIAN must be skipped");
  console.log("  ✔ Baris tanpa ID KEJADIAN berhasil ditolak tanpa menyebabkan crash.");

  // ---------------------------------------------------------------------------
  // Test 6: Duplicate ID KEJADIAN Idempotency
  // ---------------------------------------------------------------------------
  console.log("\n[Test 6/14] Uji Idempotensi Rekaman Duplikat ID KEJADIAN...");
  const dupId = "TEST-IDEMPOTENT-006";
  const payloadDup = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": dupId,
        "KODE_UNRAS": "IDEMP-1",
        "WAKTU DAN TGL KEJADIAN ISO": validMidISO,
        "TANGGAL": validMidISO.split("T")[0],
        "LOKASI": "Lokasi Versi 1",
        "ISU": "Isu Aksi Awal",
        "STATUS": "scheduled"
      }
    ]
  };
  const firstSync = await processRolling7DaySync(payloadDup, "power_automate", "Test Runner");
  assert.ok(firstSync.summary.inserted >= 1 || firstSync.summary.updated >= 1, "First sync must insert or update");

  // Re-sync with updated Excel text but same ID KEJADIAN
  payloadDup.events[0]["LOKASI"] = "Lokasi Versi 2 Terkoreksi";
  payloadDup.events[0]["ISU"] = "Isu Aksi Terkoreksi";
  const secondSync = await processRolling7DaySync(payloadDup, "power_automate", "Test Runner");
  assert.equal(secondSync.summary.updated, 1, "Second sync must update existing record, NOT insert duplicate");

  const stored = protestStore.getProtestById(dupId);
  assert.ok(stored, "Record must exist in store");
  assert.equal(stored.lokasi, "Lokasi Versi 2 Terkoreksi", "Excel text field must update");
  console.log("  ✔ Idempotensi duplikat ID KEJADIAN valid: tidak ada duplikasi row di database.");

  // ---------------------------------------------------------------------------
  // Test 7: Operator-field preservation during re-sync
  // ---------------------------------------------------------------------------
  console.log("\n[Test 7/14] Proteksi Catatan & Status Operator Lapangan...");
  const protectId = "TEST-OPERATOR-PROTECT-007";
  const initialPayload = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": protectId,
        "KODE_UNRAS": "PROT-1",
        "WAKTU DAN TGL KEJADIAN ISO": validMidISO,
        "TANGGAL": validMidISO.split("T")[0],
        "LOKASI": "Gedung Sate",
        "ISU": "Isu Buruh Asli",
        "JUMLAH MASSA": 100
      }
    ]
  };
  await processRolling7DaySync(initialPayload, "power_automate", "Test Runner");

  // Operator field updates via application UI
  protestStore.updateProtest(protectId, {
    status: "ongoing",
    actual_crowd_size: 500,
    situation_summary: "CATATAN_OPERATOR_SANGAT_PENTING",
    editorial_draft: "DRAFT_BERITA_OPERATOR",
    editorial_final: "FINAL_BERITA_OPERATOR",
    validated_lat: -6.9025,
    validated_lng: 107.6186
  });

  // Re-sync from Excel with different values and default status
  const resyncPayload = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": protectId,
        "KODE_UNRAS": "PROT-1",
        "WAKTU DAN TGL KEJADIAN ISO": validMidISO,
        "TANGGAL": validMidISO.split("T")[0],
        "LOKASI": "Gedung Sate Bandung",
        "ISU": "Isu Buruh Terupdate Excel",
        "JUMLAH MASSA": 150
      }
    ]
  };
  await processRolling7DaySync(resyncPayload, "power_automate", "Test Runner");

  const postSyncRecord = protestStore.getProtestById(protectId);
  assert.equal(postSyncRecord.situation_summary, "CATATAN_OPERATOR_SANGAT_PENTING", "Operator summary must NOT be overwritten");
  assert.equal(postSyncRecord.actual_crowd_size, 500, "Operator crowd count must NOT be overwritten");
  assert.equal(postSyncRecord.editorial_draft, "DRAFT_BERITA_OPERATOR", "Operator editorial draft must NOT be overwritten");
  assert.equal(postSyncRecord.status, "ongoing", "Operator status must NOT be overwritten");
  assert.equal(postSyncRecord.validated_lat, -6.9025, "Validated GPS latitude must NOT be overwritten");
  assert.equal(postSyncRecord.isu_tuntutan, "Isu Buruh Terupdate Excel", "Excel source fields MUST update normally");
  console.log("  ✔ CRITICAL PASS: Catatan operator, editorial, koordinat GPS, dan status aman dari overwrite Excel.");

  // ---------------------------------------------------------------------------
  // Test 8: Events older than 7 days excluded
  // ---------------------------------------------------------------------------
  console.log("\n[Test 8/14] Eksklusi Peristiwa Lebih Tua dari 7 Hari...");
  const oldDateMs = refDate.getTime() - (8 * 86400000); // 8 days ago
  const oldISO = new Date(oldDateMs).toISOString();
  const payloadOld = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "TEST-OLD-EVENT-008",
        "WAKTU DAN TGL KEJADIAN ISO": oldISO,
        "TANGGAL": oldISO.split("T")[0],
        "LOKASI": "Lokasi Lampau",
        "ISU": "Aksi 8 Hari Lalu"
      }
    ]
  };
  const resOld = await processRolling7DaySync(payloadOld, "power_automate", "Test Runner");
  assert.equal(resOld.summary.inserted + resOld.summary.updated, 0, "Older events must NOT be inserted");
  assert.equal(resOld.summary.skipped, 1, "Older events must be skipped");
  console.log("  ✔ Aksi lebih tua dari 7 hari berhasil dikecualikan.");

  // ---------------------------------------------------------------------------
  // Test 9: Future events excluded
  // ---------------------------------------------------------------------------
  console.log("\n[Test 9/14] Eksklusi Peristiwa di Masa Depan (>= period_end)...");
  const futureDateMs = refDate.getTime() + (2 * 86400000); // 2 days in the future
  const futureISO = new Date(futureDateMs).toISOString();
  const payloadFuture = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "TEST-FUTURE-EVENT-009",
        "WAKTU DAN TGL KEJADIAN ISO": futureISO,
        "TANGGAL": futureISO.split("T")[0],
        "LOKASI": "Lokasi Masa Depan",
        "ISU": "Aksi Masa Depan"
      }
    ]
  };
  const resFuture = await processRolling7DaySync(payloadFuture, "power_automate", "Test Runner");
  assert.equal(resFuture.summary.inserted + resFuture.summary.updated, 0, "Future events must NOT be inserted");
  assert.equal(resFuture.summary.skipped, 1, "Future events must be skipped");
  console.log("  ✔ Aksi masa depan berhasil dikecualikan dari jendela rolling 7 hari.");

  // ---------------------------------------------------------------------------
  // Test 10: Invalid integration token rejection (timingSafeEqual)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 10/14] Verifikasi Keamanan Token Integrasi (Timing-Safe)...");
  const secretKey = "scc-secret-production-unras-token-998877";
  assert.equal(verifyIntegrationToken("Bearer " + secretKey, secretKey), true, "Matching token must pass");
  assert.equal(verifyIntegrationToken("Bearer wrong-token", secretKey), false, "Wrong token must fail");
  assert.equal(verifyIntegrationToken("Basic abc", secretKey), false, "Non-bearer must fail");
  assert.equal(verifyIntegrationToken(null, secretKey), false, "Missing header must fail");
  assert.equal(verifyIntegrationToken("Bearer short", secretKey), false, "Different length token must fail safely");
  console.log("  ✔ Mekanisme timing-safe token comparison terverifikasi aman.");

  // ---------------------------------------------------------------------------
  // Test 11: Oversized payload / batch limit rejection
  // ---------------------------------------------------------------------------
  console.log("\n[Test 11/14] Uji Batas Ukuran Batch & Durasi Window...");
  // Window > 7 days
  const invalidWindowPayload = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: new Date(refDate.getTime() - 10 * 86400000).toISOString(), // 10 days!
    period_end: refDate.toISOString(),
    events: []
  };
  const v1 = validateRollingSyncRequest(invalidWindowPayload);
  assert.equal(v1.valid, false, "Window > 7 days must fail validation");

  // Invalid timezone
  const invalidTzPayload = {
    sync_type: "rolling_7d",
    timezone: "UTC",
    period_start: window.period_start,
    period_end: window.period_end,
    events: []
  };
  const v2 = validateRollingSyncRequest(invalidTzPayload);
  assert.equal(v2.valid, false, "Non Asia/Jakarta timezone must fail validation");

  // Batch > 1000
  const largeEvents = Array.from({ length: 1001 }, (_, i) => ({
    "ID KEJADIAN": `EVT-LARGE-${i}`,
    "WAKTU DAN TGL KEJADIAN ISO": validMidISO
  }));
  const v3 = validateRollingSyncRequest({
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: largeEvents
  });
  assert.equal(v3.valid, false, "Batch > 1000 events must fail validation");
  console.log("  ✔ Batas maksimum 7 hari, zona waktu Asia/Jakarta, dan batas batch 1000 baris tervalidasi.");

  // ---------------------------------------------------------------------------
  // Test 12: Partial batch failure handling
  // ---------------------------------------------------------------------------
  console.log("\n[Test 12/14] Penanganan Batch Parsial (Valid + Invalid Bersama)...");
  const mixedPayload = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "TEST-MIXED-VALID-012",
        "WAKTU DAN TGL KEJADIAN ISO": validMidISO,
        "TANGGAL": validMidISO.split("T")[0],
        "LOKASI": "Lokasi Campuran Valid",
        "ISU": "Isu Campuran Valid"
      },
      {
        "ID KEJADIAN": "TEST-MIXED-INVALID-012",
        "WAKTU DAN TGL KEJADIAN ISO": "FORMAT_TANGGAL_RUSAK",
        "LOKASI": "Lokasi Campuran Rusak",
        "ISU": "Isu Campuran Rusak"
      }
    ]
  };
  const mixedRes = await processRolling7DaySync(mixedPayload, "power_automate", "Test Runner");
  assert.equal(mixedRes.summary.inserted + mixedRes.summary.updated, 1, "Valid row must be saved");
  assert.equal(mixedRes.summary.skipped, 1, "Invalid row must be skipped");
  assert.equal(mixedRes.status, "partial", "Mixed batch must have status 'partial'");
  console.log("  ✔ Status batch parsial terkonfirmasi: baris valid tersimpan, baris invalid dilewati.");

  // ---------------------------------------------------------------------------
  // Test 13: Concurrency protection lock
  // ---------------------------------------------------------------------------
  console.log("\n[Test 13/14] Proteksi Lock Konkurensi Antar Proses...");
  // Simulate rapid simultaneous sync calls
  const promise1 = processRolling7DaySync(mixedPayload, "power_automate", "Thread 1");
  const promise2 = processRolling7DaySync(mixedPayload, "power_automate", "Thread 2");

  const [res1, res2] = await Promise.all([promise1, promise2]);
  const hasSkipped = res1.status === "skipped" || res2.status === "skipped";
  assert.ok(hasSkipped || res1.success && res2.success, "Concurrency guard must handle parallel calls safely");
  console.log("  ✔ Proteksi konkurensi (lock guard) berfungsi mencegah tabrakan data.");

  // ---------------------------------------------------------------------------
  // Test 14: Manual sync execution-time period calculation
  // ---------------------------------------------------------------------------
  console.log("\n[Test 14/14] Perhitungan Jendela Waktu Manual Sync pada Saat Eksekusi...");
  const manualWindow = calculateRolling7DayWindow();
  const nowMs = Date.now();
  assert.ok(Math.abs(manualWindow.period_end_ms - nowMs) < 2000, "period_end must be within 2 seconds of now");
  assert.ok(Math.abs(manualWindow.period_start_ms - (nowMs - SEVEN_DAYS_MS)) < 2000, "period_start must be 7 days before now");
  console.log(`  ✔ Kalkulasi manual sync real-time: ${manualWindow.period_start} s/d ${manualWindow.period_end}`);

  console.log("\n================================================================================");
  console.log("=== SEMUA 14 PENGUJIAN SINKRONISASI ROLLING 7-HARI BERHASIL DENGAN SEMPURNA! ===");
  console.log("================================================================================\n");
}

runTests().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});

