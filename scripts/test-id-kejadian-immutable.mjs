/**
 * SCC - EAGLE EYES: CRITICAL BUSINESS RULE TEST SUITE
 * Verifies that Excel `ID KEJADIAN` is strictly immutable and read-only,
 * and `ID UNRAS` (`kode_unras`) is the sole identity key for Excel row lookup,
 * matching, duplicate detection, and outbound updates.
 */

import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import http from "node:http";
import {
  buildOutboundPayload,
  dispatchOutboundSync,
  resolveOutboundIdUnras,
  sanitizeOutboundPayload
} from "../src/lib/unras-outbound-sync.ts";
import {
  enqueueOutboundSync,
  claimPendingOutboundJob,
  processOutboundJob
} from "../src/lib/unras-outbound-queue.ts";
import {
  calculateRolling7DayWindow,
  extractInboundMappedUpdates,
  processRolling7DaySync
} from "../src/lib/unras-rolling-sync.ts";
import { classifyCandidate } from "../src/lib/unras-identity-registry.ts";
import { protestStore } from "../src/lib/protest-store.ts";

beforeEach(() => {
  protestStore.clearOutboundJobsLocal();
});

test("1. ID UNRAS is used as the sole key; ID KEJADIAN is never used as fallback identity", async () => {
  const validEvent = {
    id: "evt-key-1",
    id_kejadian: "KEJ-20261126-001",
    kode_unras: "U-8801",
    tanggal: "2026-11-26",
    lokasi: "Kantor Pusat Bank Indonesia",
    kota_kabupaten: "Jakarta Pusat",
    isu_tuntutan: "Stabilitas Rupiah",
    status: "ongoing"
  };

  const payload = buildOutboundPayload(validEvent);
  assert.equal(payload.key_column, "ID UNRAS");
  assert.equal(payload.key_value, "U-8801");
  assert.equal(payload.id_unras, "U-8801");
  assert.equal(payload.kode_unras, "U-8801");

  // When kode_unras is empty or a synthetic 16-hex SHA-256 fallback, ID KEJADIAN must NEVER be used as fallback
  const eventNoKode = {
    ...validEvent,
    id: "evt-key-2",
    id_kejadian: "KEJ-20261126-VALID",
    kode_unras: ""
  };
  assert.equal(resolveOutboundIdUnras(eventNoKode), "");
  const enqueueNoKode = await enqueueOutboundSync(eventNoKode, { origin: "scc" });
  assert.equal(enqueueNoKode.queued, false, "Must reject outbound enqueue when kode_unras is missing");

  const eventFallbackHash = {
    ...validEvent,
    id: "evt-key-3",
    id_kejadian: "KEJ-20261126-A1B2C3D4E5F60718",
    kode_unras: "KEJ-20261126-A1B2C3D4E5F60718"
  };
  assert.equal(
    resolveOutboundIdUnras(eventFallbackHash),
    "",
    "Synthetic SHA-256 fallback ID must NEVER be accepted as ID UNRAS key"
  );
  const enqueueFallback = await enqueueOutboundSync(eventFallbackHash, { origin: "scc" });
  assert.equal(enqueueFallback.queued, false, "Must reject outbound enqueue when kode_unras is a synthetic fallback");

  // Also verify inbound sync when Excel row has ID KEJADIAN populated but ID UNRAS empty:
  // kode_unras must stay empty (not copied from ID KEJADIAN) so outbound sync refuses to use ID KEJADIAN as fallback
  const runId = Date.now();
  const testDate = "2026-11-25";
  const window = calculateRolling7DayWindow(new Date(`${testDate}T12:00:00+07:00`));
  const onlyIdKejadian = `KEJ-ONLY-NO-UNRAS-${runId}`;
  const resNoUnras = await processRolling7DaySync(
    {
      sync_type: "rolling_7d",
      timezone: "Asia/Jakarta",
      period_start: window.period_start,
      period_end: window.period_end,
      events: [
        {
          "ID KEJADIAN": onlyIdKejadian,
          "ID UNRAS": "",
          "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T09:00:00+07:00`,
          "TANGGAL": testDate,
          "LOKASI": "Monas",
          "ISU": "Row Tanpa ID UNRAS"
        }
      ]
    },
    "power_automate"
  );
  assert.equal(resNoUnras.summary.inserted, 1);
  const storedNoUnras = await protestStore.getProtestById(onlyIdKejadian);
  assert.ok(storedNoUnras);
  assert.equal(storedNoUnras.kode_unras, "", "Inbound sync must NOT copy ID KEJADIAN into kode_unras when ID UNRAS is empty");
  const enqueueFromNoUnras = await enqueueOutboundSync(storedNoUnras, { origin: "scc" });
  assert.equal(enqueueFromNoUnras.queued, false, "Record without ID UNRAS must never use ID KEJADIAN for outbound Excel");
});

test("2. ID KEJADIAN never enters outbound update payload or fields", () => {
  const event = {
    id: "evt-no-idkej",
    id_kejadian: "KEJ-20261126-IMMUTABLE",
    kode_unras: "U-8802",
    tanggal: "2026-11-26",
    lokasi: "Monas",
    kota_kabupaten: "Jakarta Pusat",
    isu_tuntutan: "Tuntutan Buruh",
    status: "scheduled"
  };

  const payload = buildOutboundPayload(event);
  assert.equal("id_kejadian" in payload, false, "Top-level payload must not contain id_kejadian");
  assert.equal("ID KEJADIAN" in payload, false, "Top-level payload must not contain ID KEJADIAN");
  assert.equal("ID KEJADIAN" in payload.fields, false, "fields must never contain ID KEJADIAN");
  assert.equal("id_kejadian" in payload.fields, false, "fields must never contain id_kejadian");
  assert.equal("ID_KEJADIAN" in payload.fields, false, "fields must never contain ID_KEJADIAN");
  assert.equal("ID UNRAS" in payload.fields, false, "fields must never contain ID UNRAS");

  // Even if a legacy job payload in DB had ID KEJADIAN injected, sanitizeOutboundPayload strips it
  const dirty = sanitizeOutboundPayload({
    ...payload,
    id_kejadian: "KEJ-DIRTY",
    fields: {
      ...payload.fields,
      "ID KEJADIAN": "KEJ-DIRTY",
      "id_kejadian": "KEJ-DIRTY",
      "BATAS": "SHOULD-BE-STRIPPED"
    }
  });
  assert.equal("id_kejadian" in dirty, false);
  assert.equal("ID KEJADIAN" in dirty.fields, false);
  assert.equal("id_kejadian" in dirty.fields, false);
  assert.equal("BATAS" in dirty.fields, false);
});

test("3. Empty ID KEJADIAN in Excel remains empty after inbound and outbound sync", async () => {
  const runId = Date.now();
  const testDate = "2026-11-25";
  const window = calculateRolling7DayWindow(new Date(`${testDate}T12:00:00+07:00`));
  const idUnras = `U-EMPTY-KEJ-${runId}`;

  // Simulated Excel Table3 row where ID KEJADIAN is empty ("")
  const excelTable = new Map([
    [
      idUnras,
      {
        "ID KEJADIAN": "", // Empty in Excel!
        "ID UNRAS": idUnras,
        "STATUS KEJADIAN": "Belum Berlangsung",
        "LOKASI": "Jakarta Pusat",
        "LOKASI UNRAS": "Patung Kuda",
        "TUNTUTAN": "Aspirasi Awal",
        "BATAS": "FORMULA_BATAS_ORIGINAL"
      }
    ]
  ]);

  // Step 3A: Inbound sync from Excel -> SCC with empty ID KEJADIAN
  const inboundRes = await processRolling7DaySync(
    {
      sync_type: "rolling_7d",
      timezone: "Asia/Jakarta",
      period_start: window.period_start,
      period_end: window.period_end,
      events: [
        {
          "ID KEJADIAN": "",
          "ID UNRAS": idUnras,
          "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T09:00:00+07:00`,
          "TANGGAL": testDate,
          "LOKASI": "Patung Kuda",
          "KOTA/KABUPATEN": "Jakarta Pusat",
          "ISU": "Aspirasi Awal",
          "STATUS KEJADIAN": "Belum Berlangsung"
        }
      ]
    },
    "power_automate",
    "Test Empty ID Kejadian"
  );
  assert.equal(inboundRes.summary.inserted, 1);

  const stored = await protestStore.getProtestById(idUnras);
  assert.ok(stored, "Record must be retrievable by ID UNRAS");
  assert.equal(stored.kode_unras, idUnras);
  assert.equal(
    stored.raw_source_payload?.["ID KEJADIAN"],
    "",
    "Inbound raw_source_payload must preserve empty ID KEJADIAN as empty string"
  );

  // Step 3B: Operator updates status in SCC -> Outbound sync to mock Power Automate Excel server
  const mockServer = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      const payload = JSON.parse(body);
      const row = excelTable.get(payload.id_unras);
      if (!row) {
        res.writeHead(404);
        res.end();
        return;
      }
      // Power Automate applies only payload.fields to the matched Excel row
      Object.assign(row, payload.fields);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "updated" }));
    });
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = `http://127.0.0.1:${port}/excel-update`;

  try {
    const updatedInScc = await protestStore.updateProtest(stored.id, {
      status: "ongoing",
      actual_crowd_size: 450
    });
    assert.ok(updatedInScc);

    const enqueueRes = await enqueueOutboundSync(updatedInScc, { origin: "scc" });
    assert.equal(enqueueRes.queued, true);
    const claimed = await claimPendingOutboundJob("worker-empty-kej");
    assert.ok(claimed);
    const execRes = await processOutboundJob(claimed);
    assert.equal(execRes.success, true);

    const excelRowAfterUpdate = excelTable.get(idUnras);
    assert.equal(
      excelRowAfterUpdate["ID KEJADIAN"],
      "",
      "CRITICAL: Empty ID KEJADIAN in Excel must remain empty after outbound update!"
    );
    assert.equal(excelRowAfterUpdate["STATUS KEJADIAN"], "Sedang Berlangsung");
    assert.equal(excelRowAfterUpdate["ESTIMASI JUMLAH MASSA"], 450);
    assert.equal(
      excelRowAfterUpdate["BATAS"],
      "FORMULA_BATAS_ORIGINAL",
      "BATAS column in Excel must remain untouched"
    );
  } finally {
    delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
    mockServer.close();
  }
});

test("4. Existing ID KEJADIAN never changes during inbound or outbound updates", async () => {
  const runId = Date.now();
  const testDate = "2026-11-25";
  const window = calculateRolling7DayWindow(new Date(`${testDate}T12:00:00+07:00`));
  const idUnras = `U-IMMUTABLE-${runId}`;
  const originalIdKejadian = `KEJ-ORIG-${runId}`;

  // Step 4A: Insert record with original ID KEJADIAN
  const res1 = await processRolling7DaySync(
    {
      sync_type: "rolling_7d",
      timezone: "Asia/Jakarta",
      period_start: window.period_start,
      period_end: window.period_end,
      events: [
        {
          "ID KEJADIAN": originalIdKejadian,
          "ID UNRAS": idUnras,
          "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T09:00:00+07:00`,
          "TANGGAL": testDate,
          "LOKASI": "Gedung DPR RI",
          "ISU": "Isu Awal"
        }
      ]
    },
    "power_automate"
  );
  assert.equal(res1.summary.inserted, 1);

  // Step 4B: Inbound re-sync with same ID UNRAS but a different or empty ID KEJADIAN
  const res2 = await processRolling7DaySync(
    {
      sync_type: "rolling_7d",
      timezone: "Asia/Jakarta",
      period_start: window.period_start,
      period_end: window.period_end,
      events: [
        {
          "ID KEJADIAN": `KEJ-MUTATED-${runId}`,
          "ID UNRAS": idUnras,
          "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T09:00:00+07:00`,
          "TANGGAL": testDate,
          "LOKASI": "Gedung DPR RI Pintu Utama",
          "ISU": "Isu Diperbarui"
        }
      ]
    },
    "power_automate"
  );

  assert.equal(res2.summary.inserted, 0, "Must NOT insert duplicate when ID KEJADIAN differs");
  assert.equal(res2.summary.updated, 1, "Must update existing record matched by ID UNRAS");

  const afterInbound = await protestStore.getProtestById(idUnras);
  assert.equal(
    afterInbound.id_kejadian,
    originalIdKejadian,
    "Existing id_kejadian must NOT be mutated by inbound sync"
  );
  assert.equal(afterInbound.isu_tuntutan, "Isu Diperbarui");

  // Step 4C: Direct extractInboundMappedUpdates must never include id_kejadian
  const extracted = extractInboundMappedUpdates(
    {
      "ID KEJADIAN": "KEJ-HACK-999",
      "id_kejadian": "KEJ-HACK-999",
      "ID UNRAS": idUnras,
      "ISU": "Test Extract"
    },
    testDate
  );
  assert.equal("id_kejadian" in extracted, false);
  assert.equal("kode_unras" in extracted, false);
});

test("5. BATAS never enters outbound update payload", () => {
  const event = {
    id: "evt-batas-check",
    id_kejadian: "KEJ-20261126-999",
    kode_unras: "U-9900",
    tanggal: "2026-11-26",
    lokasi: "Kawasan Harmoni",
    kota_kabupaten: "Jakarta Pusat",
    isu_tuntutan: "Uji Kolom Batas",
    status: "ongoing"
  };

  const payload = buildOutboundPayload(event);
  for (const key of Object.keys(payload.fields)) {
    assert.notEqual(key.toUpperCase(), "BATAS", "BATAS must never exist in payload.fields");
  }
});

test("6. Duplicate detection strictly uses ID UNRAS regardless of ID KEJADIAN differences", async () => {
  const runId = Date.now();
  const testDate = "2026-11-25";
  const window = calculateRolling7DayWindow(new Date(`${testDate}T12:00:00+07:00`));
  const sharedIdUnras = `U-DEDUP-${runId}`;

  // 6A: Verify classifyCandidate directly when same-day protest has same ID UNRAS but different ID KEJADIAN
  const existingMap = new Map([
    [`ID:KEJ-FIRST-${runId}`, `KEJ-FIRST-${runId}`],
    [`UNRAS:${sharedIdUnras.toUpperCase().replace(/[^A-Z0-9]/g, "")}`, `KEJ-FIRST-${runId}`]
  ]);
  const existingList = [
    {
      id: "uuid-1",
      id_kejadian: `KEJ-FIRST-${runId}`,
      kode_unras: sharedIdUnras,
      tanggal: testDate,
      lokasi: "Monas",
      organisasi_kelompok: "Aliansi A",
      isu_tuntutan: "Isu A"
    }
  ];

  const verdict = classifyCandidate(
    {
      id_kejadian: `KEJ-SECOND-DIFFERENT-${runId}`,
      kode_unras: sharedIdUnras,
      tanggal: testDate,
      lokasi: "Monas Timur",
      organisasi_kelompok: "Aliansi A",
      isu_tuntutan: "Isu A"
    },
    existingMap,
    existingList
  );

  assert.equal(verdict.action, "EXISTING", "Same ID UNRAS with different ID KEJADIAN must classify as EXISTING, never NEW");
  assert.equal(verdict.canonicalId, `KEJ-FIRST-${runId}`);

  // 6B: Verify in-batch duplicate detection when two rows in the same batch share ID UNRAS but have different ID KEJADIAN
  const batchRes = await processRolling7DaySync(
    {
      sync_type: "rolling_7d",
      timezone: "Asia/Jakarta",
      period_start: window.period_start,
      period_end: window.period_end,
      events: [
        {
          "ID KEJADIAN": `KEJ-BATCH-A-${runId}`,
          "ID UNRAS": sharedIdUnras,
          "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T10:00:00+07:00`,
          "TANGGAL": testDate,
          "LOKASI": "Bundaran HI",
          "ISU": "Baris Pertama"
        },
        {
          "ID KEJADIAN": `KEJ-BATCH-B-${runId}`,
          "ID UNRAS": sharedIdUnras, // Same ID UNRAS, different ID KEJADIAN
          "WAKTU DAN TGL KEJADIAN ISO": `${testDate}T10:00:00+07:00`,
          "TANGGAL": testDate,
          "LOKASI": "Bundaran HI",
          "ISU": "Baris Duplikat"
        }
      ]
    },
    "power_automate"
  );

  assert.equal(batchRes.summary.inserted, 1, "Only 1 record must be inserted for shared ID UNRAS");
  assert.equal(batchRes.summary.skipped, 1, "Second row with same ID UNRAS in batch must be skipped");
});
