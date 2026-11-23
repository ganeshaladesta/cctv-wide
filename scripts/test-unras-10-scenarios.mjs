/**
 * Comprehensive 10-Scenario End-to-End Regression Test Suite
 * Strictly verifying all 10 conditions specified in Section 8:
 *
 * 1. Record lama berubah dari Belum Berlangsung -> Sedang Berlangsung.
 * 2. Record lama berubah dari Sedang Berlangsung -> Selesai.
 * 3. Record baru dengan status Selesai.
 * 4. Record baru dengan status Sedang Berlangsung.
 * 5. Record dengan status Belum Berlangsung.
 * 6. Record dengan status NULL.
 * 7. Record tanpa kedua ID Excel (menggunakan fallback ID).
 * 8. Record dengan identitas ambigu (tertahan di antrean review, status tidak diterapkan).
 * 9. Operator status tidak berubah ketika status sumber berubah.
 * 10. KPI dan tab menghasilkan angka yang konsisten.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { protestStore } from "../src/lib/protest-store.js";
import {
  processRolling7DaySync,
  calculateRolling7DayWindow
} from "../src/lib/unras-rolling-sync.js";
import { mapSourceStatus } from "../src/lib/unras-helpers.js";

const DB_PATH = path.join(process.cwd(), "data", "pantau-nusantara.sqlite");

async function cleanupTestData() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const db = new DatabaseSync(DB_PATH);
      db.exec("DELETE FROM protest_status_history WHERE protest_id IN (SELECT id FROM protests WHERE id_kejadian LIKE 'REG-%' OR id_kejadian LIKE 'KEJ-20261123-%')");
      db.exec("DELETE FROM unras_identity_registry WHERE canonical_id LIKE 'REG-%' OR canonical_id LIKE 'KEJ-20261123-%'");
      db.exec("DELETE FROM unras_review_queue WHERE raw_payload LIKE '%REG-%' OR lokasi LIKE '%Gambir%' OR lokasi LIKE '%DPR MPR Senayan%'");
      db.exec("DELETE FROM protests WHERE id_kejadian LIKE 'REG-%' OR id_kejadian LIKE 'KEJ-20261123-%'");
      db.close();
    } catch (e) {
      console.warn("Cleanup warning:", e.message);
    }
  }
}

async function run10ScenarioSuite() {
  console.log("================================================================================");
  console.log("=== COMPREHENSIVE REGRESSION TEST SUITE: 10 SECTION 8 SPECIFIED SCENARIOS     ===");
  console.log("================================================================================\n");

  await cleanupTestData();

  const rollingWin = calculateRolling7DayWindow();
  const runId = Math.random().toString(36).substring(2, 8);
  const todayWib = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  // --------------------------------------------------------------------------
  // Scenario 1: Record lama berubah dari Belum Berlangsung -> Sedang Berlangsung
  // --------------------------------------------------------------------------
  console.log("[Scenario 1] Record lama berubah dari Belum Berlangsung -> Sedang Berlangsung...");
  const s1Id = `REG-TEST-S1-${runId}`;
  await processRolling7DaySync({
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    events: [{
      "ID KEJADIAN": s1Id,
      "ID UNRAS": `UNR-S1-${runId}`,
      "TANGGAL": todayWib,
      "LOKASI": `Depan Kementerian Keuangan RI ${runId}`,
      "ISU": `Aksi Pengawalan APBN Damai ${runId}`,
      "status_sumber": "Belum Berlangsung"
    }]
  }, "power_automate", "Regression Runner");

  const s1Initial = await protestStore.getProtestById(s1Id);
  assert.equal(s1Initial.status_sumber, "Belum Berlangsung");

  // Transition to Sedang Berlangsung
  const resS1 = await processRolling7DaySync({
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    events: [{
      "ID KEJADIAN": s1Id,
      "ID UNRAS": `UNR-S1-${runId}`,
      "TANGGAL": todayWib,
      "LOKASI": `Depan Kementerian Keuangan RI ${runId}`,
      "ISU": `Aksi Pengawalan APBN Damai ${runId}`,
      "status_sumber": "Sedang Berlangsung"
    }]
  }, "power_automate", "Regression Runner");

  assert.equal(resS1.summary.inserted, 0, "Scenario 1: Must not re-insert existing record");
  assert.equal(resS1.summary.updated, 1, "Scenario 1: Must update existing record");
  assert.equal(resS1.summary.status_updated, 1, "Scenario 1: Must increment status_updated");
  const s1After = await protestStore.getProtestById(s1Id);
  assert.equal(s1After.status_sumber, "Sedang Berlangsung", "Scenario 1: status_sumber must become Sedang Berlangsung");
  console.log("  ✔ Scenario 1 PASS: Belum Berlangsung -> Sedang Berlangsung updated cleanly\n");

  // --------------------------------------------------------------------------
  // Scenario 2: Record lama berubah dari Sedang Berlangsung -> Selesai
  // --------------------------------------------------------------------------
  console.log("[Scenario 2] Record lama berubah dari Sedang Berlangsung -> Selesai...");
  const resS2 = await processRolling7DaySync({
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    events: [{
      "ID KEJADIAN": s1Id,
      "ID UNRAS": `UNR-S1-${runId}`,
      "TANGGAL": todayWib,
      "LOKASI": `Depan Kementerian Keuangan RI ${runId}`,
      "ISU": `Aksi Pengawalan APBN Damai ${runId}`,
      "status_sumber": "Selesai"
    }]
  }, "power_automate", "Regression Runner");

  assert.equal(resS2.summary.inserted, 0, "Scenario 2: Must not re-insert");
  assert.equal(resS2.summary.updated, 1, "Scenario 2: Must update record");
  assert.equal(resS2.summary.status_updated, 1, "Scenario 2: Must increment status_updated");
  const s1Completed = await protestStore.getProtestById(s1Id);
  assert.equal(s1Completed.status_sumber, "Selesai", "Scenario 2: status_sumber must become Selesai");
  console.log("  ✔ Scenario 2 PASS: Sedang Berlangsung -> Selesai updated cleanly\n");

  // --------------------------------------------------------------------------
  // Scenario 3: Record baru dengan status Selesai
  // --------------------------------------------------------------------------
  console.log("[Scenario 3] Record baru dengan status Selesai...");
  const s3Id = `REG-TEST-S3-${runId}`;
  const resS3 = await processRolling7DaySync({
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    events: [{
      "ID KEJADIAN": s3Id,
      "ID UNRAS": `UNR-S3-${runId}`,
      "TANGGAL": todayWib,
      "LOKASI": `Depan Mabes Polri Trunojoyo ${runId}`,
      "ISU": `Aksi Tuntut Keadilan Hukum Khusus ${runId}`,
      "status_sumber": "Selesai"
    }]
  }, "power_automate", "Regression Runner");

  assert.equal(resS3.summary.inserted, 1, "Scenario 3: Must insert 1 new record");
  const s3Record = await protestStore.getProtestById(s3Id);
  assert.ok(s3Record, "Scenario 3: Record must exist");
  assert.equal(s3Record.status_sumber, "Selesai", "Scenario 3: Source status must be Selesai");
  console.log("  ✔ Scenario 3 PASS: New record with status Selesai inserted properly\n");

  // --------------------------------------------------------------------------
  // Scenario 4: Record baru dengan status Sedang Berlangsung
  // --------------------------------------------------------------------------
  console.log("[Scenario 4] Record baru dengan status Sedang Berlangsung...");
  const s4Id = `REG-TEST-S4-${runId}`;
  const resS4 = await processRolling7DaySync({
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    events: [{
      "ID KEJADIAN": s4Id,
      "ID UNRAS": `UNR-S4-${runId}`,
      "TANGGAL": todayWib,
      "LOKASI": `Kawasan Bundaran Senayan Pintu Silang ${runId}`,
      "ISU": `Aksi Solidaritas Komunitas Lingkungan ${runId}`,
      "status_sumber": "Sedang Berlangsung"
    }]
  }, "power_automate", "Regression Runner");

  assert.equal(resS4.summary.inserted, 1, "Scenario 4: Must insert 1 new record");
  const s4Record = await protestStore.getProtestById(s4Id);
  assert.ok(s4Record, "Scenario 4: Record must exist");
  assert.equal(s4Record.status_sumber, "Sedang Berlangsung", "Scenario 4: Source status must be Sedang Berlangsung");
  console.log("  ✔ Scenario 4 PASS: New record with status Sedang Berlangsung inserted properly\n");

  // --------------------------------------------------------------------------
  // Scenario 5: Record dengan status Belum Berlangsung
  // --------------------------------------------------------------------------
  console.log("[Scenario 5] Record dengan status Belum Berlangsung...");
  const s5Id = `REG-TEST-S5-${runId}`;
  const resS5 = await processRolling7DaySync({
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    events: [{
      "ID KEJADIAN": s5Id,
      "ID UNRAS": `UNR-S5-${runId}`,
      "TANGGAL": todayWib,
      "LOKASI": `Depan Kantor Gedung Sate Sayap Timur ${runId}`,
      "ISU": `Aksi Buruh Menuntut UMR Berkeadilan ${runId}`,
      "status_sumber": "Belum Berlangsung"
    }]
  }, "power_automate", "Regression Runner");

  assert.equal(resS5.summary.inserted, 1, "Scenario 5: Must insert 1 new record");
  const s5Record = await protestStore.getProtestById(s5Id);
  assert.ok(s5Record, "Scenario 5: Record must exist");
  assert.equal(s5Record.status_sumber, "Belum Berlangsung", "Scenario 5: Source status must be Belum Berlangsung");
  console.log("  ✔ Scenario 5 PASS: Record with status Belum Berlangsung inserted properly\n");

  // --------------------------------------------------------------------------
  // Scenario 6: Record dengan status NULL
  // --------------------------------------------------------------------------
  console.log("[Scenario 6] Record dengan status NULL...");
  const s6Id = `REG-TEST-S6-${runId}`;
  const resS6 = await processRolling7DaySync({
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    events: [{
      "ID KEJADIAN": s6Id,
      "ID UNRAS": `UNR-S6-${runId}`,
      "TANGGAL": todayWib,
      "LOKASI": `Depan Gedung KPK RI Kuningan Baru ${runId}`,
      "ISU": `Aksi Mendukung Integritas Lembaga ${runId}`,
      "status_sumber": null
    }]
  }, "power_automate", "Regression Runner");

  assert.equal(resS6.summary.inserted, 1, "Scenario 6: Must insert 1 new record");
  const s6Record = await protestStore.getProtestById(s6Id);
  assert.ok(s6Record, "Scenario 6: Record must exist");
  assert.equal(s6Record.status_sumber, null, "Scenario 6: Source status MUST remain strictly NULL (not defaulted!)");
  console.log("  ✔ Scenario 6 PASS: Record with NULL status preserved strictly as NULL\n");

  // --------------------------------------------------------------------------
  // Scenario 7: Record tanpa kedua ID Excel (menggunakan fallback ID)
  // --------------------------------------------------------------------------
  console.log("[Scenario 7] Record tanpa kedua ID Excel (menggunakan fallback ID)...");
  const resS7 = await processRolling7DaySync({
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    events: [{
      // NO ID KEJADIAN, NO ID UNRAS
      "TANGGAL": todayWib,
      "LOKASI": `Stasiun Gambir Pintu Barat Monas ${runId}`,
      "ISU": `Aksi Paguyuban Pengemudi Mandiri ${runId}`,
      "ORGANISASI": `Paguyuban Ojol Mandiri ${runId}`,
      "status_sumber": "Belum Berlangsung"
    }]
  }, "power_automate", "Regression Runner");

  assert.equal(resS7.summary.inserted, 1, "Scenario 7: Must successfully insert record without Excel IDs");
  const allProtests = await protestStore.queryProtestsLocal({ q: `Paguyuban Ojol Mandiri ${runId}` });
  assert.equal(allProtests.total, 1, "Scenario 7: Record should be retrievable");
  const fallbackRecord = allProtests.data[0];
  assert.ok(fallbackRecord.id_kejadian.startsWith("KEJ-"), "Scenario 7: Must have deterministic fallback ID starting with KEJ-");
  assert.equal(fallbackRecord.status_sumber, "Belum Berlangsung", "Scenario 7: Fallback record must retain status_sumber");
  console.log(`  ✔ Scenario 7 PASS: Record without Excel IDs assigned deterministic fallback ID (${fallbackRecord.id_kejadian})\n`);

  // --------------------------------------------------------------------------
  // Scenario 8: Record dengan identitas ambigu (tertahan di antrean review, status tidak diterapkan)
  // --------------------------------------------------------------------------
  console.log("[Scenario 8] Record dengan identitas ambigu (tertahan di antrean review, status tidak diterapkan)...");
  const ambBaseId = `REG-TEST-AMB-${runId}`;
  await processRolling7DaySync({
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    events: [{
      "ID KEJADIAN": ambBaseId,
      "ID UNRAS": `UNR-AMB-${runId}`,
      "TANGGAL": todayWib,
      "LOKASI": `Depan Gedung DPR MPR Senayan Kompleks Utama ${runId}`,
      "ISU": `Aksi Bersama Mahasiswa Peduli Regulasi ${runId}`,
      "ORGANISASI": `Aliansi Mahasiswa Nasional ${runId}`,
      "status_sumber": "Belum Berlangsung"
    }]
  }, "power_automate", "Regression Runner");

  const ambBaseBefore = await protestStore.getProtestById(ambBaseId);
  assert.equal(ambBaseBefore.status_sumber, "Belum Berlangsung");

  // Now an ambiguous record arrives: empty ID, same location, partial overlap on demand
  const resS8 = await processRolling7DaySync({
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    events: [{
      "ID KEJADIAN": "",
      "ID UNRAS": "",
      "TANGGAL": todayWib,
      "LOKASI": `Depan Gedung DPR MPR Senayan Kompleks Utama ${runId}`,
      "ISU": `Aksi Peduli Regulasi Penataan Publik ${runId}`,
      "ORGANISASI": `Elemen Masyarakat Swasta ${runId}`,
      "status_sumber": "Selesai" // Should NOT be applied to canonical because confidence is not confirmed!
    }]
  }, "power_automate", "Regression Runner");

  assert.equal(resS8.summary.inserted, 0, "Scenario 8: Ambiguous record must not be inserted");
  assert.equal(resS8.summary.updated, 0, "Scenario 8: Ambiguous record must NOT update canonical status");

  const ambBaseAfter = await protestStore.getProtestById(ambBaseId);
  assert.equal(ambBaseAfter.status_sumber, "Belum Berlangsung", "Scenario 8: Canonical record must NOT be updated by ambiguous match");

  const reviewQueue = await protestStore.getReviewQueue("pending_review");
  const queuedItem = reviewQueue.find(item => item.lokasi.includes(`DPR MPR Senayan Kompleks Utama ${runId}`));
  assert.ok(queuedItem, "Scenario 8: Ambiguous record must be quarantined in unras_review_queue");
  console.log("  ✔ Scenario 8 PASS: Ambiguous record quarantined in review queue, no arbitrary status overwrite\n");

  // --------------------------------------------------------------------------
  // Scenario 9: Operator status tidak berubah ketika status sumber berubah
  // --------------------------------------------------------------------------
  console.log("[Scenario 9] Operator status tidak berubah ketika status sumber berubah...");
  const s9Id = `REG-TEST-S9-${runId}`;
  await protestStore.createProtest({
    id_kejadian: s9Id,
    kode_unras: `UNR-S9-${runId}`,
    tanggal: todayWib,
    lokasi: `Kawasan Monas Pintu Silang Barat Area ${runId}`,
    isu_tuntutan: `Aksi Pantau Situasi Terkini Area ${runId}`,
    status: "monitoring", // Operator specifically set to monitoring
    urgency: "critical", // Operator urgency critical
    validated_lat: -6.1754,
    validated_lng: 106.8272,
    situation_summary: "Kondisi sangat aman dan tertib oleh tim komando",
    status_sumber: "Belum Berlangsung"
  });

  // Now sync comes with status_sumber = 'Selesai'
  const resS9 = await processRolling7DaySync({
    period_start: rollingWin.period_start,
    period_end: rollingWin.period_end,
    sync_type: "rolling_7d",
    events: [{
      "ID KEJADIAN": s9Id,
      "ID UNRAS": `UNR-S9-${runId}`,
      "TANGGAL": todayWib,
      "LOKASI": `Kawasan Monas Pintu Silang Barat Area ${runId}`,
      "ISU": `Aksi Pantau Situasi Terkini Area ${runId}`,
      "status_sumber": "Selesai"
    }]
  }, "power_automate", "Regression Runner");

  const s9After = await protestStore.getProtestById(s9Id);
  assert.equal(s9After.status_sumber, "Selesai", "Scenario 9: Source status must update to Selesai");
  assert.equal(s9After.status, "monitoring", "Scenario 9: Operator status 'monitoring' MUST NOT be overwritten!");
  assert.equal(s9After.urgency, "critical", "Scenario 9: Operator urgency MUST NOT be overwritten!");
  assert.equal(s9After.validated_lat, -6.1754, "Scenario 9: Operator latitude MUST NOT be overwritten!");
  assert.equal(s9After.situation_summary, "Kondisi sangat aman dan tertib oleh tim komando", "Scenario 9: Situation summary MUST NOT be overwritten!");
  console.log("  ✔ Scenario 9 PASS: Operator fields 100% protected while source status updated\n");

  // --------------------------------------------------------------------------
  // Scenario 10: KPI dan tab menghasilkan angka yang konsisten
  // --------------------------------------------------------------------------
  console.log("[Scenario 10] KPI dan tab menghasilkan angka yang konsisten...");
  const stats = await protestStore.getStats();

  // Test tabs
  const tabOngoing = await protestStore.queryProtestsLocal({ status: "ongoing", limit: 100 });
  const tabScheduled = await protestStore.queryProtestsLocal({ status: "scheduled", limit: 100 });
  const tabCompleted = await protestStore.queryProtestsLocal({ status: "completed", limit: 100 });

  console.log(`  -> KPI Source Ongoing: ${stats.source_status_ongoing}, Tab Ongoing count: ${tabOngoing.total}`);
  console.log(`  -> KPI Source Scheduled: ${stats.source_status_scheduled}, Tab Scheduled count: ${tabScheduled.total}`);
  console.log(`  -> KPI Source Completed: ${stats.source_status_completed}, Tab Completed count: ${tabCompleted.total}`);

  // Ongoing tab must match records with status_sumber = 'Sedang Berlangsung'
  assert.equal(tabOngoing.total, stats.source_status_ongoing, "Scenario 10: Tab Sedang Berlangsung count must match KPI source_status_ongoing");

  // Scheduled tab must match records with status_sumber = 'Belum Berlangsung'
  assert.equal(tabScheduled.total, stats.source_status_scheduled, "Scenario 10: Tab Belum Berlangsung count must match KPI source_status_scheduled");

  // Completed tab must include all status_sumber = 'Selesai' (plus any operator completed)
  assert.ok(
    tabCompleted.total >= stats.source_status_completed,
    "Scenario 10: Tab Selesai (Arsip) must include all source completed events"
  );

  // Tab Selesai (Arsip) must not produce duplicate IDs
  const completedIds = tabCompleted.data.map(p => p.id);
  const uniqueCompletedIds = new Set(completedIds);
  assert.equal(completedIds.length, uniqueCompletedIds.size, "Scenario 10: Tab Selesai (Arsip) must contain 0 duplicate IDs");

  console.log("  ✔ Scenario 10 PASS: KPI and Tab counts are completely consistent with zero duplicates\n");

  await cleanupTestData();

  console.log("================================================================================");
  console.log("=== ALL 10 SECTION 8 REGRESSION SCENARIOS PASSED WITH ZERO ERRORS (100%)    ===");
  console.log("================================================================================\n");
}

run10ScenarioSuite().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
