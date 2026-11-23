/**
 * Regression Test Suite: Tab Selesai (Arsip) Synchronized Query & Filter Verification
 *
 * Requirements:
 * 1. Tab Selesai (Arsip) displays: status_sumber = 'Selesai' OR status = 'completed'
 * 2. No duplicate records generated across union
 * 3. Verified across 5 specific conditions:
 *    - Condition 1: Selesai dari Excel, operator masih scheduled.
 *    - Condition 2: Selesai dari operator, status sumber Excel null.
 *    - Condition 3: Selesai dari keduanya (both satisfied).
 *    - Condition 4: Status sumber Excel belum selesai ('Belum Berlangsung'), operator completed.
 *    - Condition 5: Record dengan status sumber null & operator scheduled (must NOT appear).
 * 4. Pagination, search (q), and urgency filters must work in harmony with the OR condition.
 */

import assert from "node:assert/strict";
import { protestStore } from "../src/lib/protest-store.js";

async function runRegressionTests() {
  console.log("================================================================================");
  console.log("=== REGRESSION TEST: TAB SELESAI (ARSIP) UNION & DEDUPLICATION VERIFICATION ===");
  console.log("================================================================================\n");

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

  // 1. Prepare 6 distinct test records covering all matrix states
  const rec1_excelOnly = {
    id_kejadian: "TEST-TAB-001-EXCEL-ONLY",
    kode_unras: "UNR-TAB-001",
    tanggal: today,
    waktu_mulai: "09:00:00",
    lokasi: "Gedung MPR/DPR RI",
    isu_tuntutan: "Tuntutan Uji Status Excel Selesai Operator Scheduled",
    organisasi_kelompok: "Aliansi Buruh Maju",
    status: "scheduled", // Operator still scheduled
    status_sumber: "Selesai", // Excel source finished
    urgency: "high"
  };

  const rec2_operatorOnly = {
    id_kejadian: "TEST-TAB-002-OPERATOR-ONLY",
    kode_unras: "UNR-TAB-002",
    tanggal: today,
    waktu_mulai: "10:00:00",
    lokasi: "Kantor Kemenaker RI",
    isu_tuntutan: "Tuntutan Uji Status Operator Completed Excel Null",
    organisasi_kelompok: "Serikat Pekerja Mandiri",
    status: "completed", // Operator marked completed
    status_sumber: null, // Excel status null
    urgency: "medium"
  };

  const rec3_both = {
    id_kejadian: "TEST-TAB-003-BOTH-FINISHED",
    kode_unras: "UNR-TAB-003",
    tanggal: today,
    waktu_mulai: "11:00:00",
    lokasi: "Bunderan HI Jakarta",
    isu_tuntutan: "Tuntutan Uji Status Keduanya Selesai",
    organisasi_kelompok: "Koalisi Masyarakat Sipil",
    status: "completed", // Both operator completed
    status_sumber: "Selesai", // AND Excel source completed
    urgency: "low"
  };

  const rec4_operatorCompletedExcelNotYet = {
    id_kejadian: "TEST-TAB-004-OP-COMP-EXCEL-NOT",
    kode_unras: "UNR-TAB-004",
    tanggal: today,
    waktu_mulai: "13:00:00",
    lokasi: "Gedung Balai Kota DKI",
    isu_tuntutan: "Tuntutan Uji Status Operator Selesai Excel Belum Berlangsung",
    organisasi_kelompok: "Gerakan Mahasiswa Peduli",
    status: "completed", // Operator marked completed
    status_sumber: "Belum Berlangsung", // Excel still says Belum Berlangsung
    urgency: "medium"
  };

  const rec5_nullUnfinished = {
    id_kejadian: "TEST-TAB-005-NULL-SCHEDULED",
    kode_unras: "UNR-TAB-005",
    tanggal: today,
    waktu_mulai: "14:00:00",
    lokasi: "Patung Kuda Monas",
    isu_tuntutan: "Tuntutan Uji Status Sumber Null Operator Scheduled",
    organisasi_kelompok: "Forum Warga Jakarta",
    status: "scheduled", // Operator scheduled
    status_sumber: null, // Excel null -> MUST NOT APPEAR IN ARCHIVE TAB
    urgency: "medium"
  };

  const rec6_ongoingExcelAndOp = {
    id_kejadian: "TEST-TAB-006-ONGOING",
    kode_unras: "UNR-TAB-006",
    tanggal: today,
    waktu_mulai: "15:00:00",
    lokasi: "Kawasan Monas Barat",
    isu_tuntutan: "Tuntutan Uji Status Sedang Berlangsung Lapangan",
    organisasi_kelompok: "Aliansi Aksi Lapangan",
    status: "ongoing",
    status_sumber: "Sedang Berlangsung",
    urgency: "high"
  };

  // Seed test items
  console.log("[Setup] Inserting 6 matrix test records into data store...");
  const created1 = await protestStore.createProtest(rec1_excelOnly);
  const created2 = await protestStore.createProtest(rec2_operatorOnly);
  const created3 = await protestStore.createProtest(rec3_both);
  const created4 = await protestStore.createProtest(rec4_operatorCompletedExcelNotYet);
  const created5 = await protestStore.createProtest(rec5_nullUnfinished);
  const created6 = await protestStore.createProtest(rec6_ongoingExcelAndOp);

  // Update status_sumber directly on seeded items since createProtest may not map source status
  if (protestStore["db"]) {
    const db = protestStore["db"];
    db.prepare("UPDATE protests SET status_sumber = ? WHERE id = ?").run("Selesai", created1.id);
    db.prepare("UPDATE protests SET status_sumber = ? WHERE id = ?").run(null, created2.id);
    db.prepare("UPDATE protests SET status_sumber = ? WHERE id = ?").run("Selesai", created3.id);
    db.prepare("UPDATE protests SET status_sumber = ? WHERE id = ?").run("Belum Berlangsung", created4.id);
    db.prepare("UPDATE protests SET status_sumber = ? WHERE id = ?").run(null, created5.id);
    db.prepare("UPDATE protests SET status_sumber = ? WHERE id = ?").run("Sedang Berlangsung", created6.id);
  } else {
    created1.status_sumber = "Selesai";
    created2.status_sumber = null;
    created3.status_sumber = "Selesai";
    created4.status_sumber = "Belum Berlangsung";
    created5.status_sumber = null;
    created6.status_sumber = "Sedang Berlangsung";
  }

  // --------------------------------------------------------------------------
  // TEST 1: Query with status: 'completed' (The Selesai/Arsip tab condition)
  // --------------------------------------------------------------------------
  console.log("\n[Test 1] Executing queryProtests({ status: 'completed' })...");
  const result = await protestStore.queryProtestsLocal({ status: "completed", limit: 100 });
  const returnedIds = new Set(result.data.map((p) => p.id));
  const returnedKejadianIds = new Set(result.data.map((p) => p.id_kejadian));

  console.log(`  -> Query returned total: ${result.total}, data count: ${result.data.length}`);

  // Condition 1: Selesai dari Excel, operator masih scheduled -> MUST BE FOUND
  assert.ok(
    returnedKejadianIds.has(rec1_excelOnly.id_kejadian),
    "Condition 1 FAIL: Record with status_sumber='Selesai' and status='scheduled' must be included"
  );
  console.log("  ✔ Condition 1 PASS: Record with status_sumber='Selesai' and operator status='scheduled' is included");

  // Condition 2: Selesai dari operator, status sumber Excel null -> MUST BE FOUND
  assert.ok(
    returnedKejadianIds.has(rec2_operatorOnly.id_kejadian),
    "Condition 2 FAIL: Record with operator status='completed' and status_sumber=null must be included"
  );
  console.log("  ✔ Condition 2 PASS: Record with operator status='completed' and status_sumber=null is included");

  // Condition 3: Selesai dari keduanya -> MUST BE FOUND EXACTLY ONCE
  assert.ok(
    returnedKejadianIds.has(rec3_both.id_kejadian),
    "Condition 3 FAIL: Record satisfying both conditions must be included"
  );
  const bothCount = result.data.filter((p) => p.id_kejadian === rec3_both.id_kejadian).length;
  assert.equal(bothCount, 1, "Condition 3 FAIL: Record satisfying both conditions must appear exactly once (no duplicate)");
  console.log("  ✔ Condition 3 PASS: Record satisfying both conditions is included exactly once");

  // Condition 4: Status sumber Excel belum selesai, operator completed -> MUST BE FOUND
  assert.ok(
    returnedKejadianIds.has(rec4_operatorCompletedExcelNotYet.id_kejadian),
    "Condition 4 FAIL: Record with operator completed must be included even if Excel says Belum Berlangsung"
  );
  console.log("  ✔ Condition 4 PASS: Record with operator status='completed' and Excel='Belum Berlangsung' is included");

  // Condition 5: Record dengan status sumber null & operator scheduled -> MUST NOT BE FOUND
  assert.ok(
    !returnedKejadianIds.has(rec5_nullUnfinished.id_kejadian),
    "Condition 5 FAIL: Record with status_sumber=null and operator scheduled must NOT be included"
  );
  console.log("  ✔ Condition 5 PASS: Record with status_sumber=null and operator scheduled is cleanly excluded");

  // Also check ongoing record is excluded
  assert.ok(
    !returnedKejadianIds.has(rec6_ongoingExcelAndOp.id_kejadian),
    "Ongoing record must NOT be in completed archive tab"
  );
  console.log("  ✔ Control PASS: Ongoing active record is cleanly excluded");

  // --------------------------------------------------------------------------
  // TEST 2: Strict Uniqueness (No duplicate primary keys)
  // --------------------------------------------------------------------------
  console.log("\n[Test 2] Verifying 100% uniqueness of returned records...");
  const uniqueIdCount = new Set(result.data.map((p) => p.id)).size;
  assert.equal(uniqueIdCount, result.data.length, "All returned records in completed archive tab must have unique IDs");
  console.log(`  ✔ Uniqueness PASS: All ${result.data.length} records have distinct IDs (0 duplicates)`);

  // --------------------------------------------------------------------------
  // TEST 3: Search Filter (q) within Selesai (Arsip) Tab
  // --------------------------------------------------------------------------
  console.log("\n[Test 3] Verifying Search (q) filter combined with status='completed'...");
  const searchResult = await protestStore.queryProtestsLocal({
    status: "completed",
    q: "Kemenaker"
  });
  const searchKejadian = searchResult.data.map((p) => p.id_kejadian);
  assert.ok(searchKejadian.includes(rec2_operatorOnly.id_kejadian), "Search should find Kemenaker record");
  assert.ok(!searchKejadian.includes(rec1_excelOnly.id_kejadian), "Search should exclude non-matching record");
  console.log(`  ✔ Search filter PASS: Found ${searchResult.total} record(s) matching 'Kemenaker' within completed archive`);

  // --------------------------------------------------------------------------
  // TEST 4: Urgency Filter within Selesai (Arsip) Tab
  // --------------------------------------------------------------------------
  console.log("\n[Test 4] Verifying Urgency filter combined with status='completed'...");
  const highUrgencyResult = await protestStore.queryProtestsLocal({
    status: "completed",
    urgency: "high"
  });
  const highIds = highUrgencyResult.data.map((p) => p.id_kejadian);
  assert.ok(highIds.includes(rec1_excelOnly.id_kejadian), "Urgency filter should find high urgency record");
  assert.ok(!highIds.includes(rec3_both.id_kejadian), "Urgency filter should exclude low urgency record");
  console.log(`  ✔ Urgency filter PASS: Correctly filtered high urgency within completed archive tab`);

  // --------------------------------------------------------------------------
  // TEST 5: Pagination within Selesai (Arsip) Tab
  // --------------------------------------------------------------------------
  console.log("\n[Test 5] Verifying Pagination within Selesai (Arsip) Tab...");
  const page1 = await protestStore.queryProtestsLocal({ status: "completed", page: 1, limit: 2 });
  const page2 = await protestStore.queryProtestsLocal({ status: "completed", page: 2, limit: 2 });
  assert.equal(page1.data.length, 2, "Page 1 limit 2 should return 2 items");
  assert.equal(page2.data.length, 2, "Page 2 limit 2 should return 2 items");
  // Ensure no overlap between page 1 and page 2
  const p1Ids = new Set(page1.data.map((p) => p.id));
  for (const item of page2.data) {
    assert.ok(!p1Ids.has(item.id), "Page 1 and Page 2 must not have overlapping records");
  }
  console.log(`  ✔ Pagination PASS: Page 1 and Page 2 partition records cleanly without overlap`);

  console.log("\n================================================================================");
  console.log("=== ALL 5 REGRESSION TEST CONDITIONS & INVARIANTS PASSED SUCCESSFULLY!       ===");
  console.log("================================================================================\n");
}

runRegressionTests().catch((err) => {
  console.error("Regression test failed:", err);
  process.exit(1);
});

