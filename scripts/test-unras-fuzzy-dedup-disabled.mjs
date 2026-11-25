/**
 * Automated Regression Test Suite: Fuzzy Duplicate Suppression Disabled
 * SCC - EAGLE EYES: UNRAS Inbound Excel Sync
 *
 * Verifies all 5 mandatory requirements:
 * 1. Two records with identical organizations and identical dates but DIFFERENT ID UNRAS are BOTH inserted.
 * 2. Two records with identical locations and dates but DIFFERENT ID UNRAS are BOTH inserted.
 * 3. Exact reported bug scenario: KEJ-20261125-U1639 (100% org similarity) and KEJ-20261125-U1640 (60% org similarity & generic location "Lokasi Belum Ditentukan") are both processed and inserted.
 * 4. Records with the SAME ID UNRAS update the existing record rather than inserting duplicates.
 * 5. Full overwrite semantics remain intact for empty strings, nulls, zeroes, and false values.
 * 6. Review queue remains clean of valid Excel records (bypassed).
 */

import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  calculateRolling7DayWindow,
  processRolling7DaySync
} from "../src/lib/unras-rolling-sync.ts";
import { protestStore } from "../src/lib/protest-store.ts";

console.log("================================================================================");
console.log("=== SCC - EAGLE EYES: REGRESSION TEST - FUZZY DEDUP DISABLED IN INBOUND SYNC ===");
console.log("================================================================================\n");

async function runRegressionTestSuite() {
  const dbPath = path.join(process.cwd(), "data", "pantau-nusantara.sqlite");
  const runId = Date.now();
  const testDate = "2026-11-25";

  // Window covering 2026-11-25
  const window = calculateRolling7DayWindow(new Date(`${testDate}T12:00:00+07:00`));

  // Cleanup any leftover test data
  try {
    const testDb = new DatabaseSync(dbPath);
    testDb.exec("DELETE FROM protests WHERE id_kejadian LIKE 'TEST-FUZZY-%' OR id_kejadian LIKE 'KEJ-20261125-U1639%' OR id_kejadian LIKE 'KEJ-20261125-U1640%'");
    testDb.exec("DELETE FROM unras_identity_registry WHERE canonical_id LIKE 'TEST-FUZZY-%' OR canonical_id LIKE 'KEJ-20261125-U1639%' OR canonical_id LIKE 'KEJ-20261125-U1640%'");
    testDb.exec("DELETE FROM unras_review_queue WHERE matched_canonical_id LIKE 'TEST-FUZZY-%' OR raw_payload LIKE '%TEST-FUZZY-%' OR raw_payload LIKE '%U1639%' OR raw_payload LIKE '%U1640%'");
    testDb.close();
  } catch (err) {
    console.warn("Cleanup warning:", err);
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Identical organizations + identical dates + DIFFERENT ID UNRAS
  // ---------------------------------------------------------------------------
  console.log("[Test 1/5] Identical organizations & dates with DIFFERENT ID UNRAS -> BOTH INSERTED...");
  const orgName = `Serikat Buruh Indonesia Bersatu ${runId}`;
  const unrasId1A = `U101-${runId}`;
  const unrasId1B = `U102-${runId}`;
  const idKej1A = `TEST-FUZZY-1A-${runId}`;
  const idKej1B = `TEST-FUZZY-1B-${runId}`;

  const payload1 = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": idKej1A,
        "ID UNRAS": unrasId1A,
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T10:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": "Kawasan Industri Pulo Gadung",
        "ORGANISASI": orgName,
        "ISU": "Penyesuaian Upah Minimum Sektoral"
      },
      {
        "ID KEJADIAN": idKej1B,
        "ID UNRAS": unrasId1B,
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T10:30:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": "Kantor Walikota Jakarta Timur",
        "ORGANISASI": orgName, // 100% Identical Organization
        "ISU": "Penyesuaian Upah Minimum Sektoral" // Identical Demands
      }
    ]
  };

  const res1 = await processRolling7DaySync(payload1, "power_automate", "Test Runner");
  assert.equal(res1.summary.received, 2, "Received 2 events");
  assert.equal(res1.summary.inserted, 2, "Both records must be inserted");
  assert.equal(res1.summary.skipped, 0, "No records should be skipped");
  assert.equal(res1.summary.failed, 0, "No records failed");

  const rec1A = await protestStore.getProtestById(idKej1A);
  const rec1B = await protestStore.getProtestById(idKej1B);
  assert.ok(rec1A, "Record 1A must exist in database");
  assert.ok(rec1B, "Record 1B must exist in database");
  assert.equal(rec1A.kode_unras, unrasId1A);
  assert.equal(rec1B.kode_unras, unrasId1B);
  assert.notEqual(rec1A.id, rec1B.id, "Records must be distinct database entities");
  console.log("  ✔ PASS: Kedua rekor dengan organisasi identik (100%) berhasil disimpan karena memiliki ID UNRAS berbeda.\n");

  // ---------------------------------------------------------------------------
  // TEST 2: Identical locations + identical dates + DIFFERENT ID UNRAS
  // ---------------------------------------------------------------------------
  console.log("[Test 2/5] Identical locations & dates with DIFFERENT ID UNRAS -> BOTH INSERTED...");
  const sharedLocation = `Gedung Bank Indonesia Thamrin ${runId}`;
  const unrasId2A = `U201-${runId}`;
  const unrasId2B = `U202-${runId}`;
  const idKej2A = `TEST-FUZZY-2A-${runId}`;
  const idKej2B = `TEST-FUZZY-2B-${runId}`;

  const payload2 = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": idKej2A,
        "ID UNRAS": unrasId2A,
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T09:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": sharedLocation,
        "ORGANISASI": "Aliansi Peduli UMKM",
        "ISU": "Kemudahan Akses Kredit Usaha Rakyat"
      },
      {
        "ID KEJADIAN": idKej2B,
        "ID UNRAS": unrasId2B,
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T13:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": sharedLocation, // Identical location
        "ORGANISASI": "Front Pemuda Penjaga Moneter",
        "ISU": "Dukungan Stabilitas Nilai Tukar Rupiah"
      }
    ]
  };

  const res2 = await processRolling7DaySync(payload2, "power_automate", "Test Runner");
  assert.equal(res2.summary.inserted, 2, "Both records at same location must be inserted");
  assert.equal(res2.summary.skipped, 0, "None should be skipped");

  const rec2A = await protestStore.getProtestById(idKej2A);
  const rec2B = await protestStore.getProtestById(idKej2B);
  assert.ok(rec2A && rec2B, "Both records must exist");
  assert.equal(rec2A.lokasi, sharedLocation);
  assert.equal(rec2B.lokasi, sharedLocation);
  console.log("  ✔ PASS: Kedua rekor dengan lokasi identik berhasil disimpan karena memiliki ID UNRAS berbeda.\n");

  // ---------------------------------------------------------------------------
  // TEST 3: Exact Reported Bug Scenario: KEJ-20261125-U1639 and KEJ-20261125-U1640
  // ---------------------------------------------------------------------------
  console.log("[Test 3/5] Bug Scenario: KEJ-20261125-U1639 & KEJ-20261125-U1640 (Generic Location & Similarity)...");
  const bugId1 = "KEJ-20261125-U1639";
  const bugUnras1 = "U1639";
  const bugId2 = "KEJ-20261125-U1640";
  const bugUnras2 = "U1640";

  const payloadBug = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": bugId1,
        "ID UNRAS": bugUnras1,
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T09:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": "Gedung Bank Indonesia, Jl. M.H. Thamrin No.2",
        "ORGANISASI": "Koalisi Masyarakat Sipil",
        "ISU": "Aspirasi Kebijakan Publik",
        "STATUS KEJADIAN": "Belum Berlangsung"
      },
      {
        "ID KEJADIAN": bugId2,
        "ID UNRAS": bugUnras2,
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T10:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": "Lokasi Belum Ditentukan", // Generic location placeholder that previously triggered AMBIGUOUS/DUPLICATE
        "ORGANISASI": "Koalisi Masyarakat Sipil Merdeka", // 60-75% similarity to U1639
        "ISU": "Aspirasi Kebijakan Publik",
        "STATUS KEJADIAN": "Belum Berlangsung"
      }
    ]
  };

  const resBug = await processRolling7DaySync(payloadBug, "power_automate", "Test Runner");
  assert.equal(resBug.summary.inserted, 2, "Both bug scenario records must be inserted");
  assert.equal(resBug.summary.skipped, 0, "Neither record should be skipped as DUPLICATE or AMBIGUOUS");
  assert.equal(resBug.summary.failed, 0, "Zero failures");

  const bugRec1 = await protestStore.getProtestById(bugId1);
  const bugRec2 = await protestStore.getProtestById(bugId2);
  assert.ok(bugRec1, "U1639 must be inserted");
  assert.ok(bugRec2, "U1640 must be inserted");
  assert.equal(bugRec1.kode_unras, bugUnras1);
  assert.equal(bugRec2.kode_unras, bugUnras2);

  // Verify review queue has NOT been polluted with U1639 or U1640
  const reviewQueueItems = await protestStore.getReviewQueue({ status: "pending_review" });
  const reviewBugMatch = reviewQueueItems.find(
    (item) => item.raw_payload && (item.raw_payload["ID UNRAS"] === bugUnras1 || item.raw_payload["ID UNRAS"] === bugUnras2)
  );
  assert.equal(reviewBugMatch, undefined, "Valid Excel records must NEVER be diverted to review queue");
  console.log("  ✔ PASS: KEJ-20261125-U1639 dan KEJ-20261125-U1640 keduanya berhasil disimpan tanpa ditahan atau dilewati.\n");

  // ---------------------------------------------------------------------------
  // TEST 4: Same ID UNRAS updates existing record rather than creating duplicate
  // ---------------------------------------------------------------------------
  console.log("[Test 4/5] Same ID UNRAS updates existing record (Full Overwrite)...");
  const updatePayloadBug = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": bugId1,
        "ID UNRAS": bugUnras1,
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T09:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": "Gedung Bank Indonesia Lantai 1",
        "ORGANISASI": "Koalisi Masyarakat Sipil Diperbarui",
        "ISU": "Aspirasi Kebijakan Publik Terkini",
        "STATUS KEJADIAN": "Sedang Berlangsung"
      }
    ]
  };

  const resUpdate = await processRolling7DaySync(updatePayloadBug, "power_automate", "Test Runner");
  assert.equal(resUpdate.summary.inserted, 0, "No new record inserted");
  assert.equal(resUpdate.summary.updated, 1, "Existing record must be updated");

  const bugRec1Updated = await protestStore.getProtestById(bugId1);
  assert.equal(bugRec1Updated.organisasi_kelompok, "Koalisi Masyarakat Sipil Diperbarui");
  assert.equal(bugRec1Updated.lokasi, "Gedung Bank Indonesia Lantai 1");
  assert.equal(bugRec1Updated.status, "ongoing");
  console.log("  ✔ PASS: Rekor dengan ID UNRAS yang sama berhasil diperbarui (updated: 1, inserted: 0).\n");

  // ---------------------------------------------------------------------------
  // TEST 5: Full overwrite semantics for empty strings, nulls, zeroes, false
  // ---------------------------------------------------------------------------
  console.log("[Test 5/5] Full overwrite semantics for empty strings, nulls, zeroes, and false...");
  const fullOverwriteId = `TEST-FUZZY-OVERWRITE-${runId}`;
  const fullOverwriteUnras = `U-OVERWRITE-${runId}`;

  // Step 5A: Seed record with rich data
  const seedPayload = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": fullOverwriteId,
        "ID UNRAS": fullOverwriteUnras,
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T08:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": "Bundaran HI Jakarta",
        "TITIK KUMPUL": "Patung Selamat Datang",
        "SASARAN": "Gedung Kedutaan",
        "ORGANISASI": "Serikat Awal",
        "ISU": "Isu Awal Aksi",
        "JUMLAH MASSA": 500,
        "KORLAP": "Budi Santoso",
        "KETERANGAN": "Keterangan Awal Panjang",
        "DAMPAK": "Lalu lintas padat merayap",
        "STATUS KEJADIAN": "Sedang Berlangsung"
      }
    ]
  };

  const resSeed = await processRolling7DaySync(seedPayload, "power_automate", "Test Runner");
  assert.equal(resSeed.summary.inserted, 1);

  const initialRec = await protestStore.getProtestById(fullOverwriteId);
  assert.equal(initialRec.estimasi_massa_source, 500);
  assert.equal(initialRec.titik_kumpul, "Patung Selamat Datang");
  assert.equal(initialRec.korlap_pimpinan, "Budi Santoso");

  // Step 5B: Send full-overwrite clearing fields explicitly
  const overwritePayload = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window.period_start,
    period_end: window.period_end,
    events: [
      {
        "ID KEJADIAN": fullOverwriteId,
        "ID UNRAS": fullOverwriteUnras,
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T08:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": "Bundaran HI Jakarta",
        "TITIK KUMPUL": "", // Explicit empty string -> cleared
        "SASARAN": null, // Explicit null -> cleared
        "ORGANISASI": "Serikat Baru Terverifikasi",
        "ISU": "Isu Diperbarui",
        "JUMLAH MASSA": 0, // Explicit zero -> preserved as 0
        "KORLAP": "", // Explicit empty string -> cleared
        "KETERANGAN": "", // Explicit empty string -> cleared
        "DAMPAK": "Tidak Ada",
        "STATUS KEJADIAN": "Selesai"
      }
    ]
  };

  const resOverwrite = await processRolling7DaySync(overwritePayload, "power_automate", "Test Runner");
  assert.equal(resOverwrite.summary.updated, 1);
  assert.equal(resOverwrite.summary.inserted, 0);

  const finalRec = await protestStore.getProtestById(fullOverwriteId);
  assert.equal(finalRec.organisasi_kelompok, "Serikat Baru Terverifikasi");
  assert.equal(finalRec.titik_kumpul, null, "titik_kumpul must be cleared to null/empty");
  assert.equal(finalRec.sasaran_aksi, null, "sasaran_aksi must be cleared to null");
  assert.equal(finalRec.korlap_pimpinan, null, "korlap_pimpinan must be cleared");
  assert.equal(finalRec.keterangan_source, null, "keterangan_source must be cleared");
  assert.equal(finalRec.estimasi_massa_source, 0, "estimasi_massa_source 0 must be preserved as 0");
  assert.equal(finalRec.status, "completed", "Status must update to completed");
  console.log("  ✔ PASS: Kontrak full-overwrite berhasil mengosongkan field eksplisit kosong/null dan mempertahankan nilai 0.\n");

  // Cleanup test records
  try {
    const testDb = new DatabaseSync(dbPath);
    testDb.exec("DELETE FROM protests WHERE id_kejadian LIKE 'TEST-FUZZY-%' OR id_kejadian LIKE 'KEJ-20261125-U1639%' OR id_kejadian LIKE 'KEJ-20261125-U1640%'");
    testDb.exec("DELETE FROM unras_identity_registry WHERE canonical_id LIKE 'TEST-FUZZY-%' OR canonical_id LIKE 'KEJ-20261125-U1639%' OR canonical_id LIKE 'KEJ-20261125-U1640%'");
    testDb.close();
  } catch {}

  console.log("================================================================================");
  console.log("=== SEMUA 5 PENGUJIAN REGRESI FUZZY DEDUP DISABLED BERHASIL DENGAN SEMPURNA! ===");
  console.log("================================================================================\n");
}

runRegressionTestSuite().catch((err) => {
  console.error("FATAL ERROR IN REGRESSION TEST SUITE:", err);
  process.exit(1);
});

