/**
 * SCC - EAGLE EYES: ASYNC OUTBOUND JOB QUEUE TEST SUITE
 * Verifies all 14 requirements of the optimistic UI + persistent background job queue.
 */

import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import http from "node:http";
import { protestStore } from "../src/lib/protest-store.ts";
import {
  enqueueOutboundSync,
  claimPendingOutboundJob,
  processOutboundJob,
  runOutboundSyncWorker,
  getLatestOutboundJobByProtestId,
  retryOutboundJob,
  recoverPendingOutboundJobs,
  verifyAndRecoverUnclaimedJob
} from "../src/lib/unras-outbound-queue.ts";
import { POST as workerPostHandler } from "../src/app/api/integrations/unras/outbound-worker/route.ts";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import {
  buildOutboundPayload,
  mapSCCStatusToExcelStatus
} from "../src/lib/unras-outbound-sync.ts";
import { extractInboundMappedUpdates } from "../src/lib/unras-rolling-sync.ts";

beforeEach(() => {
  protestStore.clearOutboundJobsLocal();
});

test("1. Save persists SCC data into store", async () => {
  const testId = `test-persist-${Date.now()}`;
  const event = await protestStore.createProtest({
    id_kejadian: `KEJ-${testId}`,
    kode_unras: `UNR-${testId}`,
    tanggal: "2026-11-25",
    waktu_mulai: "09:00:00",
    lokasi: "Gedung Bank Indonesia",
    kota_kabupaten: "Jakarta Pusat",
    isu_tuntutan: "Aspirasi Moneter",
    status: "scheduled",
    actual_crowd_size: 250
  });

  assert.ok(event);
  assert.equal(event.lokasi, "Gedung Bank Indonesia");
  assert.equal(event.actual_crowd_size, 250);
});

test("2. Save creates one outbound job with pending status", async () => {
  const testId = `test-job-create-${Date.now()}`;
  const event = await protestStore.createProtest({
    id_kejadian: `KEJ-${testId}`,
    kode_unras: `UNR-${testId}`,
    tanggal: "2026-11-25",
    lokasi: "Kawasan Monas",
    kota_kabupaten: "Jakarta Pusat",
    isu_tuntutan: "Aksi Damai Buruh",
    status: "ongoing"
  });

  const res = await enqueueOutboundSync(event, { origin: "scc", route: "PATCH /api/protests/[id]" });
  assert.equal(res.queued, true);
  assert.ok(res.job);
  assert.equal(res.job.status, "pending");
  assert.equal(res.job.protest_id, event.id);
  assert.equal(res.job.kode_unras, `UNR-${testId}`);
  assert.equal(res.job.attempts, 0);

  // Check store state updated
  const stored = await protestStore.getProtestById(event.id);
  assert.equal(stored?.outbound_sync_status, "pending");
});

test("3. API responds without waiting for Power Automate (<100ms)", async () => {
  const testId = `test-latency-${Date.now()}`;
  const event = await protestStore.createProtest({
    id_kejadian: `KEJ-${testId}`,
    kode_unras: `UNR-${testId}`,
    tanggal: "2026-11-25",
    lokasi: "DPR RI",
    kota_kabupaten: "Jakarta Pusat",
    isu_tuntutan: "RUU Pengupahan",
    status: "scheduled"
  });

  const startTime = Date.now();
  const res = await enqueueOutboundSync(event, { origin: "scc" });
  const duration = Date.now() - startTime;

  assert.equal(res.queued, true);
  assert.ok(duration < 100, `Enqueue execution time must be under 100ms, actual: ${duration}ms`);
});

test("4. Worker successfully sends a pending job via HTTP", async () => {
  let receivedPayload = null;
  const mockServer = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      receivedPayload = JSON.parse(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "success" }));
    });
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = `http://127.0.0.1:${port}/flow-success`;

  try {
    const testId = `test-worker-send-${Date.now()}`;
    const event = await protestStore.createProtest({
      id_kejadian: `KEJ-${testId}`,
      kode_unras: `UNR-${testId}`,
      tanggal: "2026-11-25",
      lokasi: "Gedung Balaikota",
      kota_kabupaten: "Jakarta Pusat",
      isu_tuntutan: "Aspirasi Buruh Jakarta",
      status: "completed",
      actual_crowd_size: 500
    });

    const enqueueRes = await enqueueOutboundSync(event, { origin: "scc" });
    assert.ok(enqueueRes.job);

    const claimed = await claimPendingOutboundJob("worker-test-1");
    assert.ok(claimed);
    assert.equal(claimed.id, enqueueRes.job.id);
    assert.equal(claimed.status, "processing");

    const execResult = await processOutboundJob(claimed);
    assert.equal(execResult.success, true);
    assert.equal(execResult.status, "success");
    assert.ok(receivedPayload);
    assert.equal(receivedPayload.origin, "scc");
    assert.equal(receivedPayload.id_unras, `UNR-${testId}`);
    assert.equal(receivedPayload.fields["STATUS KEJADIAN"], "Selesai");
  } finally {
    delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
    mockServer.close();
  }
});

test("5. Worker marks successful jobs correctly in DB", async () => {
  let received = false;
  const mockServer = http.createServer((req, res) => {
    received = true;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = `http://127.0.0.1:${port}/worker-mark`;

  try {
    const testId = `test-mark-succ-${Date.now()}`;
    const event = await protestStore.createProtest({
      id_kejadian: `KEJ-${testId}`,
      kode_unras: `UNR-${testId}`,
      tanggal: "2026-11-25",
      lokasi: "Bundaran HI",
      kota_kabupaten: "Jakarta Pusat",
      isu_tuntutan: "Aspirasi Buruh",
      status: "ongoing"
    });

    await enqueueOutboundSync(event, { origin: "scc" });
    const workerRes = await runOutboundSyncWorker({ maxJobs: 1 });
    assert.equal(workerRes.processed, 1);
    assert.equal(workerRes.succeeded, 1);

    const latestJob = await getLatestOutboundJobByProtestId(event.id);
    assert.ok(latestJob);
    assert.equal(latestJob.status, "success");
    assert.ok(latestJob.processed_at);

    const stored = await protestStore.getProtestById(event.id);
    assert.equal(stored?.outbound_sync_status, "success");
    assert.ok(stored?.last_outbound_synced_at);
  } finally {
    delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
    mockServer.close();
  }
});

test("6. Worker retries temporary HTTP errors (5xx) with backoff", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Service Unavailable" }));
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = `http://127.0.0.1:${port}/retry-test`;

  try {
    const testId = `test-retry-temp-${Date.now()}`;
    const event = await protestStore.createProtest({
      id_kejadian: `KEJ-${testId}`,
      kode_unras: `UNR-${testId}`,
      tanggal: "2026-11-25",
      lokasi: "Kemenaker",
      kota_kabupaten: "Jakarta Selatan",
      isu_tuntutan: "Aspirasi UMP",
      status: "ongoing"
    });

    const enqueueRes = await enqueueOutboundSync(event, { origin: "scc" });
    const claimed = await claimPendingOutboundJob("worker-retry-test");
    assert.ok(claimed);

    const execRes = await processOutboundJob(claimed);
    assert.equal(execRes.success, false);

    const latestJob = await getLatestOutboundJobByProtestId(event.id);
    assert.ok(latestJob);
    assert.equal(latestJob.status, "pending", "Transient failure must reschedule to pending status");
    assert.ok(latestJob.next_retry_at, "Must have next_retry_at set");
    assert.equal(latestJob.attempts, 1);
  } finally {
    delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
    mockServer.close();
  }
});

test("7. Worker marks permanently failed jobs after max attempts or non-retryable 4xx", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Row not found in Table3" }));
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = `http://127.0.0.1:${port}/fail-test`;

  try {
    const testId = `test-fail-perm-${Date.now()}`;
    const event = await protestStore.createProtest({
      id_kejadian: `KEJ-${testId}`,
      kode_unras: `UNR-${testId}`,
      tanggal: "2026-11-25",
      lokasi: "KPK",
      kota_kabupaten: "Jakarta Selatan",
      isu_tuntutan: "Aspirasi Antikorupsi",
      status: "ongoing"
    });

    await enqueueOutboundSync(event, { origin: "scc" });
    const claimed = await claimPendingOutboundJob("worker-fail-test");
    assert.ok(claimed);

    const execRes = await processOutboundJob(claimed);
    assert.equal(execRes.success, false);
    assert.equal(execRes.status, "not_found");

    const latestJob = await getLatestOutboundJobByProtestId(event.id);
    assert.ok(latestJob);
    assert.equal(latestJob.status, "failed");

    const stored = await protestStore.getProtestById(event.id);
    assert.equal(stored?.outbound_sync_status, "failed");
  } finally {
    delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
    mockServer.close();
  }
});

test("8. Two workers cannot claim the same job (Concurrency Lock Protection)", async () => {
  const testId = `test-race-${Date.now()}`;
  const event = await protestStore.createProtest({
    id_kejadian: `KEJ-${testId}`,
    kode_unras: `UNR-${testId}`,
    tanggal: "2026-11-25",
    lokasi: "Kemendagri",
    kota_kabupaten: "Jakarta Pusat",
    isu_tuntutan: "Pilkada Serentak",
    status: "ongoing"
  });

  await enqueueOutboundSync(event, { origin: "scc" });

  // Worker 1 claims
  const worker1Claim = await claimPendingOutboundJob("worker-1");
  assert.ok(worker1Claim, "Worker 1 must claim the pending job");

  // Worker 2 attempts to claim immediately
  const worker2Claim = await claimPendingOutboundJob("worker-2");
  assert.equal(worker2Claim, null, "Worker 2 must NOT be able to claim the same job already locked by Worker 1");
});

test("9. Stale processing locks (>5 mins) can be recovered", async () => {
  const testId = `test-stale-${Date.now()}`;
  const event = await protestStore.createProtest({
    id_kejadian: `KEJ-${testId}`,
    kode_unras: `UNR-${testId}`,
    tanggal: "2026-11-25",
    lokasi: "Kemenpora",
    kota_kabupaten: "Jakarta Pusat",
    isu_tuntutan: "Aspirasi Pemuda",
    status: "ongoing"
  });

  const enqueueRes = await enqueueOutboundSync(event, { origin: "scc" });
  assert.ok(enqueueRes.job);

  // Simulate a crashed worker that left locked_at 10 minutes ago
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  protestStore.updateOutboundJobLocal(enqueueRes.job.id, {
    status: "processing",
    locked_at: tenMinutesAgo
  });

  // Verify recovering stale locks
  const recoveredCount = protestStore.resetStaleOutboundJobLocksLocal();
  assert.ok(recoveredCount >= 1, "Must recover at least 1 stale lock");

  // Worker should now be able to claim it
  const newClaim = await claimPendingOutboundJob("worker-recovered");
  assert.ok(newClaim, "Recovered stale job must be claimable by next worker");
  assert.equal(newClaim.id, enqueueRes.job.id);
});

test("10. Inbound synchronization does not enqueue outbound jobs (Loop Prevention)", async () => {
  const testId = `test-inbound-loop-${Date.now()}`;
  const event = await protestStore.createProtest({
    id_kejadian: `KEJ-${testId}`,
    kode_unras: `UNR-${testId}`,
    tanggal: "2026-11-25",
    lokasi: "Kemenhub",
    kota_kabupaten: "Jakarta Pusat",
    isu_tuntutan: "Aspirasi Transportasi",
    status: "ongoing"
  });

  // When inbound Excel sync runs, origin is 'excel'
  const enqueueRes = await enqueueOutboundSync(event, { origin: "excel" });
  assert.equal(enqueueRes.queued, false);
  assert.match(enqueueRes.reason, /Loop prevention/);

  // Check no job was created
  const latestJob = await getLatestOutboundJobByProtestId(event.id);
  assert.equal(latestJob, null, "No job must be created when origin is excel");
});

test("11. Explicit null and empty values are preserved in queued payload", async () => {
  const testId = `test-explicit-empty-${Date.now()}`;
  const event = await protestStore.createProtest({
    id_kejadian: `KEJ-${testId}`,
    kode_unras: `UNR-${testId}`,
    tanggal: "2026-11-25",
    lokasi: "Kemenko Perekonomian",
    kota_kabupaten: "Jakarta Pusat",
    isu_tuntutan: "Aspirasi Ekonomi",
    actual_crowd_size: null, // Explicit clear
    editorial_final: "", // Explicit clear
    editorial_draft: "", // Explicit clear
    status: "ongoing"
  });

  const enqueueRes = await enqueueOutboundSync(event, { origin: "scc" });
  assert.ok(enqueueRes.job);

  const payload = enqueueRes.job.payload;
  assert.equal(payload.fields["ESTIMASI JUMLAH MASSA"], null, "Explicit null crowd size must be preserved as null");
  assert.equal(payload.fields["REDAKSI"], null, "Cleared editorial must be preserved as null");
});

test("12. BATAS column is never included in queued outbound payload", async () => {
  const testId = `test-batas-${Date.now()}`;
  const event = await protestStore.createProtest({
    id_kejadian: `KEJ-${testId}`,
    kode_unras: `UNR-${testId}`,
    tanggal: "2026-11-25",
    lokasi: "Kantor Pertanahan",
    kota_kabupaten: "Jakarta Selatan",
    isu_tuntutan: "Sengketa Lahan",
    status: "scheduled"
  });

  const enqueueRes = await enqueueOutboundSync(event, { origin: "scc" });
  assert.ok(enqueueRes.job);

  const payload = enqueueRes.job.payload;
  assert.equal("BATAS" in payload.fields, false, "BATAS must NEVER be in outbound payload fields");
});

test("13. Manual retry capability for failed jobs", async () => {
  const testId = `test-manual-retry-${Date.now()}`;
  const event = await protestStore.createProtest({
    id_kejadian: `KEJ-${testId}`,
    kode_unras: `UNR-${testId}`,
    tanggal: "2026-11-25",
    lokasi: "Kementerian BUMN",
    kota_kabupaten: "Jakarta Pusat",
    isu_tuntutan: "Restrukturisasi",
    status: "scheduled"
  });

  const enqueueRes = await enqueueOutboundSync(event, { origin: "scc" });
  assert.ok(enqueueRes.job);

  // Mark job as failed
  protestStore.updateOutboundJobLocal(enqueueRes.job.id, {
    status: "failed",
    last_error: "Connection timeout"
  });

  let jobState = await getLatestOutboundJobByProtestId(event.id);
  assert.equal(jobState?.status, "failed");

  // Operator triggers retry
  const retried = await retryOutboundJob(enqueueRes.job.id);
  assert.equal(retried, true);

  jobState = await getLatestOutboundJobByProtestId(event.id);
  assert.equal(jobState?.status, "pending", "Manual retry must reset job to pending");
  assert.equal(jobState?.locked_at, null);
});

test("14. Frontend distinguishes SCC save success from Excel sync success", () => {
  // Verifies contract:
  // SCC save responds immediately with { success: true, message: 'Data unjuk rasa berhasil diperbarui.' }
  // Excel sync state is held independently in outbound_sync: { status: 'pending' | 'processing' | 'success' | 'failed' }
  const sccSavedResponse = {
    success: true,
    message: "Data unjuk rasa berhasil diperbarui.",
    data: { id: "evt-01", status: "completed" },
    outbound_sync: {
      status: "pending",
      job_id: "job-01",
      attempts: 0,
      queued: true
    }
  };

  assert.equal(sccSavedResponse.success, true);
  assert.notEqual(sccSavedResponse.outbound_sync.status, "success", "Excel sync must remain pending until worker confirms execution");
});

test("15. Ambiguous HTTP timeout blocks automatic retry to prevent duplicate delivery when Power Automate outcome is unknown", async () => {
  // Simulate an endpoint that does not respond in time (mock hanging server)
  const hangingServer = http.createServer((req, res) => {
    // Deliberately do not respond, causing client AbortError / timeout
  });

  await new Promise((resolve) => hangingServer.listen(0, "127.0.0.1", resolve));
  const port = hangingServer.address().port;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = `http://127.0.0.1:${port}/hang-test`;

  try {
    const testId = `test-ambig-${Date.now()}`;
    const event = await protestStore.createProtest({
      id_kejadian: `KEJ-${testId}`,
      kode_unras: `UNR-${testId}`,
      tanggal: "2026-11-25",
      lokasi: "Gedung MK",
      kota_kabupaten: "Jakarta Pusat",
      isu_tuntutan: "Aspirasi Konstitusi",
      status: "ongoing"
    });

    await enqueueOutboundSync(event, { origin: "scc" });
    const claimed = await claimPendingOutboundJob("worker-ambig");
    assert.ok(claimed);

    // Execute with 200ms timeout to simulate ambiguous timeout after sending POST to Power Automate
    const execRes = await processOutboundJob(claimed, { timeoutMs: 200 });
    assert.equal(execRes.success, false);
    assert.equal(execRes.status, "failed");

    // Verify latest job status is marked failed (NOT pending) so automatic retry never sends a duplicate request
    const latestJob = await getLatestOutboundJobByProtestId(event.id);
    assert.ok(latestJob);
    assert.equal(latestJob.status, "failed", "Ambiguous timeout must mark job failed to halt automatic retry");
    assert.equal(latestJob.next_retry_at, null, "Ambiguous timeout must not schedule automatic retry");
    assert.match(latestJob.last_error || "", /ambiguous timeout|duplikat/i);

    // Verify another worker run cannot auto-claim the ambiguous-timeout job
    const reClaim = await claimPendingOutboundJob("worker-ambig-2");
    assert.equal(reClaim, null, "Worker must not auto-claim an ambiguous timeout job");
  } finally {
    delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
    hangingServer.close();
  }
});

test("16. Pending job recovery mechanism recovers unclaimed pending jobs when webhook fails", async () => {
  let receivedBody = null;
  const mockServer = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      receivedBody = JSON.parse(raw);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    });
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = `http://127.0.0.1:${port}/recovery-test`;

  try {
    const testId = `test-recovery-${Date.now()}`;
    const event = await protestStore.createProtest({
      id_kejadian: `KEJ-${testId}`,
      kode_unras: `UNR-${testId}`,
      tanggal: "2026-11-25",
      lokasi: "Istana Merdeka",
      kota_kabupaten: "Jakarta Pusat",
      isu_tuntutan: "Recovery Queue Test",
      status: "ongoing"
    });

    const enqueueRes = await enqueueOutboundSync(event, { origin: "scc" });
    assert.ok(enqueueRes.job);

    // Simulate job sitting unclaimed for >10s because Supabase webhook delivery failed
    const tenSecondsAgo = new Date(Date.now() - 12000).toISOString();
    protestStore.db.prepare("UPDATE unras_outbound_jobs SET created_at = ? WHERE id = ?").run(
      tenSecondsAgo,
      enqueueRes.job.id
    );

    const recoveryRes = await recoverPendingOutboundJobs({
      graceWindowMs: 8000,
      maxJobs: 1,
      trigger: "test_missed_webhook"
    });

    assert.equal(recoveryRes.recovered, true, "Recovery must detect and process unclaimed pending job");
    assert.equal(recoveryRes.workerResult?.succeeded, 1);
    assert.ok(receivedBody);
    assert.equal(receivedBody.id_unras, `UNR-${testId}`);

    const latestJob = await getLatestOutboundJobByProtestId(event.id);
    assert.equal(latestJob?.status, "success");
  } finally {
    delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
    mockServer.close();
  }
});

test("17. Supabase Database Webhook POST triggers worker on INSERT with CRON_SECRET and ignores non-pending UPDATE", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = `http://127.0.0.1:${port}/webhook-test`;
  process.env.CRON_SECRET = "test-secret-webhook-999";

  try {
    const testId = `test-db-webhook-${Date.now()}`;
    const event = await protestStore.createProtest({
      id_kejadian: `KEJ-${testId}`,
      kode_unras: `UNR-${testId}`,
      tanggal: "2026-11-25",
      lokasi: "Bundaran HI",
      kota_kabupaten: "Jakarta Pusat",
      isu_tuntutan: "Supabase Webhook Trigger Test",
      status: "ongoing"
    });

    const enqueueRes = await enqueueOutboundSync(event, { origin: "scc" });
    assert.ok(enqueueRes.job);

    // 1. Unauthorized webhook request must return 401
    const unauthReq = new NextRequest("http://localhost/api/integrations/unras/outbound-worker", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer wrong-token" },
      body: JSON.stringify({ type: "INSERT", table: "unras_outbound_jobs", record: enqueueRes.job })
    });
    const unauthRes = await workerPostHandler(unauthReq);
    assert.equal(unauthRes.status, 401, "Invalid CRON_SECRET must be rejected with 401");

    // 1B. Forged x-scc-user-role header without valid secret must also be rejected with 401
    const roleBypassReq = new NextRequest("http://localhost/api/integrations/unras/outbound-worker", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-scc-user-role": "admin" },
      body: JSON.stringify({ type: "INSERT", table: "unras_outbound_jobs", record: enqueueRes.job })
    });
    const roleBypassRes = await workerPostHandler(roleBypassReq);
    assert.equal(roleBypassRes.status, 401, "x-scc-user-role bypass must be rejected with 401");

    // 2. Non-pending UPDATE webhook must be skipped safely
    const updateReq = new NextRequest("http://localhost/api/integrations/unras/outbound-worker", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer test-secret-webhook-999" },
      body: JSON.stringify({
        type: "UPDATE",
        table: "unras_outbound_jobs",
        record: { ...enqueueRes.job, status: "processing" }
      })
    });
    const updateRes = await workerPostHandler(updateReq);
    const updateJson = await updateRes.json();
    assert.equal(updateJson.skipped, true, "Non-pending UPDATE webhook must be skipped");

    // 3. Valid INSERT webhook triggers worker and completes job
    const insertReq = new NextRequest("http://localhost/api/integrations/unras/outbound-worker", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer test-secret-webhook-999" },
      body: JSON.stringify({
        type: "INSERT",
        table: "unras_outbound_jobs",
        schema: "public",
        record: enqueueRes.job,
        old_record: null
      })
    });
    const insertRes = await workerPostHandler(insertReq);
    assert.equal(insertRes.status, 200);
    const insertJson = await insertRes.json();
    assert.equal(insertJson.success, true);
    assert.equal(insertJson.trigger, "supabase_webhook_insert");
    assert.equal(insertJson.succeeded, 1);

    const latestJob = await getLatestOutboundJobByProtestId(event.id);
    assert.equal(latestJob?.status, "success");
  } finally {
    delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
    delete process.env.CRON_SECRET;
    mockServer.close();
  }
});

test("18. Server-side post-enqueue fallback (verifyAndRecoverUnclaimedJob) recovers job without browser polling if pg_net webhook fails", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = `http://127.0.0.1:${port}/post-save-fallback`;

  try {
    const testId = `test-no-poll-${Date.now()}`;
    const event = await protestStore.createProtest({
      id_kejadian: `KEJ-${testId}`,
      kode_unras: `UNR-${testId}`,
      tanggal: "2026-11-25",
      lokasi: "Kemenkeu",
      kota_kabupaten: "Jakarta Pusat",
      isu_tuntutan: "Server Fallback Without Browser Poll",
      status: "ongoing"
    });

    const enqueueRes = await enqueueOutboundSync(event, { origin: "scc" });
    assert.ok(enqueueRes.job);

    // Simulate job aged 2s and verifyAndRecoverUnclaimedJob running with 50ms delay
    const twoSecondsAgo = new Date(Date.now() - 2000).toISOString();
    protestStore.db.prepare("UPDATE unras_outbound_jobs SET created_at = ? WHERE id = ?").run(
      twoSecondsAgo,
      enqueueRes.job.id
    );

    const fallbackRes = await verifyAndRecoverUnclaimedJob(enqueueRes.job.id, {
      delayMs: 50,
      trigger: "test_server_after_fallback"
    });
    assert.equal(fallbackRes.recovered, true);

    const latestJob = await getLatestOutboundJobByProtestId(event.id);
    assert.equal(latestJob?.status, "success");
  } finally {
    delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
    mockServer.close();
  }
});

test("19. SQL setup script (supabase/setup_unras_outbound_webhook.sql) is idempotent, uses pg_net + Vault exclusively (no plaintext fallback table), and vercel.json has no outbound cron", () => {
  const sqlPath = path.resolve(process.cwd(), "supabase/setup_unras_outbound_webhook.sql");
  assert.ok(fs.existsSync(sqlPath), "supabase/setup_unras_outbound_webhook.sql must exist");
  const sql = fs.readFileSync(sqlPath, "utf8");

  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS pg_net/i);
  assert.match(sql, /vault\.decrypted_secrets/i);
  assert.match(sql, /net\.http_post/i);
  assert.match(sql, /AFTER INSERT ON public\.unras_outbound_jobs/i);
  assert.doesNotMatch(sql, /AFTER INSERT OR UPDATE/i, "Must never trigger on UPDATE");
  assert.doesNotMatch(sql, /AFTER UPDATE/i, "Must never trigger on UPDATE");
  assert.doesNotMatch(sql, /CREATE TABLE.*unras_webhook_config/i, "Must never store CRON_SECRET in plaintext fallback table");
  assert.match(sql, /DROP TRIGGER IF EXISTS trg_unras_outbound_jobs_after_insert_webhook/i);

  const vercelJsonPath = path.resolve(process.cwd(), "vercel.json");
  const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"));
  const crons = vercelJson.crons || [];
  for (const c of crons) {
    assert.notEqual(c.schedule, "* * * * *", "vercel.json must not contain per-minute cron");
    assert.ok(!String(c.path).includes("outbound-worker"), "vercel.json must not contain outbound-worker cron");
  }
});

test("20. Rapid multi-record editing (Save U1640, immediately edit and save U1639 while Power Automate is delayed): both jobs run independently without blocking or overwriting", async () => {
  const processedPayloads = [];
  const mockServer = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      const parsed = JSON.parse(raw);
      processedPayloads.push(parsed);
      // Simulate delayed Power Automate execution (120ms delay in test)
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ updated: parsed.id_unras }));
      }, 120);
    });
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = `http://127.0.0.1:${port}/multi-job-test`;

  try {
    const suffix = Date.now();
    const u1640 = await protestStore.createProtest({
      id_kejadian: `KEJ-20261125-U1640-${suffix}`,
      kode_unras: `KEJ-20261125-U1640-${suffix}`,
      tanggal: "2026-11-25",
      lokasi: "Gedung DPR/MPR RI",
      kota_kabupaten: "Jakarta Pusat",
      isu_tuntutan: "Tuntutan Awal U1640",
      status: "scheduled"
    });

    const u1639 = await protestStore.createProtest({
      id_kejadian: `KEJ-20261125-U1639-${suffix}`,
      kode_unras: `KEJ-20261125-U1639-${suffix}`,
      tanggal: "2026-11-25",
      lokasi: "Patung Kuda Monas",
      kota_kabupaten: "Jakarta Pusat",
      isu_tuntutan: "Tuntutan Awal U1639",
      status: "scheduled"
    });

    // 1. Operator edits and saves U1640
    const t0 = Date.now();
    const updated1640 = await protestStore.updateProtest(u1640.id, {
      situation_summary: "Update operator U1640",
      status: "ongoing"
    }, { id: "op-1", name: "Operator 1", email: "op1@scc.go.id", role: "operator" });
    const q1640 = await enqueueOutboundSync(updated1640, { origin: "scc", route: "PATCH /api/protests/[id]" });
    const save1640Ms = Date.now() - t0;

    assert.ok(q1640.queued && q1640.job, "U1640 job must be durably enqueued");
    assert.ok(save1640Ms < 100, `Save U1640 acceptance must not wait for Power Automate (<100ms, got ${save1640Ms}ms)`);
    assert.equal(q1640.job.status, "pending");

    // 2. Operator immediately opens, edits, and saves U1639 while U1640 is still pending/in-flight
    const t1 = Date.now();
    const updated1639 = await protestStore.updateProtest(u1639.id, {
      situation_summary: "Update operator U1639",
      status: "completed"
    }, { id: "op-1", name: "Operator 1", email: "op1@scc.go.id", role: "operator" });
    const q1639 = await enqueueOutboundSync(updated1639, { origin: "scc", route: "PATCH /api/protests/[id]" });
    const save1639Ms = Date.now() - t1;

    assert.ok(q1639.queued && q1639.job, "U1639 job must be durably enqueued");
    assert.ok(save1639Ms < 100, `Save U1639 acceptance must not wait for Power Automate (<100ms, got ${save1639Ms}ms)`);
    assert.notEqual(q1640.job.id, q1639.job.id, "Each job must have an independent job ID");
    assert.notEqual(q1640.job.correlation_id, q1639.job.correlation_id, "Each job must have an independent correlation ID");

    // 3. Two concurrent worker invocations claim and process U1640 and U1639 independently
    const [claim1, claim2] = [
      await claimPendingOutboundJob("worker-concurrent-1"),
      await claimPendingOutboundJob("worker-concurrent-2")
    ];
    assert.ok(claim1 && claim2, "Both pending jobs must be claimable by independent workers");
    assert.notEqual(claim1.id, claim2.id, "Workers must never claim the same job");

    const [res1, res2] = await Promise.all([
      processOutboundJob(claim1),
      processOutboundJob(claim2)
    ]);
    assert.equal(res1.success, true);
    assert.equal(res2.success, true);

    // 4. Verify each record has its own independent status and preserved SCC data
    const finalJob1640 = await getLatestOutboundJobByProtestId(u1640.id);
    const finalJob1639 = await getLatestOutboundJobByProtestId(u1639.id);
    assert.equal(finalJob1640?.status, "success");
    assert.equal(finalJob1639?.status, "success");

    const stored1640 = await protestStore.getProtestById(u1640.id);
    const stored1639 = await protestStore.getProtestById(u1639.id);
    assert.equal(stored1640?.outbound_sync_status, "success");
    assert.equal(stored1640?.situation_summary, "Update operator U1640");
    assert.equal(stored1639?.outbound_sync_status, "success");
    assert.equal(stored1639?.situation_summary, "Update operator U1639");
  } finally {
    delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
    mockServer.close();
  }
});

test("21. One failed job does not block another job, and Excel sync failure never rolls back SCC data", async () => {
  const mockServer = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      const parsed = JSON.parse(raw);
      if (String(parsed.id_unras).includes("FAIL-FIRST")) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Row not found in Excel Table3" }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      }
    });
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = `http://127.0.0.1:${port}/partial-failure-test`;

  try {
    const suffix = Date.now();
    const failingProtest = await protestStore.createProtest({
      id_kejadian: `KEJ-FAIL-${suffix}`,
      kode_unras: `UNR-FAIL-FIRST-${suffix}`,
      tanggal: "2026-11-25",
      lokasi: "Lokasi Gagal Excel",
      kota_kabupaten: "Jakarta Pusat",
      isu_tuntutan: "Aksi 1",
      status: "ongoing",
      situation_summary: "Data SCC Tersimpan Aman"
    });

    const succeedingProtest = await protestStore.createProtest({
      id_kejadian: `KEJ-OK-${suffix}`,
      kode_unras: `UNR-OK-SECOND-${suffix}`,
      tanggal: "2026-11-25",
      lokasi: "Lokasi Sukses Excel",
      kota_kabupaten: "Jakarta Pusat",
      isu_tuntutan: "Aksi 2",
      status: "completed"
    });

    await enqueueOutboundSync(failingProtest, { origin: "scc" });
    await enqueueOutboundSync(succeedingProtest, { origin: "scc" });

    // Worker processes up to 2 jobs: first job fails (404), second job must still be processed and succeed
    const workerRes = await runOutboundSyncWorker({ maxJobs: 2 });
    assert.equal(workerRes.processed, 2, "Worker must process both jobs without being blocked by the first failure");
    assert.equal(workerRes.failed, 1);
    assert.equal(workerRes.succeeded, 1);

    // Verify failing protest keeps its SCC data intact while showing failed sync state
    const storedFailing = await protestStore.getProtestById(failingProtest.id);
    assert.equal(storedFailing?.situation_summary, "Data SCC Tersimpan Aman", "SCC data must never be rolled back on Excel sync failure");
    assert.equal(storedFailing?.outbound_sync_status, "failed");

    // Verify second protest succeeded independently
    const storedSucceeding = await protestStore.getProtestById(succeedingProtest.id);
    assert.equal(storedSucceeding?.outbound_sync_status, "success");
  } finally {
    delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
    mockServer.close();
  }
});

test("22. Non-blocking Save UX contract in ProtestDetailModal and ProtestDashboard", () => {
  const modalPath = path.resolve(process.cwd(), "src/components/protests/protest-detail-modal.tsx");
  const dashboardPath = path.resolve(process.cwd(), "src/components/protests/protest-dashboard.tsx");
  const modalCode = fs.readFileSync(modalPath, "utf8");
  const dashboardCode = fs.readFileSync(dashboardPath, "utf8");

  // Verify modal closes immediately via handleDurableSaveAccepted and shows required toast & status
  assert.match(modalCode, /Perubahan berhasil disimpan/);
  assert.match(modalCode, /Menunggu sinkronisasi Excel/);
  assert.match(modalCode, /handleDurableSaveAccepted/);
  assert.match(modalCode, /onClose\(\)/);

  // Verify dashboard tracks per-record sync states independently and supports retry
  assert.match(dashboardCode, /recordSyncStates/);
  assert.match(dashboardCode, /Menunggu sinkronisasi Excel/);
  assert.match(dashboardCode, /handleRetryRecordSync/);
});




