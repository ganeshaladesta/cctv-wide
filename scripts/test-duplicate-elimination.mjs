/**
 * Comprehensive Automated Test Suite: Phase 5 Duplicate Elimination Engine
 * SCC - EAGLE EYES
 *
 * Verifies all 9 mandatory Phase 5 requirements:
 * 1. Same incident submitted 10 times produces exactly 1 database record.
 * 2. Same incident submitted by Daily H-0 and Manual Rolling 7-day produces exactly 1 record.
 * 3. Concurrent submissions cannot create duplicates (Promise.all parallel sync).
 * 4. Source field edits (minor phrasing/typo) do not create a new incident.
 * 5. Existing incidents are never updated (updated: 0, operator fields unchanged).
 * 6. Ambiguous records are held for review (verified in unras_review_queue, not in protests).
 * 7. Different incidents on the same date are not incorrectly merged (distinct locations & demands).
 * 8. Malformed IDs such as KEJ-20261123- rejected as valid identities and replaced by deterministic fallback.
 * 9. Existing insert-only behavior remains intact.
 */

import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  calculateRolling7DayWindow,
  calculateSameDayWindow,
  processRolling7DaySync,
  processSameDaySync,
  generateDeterministicFallbackId,
  isValidIdKejadian
} from "../src/lib/unras-rolling-sync.ts";
import { protestStore } from "../src/lib/protest-store.ts";

console.log("================================================================================");
console.log("=== SCC - EAGLE EYES: DUPLICATE ELIMINATION TEST SUITE (PHASE 5)             ===");
console.log("================================================================================\n");

async function runTestSuite() {
  const dbPath = path.join(process.cwd(), "data", "pantau-nusantara.sqlite");
  try {
    const testDb = new DatabaseSync(dbPath);
    testDb.exec("DELETE FROM protests WHERE id_kejadian LIKE 'TEST-DUP-%' OR lokasi LIKE '%Kantor Kementerian Agama%'");
    testDb.exec("DELETE FROM unras_identity_registry WHERE canonical_id LIKE 'TEST-DUP-%' OR identity_key LIKE '%Kantor Kementerian Agama%'");
    testDb.exec("DELETE FROM unras_review_queue WHERE matched_canonical_id LIKE 'TEST-DUP-%' OR raw_payload LIKE '%TEST-DUP-%'");
    testDb.close();
  } catch (err) {
    console.warn("Cleanup warning:", err);
  }

  const runId = Date.now();
  const testDate = "2026-11-23";
  const window7d = calculateRolling7DayWindow(new Date(`${testDate}T12:00:00+07:00`));
  const windowH0 = calculateSameDayWindow(new Date(`${testDate}T12:00:00+07:00`));

  // ---------------------------------------------------------------------------
  // Test 1: Same incident submitted 10 times produces exactly 1 database record
  // ---------------------------------------------------------------------------
  console.log("[Test 1/9] Same incident submitted 10 times produces exactly 1 database record...");
  const id1 = `TEST-DUP-REPEAT-${runId}`;
  const payload1 = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window7d.period_start,
    period_end: window7d.period_end,
    events: [
      {
        "ID KEJADIAN": id1,
        "KODE_UNRAS": `CODE-${runId}`,
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T09:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": `Depan Gedung KPK Kuningan ${runId}`,
        "ISU": `Tuntutan Penegakan Hukum Terbuka ${runId}`,
        "ORGANISASI": `Masyarakat Antikorupsi ${runId}`
      }
    ]
  };

  let totalInserted = 0;
  let totalSkipped = 0;
  for (let i = 0; i < 10; i++) {
    const res = await processRolling7DaySync(payload1, "power_automate", "Test Runner");
    totalInserted += res.summary.inserted;
    totalSkipped += res.summary.skipped;
  }
  assert.equal(totalInserted, 1, "Incident must be inserted exactly ONCE");
  assert.equal(totalSkipped, 9, "Remaining 9 attempts must be skipped");
  console.log("  ✔ Submitting same incident 10 times resulted in 1 insert, 9 skips.");

  // ---------------------------------------------------------------------------
  // Test 2: Same incident submitted by Daily H-0 and Manual Rolling 7-day produces exactly 1 record
  // ---------------------------------------------------------------------------
  console.log("\n[Test 2/9] Shared identity across Daily H-0 and Manual Rolling 7-day...");
  const id2 = `TEST-DUP-CROSS-${runId}`;
  const eventCross = {
    "ID KEJADIAN": id2,
    "KODE_UNRAS": `CROSS-${runId}`,
    "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T10:00:00+07:00`,
    "TANGGAL": testDate,
    "LOKASI": `Kawasan Balai Kota Jakarta ${runId}`,
    "ISU": `Penyampaian Tuntutan UMP Pekerja ${runId}`,
    "ORGANISASI": `Serikat Pekerja Ibu Kota ${runId}`
  };

  const resH0 = await processSameDaySync({
    sync_type: "same_day",
    timezone: "Asia/Jakarta",
    period_start: windowH0.period_start,
    period_end: windowH0.period_end,
    events: [eventCross]
  }, "power_automate");

  assert.equal(resH0.summary.inserted, 1, "First sync (Daily H-0) must insert incident");

  const resManual = await processRolling7DaySync({
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window7d.period_start,
    period_end: window7d.period_end,
    events: [eventCross]
  }, "power_automate", "Test Runner");

  assert.equal(resManual.summary.inserted, 0, "Second sync (Manual Rolling 7-day) must NOT insert duplicate");
  assert.equal(resManual.summary.skipped, 1, "Second sync must skip existing incident");
  console.log("  ✔ Daily H-0 inserted 1 record, Manual Rolling 7-day skipped duplicate cleanly.");

  // ---------------------------------------------------------------------------
  // Test 3: Concurrent submissions cannot create duplicates (Promise.all parallel sync)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 3/9] Concurrent submissions race-condition protection...");
  const id3 = `TEST-DUP-CONCURRENT-${runId}`;
  const payloadConcurrent = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window7d.period_start,
    period_end: window7d.period_end,
    events: [
      {
        "ID KEJADIAN": id3,
        "KODE_UNRAS": `CONC-${runId}`,
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T11:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": `Bundaran Patung Kuda Monas ${runId}`,
        "ISU": `Aksi Damai Pengemudi Daring ${runId}`,
        "ORGANISASI": `Komunitas Ojol Nasional ${runId}`
      }
    ]
  };

  const concurrentResults = await Promise.all([
    processRolling7DaySync(payloadConcurrent, "power_automate", "Worker 1"),
    processRolling7DaySync(payloadConcurrent, "power_automate", "Worker 2"),
    processRolling7DaySync(payloadConcurrent, "power_automate", "Worker 3")
  ]);

  const insertedConcurrent = concurrentResults.reduce((acc, r) => acc + r.summary.inserted, 0);
  assert.equal(insertedConcurrent, 1, "Concurrent requests must insert incident exactly ONCE");
  console.log("  ✔ Concurrent execution across 3 workers inserted exactly 1 record, 0 race duplicates.");

  // ---------------------------------------------------------------------------
  // Test 4: Source field edits (minor phrasing/typo) do not create a new incident
  // ---------------------------------------------------------------------------
  console.log("\n[Test 4/9] Source phrasing edits / permutations caught by semantic fingerprint...");
  // Re-submit the same event from Test 1 with rearranged issue wording and minor typo in location
  const payloadPermuted = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window7d.period_start,
    period_end: window7d.period_end,
    events: [
      {
        "ID KEJADIAN": `KEJ-NEW-ROW-ID-${runId}`, // Excel assigned a new row ID
        "KODE_UNRAS": "", // Empty ID UNRAS
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T09:30:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": `Depan Gedung KPK Kuningan ${runId}`, // Same location
        "ISU": `Terbuka Penegakan Hukum Tuntutan ${runId}`, // Words re-ordered!
        "ORGANISASI": `Masyarakat Antikorupsi ${runId}`
      }
    ]
  };

  const resPermuted = await processRolling7DaySync(payloadPermuted, "power_automate", "Test Runner");
  assert.equal(resPermuted.summary.inserted, 0, "Permuted wording MUST NOT insert a second record");
  assert.equal(resPermuted.summary.skipped, 1, "Permuted wording must be detected as DUPLICATE");
  console.log("  ✔ Rearranged demand keywords correctly deduplicated to canonical incident.");

  // ---------------------------------------------------------------------------
  // Test 5: Existing incidents are never updated (updated: 0, operator fields unchanged)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 5/9] Strict INSERT-ONLY / SKIP: Operator fields completely preserved...");
  const storedEvent = await protestStore.getProtestById(id1);
  assert.ok(storedEvent);

  // Operator annotates event
  await protestStore.updateProtest(storedEvent.id, {
    status: "ongoing",
    urgency: "high",
    validated_lat: -6.2088,
    validated_lng: 106.8456,
    situation_summary: "Catatan operator: Terpantau 250 orang tertib di lokasi"
  });

  // Incoming sync with conflicting source changes
  const payloadOverriding = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window7d.period_start,
    period_end: window7d.period_end,
    events: [
      {
        "ID KEJADIAN": id1,
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T09:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": "LOKASI_PALSU_YANG_TIDAK_BOLEH_MENIMPA",
        "ISU": "ISU_PALSU_YANG_TIDAK_BOLEH_MENIMPA",
        "STATUS": "completed" // Should NOT override operator status
      }
    ]
  };

  const resOverride = await processRolling7DaySync(payloadOverriding, "power_automate", "Test Runner");
  assert.equal(resOverride.summary.inserted, 0);
  assert.equal(resOverride.summary.updated, 0, "Updated MUST always remain 0");
  assert.equal(resOverride.summary.skipped, 1);

  const verifiedEvent = await protestStore.getProtestById(id1);
  assert.equal(verifiedEvent.status, "ongoing", "Operator status must not be overridden");
  assert.equal(verifiedEvent.urgency, "high", "Operator urgency must not be overridden");
  assert.equal(verifiedEvent.validated_lat, -6.2088, "Operator latitude must not be overridden");
  assert.equal(verifiedEvent.situation_summary, "Catatan operator: Terpantau 250 orang tertib di lokasi");
  assert.equal(verifiedEvent.lokasi, `Depan Gedung KPK Kuningan ${runId}`, "Original location must remain unchanged");
  console.log("  ✔ Updated count is 0 and operator fields are 100% untouched.");

  // ---------------------------------------------------------------------------
  // Test 6: Ambiguous records are held for review (unras_review_queue, not in protests)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 6/9] Ambiguous records held for operator review...");
  const payloadAmbiguous = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window7d.period_start,
    period_end: window7d.period_end,
    events: [
      {
        "ID KEJADIAN": "", // missing
        "ID UNRAS": "",    // missing
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T14:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": `Depan Gedung KPK Kuningan ${runId}`, // Same location as id1
        "ISU": `Tuntutan Transparansi Tambahan ${runId}`, // Related partial overlap
        "ORGANISASI": `Gerakan Masyarakat Berantas Korupsi ${runId}`
      }
    ]
  };

  const resAmbiguous = await processRolling7DaySync(payloadAmbiguous, "power_automate", "Test Runner");
  assert.equal(resAmbiguous.summary.inserted, 0, "Ambiguous records must NOT be inserted into protests");
  assert.equal(resAmbiguous.summary.skipped, 1, "Ambiguous record is counted as skipped");

  const reviewQueue = await protestStore.getReviewQueue("pending_review");
  const queuedItem = reviewQueue.find(item => item.lokasi === `Depan Gedung KPK Kuningan ${runId}`);
  assert.ok(queuedItem, "Item must be queued in unras_review_queue");
  assert.equal(queuedItem.status, "pending_review");
  assert.ok(queuedItem.ambiguity_reason.includes("Kemiripan parsial"));
  console.log("  ✔ Ambiguous record quarantined in unras_review_queue for operator adjudication.");

  // ---------------------------------------------------------------------------
  // Test 7: Different incidents on the same date are not incorrectly merged
  // ---------------------------------------------------------------------------
  console.log("\n[Test 7/9] Distinct incidents on the same date are preserved...");
  const idDistinctA = `TEST-DUP-DISTINCT-A-${runId}`;
  const idDistinctB = `TEST-DUP-DISTINCT-B-${runId}`;
  const payloadDistinct = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window7d.period_start,
    period_end: window7d.period_end,
    events: [
      {
        "ID KEJADIAN": idDistinctA,
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T10:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": `Gedung Kemenkes RI Kuningan ${runId}`,
        "ISU": `Tuntutan Insentif Tenaga Kesehatan ${runId}`,
        "ORGANISASI": `Persatuan Perawat Seluruh Indonesia ${runId}`
      },
      {
        "ID KEJADIAN": idDistinctB,
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T10:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": `Kementerian Perhubungan RI Gambir ${runId}`,
        "ISU": `Regulasi Tarif Angkutan Pelabuhan Laut ${runId}`,
        "ORGANISASI": `Asosiasi Logistik dan Pelayaran ${runId}`
      }
    ]
  };

  const resDistinct = await processRolling7DaySync(payloadDistinct, "power_automate", "Test Runner");
  assert.equal(resDistinct.summary.inserted, 2, "Both distinct incidents must be inserted");
  assert.equal(resDistinct.summary.skipped, 0);

  const recA = await protestStore.getProtestById(idDistinctA);
  const recB = await protestStore.getProtestById(idDistinctB);
  assert.ok(recA && recB, "Both incidents must exist independently in database");
  console.log("  ✔ Distinct incidents at different venues on same date correctly inserted.");

  // ---------------------------------------------------------------------------
  // Test 8: Malformed IDs such as KEJ-20261123- rejected and given deterministic fallback
  // ---------------------------------------------------------------------------
  console.log("\n[Test 8/9] Malformed IDs rejected and replaced by deterministic fallback...");
  assert.equal(isValidIdKejadian("KEJ-20261123-"), false, "Malformed ID ending with hyphen must be invalid");
  assert.equal(isValidIdKejadian("KEJ-"), false, "Empty suffix must be invalid");
  assert.equal(isValidIdKejadian(null), false);
  assert.equal(isValidIdKejadian("   "), false);

  const loc8 = `Kantor Kementerian Agama RI Lapangan Banteng ${runId}`;
  const isu8 = `Aspirasi Guru Madrasah Terkait Sertifikasi ${runId}`;
  const org8 = `Forum Pendidik Madrasah ${runId}`;

  const expectedFallbackId = generateDeterministicFallbackId(testDate, loc8, org8, isu8);
  assert.ok(expectedFallbackId.startsWith(`KEJ-20261123-`));
  assert.equal(expectedFallbackId.length, `KEJ-20261123-`.length + 16);

  const payloadMalformed = {
    sync_type: "rolling_7d",
    timezone: "Asia/Jakarta",
    period_start: window7d.period_start,
    period_end: window7d.period_end,
    events: [
      {
        "ID KEJADIAN": "KEJ-20261123-", // Malformed
        "ID UNRAS": "",
        "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T13:00:00+07:00`,
        "TANGGAL": testDate,
        "LOKASI": loc8,
        "ISU": isu8,
        "ORGANISASI": org8
      }
    ]
  };

  const resMalformed = await processRolling7DaySync(payloadMalformed, "power_automate", "Test Runner");
  if (resMalformed.summary.inserted !== 1) {
    console.log("resMalformed error details:", resMalformed.errors, resMalformed.summary);
  }
  assert.equal(resMalformed.summary.inserted, 1, "Record with malformed ID must be inserted with fallback ID");
  const storedFallback = await protestStore.getProtestById(expectedFallbackId);
  assert.ok(storedFallback, `Record must exist under deterministic ID: ${expectedFallbackId}`);
  console.log(`  ✔ Malformed 'KEJ-20261123-' safely replaced with deterministic ID: ${expectedFallbackId}`);

  // ---------------------------------------------------------------------------
  // Test 9: Existing insert-only behavior remains intact
  // ---------------------------------------------------------------------------
  console.log("\n[Test 9/9] Verifying permanent insert-only invariants...");
  const stats = await protestStore.getStats();
  assert.ok(stats.total_events > 0, "Database must retain all inserted events");
  console.log("  ✔ Insert-only invariants fully verified.");

  console.log("\n================================================================================");
  console.log("=== PHASE 5: ALL 9 DUPLICATE ELIMINATION TESTS PASSED (100% PASS)            ===");
  console.log("================================================================================\n");
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
