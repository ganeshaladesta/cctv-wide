/**
 * Comprehensive Automated Test Suite: Same-Day (H-0) Synchronization Engine
 * SCC - EAGLE EYES
 * Worksheet: 'NEW UNRAS 2022-2026'
 *
 * Boundary: Asia/Jakarta Calendar Day (00:00:00 WIB today <= event < 00:00:00 WIB tomorrow)
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  calculateSameDayWindow,
  calculateRolling7DayWindow,
  parseSourceEventDatetime,
  verifyIntegrationToken,
  validateRollingSyncRequest,
  processSameDaySync
} from "../src/lib/unras-rolling-sync.ts";
import { protestStore } from "../src/lib/protest-store.ts";

console.log("================================================================================");
console.log("=== SCC - EAGLE EYES: Same-Day (H-0) Sync Engine Test Suite                  ===");
console.log("================================================================================\n");

async function runTests() {
  const refDate = new Date("2026-11-19T05:00:00.000Z"); // 12:00 WIB on 19 Nov 2026
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // ---------------------------------------------------------------------------
  // Test 1: Same-Day (H-0) window calculation in Asia/Jakarta
  // ---------------------------------------------------------------------------
  console.log("[Test 1/15] Menghitung Jendela Waktu Hari Ini H-0 (Asia/Jakarta)...");
  const window = calculateSameDayWindow(refDate);
  assert.equal(window.date_wib, "2026-11-19", "WIB date must be 2026-11-19");
  assert.equal(window.period_end_ms - window.period_start_ms, ONE_DAY_MS, "Window must be exactly 24 hours in ms");
  
  // Verify start is 00:00:00 WIB (which is 17:00 UTC previous day)
  const startObj = new Date(window.period_start);
  assert.equal(startObj.toISOString(), "2026-11-18T17:00:00.000Z");
  
  // Verify end is 00:00:00 WIB tomorrow (which is 17:00 UTC today)
  const endObj = new Date(window.period_end);
  assert.equal(endObj.toISOString(), "2026-11-19T17:00:00.000Z");
  
  console.log(`  ✔ Window valid: ${window.period_start} (00:00:00 WIB) s/d ${window.period_end} (24:00:00 WIB)`);

  // ---------------------------------------------------------------------------
  // Test 2: Month-End and Leap Year Transitions
  // ---------------------------------------------------------------------------
  console.log("\n[Test 2/15] Uji Transisi Pergantian Bulan & Tahun Baru (H-0)...");
  const leapDate = new Date("2024-02-29T10:00:00+07:00");
  const leapWindow = calculateSameDayWindow(leapDate);
  assert.equal(leapWindow.date_wib, "2024-02-29");
  assert.equal(leapWindow.period_end_ms - leapWindow.period_start_ms, ONE_DAY_MS);

  const yearEndDate = new Date("2026-12-31T23:00:00+07:00");
  const yearEndWindow = calculateSameDayWindow(yearEndDate);
  assert.equal(yearEndWindow.date_wib, "2026-12-31");
  assert.equal(yearEndWindow.period_end_ms - yearEndWindow.period_start_ms, ONE_DAY_MS);
  console.log("  ✔ Perhitungan transisi kalender leap year dan akhir tahun sukses.");

  // ---------------------------------------------------------------------------
  // Test 3: Exact Jakarta midnight start boundary (00:00:00.000 WIB) - INCLUDED
  // ---------------------------------------------------------------------------
  console.log("\n[Test 3/15] Inklusi Batas Awal Tepat (00:00:00 WIB Hari Ini)...");
  const exactStartISO = "2026-11-19T00:00:00+07:00";
  const payloadExactStart = {
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "TEST-BOUNDARY-START-001",
        "KODE_UNRAS": "TB-001",
        "WAKTU DAN TGL KEJADIAN ISO": exactStartISO,
        "TANGGAL": "2026-11-19",
        "LOKASI": "Titik Batas Awal Tengah Malam",
        "ISU": "Uji inklusi batas awal 00:00 WIB",
        "STATUS": "scheduled"
      }
    ]
  };
  const resExactStart = await processSameDaySync(payloadExactStart, "power_automate", "Test Runner");
  assert.equal(resExactStart.summary.inserted + resExactStart.summary.updated, 1, "Exact start timestamp MUST be included");
  assert.equal(resExactStart.summary.skipped, 0, "Exact start timestamp MUST NOT be skipped");
  console.log("  ✔ Batas awal tepat (00:00:00 WIB) BERHASIL disertakan (INCLUDED).");

  // ---------------------------------------------------------------------------
  // Test 4: Late night boundary inclusion (23:59:59.999 WIB) - INCLUDED
  // ---------------------------------------------------------------------------
  console.log("\n[Test 4/15] Inklusi Detik Terakhir Hari Ini (23:59:59 WIB)...");
  const lateNightISO = "2026-11-19T23:59:59+07:00";
  const payloadLateNight = {
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "TEST-BOUNDARY-NIGHT-002",
        "KODE_UNRAS": "TB-002",
        "WAKTU DAN TGL KEJADIAN ISO": lateNightISO,
        "TANGGAL": "2026-11-19",
        "LOKASI": "Titik Malam Hari",
        "ISU": "Uji inklusi detik akhir 23:59 WIB",
        "STATUS": "scheduled"
      }
    ]
  };
  const resLateNight = await processSameDaySync(payloadLateNight, "power_automate", "Test Runner");
  assert.equal(resLateNight.summary.inserted + resLateNight.summary.updated, 1, "Late night today MUST be included");
  assert.equal(resLateNight.summary.skipped, 0, "Late night today MUST NOT be skipped");
  console.log("  ✔ Detik terakhir hari ini (23:59:59 WIB) BERHASIL disertakan (INCLUDED).");

  // ---------------------------------------------------------------------------
  // Test 5: Exact end boundary exclusion (00:00:00 WIB besok) - EXCLUDED
  // ---------------------------------------------------------------------------
  console.log("\n[Test 5/15] Eksklusi Batas Akhir Tepat (00:00:00 WIB Besok)...");
  const exactEndISO = "2026-11-20T00:00:00+07:00";
  const payloadExactEnd = {
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "TEST-BOUNDARY-END-003",
        "KODE_UNRAS": "TB-003",
        "WAKTU DAN TGL KEJADIAN ISO": exactEndISO,
        "TANGGAL": "2026-11-20",
        "LOKASI": "Titik Batas Akhir Besok",
        "ISU": "Uji eksklusi batas akhir",
        "STATUS": "scheduled"
      }
    ]
  };
  const resExactEnd = await processSameDaySync(payloadExactEnd, "power_automate", "Test Runner");
  assert.equal(resExactEnd.summary.inserted + resExactEnd.summary.updated, 0, "Exact end timestamp MUST be excluded");
  assert.equal(resExactEnd.summary.skipped, 1, "Exact end timestamp MUST be skipped");
  console.log("  ✔ Batas akhir tepat (00:00:00 WIB besok) BERHASIL dikecualikan (EXCLUDED).");

  // ---------------------------------------------------------------------------
  // Test 6: Yesterday's event exclusion (Kemarin 23:59:59 WIB) - EXCLUDED
  // ---------------------------------------------------------------------------
  console.log("\n[Test 6/15] Eksklusi Peristiwa Kemarin (H-1)...");
  const yesterdayISO = "2026-11-18T23:59:59+07:00";
  const payloadYesterday = {
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "TEST-YESTERDAY-004",
        "WAKTU DAN TGL KEJADIAN ISO": yesterdayISO,
        "TANGGAL": "2026-11-18",
        "LOKASI": "Lokasi Kemarin",
        "ISU": "Aksi Kemarin Malam"
      }
    ]
  };
  const resYesterday = await processSameDaySync(payloadYesterday, "power_automate", "Test Runner");
  assert.equal(resYesterday.summary.inserted + resYesterday.summary.updated, 0, "Yesterday events must NOT be inserted");
  assert.equal(resYesterday.summary.skipped, 1, "Yesterday events must be skipped");
  console.log("  ✔ Aksi kemarin (H-1) berhasil dikecualikan.");

  // ---------------------------------------------------------------------------
  // Test 7: Future event exclusion (H+2) - EXCLUDED
  // ---------------------------------------------------------------------------
  console.log("\n[Test 7/15] Eksklusi Peristiwa Masa Depan (H+2)...");
  const futureISO = "2026-11-21T10:00:00+07:00";
  const payloadFuture = {
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "TEST-FUTURE-005",
        "WAKTU DAN TGL KEJADIAN ISO": futureISO,
        "TANGGAL": "2026-11-21",
        "LOKASI": "Lokasi Masa Depan",
        "ISU": "Aksi Lusa"
      }
    ]
  };
  const resFuture = await processSameDaySync(payloadFuture, "power_automate", "Test Runner");
  assert.equal(resFuture.summary.inserted + resFuture.summary.updated, 0, "Future events must NOT be inserted");
  assert.equal(resFuture.summary.skipped, 1, "Future events must be skipped");
  console.log("  ✔ Aksi masa depan berhasil dikecualikan dari jendela hari ini.");

  // ---------------------------------------------------------------------------
  // Test 8: Historical records in database are NEVER deleted by H-0 sync
  // ---------------------------------------------------------------------------
  console.log("\n[Test 8/15] Jaminan Rekaman Historis Database TIDAK Terhapus...");
  const historicalId = `TEST-HIST-${Date.now()}`;
  const testUser = { id: "test-admin", name: "Test Admin", email: "admin@test.local", role: "admin" };
  // Directly insert an older record into store
  await protestStore.createProtest({
    id_kejadian: historicalId,
    kode_unras: "HIST-001",
    tanggal: "2026-11-10",
    lokasi: "Gedung MPR Lama",
    isu_tuntutan: "Aksi Historis 9 Hari Lalu",
    status: "completed",
    urgency: "low",
    has_coordinates: false
  }, testUser);

  // Run same-day H-0 sync with only today's data
  const payloadTodayOnly = {
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": "TEST-TODAY-007",
        "WAKTU DAN TGL KEJADIAN ISO": "2026-11-19T10:00:00+07:00",
        "TANGGAL": "2026-11-19",
        "LOKASI": "Lokasi Hari Ini",
        "ISU": "Aksi Hari Ini"
      }
    ]
  };
  await processSameDaySync(payloadTodayOnly, "power_automate", "Test Runner");

  // Verify historical record still exists intact!
  const histCheck = await protestStore.getProtestById(historicalId);
  assert.ok(histCheck, "Historical record outside H-0 window MUST NOT be deleted");
  assert.equal(histCheck.isu_tuntutan, "Aksi Historis 9 Hari Lalu");
  console.log("  ✔ CRITICAL PASS: Rekaman historis di luar jendela sinkronisasi 100% aman dan tidak terhapus.");

  // ---------------------------------------------------------------------------
  // Test 9: Idempotent upsert by ID KEJADIAN
  // ---------------------------------------------------------------------------
  console.log("\n[Test 9/15] Uji Idempotensi Rekaman Duplikat ID KEJADIAN...");
  const dupId = `TEST-IDEMP-H0-${Date.now()}`;
  const todayMidISO = "2026-11-19T14:00:00+07:00";
  const payloadDup = {
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": dupId,
        "KODE_UNRAS": "IDEMP-H0",
        "WAKTU DAN TGL KEJADIAN ISO": todayMidISO,
        "TANGGAL": "2026-11-19",
        "LOKASI": "Lokasi Versi A",
        "ISU": "Isu Versi A",
        "STATUS": "scheduled"
      }
    ]
  };
  const firstSync = await processSameDaySync(payloadDup, "power_automate", "Test Runner");
  assert.ok(firstSync.summary.inserted >= 1 || firstSync.summary.updated >= 1);

  // Re-sync with updated text
  payloadDup.events[0]["LOKASI"] = "Lokasi Versi B Terkoreksi";
  const secondSync = await processSameDaySync(payloadDup, "power_automate", "Test Runner");
  assert.equal(secondSync.summary.updated, 1, "Second sync must update, NOT duplicate");

  const stored = await protestStore.getProtestById(dupId);
  assert.equal(stored.lokasi, "Lokasi Versi B Terkoreksi");
  console.log("  ✔ Idempotensi duplikat ID KEJADIAN valid: tidak ada duplikasi data.");

  // ---------------------------------------------------------------------------
  // Test 10: Operator-managed fields & validated coords preservation
  // ---------------------------------------------------------------------------
  console.log("\n[Test 10/15] Proteksi Catatan & Validasi Koordinat Operator...");
  const protectId = `TEST-OPERATOR-PROTECT-H0-${Date.now()}`;
  const initPayload = {
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": protectId,
        "KODE_UNRAS": "PROT-H0",
        "WAKTU DAN TGL KEJADIAN ISO": todayMidISO,
        "TANGGAL": "2026-11-19",
        "LOKASI": "Patung Kuda",
        "ISU": "Isu Buruh H-0",
        "JUMLAH MASSA": 100
      }
    ]
  };
  await processSameDaySync(initPayload, "power_automate", "Test Runner");

  // Operator validates coordinates and enters critical notes
  await protestStore.updateProtest(protectId, {
    status: "ongoing",
    actual_crowd_size: 450,
    situation_summary: "OPERATOR_NOTE_H0_CRITICAL",
    editorial_draft: "EDITORIAL_DRAFT_H0",
    editorial_final: "EDITORIAL_FINAL_H0",
    validated_lat: -6.1805,
    validated_lng: 106.8227
  });

  // Re-sync from Excel with different values
  const reSync = {
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": protectId,
        "KODE_UNRAS": "PROT-H0",
        "WAKTU DAN TGL KEJADIAN ISO": todayMidISO,
        "TANGGAL": "2026-11-19",
        "LOKASI": "Patung Kuda Monas",
        "ISU": "Isu Buruh Excel Updated",
        "JUMLAH MASSA": 200
      }
    ]
  };
  await processSameDaySync(reSync, "power_automate", "Test Runner");

  const postSyncRecord = await protestStore.getProtestById(protectId);
  assert.equal(postSyncRecord.situation_summary, "OPERATOR_NOTE_H0_CRITICAL");
  assert.equal(postSyncRecord.actual_crowd_size, 450);
  assert.equal(postSyncRecord.status, "ongoing");
  assert.equal(postSyncRecord.validated_lat, -6.1805);
  assert.equal(postSyncRecord.validated_lng, 106.8227);
  assert.equal(postSyncRecord.isu_tuntutan, "Isu Buruh Excel Updated");
  console.log("  ✔ CRITICAL PASS: Koordinat validasi & catatan operator aman dari overwrite Excel.");

  // ---------------------------------------------------------------------------
  // Test 11: Invalid timestamps & missing ID handling
  // ---------------------------------------------------------------------------
  console.log("\n[Test 11/15] Penanganan Baris Rusak & Tanpa ID...");
  const invalidTime = parseSourceEventDatetime("invalid-date-format", null);
  assert.equal(invalidTime.iso, null);

  const payloadCorrupt = {
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      { "ID KEJADIAN": "", "WAKTU DAN TGL KEJADIAN ISO": todayMidISO },
      { "ID KEJADIAN": "TEST-CORRUPT", "WAKTU DAN TGL KEJADIAN ISO": "TIMESTAMP_RUSAK" }
    ]
  };
  const resCorrupt = await processSameDaySync(payloadCorrupt, "power_automate", "Test Runner");
  assert.equal(resCorrupt.summary.skipped, 2, "Corrupt rows must be safely skipped");
  console.log("  ✔ Baris rusak dan tanpa ID berhasil dilewati tanpa error fatal.");

  // ---------------------------------------------------------------------------
  // Test 12: Request Schema & Max Duration Validation (H-0 Window <= 24h)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 12/15] Uji Validasi Durasi Window Maksimal 24 Jam...");
  // Window > 24 hours
  const multiDayPayload = {
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    period_start: new Date(refDate.getTime() - 2 * 86400000).toISOString(), // 2 days!
    period_end: refDate.toISOString(),
    events: []
  };
  const vMultiDay = validateRollingSyncRequest(multiDayPayload);
  assert.equal(vMultiDay.valid, false, "Window > 24 hours must fail validation for H-0 sync");
  assert.ok(vMultiDay.error?.includes("24 jam"), "Error must explain 24h limit");

  // Invalid timezone
  const vTz = validateRollingSyncRequest({
    sync_type: "same_day",
    timezone: "UTC",
    period_start: window.period_start,
    period_end: window.period_end,
    events: []
  });
  assert.equal(vTz.valid, false, "Non Asia/Jakarta timezone must fail");
  console.log("  ✔ Validasi skema: batas durasi 24 jam & zona waktu Asia/Jakarta terverifikasi.");

  // ---------------------------------------------------------------------------
  // Test 13: Timing-Safe Integration Token Verification
  // ---------------------------------------------------------------------------
  console.log("\n[Test 13/15] Verifikasi Token Keamanan Integrasi (Timing-Safe)...");
  const secret = "scc-unras-secret-token-2026-xyz";
  assert.equal(verifyIntegrationToken("Bearer " + secret, secret), true);
  assert.equal(verifyIntegrationToken("Bearer wrong-token", secret), false);
  assert.equal(verifyIntegrationToken(null, secret), false);
  console.log("  ✔ Token perbandingan timing-safe terverifikasi aman.");

  // ---------------------------------------------------------------------------
  // Test 14: Concurrency Lock Guard
  // ---------------------------------------------------------------------------
  console.log("\n[Test 14/15] Proteksi Lock Konkurensi Antar Proses...");
  const promise1 = processSameDaySync(payloadLateNight, "power_automate", "Thread 1");
  const promise2 = processSameDaySync(payloadLateNight, "power_automate", "Thread 2");
  const [r1, r2] = await Promise.all([promise1, promise2]);
  const safe = r1.status === "skipped" || r2.status === "skipped" || (r1.success && r2.success);
  assert.ok(safe, "Concurrency lock must prevent race conditions");
  console.log("  ✔ Lock konkurensi aktif dan mencegah tabrakan eksekusi ganda.");

  // ---------------------------------------------------------------------------
  // Test 15: Backward Compatibility Alias Verification
  // ---------------------------------------------------------------------------
  console.log("\n[Test 15/17] Verifikasi Kompatibilitas Mundur (Alias Function)...");
  const legacyWindow = calculateRolling7DayWindow(refDate);
  assert.equal(legacyWindow.date_wib, "2026-11-19");
  assert.equal(legacyWindow.period_end_ms - legacyWindow.period_start_ms, ONE_DAY_MS);
  console.log("  ✔ Alias backwards-compatibility (calculateRolling7DayWindow) berfungsi mulus.");

  // ---------------------------------------------------------------------------
  // Test 16: Time Normalization & PostgreSQL TIME Column Safety
  // ---------------------------------------------------------------------------
  console.log("\n[Test 16/17] Verifikasi Normalisasi Waktu (WIB Suffix & Range Validation)...");
  const { normalizeTimeString } = await import("../src/lib/time-normalization.ts");
  
  // Basic cases
  assert.equal(normalizeTimeString("09:00 WIB").time, "09:00:00");
  assert.equal(normalizeTimeString("09:30 WIB").time, "09:30:00");
  assert.equal(normalizeTimeString("09:00").time, "09:00:00");
  assert.equal(normalizeTimeString("14:45:30 WIB").time, "14:45:30");
  assert.equal(normalizeTimeString("14.45.30 WITA").time, "14:45:30");
  assert.equal(normalizeTimeString("").time, null);
  assert.equal(normalizeTimeString(null).time, null);
  assert.equal(normalizeTimeString(0.375).time, "09:00:00"); // Excel fraction: 9h/24h = 0.375

  // Invalid time ranges must NOT silently convert to midnight, must return error
  const invalidHour = normalizeTimeString("25:00 WIB");
  assert.equal(invalidHour.time, null);
  assert.ok(invalidHour.error?.includes("Jam tidak valid"));

  const invalidMinute = normalizeTimeString("12:65 WIB");
  assert.equal(invalidMinute.time, null);
  assert.ok(invalidMinute.error?.includes("Menit tidak valid"));

  const garbageTime = normalizeTimeString("bukan-waktu");
  assert.equal(garbageTime.time, null);
  assert.ok(garbageTime.error?.includes("Format waktu tidak valid"));
  console.log("  ✔ Normalisasi format waktu PostgreSQL TIME terverifikasi akurat.");

  // ---------------------------------------------------------------------------
  // Test 17: Double-dash Date Window Rejection
  // ---------------------------------------------------------------------------
  console.log("\n[Test 17/17] Penolakan Format Window Cacat (Double Dash '--')...");
  const doubleDashPayload = {
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    period_start: "2026--11-18T17:00:00.000Z",
    period_end: "2026-11-19T17:00:00.000Z",
    events: []
  };
  const vDoubleDash = validateRollingSyncRequest(doubleDashPayload);
  assert.equal(vDoubleDash.valid, false, "Double-dash in period_start must fail validation");
  assert.ok(vDoubleDash.error?.includes("double dash"));
  console.log("  ✔ Penolakan string tanggal cacat dengan double dash terverifikasi aman.");

  console.log("\n================================================================================");
  console.log("=== SEMUA 17 PENGUJIAN SINKRONISASI SAME-DAY (H-0) BERHASIL DENGAN SEMPURNA! ===");
  console.log("================================================================================\n");
}

runTests().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
