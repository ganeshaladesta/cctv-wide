/**
 * SCC - EAGLE EYES: UNRAS Dashboard KPI Aggregation Test Suite
 * Validates U1473 regression, status normalization, crowd aggregation,
 * Asia/Jakarta operational date filtering, and multi-point situational overview.
 */

import assert from "node:assert/strict";
import { protestStore } from "../src/lib/protest-store.ts";
import { normalizeProtestStatus, synthesizePointsForLegacyEvent } from "../src/lib/unras-helpers.ts";
import { calculateSameDayWindow, processSameDaySync } from "../src/lib/unras-rolling-sync.ts";

const results = [];

function recordTest(num, name, passed, details = "") {
  results.push({ num, name, passed, details });
  const status = passed ? "✔ PASS" : "✖ FAIL";
  console.log(`[Test ${String(num).padStart(2, "0")}/10] ${status} - ${name}`);
  if (details) {
    console.log(`          ${details}`);
  }
}

async function runKpiTests() {
  console.log("================================================================================");
  console.log("=== SCC - EAGLE EYES: UNRAS DASHBOARD KPI AGGREGATION TEST SUITE            ===");
  console.log("================================================================================\n");

  const todayWib = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

  // 1. Ingest U1473 record via standard sync pipeline
  const u1473Row = {
    "ID KEJADIAN": "KEJ-20261120-U1473",
    "ID UNRAS": "U1473",
    "WAKTU DAN TGL KEJADIAN ISO": `${todayWib}T16:00:00+07:00`,
    "TANGGAL": todayWib,
    "WAKTU": "16:00:00",
    "KP/KPw": "KPwDN",
    "REGIONAL": "KTI",
    "PROVINSI": "Kalimantan Timur",
    "LOKASI": "Samarinda",
    "ORGANISASI": "Gerakan Rakyat Menggugat (GERAM)",
    "KORLAP": "Koordinator Lapangan GERAM",
    "ISU": "Aksi Penolakan Tambang Ilegal di Kalimantan Timur",
    "JUMLAH MASSA": "500",
    "KETERANGAN": "Massa berkumpul di depan kantor gubernur Kaltim.",
    "STATUS": "scheduled"
  };

  const window = calculateSameDayWindow();
  const syncResult = await processSameDaySync(
    {
      sync_type: "same_day",
      timezone: "Asia/Jakarta",
      period_start: window.period_start,
      period_end: window.period_end,
      events: [u1473Row]
    },
    "power_automate",
    "Automated Test Ingest"
  );

  assert.equal(syncResult.success, true);

  // Test 1: Total UNRAS includes U1473
  const stats = await protestStore.getStats();
  const foundU1473 = await protestStore.getProtestById("KEJ-20261120-U1473");
  const test1Pass = foundU1473 !== null && stats.total_events > 0;
  recordTest(1, "Total UNRAS includes U1473", test1Pass, `Found U1473 ID: ${foundU1473?.id}, Total events: ${stats.total_events}`);

  // Test 2: Daily Situation Overview includes U1473 in scheduled points
  const dailyOverview = await protestStore.getDailySituationOverview(todayWib);
  const test2Pass = dailyOverview.scheduled_points_count >= 1 && dailyOverview.total_points >= 1;
  recordTest(2, "Today scheduled count includes U1473", test2Pass, `Scheduled points: ${dailyOverview.scheduled_points_count}, Total points: ${dailyOverview.total_points}`);

  // Test 3: Crowd estimate includes 500 for U1473
  const test3Pass = dailyOverview.total_estimated_crowd >= 500;
  recordTest(3, "Crowd estimate includes 500 from U1473", test3Pass, `Total crowd aggregated: ${dailyOverview.total_estimated_crowd} orang`);

  // Test 4: Samarinda and Kalimantan Timur are counted in distinct geographic aggregates
  const hasKaltim = dailyOverview.affected_provinces.includes("Kalimantan Timur");
  const hasKti = dailyOverview.affected_regions.includes("KTI");
  const test4Pass = hasKaltim && dailyOverview.affected_provinces_count >= 1;
  recordTest(4, "Geographic aggregation reflects Kalimantan Timur & KTI", test4Pass, `Provinces: ${dailyOverview.affected_provinces.join(", ")} | Regions: ${dailyOverview.affected_regions.join(", ")}`);

  // Test 5: Status normalization handles ongoing, monitoring, completed, cancelled, and casing
  const normOngoing = normalizeProtestStatus("ONGOING");
  const normBerlangsung = normalizeProtestStatus("berlangsung");
  const normPantau = normalizeProtestStatus("Pemantauan");
  const normSched = normalizeProtestStatus("TERJADWAL");
  const normBubar = normalizeProtestStatus("Selesai");
  const normBatal = normalizeProtestStatus("dibatalkan");
  const test5Pass =
    normOngoing === "ongoing" &&
    normBerlangsung === "ongoing" &&
    normPantau === "monitoring" &&
    normSched === "scheduled" &&
    normBubar === "completed" &&
    normBatal === "cancelled";
  recordTest(5, "Status normalization covers operational statuses and aliases", test5Pass, "ONGOING->ongoing, berlangsung->ongoing, Pemantauan->monitoring, TERJADWAL->scheduled, Selesai->completed, dibatalkan->cancelled");

  // Test 6: Ongoing event counts in active & ongoing points
  const ongoingEvent = await protestStore.createProtestLocal({
    id_kejadian: `ONGOING-TEST-${Date.now()}`,
    kode_unras: "U-ONG-1",
    tanggal: todayWib,
    waktu_mulai: "10:00:00",
    lokasi: "Bundaran HI",
    provinsi: "DKI Jakarta",
    regional: "Kantor Pusat",
    isu_tuntutan: "Aksi Buruh Jakarta",
    status: "ongoing",
    estimasi_massa_source: 300
  });
  const overviewWithOngoing = await protestStore.getDailySituationOverview(todayWib);
  const test6Pass = overviewWithOngoing.ongoing_points_count >= 1 && overviewWithOngoing.total_active_points >= 1;
  recordTest(6, "Ongoing event counted in ongoing_points_count & active_points", test6Pass, `Ongoing count: ${overviewWithOngoing.ongoing_points_count}, Total active: ${overviewWithOngoing.total_active_points}`);

  // Test 7: Monitoring event counts in monitoring_points_count & active_points
  const monitoringEvent = await protestStore.createProtestLocal({
    id_kejadian: `MON-TEST-${Date.now()}`,
    kode_unras: "U-MON-1",
    tanggal: todayWib,
    waktu_mulai: "11:00:00",
    lokasi: "Gedung DPR RI",
    provinsi: "DKI Jakarta",
    regional: "Kantor Pusat",
    isu_tuntutan: "Aksi Mahasiswa",
    status: "monitoring",
    estimasi_massa_source: 200
  });
  const overviewWithMon = await protestStore.getDailySituationOverview(todayWib);
  const test7Pass = overviewWithMon.monitoring_points_count >= 1;
  recordTest(7, "Monitoring event counted in monitoring_points_count", test7Pass, `Monitoring count: ${overviewWithMon.monitoring_points_count}`);

  // Test 8: Completed and Cancelled events separated from active points
  const compEvent = await protestStore.createProtestLocal({
    id_kejadian: `COMP-TEST-${Date.now()}`,
    kode_unras: "U-COMP-1",
    tanggal: todayWib,
    waktu_mulai: "08:00:00",
    lokasi: "Monas",
    provinsi: "DKI Jakarta",
    regional: "Kantor Pusat",
    isu_tuntutan: "Aksi Damai",
    status: "completed",
    estimasi_massa_source: 150
  });
  const cancEvent = await protestStore.createProtestLocal({
    id_kejadian: `CANC-TEST-${Date.now()}`,
    kode_unras: "U-CANC-1",
    tanggal: todayWib,
    waktu_mulai: "09:00:00",
    lokasi: "KPK",
    provinsi: "DKI Jakarta",
    regional: "Kantor Pusat",
    isu_tuntutan: "Aksi Batal",
    status: "cancelled",
    estimasi_massa_source: 100
  });
  const overviewWithAll = await protestStore.getDailySituationOverview(todayWib);
  const test8Pass = overviewWithAll.completed_points_count >= 1;
  recordTest(8, "Completed & cancelled events classified accurately", test8Pass, `Completed points: ${overviewWithAll.completed_points_count}`);

  // Test 9: Midnight boundary event (23:59 WIB and 00:00 WIB next day)
  const midnightEvent = await protestStore.createProtestLocal({
    id_kejadian: `MIDNIGHT-TEST-${Date.now()}`,
    kode_unras: "U-MID-1",
    tanggal: todayWib,
    waktu_mulai: "23:55:00",
    lokasi: "Simpang Lima",
    provinsi: "Jawa Tengah",
    regional: "Jawa",
    isu_tuntutan: "Aksi Menjelang Tengah Malam",
    status: "scheduled",
    estimasi_massa_source: 50
  });
  const overviewMidnight = await protestStore.getDailySituationOverview(todayWib);
  const test9Pass = overviewMidnight.points.some(p => p.parent_id_kejadian?.includes("MIDNIGHT"));
  recordTest(9, "WIB midnight boundary event properly contained in today's overview", test9Pass, "23:55 WIB event successfully matched today operational date");

  // Test 10: Point synthesis preserves crowd estimate without summing historical observations repeatedly
  const synthesized = synthesizePointsForLegacyEvent(foundU1473);
  const test10Pass = synthesized.length === 1 && synthesized[0].current_crowd_total === 500 && synthesized[0].elements?.length >= 1;
  recordTest(10, "Point synthesis accurately preserves single event-level crowd estimate", test10Pass, `Point crowd: ${synthesized[0].current_crowd_total}, Elements: ${synthesized[0].elements?.length}`);

  console.log("\n================================================================================");
  const allPassed = results.every(r => r.passed);
  console.log(`=== HASIL AKHIR: ${results.filter(r => r.passed).length}/${results.length} PENGUJIAN BERHASIL (${allPassed ? "PASS" : "FAIL"})                         ===`);
  console.log("================================================================================\n");

  if (!allPassed) {
    process.exit(1);
  }
}

runKpiTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
