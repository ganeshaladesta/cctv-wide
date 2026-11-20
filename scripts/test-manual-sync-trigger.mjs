/**
 * SCC - EAGLE EYES: Manual Sync Button & Power Automate Integration Test Suite
 * Automated tests covering all 13 requirements for manual trigger integration.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { GET as getSync, POST as postSync } from "../src/app/api/protests/sync/route.ts";
import { POST as postIntegrationsSync } from "../src/app/api/integrations/unras/sync/route.ts";
import {
  calculateSameDayWindow,
  processSameDaySync
} from "../src/lib/unras-rolling-sync.ts";
import { protestStore } from "../src/lib/protest-store.ts";

const SECRET = "scc-unras-secret-token-2026-xyz";
process.env.UNRAS_SYNC_SECRET = SECRET;

const results = [];

function recordTest(num, name, passed, details = "") {
  results.push({ num, name, passed, details });
  const status = passed ? "✔ PASS" : "✖ FAIL";
  console.log(`[Test ${String(num).padStart(2, "0")}/13] ${status} - ${name}`);
  if (details) {
    console.log(`          ${details}`);
  }
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("=== SCC - EAGLE EYES: MANUAL SYNC TRIGGER INTEGRATION TEST SUITE (13 CASES) ===");
  console.log("================================================================================\n");

  const todayWindow = calculateSameDayWindow();
  const todayWib = todayWindow.date_wib;
  const validEventIso = `${todayWib}T10:00:00+07:00`;

  // ---------------------------------------------------------------------------
  // Test 1: Daily recurrence remains operational
  // ---------------------------------------------------------------------------
  try {
    const scheduledPayload = {
      sync_type: "same_day",
      timezone: "Asia/Jakarta",
      period_start: todayWindow.period_start,
      period_end: todayWindow.period_end,
      triggered_by: "power_automate",
      events: [
        {
          id_kejadian: "KEJ-CRON-DAILY-001",
          kode_unras: "U2001",
          tanggal_kejadian: validEventIso,
          tuntutan: "Aksi Terjadwal Harian 05:00 WIB",
          lokasi: "Gedung BI Thamrin",
          waktu: "09:00"
        }
      ]
    };
    const res = await processSameDaySync(scheduledPayload, "power_automate", "Scheduled Sync (05:00 WIB)");
    assert.equal(res.success, true);
    assert.ok(res.summary.inserted >= 1 || res.summary.updated >= 1);
    
    const logs = await protestStore.getSyncLogs(5);
    const lastLog = logs.find((l) => l.id === res.execution_id);
    assert.ok(lastLog, "Sync log must exist");
    assert.equal(lastLog.triggered_by, "power_automate");
    recordTest(1, "Daily recurrence remains operational", true, "Scheduled 05:00 WIB sync executed with triggered_by: power_automate");
  } catch (err) {
    recordTest(1, "Daily recurrence remains operational", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 2: Manual Admin trigger invokes the same flow
  // ---------------------------------------------------------------------------
  try {
    // Set mock trigger URL for testing environment
    process.env.POWER_AUTOMATE_TRIGGER_URL = "mock://power-automate-flow-endpoint";
    process.env.ALLOW_MOCK_SYNC_TRIGGER = "true";

    const req = new NextRequest("http://localhost:3000/api/protests/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "admin",
        "x-scc-user-name": "Admin Komando"
      },
      body: JSON.stringify({})
    });

    const res = await postSync(req);
    assert.equal(res.status, 202);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.status, "running");
    assert.ok(json.execution_id.startsWith("sync-"));

    const log = await protestStore.getSyncLogById(json.execution_id);
    assert.ok(log, "Running sync log must be registered in store");
    assert.equal(log.triggered_by, "manual_admin");
    recordTest(2, "Manual Admin trigger invokes the same flow", true, `Initialized execution: ${json.execution_id} (manual_admin)`);

    // Complete Test 2 log so concurrency lock is clear for Test 5
    await protestStore.updateSyncLog(json.execution_id, {
      status: "success",
      completed_at: new Date().toISOString()
    });
  } catch (err) {
    recordTest(2, "Manual Admin trigger invokes the same flow", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 3: Viewer cannot trigger sync (HTTP 403)
  // ---------------------------------------------------------------------------
  try {
    const req = new NextRequest("http://localhost:3000/api/protests/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "viewer"
      },
      body: JSON.stringify({})
    });

    const res = await postSync(req);
    assert.equal(res.status, 403, "Viewer must receive HTTP 403 Forbidden");
    const json = await res.json();
    assert.equal(json.success, false);
    assert.ok(json.error.includes("Akses ditolak"));
    recordTest(3, "Viewer cannot trigger sync (HTTP 403)", true, "Properly blocked with HTTP 403 Forbidden");
  } catch (err) {
    recordTest(3, "Viewer cannot trigger sync (HTTP 403)", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 4: Operator cannot trigger sync (HTTP 403)
  // ---------------------------------------------------------------------------
  try {
    const req = new NextRequest("http://localhost:3000/api/protests/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "operator"
      },
      body: JSON.stringify({})
    });

    const res = await postSync(req);
    assert.equal(res.status, 403, "Operator must receive HTTP 403 Forbidden");
    const json = await res.json();
    assert.equal(json.success, false);
    assert.ok(json.error.includes("Akses ditolak"));
    recordTest(4, "Operator cannot trigger sync (HTTP 403)", true, "Properly blocked with HTTP 403 Forbidden");
  } catch (err) {
    recordTest(4, "Operator cannot trigger sync (HTTP 403)", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 5: Admin can trigger sync (HTTP 202)
  // ---------------------------------------------------------------------------
  try {
    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 5500));

    const req = new NextRequest("http://localhost:3000/api/protests/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "admin",
        "x-scc-user-name": "Super Admin"
      },
      body: JSON.stringify({})
    });

    const res = await postSync(req);
    assert.equal(res.status, 202, "Admin trigger request must return HTTP 202 Accepted");
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.status, "running");
    recordTest(5, "Admin can trigger sync (HTTP 202)", true, "Accepted with execution_id and status: running");
  } catch (err) {
    recordTest(5, "Admin can trigger sync (HTTP 202)", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 6: Duplicate clicks are handled safely (rate limit / 409 / 429)
  // ---------------------------------------------------------------------------
  try {
    // Immediate second click (duplicate spam click within 1 second)
    const reqDuplicate = new NextRequest("http://localhost:3000/api/protests/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scc-user-role": "admin"
      },
      body: JSON.stringify({})
    });

    const resDuplicate = await postSync(reqDuplicate);
    assert.ok(
      resDuplicate.status === 429 || resDuplicate.status === 409,
      `Duplicate click must return 429 or 409, got ${resDuplicate.status}`
    );
    const json = await resDuplicate.json();
    assert.equal(json.success, false);
    recordTest(6, "Duplicate clicks are handled safely", true, `Safely rejected with HTTP ${resDuplicate.status} (${json.status || json.error})`);
  } catch (err) {
    recordTest(6, "Duplicate clicks are handled safely", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 7: Running status is displayed accurately
  // ---------------------------------------------------------------------------
  try {
    // Fetch logs via GET /api/protests/sync
    const req = new NextRequest("http://localhost:3000/api/protests/sync?limit=5", {
      method: "GET"
    });
    const res = await getSync(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.latestSyncLogs));
    
    // Check running log
    const runningLog = json.latestSyncLogs.find((l) => l.status === "running");
    assert.ok(runningLog, "At least one log should reflect 'running' state");
    recordTest(7, "Running status is displayed accurately", true, `Log ${runningLog.id} status is 'running'`);
  } catch (err) {
    recordTest(7, "Running status is displayed accurately", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 8: Successful execution updates dashboard metrics
  // ---------------------------------------------------------------------------
  try {
    // Power Automate delivers payload back to POST /api/integrations/unras/sync
    const payload = {
      sync_type: "same_day",
      timezone: "Asia/Jakarta",
      events: [
        {
          id_kejadian: "KEJ-METRIC-TEST-008",
          kode_unras: "U2008",
          tanggal_kejadian: validEventIso,
          tuntutan: "Aksi Verifikasi Metrik Dashboard",
          lokasi: "Kantor Pusat BI",
          waktu: "10:00",
          jumlah_massa: 600
        }
      ]
    };

    const req = new NextRequest("http://localhost:3000/api/integrations/unras/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SECRET}`
      },
      body: JSON.stringify(payload)
    });

    const res = await postIntegrationsSync(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.summary.processed >= 1);

    // Verify stats updated
    const stats = await protestStore.getStats();
    assert.ok(stats.total_events >= 1);
    recordTest(8, "Successful execution updates dashboard metrics", true, `Processed: ${json.summary.processed}, Total events: ${stats.total_events}`);
  } catch (err) {
    recordTest(8, "Successful execution updates dashboard metrics", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 9: Failed execution displays actual error
  // ---------------------------------------------------------------------------
  try {
    const errorLogId = `sync-err-test-${Date.now()}`;
    await protestStore.createSyncLog({
      id: errorLogId,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: "failed",
      triggered_by: "manual_admin",
      triggered_by_user: "Admin Test",
      source_worksheet: "NEW UNRAS 2022-2026",
      records_received: 5,
      records_processed: 0,
      records_created: 0,
      records_updated: 0,
      records_skipped: 0,
      records_failed: 5,
      error_details: "Koneksi ke Microsoft Excel Online Business timeout pada gateway",
      duration_ms: 1250
    });

    const req = new NextRequest(`http://localhost:3000/api/protests/sync?execution_id=${errorLogId}`, {
      method: "GET"
    });
    const res = await getSync(req);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.execution.status, "failed");
    assert.equal(json.execution.error_details, "Koneksi ke Microsoft Excel Online Business timeout pada gateway");
    recordTest(9, "Failed execution displays actual error", true, "Error message preserved & surfaced accurately");
  } catch (err) {
    recordTest(9, "Failed execution displays actual error", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 10: H-0 WIB filtering remains unchanged
  // ---------------------------------------------------------------------------
  try {
    // Yesterday event (H-1)
    const yesterdayIso = "2026-11-18T10:00:00+07:00";
    const payload = {
      events: [
        {
          id_kejadian: "KEJ-PAST-010",
          kode_unras: "U2010",
          tanggal_kejadian: yesterdayIso,
          tuntutan: "Aksi Masa Lampau Kemarin",
          lokasi: "Monas"
        }
      ]
    };

    const res = await processSameDaySync(payload, "power_automate");
    assert.equal(res.summary.skipped, 1);
    assert.ok(res.errors.some((e) => e.includes("lebih lampau dari hari ini")));
    recordTest(10, "H-0 WIB filtering remains unchanged", true, "Yesterday event strictly excluded from same-day window");
  } catch (err) {
    recordTest(10, "H-0 WIB filtering remains unchanged", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 11: Repeated sync does not duplicate records
  // ---------------------------------------------------------------------------
  try {
    const idKejadian = "KEJ-REPEAT-TEST-011";
    const payload = {
      events: [
        {
          id_kejadian: idKejadian,
          kode_unras: "U2011",
          tanggal_kejadian: validEventIso,
          tuntutan: "Aksi Berulang Idempoten",
          lokasi: "Gedung DPR RI",
          waktu: "09:00"
        }
      ]
    };

    const res1 = await processSameDaySync(payload, "power_automate");
    const count1 = (await protestStore.queryProtests({ q: idKejadian })).total;

    const res2 = await processSameDaySync(payload, "power_automate");
    const count2 = (await protestStore.queryProtests({ q: idKejadian })).total;

    assert.equal(count1, count2, "Total database rows must not increase");
    assert.equal(res2.summary.updated, 1, "Second run must perform UPDATE");
    recordTest(11, "Repeated sync does not duplicate records", true, `Row count stable at ${count1}, 0 duplicates created`);
  } catch (err) {
    recordTest(11, "Repeated sync does not duplicate records", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 12: Existing manual UNRAS data is preserved
  // ---------------------------------------------------------------------------
  try {
    const manualId = `MANUAL-INPUT-${Date.now()}`;
    const manualEvent = await protestStore.createProtest({
      id_kejadian: manualId,
      kode_unras: `UNR-${Date.now()}`,
      tanggal: todayWib,
      waktu_mulai: "08:30:00",
      lokasi: "Depan Pintu Air Istana",
      isu_tuntutan: "Aksi Spontan Warga (Input Manual)",
      source_type: "manual",
      status: "ongoing"
    });

    // Run Excel sync
    const syncPayload = {
      events: [
        {
          id_kejadian: `KEJ-EXCEL-${Date.now()}`,
          kode_unras: "U2012",
          tanggal_kejadian: validEventIso,
          tuntutan: "Aksi Dari Excel",
          lokasi: "Patung Kuda"
        }
      ]
    };
    await processSameDaySync(syncPayload, "power_automate");

    // Verify manual event is still intact
    const manualRecord = await protestStore.getProtestById(manualEvent.id);
    assert.ok(manualRecord, "Manual event must not be deleted or modified");
    assert.equal(manualRecord.id, manualEvent.id);
    assert.equal(manualRecord.isu_tuntutan, "Aksi Spontan Warga (Input Manual)");
    assert.equal(manualRecord.lokasi, "Depan Pintu Air Istana");
    recordTest(12, "Existing manual UNRAS data is preserved", true, "Manual record completely untouched by Excel sync");
  } catch (err) {
    recordTest(12, "Existing manual UNRAS data is preserved", false, err.message);
  }

  // ---------------------------------------------------------------------------
  // Test 13: Existing operator-managed fields are preserved
  // ---------------------------------------------------------------------------
  try {
    const idKejadian = "KEJ-OPERATOR-PROTECT-013";
    const initialPayload = {
      events: [
        {
          id_kejadian: idKejadian,
          kode_unras: "U2013",
          tanggal_kejadian: validEventIso,
          tuntutan: "Tuntutan Awal",
          lokasi: "Gedung Sate",
          waktu: "09:00"
        }
      ]
    };
    await processSameDaySync(initialPayload, "power_automate");

    const record = (await protestStore.queryProtests({ q: idKejadian })).data[0];
    assert.ok(record, "Created record must exist");

    // Operator updates fields
    await protestStore.updateProtest(record.id, {
      status: "ongoing",
      urgency: "critical",
      validated_lat: -6.9024,
      validated_lng: 107.6186,
      actual_crowd_size: 2000,
      situation_summary: "Observasi Lapangan: Gerbang ditutup kawat berduri"
    });

    // Repeated sync with updated Excel title
    const secondPayload = {
      events: [
        {
          id_kejadian: idKejadian,
          kode_unras: "U2013",
          tanggal_kejadian: validEventIso,
          tuntutan: "Tuntutan Revisi Jam 12",
          lokasi: "Gedung Sate Lapangan Gasibu",
          waktu: "12:00"
        }
      ]
    };
    await processSameDaySync(secondPayload, "power_automate");

    const updatedRecord = await protestStore.getProtestById(record.id);
    assert.ok(updatedRecord);
    assert.equal(updatedRecord.status, "ongoing", "Status must remain 'ongoing'");
    assert.equal(updatedRecord.urgency, "critical", "Urgency must remain 'critical'");
    assert.equal(updatedRecord.validated_lat, -6.9024, "Latitude must be preserved");
    assert.equal(updatedRecord.validated_lng, 107.6186, "Longitude must be preserved");
    assert.equal(updatedRecord.actual_crowd_size, 2000, "Actual crowd size must be preserved");
    assert.equal(updatedRecord.situation_summary, "Observasi Lapangan: Gerbang ditutup kawat berduri");
    assert.equal(updatedRecord.isu_tuntutan, "Tuntutan Revisi Jam 12", "Source field updated");
    recordTest(13, "Existing operator-managed fields are preserved", true, "Operator coordinates, status, and notes 100% preserved");
  } catch (err) {
    recordTest(13, "Existing operator-managed fields are preserved", false, err.message);
  }

  console.log("\n================================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`=== HASIL AKHIR: ${passedCount}/13 PENGUJIAN BERHASIL (PASS)                         ===`);
  console.log("================================================================================");

  if (passedCount !== 13) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed with unhandled error:", err);
  process.exit(1);
});
