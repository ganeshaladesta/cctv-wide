import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { protestStore } from "../src/lib/protest-store.ts";
import {
  enqueueOutboundSync,
  claimPendingOutboundJob,
  processOutboundJob,
  retryOutboundJob
} from "../src/lib/unras-outbound-queue.ts";
import {
  buildOutboundPayload,
  mapSCCStatusToExcelStatus
} from "../src/lib/unras-outbound-sync.ts";

const TEST_USER = {
  id: "a0000000-0000-0000-0000-000000000002",
  email: "operator@scc.go.id",
  name: "Operator Lapangan SCC",
  role: "operator"
};

/**
 * Starts a local mock Power Automate HTTP server where we can control the response status code
 * or artificial delay (to trigger timeout).
 */
async function startControllableMockServer() {
  let nextStatusCode = 200;
  let nextDelayMs = 0;
  const receivedRequests = [];

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString("utf8");
    let parsedBody = null;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {}

    receivedRequests.push({
      headers: req.headers,
      body: parsedBody
    });

    if (nextDelayMs > 0) {
      await new Promise((r) => setTimeout(r, nextDelayMs));
    }

    res.writeHead(nextStatusCode, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: nextStatusCode >= 200 && nextStatusCode < 300,
        status: nextStatusCode
      })
    );
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/webhook`;

  return {
    url,
    receivedRequests,
    setBehavior({ statusCode = 200, delayMs = 0 }) {
      nextStatusCode = statusCode;
      nextDelayMs = delayMs;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

/**
 * Helper to create a clean isolated protest record starting with status_sumber = 'Belum Berlangsung'
 */
async function createBaselineProtest(suffix, initialStatusSumber = "Belum Berlangsung") {
  const uniqueKode = `UNR-SUMBER-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const created = await protestStore.createProtest(
    {
      id_kejadian: `UNRAS-2026-JKT-${suffix}-${Date.now()}`,
      kode_unras: uniqueKode,
      tanggal: "2026-11-27",
      waktu_mulai: "09:00:00",
      lokasi: "Gedung DPR/MPR RI",
      kota_kabupaten: "Jakarta Pusat",
      provinsi: "DKI Jakarta",
      isu_tuntutan: `Pengujian Sinkronisasi Status Sumber (${suffix})`,
      organisasi_kelompok: "Aliansi Uji Status Sumber",
      status: "scheduled",
      status_sumber: initialStatusSumber,
      urgency: "medium"
    },
    TEST_USER
  );
  return created;
}

test("1. Mapping unit check: mapSCCStatusToExcelStatus & buildOutboundPayload use latest operator status over stale status_sumber", () => {
  assert.equal(mapSCCStatusToExcelStatus("completed"), "Selesai");
  assert.equal(mapSCCStatusToExcelStatus("ongoing"), "Sedang Berlangsung");
  assert.equal(mapSCCStatusToExcelStatus("monitoring"), "Sedang Berlangsung");
  assert.equal(mapSCCStatusToExcelStatus("scheduled"), "Belum Berlangsung");

  const fakeEvent = {
    id: "evt-map-1",
    id_kejadian: "KEJ-001",
    kode_unras: "UNR-MAP-001",
    tanggal: "2026-11-27",
    lokasi: "Monas",
    isu_tuntutan: "Uji Mapping",
    status: "completed",
    status_sumber: "Belum Berlangsung", // stale source status
    urgency: "medium",
    has_coordinates: false,
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const payload = buildOutboundPayload(fakeEvent);
  assert.equal(
    payload.fields["STATUS KEJADIAN"],
    "Selesai",
    "Outbound payload must use latest operator status ('completed' -> 'Selesai'), not stale status_sumber"
  );
  assert.equal(payload.key_column, "ID UNRAS");
  assert.equal(payload.key_value, "UNR-MAP-001");
  assert.ok(!("ID KEJADIAN" in payload.fields), "ID KEJADIAN must never be in outbound fields");
  assert.ok(!("BATAS" in payload.fields), "BATAS must never be in outbound fields");
});

test("2. Operator COMPLETED and Excel succeeds -> status_sumber updates to 'Selesai' ONLY after Excel confirms 200", async () => {
  const mockServer = await startControllableMockServer();
  const prevUrl = process.env.POWER_AUTOMATE_OUTBOUND_URL;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = mockServer.url;

  try {
    const protest = await createBaselineProtest("COMPLETED", "Belum Berlangsung");
    assert.equal(protest.status_sumber, "Belum Berlangsung");

    // Step A: Operator transitions status to 'completed'
    const updatedByOperator = await protestStore.updateProtestStatus(
      protest.id,
      "completed",
      "Aksi selesai dengan tertib",
      TEST_USER
    );
    assert.equal(updatedByOperator.status, "completed");
    // BEFORE Excel confirms outbound sync, status_sumber MUST still be 'Belum Berlangsung'
    assert.equal(
      updatedByOperator.status_sumber,
      "Belum Berlangsung",
      "status_sumber must NOT change before Excel confirms outbound sync"
    );

    // Step B: Enqueue outbound job
    const enq = await enqueueOutboundSync(updatedByOperator, {
      origin: "scc",
      route: "POST /api/protests/[id]/status"
    });
    assert.equal(enq.queued, true);
    const beforeWorker = await protestStore.getProtestById(protest.id);
    assert.equal(
      beforeWorker.status_sumber,
      "Belum Berlangsung",
      "While outbound job is pending, status_sumber must remain 'Belum Berlangsung'"
    );

    // Step C: Worker processes job and Power Automate confirms HTTP 200
    mockServer.setBehavior({ statusCode: 200 });
    const execRes = await processOutboundJob(enq.job);
    assert.equal(execRes.success, true);

    const afterExcelSuccess = await protestStore.getProtestById(protest.id);
    assert.equal(afterExcelSuccess.outbound_sync_status, "success");
    assert.equal(
      afterExcelSuccess.status_sumber,
      "Selesai",
      "After Excel confirms outbound success, status_sumber must update to 'Selesai'"
    );
  } finally {
    process.env.POWER_AUTOMATE_OUTBOUND_URL = prevUrl;
    await mockServer.close();
  }
});

test("3. Operator ONGOING and Excel succeeds -> status_sumber updates to 'Sedang Berlangsung'", async () => {
  const mockServer = await startControllableMockServer();
  const prevUrl = process.env.POWER_AUTOMATE_OUTBOUND_URL;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = mockServer.url;

  try {
    const protest = await createBaselineProtest("ONGOING", "Belum Berlangsung");
    const updated = await protestStore.updateProtestStatus(
      protest.id,
      "ongoing",
      "Massa mulai berkumpul",
      TEST_USER
    );
    assert.equal(updated.status_sumber, "Belum Berlangsung");

    const enq = await enqueueOutboundSync(updated, { origin: "scc" });
    mockServer.setBehavior({ statusCode: 200 });
    const res = await processOutboundJob(enq.job);
    assert.equal(res.success, true);

    const finalRecord = await protestStore.getProtestById(protest.id);
    assert.equal(finalRecord.status, "ongoing");
    assert.equal(finalRecord.status_sumber, "Sedang Berlangsung");
  } finally {
    process.env.POWER_AUTOMATE_OUTBOUND_URL = prevUrl;
    await mockServer.close();
  }
});

test("4. Operator MONITORING and Excel succeeds -> status_sumber updates to 'Sedang Berlangsung'", async () => {
  const mockServer = await startControllableMockServer();
  const prevUrl = process.env.POWER_AUTOMATE_OUTBOUND_URL;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = mockServer.url;

  try {
    const protest = await createBaselineProtest("MONITORING", "Belum Berlangsung");
    const updated = await protestStore.updateProtestStatus(
      protest.id,
      "monitoring",
      "Pemantauan intensif perimeter",
      TEST_USER
    );
    assert.equal(updated.status_sumber, "Belum Berlangsung");

    const enq = await enqueueOutboundSync(updated, { origin: "scc" });
    mockServer.setBehavior({ statusCode: 204 });
    const res = await processOutboundJob(enq.job);
    assert.equal(res.success, true);

    const finalRecord = await protestStore.getProtestById(protest.id);
    assert.equal(finalRecord.status, "monitoring");
    assert.equal(finalRecord.status_sumber, "Sedang Berlangsung");
  } finally {
    process.env.POWER_AUTOMATE_OUTBOUND_URL = prevUrl;
    await mockServer.close();
  }
});

test("5. Operator SCHEDULED and Excel succeeds -> status_sumber updates to 'Belum Berlangsung'", async () => {
  const mockServer = await startControllableMockServer();
  const prevUrl = process.env.POWER_AUTOMATE_OUTBOUND_URL;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = mockServer.url;

  try {
    // Start from 'Sedang Berlangsung' and operator changes to 'scheduled'
    const protest = await createBaselineProtest("SCHEDULED", "Sedang Berlangsung");
    const updated = await protestStore.updateProtest(
      protest.id,
      { status: "scheduled" },
      TEST_USER
    );
    assert.equal(updated.status_sumber, "Sedang Berlangsung");

    const enq = await enqueueOutboundSync(updated, { origin: "scc" });
    mockServer.setBehavior({ statusCode: 200 });
    const res = await processOutboundJob(enq.job);
    assert.equal(res.success, true);

    const finalRecord = await protestStore.getProtestById(protest.id);
    assert.equal(finalRecord.status, "scheduled");
    assert.equal(finalRecord.status_sumber, "Belum Berlangsung");
  } finally {
    process.env.POWER_AUTOMATE_OUTBOUND_URL = prevUrl;
    await mockServer.close();
  }
});

test("6. Outbound failure (HTTP 500 / 404) or timeout -> status_sumber MUST NOT change", async () => {
  const mockServer = await startControllableMockServer();
  const prevUrl = process.env.POWER_AUTOMATE_OUTBOUND_URL;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = mockServer.url;

  try {
    // Case A: HTTP 404 failure
    const protestFail = await createBaselineProtest("FAIL404", "Belum Berlangsung");
    const updatedFail = await protestStore.updateProtestStatus(
      protestFail.id,
      "completed",
      "Selesai namun gagal di Excel",
      TEST_USER
    );
    const enqFail = await enqueueOutboundSync(updatedFail, { origin: "scc" });
    mockServer.setBehavior({ statusCode: 404 });
    const resFail = await processOutboundJob(enqFail.job);
    assert.equal(resFail.success, false);

    const recordAfter404 = await protestStore.getProtestById(protestFail.id);
    assert.equal(recordAfter404.outbound_sync_status, "failed");
    assert.equal(
      recordAfter404.status_sumber,
      "Belum Berlangsung",
      "status_sumber must NOT update when outbound fails with 404"
    );

    // Case B: Ambiguous HTTP timeout
    const protestTimeout = await createBaselineProtest("TIMEOUT", "Belum Berlangsung");
    const updatedTimeout = await protestStore.updateProtestStatus(
      protestTimeout.id,
      "completed",
      "Selesai namun timeout ke Power Automate",
      TEST_USER
    );
    const enqTimeout = await enqueueOutboundSync(updatedTimeout, { origin: "scc" });
    mockServer.setBehavior({ statusCode: 200, delayMs: 250 });
    const resTimeout = await processOutboundJob(enqTimeout.job, { timeoutMs: 50 });
    assert.equal(resTimeout.success, false);

    const recordAfterTimeout = await protestStore.getProtestById(protestTimeout.id);
    assert.equal(recordAfterTimeout.outbound_sync_status, "failed");
    assert.equal(
      recordAfterTimeout.status_sumber,
      "Belum Berlangsung",
      "status_sumber must NOT update when outbound times out"
    );
  } finally {
    process.env.POWER_AUTOMATE_OUTBOUND_URL = prevUrl;
    await mockServer.close();
  }
});

test("7. Retry succeeds after initial failure -> status_sumber stays unchanged on failure and updates on retry success", async () => {
  const mockServer = await startControllableMockServer();
  const prevUrl = process.env.POWER_AUTOMATE_OUTBOUND_URL;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = mockServer.url;

  try {
    const protest = await createBaselineProtest("RETRY", "Belum Berlangsung");
    const updated = await protestStore.updateProtestStatus(
      protest.id,
      "completed",
      "Uji retry outbound",
      TEST_USER
    );
    const enq = await enqueueOutboundSync(updated, { origin: "scc" });

    // Attempt 1: Temporary 503 failure
    mockServer.setBehavior({ statusCode: 503, delayMs: 0 });
    const attempt1 = await processOutboundJob({ ...enq.job, attempts: 1 });
    assert.equal(attempt1.success, false);

    const afterAttempt1 = await protestStore.getProtestById(protest.id);
    assert.equal(
      afterAttempt1.status_sumber,
      "Belum Berlangsung",
      "status_sumber must remain 'Belum Berlangsung' after failed attempt 1"
    );

    // Manual/scheduled Retry: Power Automate now responds HTTP 200
    await retryOutboundJob(enq.job.id);
    mockServer.setBehavior({ statusCode: 200, delayMs: 0 });
    const attempt2 = await processOutboundJob({ ...enq.job, attempts: 2 });
    assert.equal(attempt2.success, true);

    const afterRetrySuccess = await protestStore.getProtestById(protest.id);
    assert.equal(afterRetrySuccess.outbound_sync_status, "success");
    assert.equal(
      afterRetrySuccess.status_sumber,
      "Selesai",
      "status_sumber must update to 'Selesai' once retry succeeds"
    );
  } finally {
    process.env.POWER_AUTOMATE_OUTBOUND_URL = prevUrl;
    await mockServer.close();
  }
});

