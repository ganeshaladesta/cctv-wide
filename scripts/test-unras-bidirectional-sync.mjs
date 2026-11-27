import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import {
  hasRowField,
  getRawRowField,
  extractInboundMappedUpdates,
  processSameDaySync
} from "../src/lib/unras-rolling-sync.ts";
import {
  buildOutboundPayload,
  dispatchOutboundSync,
  mapSCCStatusToExcelStatus,
  resolveOutboundCrowdSize,
  resolveOutboundEditorial
} from "../src/lib/unras-outbound-sync.ts";
import { protestStore } from "../src/lib/protest-store.ts";

test("1. Inbound Presence & Extraction: Omitted vs Explicit Empty/Zero/False/Null", () => {
  const row = {
    LOKASI: "Kantor Pusat BI, Jakarta",
    lokasi_unras: "Pintu Barat BI",
    "KOTA/KABUPATEN": "Jakarta Pusat",
    ISU: "Kenaikan Upah Minimum 2027",
    "JUMLAH MASSA": 0,
    DAMPAK: "",
    KETERANGAN: null,
    TUJUAN: "Bank Indonesia",
    "JARAK LOKASI UNRAS": "0 meter",
    REDAKSI: "Aksi buruh menyampaikan tuntutan upah secara damai.",
    // Note: kp_kpw, regional, and sasaran are intentionally OMITTED
  };

  // Test field presence detection
  assert.equal(hasRowField(row, "LOKASI"), true);
  assert.equal(hasRowField(row, "lokasi_unras"), true);
  assert.equal(hasRowField(row, "JUMLAH MASSA"), true);
  assert.equal(hasRowField(row, "DAMPAK"), true);
  assert.equal(hasRowField(row, "KETERANGAN"), true);
  assert.equal(hasRowField(row, "TUJUAN"), true);
  assert.equal(hasRowField(row, "kp_kpw"), false);
  assert.equal(hasRowField(row, "sasaran_aksi"), false);

  const updates = extractInboundMappedUpdates(row, "2026-11-25", "2026-11-25T09:00:00.000Z");

  // Location Contract: Venue goes to 'lokasi', City goes to 'kota_kabupaten'
  assert.equal(updates.lokasi, "Pintu Barat BI", "Venue must map to lokasi");
  assert.equal(updates.kota_kabupaten, "Kantor Pusat BI, Jakarta", "City must map to kota_kabupaten");

  // Explicit values preserved
  assert.equal(updates.isu_tuntutan, "Kenaikan Upah Minimum 2027");
  assert.equal(updates.estimasi_massa_source, 0, "Zero crowd size must be preserved as 0, not null");
  assert.equal(updates.actual_crowd_size, 0);
  assert.equal(updates.dampak, "", "Explicit empty string must be preserved");
  assert.equal(updates.keterangan_source, null, "Explicit null must be preserved");
  assert.equal(updates.tujuan, "Bank Indonesia");
  assert.equal(updates.jarak_lokasi_unras, "0 meter");
  assert.equal(updates.redaksi, "Aksi buruh menyampaikan tuntutan upah secara damai.");
  assert.equal(updates.editorial_draft, "Aksi buruh menyampaikan tuntutan upah secara damai.");

  // Omitted fields must NOT exist on updates object
  assert.equal("kp_kpw" in updates, false, "Omitted field kp_kpw must not be present in updates");
  assert.equal("sasaran_aksi" in updates, false, "Omitted field sasaran_aksi must not be present in updates");
});

test("2. Full Overwrite in Store: Existing Values Overwritten by Excel Values", async () => {
  const testId = `test-ovr-${Date.now()}`;
  const initial = await protestStore.createProtest({
    id_kejadian: testId,
    kode_unras: `UNR-${testId}`,
    tanggal: "2026-11-24",
    waktu_mulai: "08:00:00",
    lokasi: "Gedung Sate",
    kota_kabupaten: "Bandung",
    isu_tuntutan: "Tuntutan Awal",
    status: "ongoing",
    status_sumber: "Sedang Berlangsung",
    estimasi_massa_source: 500,
    situation_summary: "Situasi lama yang ditulis operator",
    redaksi: "Redaksi lama"
  });

  assert.ok(initial);
  assert.equal(initial.lokasi, "Gedung Sate");
  assert.equal(initial.kota_kabupaten, "Bandung");
  assert.equal(initial.status_sumber, "Sedang Berlangsung");

  // Apply full overwrite update with empty string, 0, new values
  const updated = await protestStore.updateProtest(initial.id, {
    lokasi: "DPRD Jabar",
    kota_kabupaten: "Bandung",
    isu_tuntutan: "Tuntutan Baru yang Diperbarui",
    status_sumber: "Selesai",
    status: "completed",
    estimasi_massa_source: 0,
    situation_summary: "", // Overwrites with empty string
    tujuan: "Gubernur Jabar",
    jarak_lokasi_unras: "50m",
    redaksi: "Redaksi baru dari Excel"
  });

  assert.ok(updated);
  assert.equal(updated.lokasi, "DPRD Jabar", "Venue must be updated");
  assert.equal(updated.isu_tuntutan, "Tuntutan Baru yang Diperbarui");
  assert.equal(updated.status_sumber, "Selesai", "status_sumber must be updated to Selesai");
  assert.equal(updated.status, "completed", "status operator mapped to completed");
  assert.equal(updated.estimasi_massa_source, 0, "estimasi_massa_source must be 0");
  assert.equal(updated.situation_summary, "", "situation_summary must be empty string");
  assert.equal(updated.tujuan, "Gubernur Jabar");
  assert.equal(updated.jarak_lokasi_unras, "50m");
  assert.equal(updated.redaksi, "Redaksi baru dari Excel");

  // Internal fields must be preserved
  assert.equal(updated.id, initial.id);
  assert.equal(updated.id_kejadian, testId);
});

test("3. Outbound Payload Contract & BATAS Column Safety", () => {
  const event = {
    id: "evt-test-123",
    id_kejadian: "KEJ-20261125-001",
    kode_unras: "U9999",
    tanggal: "2026-11-25",
    waktu_mulai: "10:00:00",
    lokasi: "Kawasan Monas", // Venue
    kota_kabupaten: "Jakarta Pusat", // City
    isu_tuntutan: "Aspirasi Kebijakan Transportasi",
    actual_crowd_size: 750,
    estimasi_massa_source: 500,
    organisasi_kelompok: "Koalisi Transportasi Publik",
    status: "ongoing",
    status_sumber: "Sedang Berlangsung",
    provinsi: "DKI Jakarta",
    regional: "Kantor Pusat",
    kp_kpw: "KPBI",
    tujuan: "Kementerian Perhubungan",
    jarak_lokasi_unras: "200m",
    redaksi: "Laporan situasi resmi."
  };

  const payload = buildOutboundPayload(event);

  // Contract verification
  assert.equal(payload.origin, "scc");
  assert.equal(payload.event_type, "unras.updated");
  assert.equal(payload.key_column, "ID UNRAS");
  assert.equal(payload.key_value, "U9999");
  assert.equal(payload.id_unras, "U9999", "id_unras is the matching key for ID UNRAS");
  assert.equal(payload.kode_unras, "U9999");
  assert.equal("id_kejadian" in payload, false, "id_kejadian must NEVER be included in outbound payload");
  assert.equal(payload.fields["ESTIMASI JUMLAH MASSA"], 750, "Prefer verified actual crowd size");

  // Location Contract
  assert.equal(payload.fields["LOKASI"], "Jakarta Pusat", "Excel 'Lokasi' Col I must receive city kota_kabupaten");
  assert.equal(payload.fields["LOKASI UNRAS"], "Kawasan Monas", "Excel 'Lokasi Unras' Col P must receive venue lokasi");

  // STRICT SAFETY: BATAS, ID UNRAS, and ID KEJADIAN must NEVER be present inside fields
  assert.equal("BATAS" in payload.fields, false, "BATAS column must never exist in fields");
  assert.equal("ID UNRAS" in payload.fields, false, "ID UNRAS must never be an updateable field");
  assert.equal("ID KEJADIAN" in payload.fields, false, "ID KEJADIAN must never be an updateable field");
  assert.equal("batas" in payload.fields, false, "batas column must never exist in fields");
  assert.equal("Batas" in payload.fields, false, "Batas column must never exist in fields");
});

test("4. Loop Prevention & Origin Tracking", async () => {
  const event = {
    id: "evt-test-loop",
    id_kejadian: "KEJ-LOOP-001",
    kode_unras: "U-LOOP",
    tanggal: "2026-11-25",
    lokasi: "Bundaran HI",
    kota_kabupaten: "Jakarta Pusat",
    isu_tuntutan: "Test Loop Prevention",
    status: "scheduled"
  };

  // When origin is "excel", outbound sync MUST be skipped immediately
  const skipResult = await dispatchOutboundSync(event, { origin: "excel" });
  assert.equal(skipResult.status, "skipped", "Excel-originated change must NOT trigger outbound sync");
  assert.equal(skipResult.success, true);
});

test("5. Outbound Validation: Missing ID UNRAS Rejection", async () => {
  const eventMissingId = {
    id: "evt-no-id",
    id_kejadian: "KEJ-NO-ID",
    kode_unras: "",
    tanggal: "2026-11-25",
    lokasi: "Monas",
    isu_tuntutan: "Test Missing ID",
    status: "scheduled"
  };

  const missingResult = await dispatchOutboundSync(eventMissingId, { origin: "scc" });
  assert.equal(missingResult.success, false);
  assert.equal(missingResult.status, "failed");
  assert.match(missingResult.error, /id_unras/);
});

test("5B. Outbound Handling: Missing POWER_AUTOMATE_OUTBOUND_URL Graceful Skip", async () => {
  const savedUrl = process.env.POWER_AUTOMATE_OUTBOUND_URL;
  const savedWebhook = process.env.UNRAS_OUTBOUND_WEBHOOK_URL;
  delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
  delete process.env.UNRAS_OUTBOUND_WEBHOOK_URL;

  try {
    const testEvent = {
      id: "evt-no-url",
      id_kejadian: "KEJ-NO-URL",
      kode_unras: "U-NO-URL",
      tanggal: "2026-11-25",
      lokasi: "Monas",
      isu_tuntutan: "Test Missing URL",
      status: "scheduled"
    };

    const res = await dispatchOutboundSync(testEvent, { origin: "scc" });
    assert.equal(res.success, true);
    assert.equal(res.status, "skipped");
    assert.match(res.error, /POWER_AUTOMATE_OUTBOUND_URL/);
  } finally {
    if (savedUrl) process.env.POWER_AUTOMATE_OUTBOUND_URL = savedUrl;
    if (savedWebhook) process.env.UNRAS_OUTBOUND_WEBHOOK_URL = savedWebhook;
  }
});

test("6. Outbound HTTP Dispatch with Mock Power Automate Server (200, 404, 409)", async () => {
  let mockStatusCode = 200;
  let receivedRequests = [];

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      receivedRequests.push({
        method: req.method,
        headers: req.headers,
        body: JSON.parse(body)
      });
      res.writeHead(mockStatusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: mockStatusCode === 200 ? "OK" : "Error" }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = `http://127.0.0.1:${port}/webhook`;

  try {
    const testEvent = {
      id: "evt-mock-dispatch",
      id_kejadian: "KEJ-DISPATCH-001",
      kode_unras: "U-DISPATCH-99",
      tanggal: "2026-11-25",
      lokasi: "Gedung BI",
      kota_kabupaten: "Jakarta Pusat",
      isu_tuntutan: "Aspirasi Moneter",
      status: "ongoing"
    };

    // Subtest 6A: Successful 200
    mockStatusCode = 200;
    receivedRequests = [];
    const res200 = await dispatchOutboundSync(testEvent, { origin: "scc" });
    assert.equal(res200.success, true);
    assert.equal(res200.status, "success");
    assert.equal(res200.http_status, 200);
    assert.equal(receivedRequests.length, 1);
    assert.equal(receivedRequests[0].body.origin, "scc");
    assert.equal(receivedRequests[0].body.id_unras, "U-DISPATCH-99");
    assert.equal(receivedRequests[0].body.key_column, "ID UNRAS");
    assert.equal(receivedRequests[0].body.key_value, "U-DISPATCH-99");
    assert.equal("id_kejadian" in receivedRequests[0].body, false, "id_kejadian must never be sent to Power Automate");
    assert.equal("ID KEJADIAN" in receivedRequests[0].body.fields, false, "ID KEJADIAN must never be in fields");
    assert.equal(receivedRequests[0].body.fields["LOKASI"], "Jakarta Pusat");
    assert.equal(receivedRequests[0].body.fields["LOKASI UNRAS"], "Gedung BI");

    // Subtest 6B: 404 Not Found in Excel Table3
    mockStatusCode = 404;
    receivedRequests = [];
    const res404 = await dispatchOutboundSync(testEvent, { origin: "scc" });
    assert.equal(res404.success, false);
    assert.equal(res404.status, "not_found");
    assert.equal(res404.http_status, 404);

    // Subtest 6C: 409 Ambiguous / Multiple Rows in Excel Table3
    mockStatusCode = 409;
    receivedRequests = [];
    const res409 = await dispatchOutboundSync(testEvent, { origin: "scc" });
    assert.equal(res409.success, false);
    assert.equal(res409.status, "conflict");
    assert.equal(res409.http_status, 409);

  } finally {
    delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
    server.close();
  }
});

test("7. Status Mapping & Operator Status Priority over Stale status_sumber", () => {
  // Vocabulary Preservation: Belum Berlangsung, Sedang Berlangsung, Selesai
  assert.equal(mapSCCStatusToExcelStatus("completed"), "Selesai");
  assert.equal(mapSCCStatusToExcelStatus("ongoing"), "Sedang Berlangsung");
  assert.equal(mapSCCStatusToExcelStatus("monitoring"), "Sedang Berlangsung");
  assert.equal(mapSCCStatusToExcelStatus("scheduled"), "Belum Berlangsung");
  assert.equal(mapSCCStatusToExcelStatus("cancelled"), "Belum Berlangsung");
  assert.equal(mapSCCStatusToExcelStatus(null), "Belum Berlangsung");

  // Critical requirement: Outbound STATUS KEJADIAN must reflect latest operator SCC status,
  // NOT a stale status_sumber value!
  const eventOperatorCompleted = {
    id: "evt-st-01",
    id_kejadian: "KEJ-ST-01",
    kode_unras: "U-ST-01",
    status: "completed", // Operator approved status
    status_sumber: "Sedang Berlangsung" // Stale source status from older Excel import
  };

  const payload = buildOutboundPayload(eventOperatorCompleted);
  assert.equal(payload.fields["STATUS KEJADIAN"], "Selesai", "Operator status 'completed' must overwrite stale 'Sedang Berlangsung' in Excel");

  const eventOperatorOngoing = {
    id: "evt-st-02",
    id_kejadian: "KEJ-ST-02",
    kode_unras: "U-ST-02",
    status: "ongoing",
    status_sumber: "Belum Berlangsung"
  };
  assert.equal(buildOutboundPayload(eventOperatorOngoing).fields["STATUS KEJADIAN"], "Sedang Berlangsung");
});

test("8. Crowd Size Mapping: Operator Actual Crowd Size & Clear Overwrite Behavior", () => {
  // Case A: Operator enters new crowd size (e.g. 1200)
  const eventCustomSize = {
    id: "evt-cr-01",
    id_kejadian: "KEJ-CR-01",
    kode_unras: "U-CR-01",
    actual_crowd_size: 1200,
    estimasi_massa_source: 300
  };
  assert.equal(resolveOutboundCrowdSize(eventCustomSize), 1200);
  assert.equal(buildOutboundPayload(eventCustomSize).fields["ESTIMASI JUMLAH MASSA"], 1200);

  // Case B: Operator sets crowd size to 0
  const eventZeroSize = {
    id: "evt-cr-02",
    id_kejadian: "KEJ-CR-02",
    kode_unras: "U-CR-02",
    actual_crowd_size: 0,
    estimasi_massa_source: 300
  };
  assert.equal(resolveOutboundCrowdSize(eventZeroSize), 0);
  assert.equal(buildOutboundPayload(eventZeroSize).fields["ESTIMASI JUMLAH MASSA"], 0);

  // Case C: Operator clears crowd size (null). MUST NOT restore older source estimate 300!
  const eventClearedSize = {
    id: "evt-cr-03",
    id_kejadian: "KEJ-CR-03",
    kode_unras: "U-CR-03",
    actual_crowd_size: null,
    estimasi_massa_source: 300
  };
  assert.equal(resolveOutboundCrowdSize(eventClearedSize), null, "Clearing crowd size must result in null");
  assert.equal(buildOutboundPayload(eventClearedSize).fields["ESTIMASI JUMLAH MASSA"], null, "Must NOT restore older source estimate 300");

  // Case D: Untouched/fresh record without operator actual_crowd_size (undefined)
  const eventFreshSize = {
    id: "evt-cr-04",
    id_kejadian: "KEJ-CR-04",
    kode_unras: "U-CR-04",
    estimasi_massa_source: 300
  };
  assert.equal(resolveOutboundCrowdSize(eventFreshSize), 300);
  assert.equal(buildOutboundPayload(eventFreshSize).fields["ESTIMASI JUMLAH MASSA"], 300);
});

test("9. Editorial Priority: final > draft, Cleared State Sends Empty and Ignores Stale redaksi", () => {
  // Case A: editorial_final takes priority over draft and redaksi
  const eventBothAvailable = {
    id: "evt-ed-01",
    id_kejadian: "KEJ-ED-01",
    kode_unras: "U-ED-01",
    editorial_final: "Laporan Final Disetujui Komandan",
    editorial_draft: "Draf catatan lapangan operator",
    redaksi: "Redaksi lama dari Excel"
  };
  assert.equal(resolveOutboundEditorial(eventBothAvailable), "Laporan Final Disetujui Komandan");
  assert.equal(buildOutboundPayload(eventBothAvailable).fields["REDAKSI"], "Laporan Final Disetujui Komandan");

  // Case B: Clearing final editorial uses draft only when draft is non-empty
  const eventDraftFallback = {
    id: "evt-ed-02",
    id_kejadian: "KEJ-ED-02",
    kode_unras: "U-ED-02",
    editorial_final: "",
    editorial_draft: "Draf catatan lapangan operator",
    redaksi: "Redaksi lama dari Excel"
  };
  assert.equal(resolveOutboundEditorial(eventDraftFallback), "Draf catatan lapangan operator");
  assert.equal(buildOutboundPayload(eventDraftFallback).fields["REDAKSI"], "Draf catatan lapangan operator");

  // Case C: Clearing both editorial fields sends empty REDAKSI and NEVER sends stale redaksi
  const eventBothCleared = {
    id: "evt-ed-03",
    id_kejadian: "KEJ-ED-03",
    kode_unras: "U-ED-03",
    editorial_final: "",
    editorial_draft: null,
    redaksi: "Redaksi lama yang seharusnya tidak bocor"
  };
  assert.equal(resolveOutboundEditorial(eventBothCleared), null);
  assert.equal(buildOutboundPayload(eventBothCleared).fields["REDAKSI"], null, "Must NOT accidentally send stale redaksi when operator cleared editorial");
});

test("10. Inbound Excel Updates Subsequently Overwrite All Three Operator Fields", async () => {
  const testId = `test-inbound-ovr-${Date.now()}`;
  
  // 1. Initial state: Operator had set status to 'completed', actual_crowd_size to 800, editorial_final to 'Disetujui'
  const initial = await protestStore.createProtest({
    id_kejadian: testId,
    kode_unras: `UNR-${testId}`,
    tanggal: "2026-11-25",
    lokasi: "Gedung MK",
    kota_kabupaten: "Jakarta Pusat",
    isu_tuntutan: "Uji Materiil UU",
    status: "completed",
    status_sumber: "Selesai",
    actual_crowd_size: 800,
    estimasi_massa_source: 800,
    editorial_draft: "Draf 1",
    editorial_final: "Laporan Disetujui",
    redaksi: "Laporan Disetujui"
  });

  assert.ok(initial);
  assert.equal(initial.status, "completed");
  assert.equal(initial.actual_crowd_size, 800);
  assert.equal(initial.editorial_final, "Laporan Disetujui");

  // 2. Incoming Excel row arrives with new values from analysts:
  // Status: "Sedang Berlangsung" (Excel reopening event)
  // Crowd: 1500 (Excel analyst updated crowd)
  // Redaksi: "Update situasi dari koordinator lapangan di Excel"
  const inboundExcelRow = {
    "ID KEJADIAN": testId,
    "ID UNRAS": `UNR-${testId}`,
    "TANGGAL": "2026-11-25",
    "LOKASI": "Jakarta Pusat",
    "LOKASI UNRAS": "Gedung Mahkamah Konstitusi",
    "ISU": "Uji Materiil UU Diperbarui",
    "Status Kejadian": "Sedang Berlangsung",
    "JUMLAH MASSA": 1500,
    "REDAKSI": "Update situasi dari koordinator lapangan di Excel"
  };

  const updates = extractInboundMappedUpdates(inboundExcelRow, "2026-11-25", "2026-11-25T10:00:00+07:00");
  
  // Apply inbound full overwrite to store
  const overwritten = await protestStore.updateProtest(initial.id, updates, {
    id: "system-excel-sync",
    name: "Excel Inbound Sync",
    email: "system@scc.go.id",
    role: "admin"
  });

  assert.ok(overwritten);
  // Field 1: Status overwritten by Excel
  assert.equal(overwritten.status, "ongoing", "Operator status must be overwritten by Excel status");
  assert.equal(overwritten.status_sumber, "Sedang Berlangsung");

  // Field 2: Crowd size overwritten by Excel
  assert.equal(overwritten.actual_crowd_size, 1500, "Operator crowd size must be overwritten by Excel crowd size");
  assert.equal(overwritten.estimasi_massa_source, 1500);

  // Field 3: Redaksi overwritten by Excel
  assert.equal(overwritten.redaksi, "Update situasi dari koordinator lapangan di Excel");
  assert.equal(overwritten.editorial_draft, "Update situasi dari koordinator lapangan di Excel");
});

test("11. Operator Save Dispatch Invocation with Mock Webhook", async () => {
  let requestReceived = null;
  const mockServer = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      requestReceived = {
        method: req.method,
        headers: req.headers,
        body: JSON.parse(body)
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "success" }));
    });
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = mockServer.address().port;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = `http://127.0.0.1:${mockPort}/operator-save`;

  try {
    const testEvent = {
      id: "evt-op-save-test",
      id_kejadian: "KEJ-OPSAVE-001",
      kode_unras: "U-OPSAVE-01",
      tanggal: "2026-11-25",
      lokasi: "Kawasan BI",
      kota_kabupaten: "Jakarta Pusat",
      isu_tuntutan: "Aspirasi Pekerja",
      status: "ongoing",
      actual_crowd_size: 400
    };

    // Simulate operator saving changes via PATCH /api/protests/[id]
    const dispatchResult = await dispatchOutboundSync(testEvent, {
      origin: "scc",
      route: "PATCH /api/protests/[id]"
    });

    assert.equal(dispatchResult.success, true);
    assert.equal(dispatchResult.status, "success");
    assert.ok(requestReceived, "Mock Power Automate endpoint must receive HTTP request on operator Save");
    assert.equal(requestReceived.body.origin, "scc");
    assert.equal(requestReceived.body.id_unras, "U-OPSAVE-01");
    assert.equal(requestReceived.body.fields["STATUS KEJADIAN"], "Sedang Berlangsung");
    assert.equal(requestReceived.body.fields["ESTIMASI JUMLAH MASSA"], 400);
  } finally {
    delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
    mockServer.close();
  }
});

test("12. Outbound HTTP 401 Handling (DirectApiAuthorizationRequired / Missing SAS Signature)", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: {
        code: "DirectApiAuthorizationRequired",
        message: "The request must be authenticated only by Shared Access scheme.",
        messageTemplate: "DirectApiAuthorizationRequired"
      }
    }));
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = mockServer.address().port;
  process.env.POWER_AUTOMATE_OUTBOUND_URL = `http://127.0.0.1:${mockPort}/mock-401`;

  try {
    const testEvent = {
      id: "evt-op-401-test",
      id_kejadian: "KEJ-401-001",
      kode_unras: "U-401-01",
      tanggal: "2026-11-25",
      lokasi: "Gedung Bank Indonesia",
      kota_kabupaten: "Jakarta Pusat",
      status: "ongoing"
    };

    const dispatchResult = await dispatchOutboundSync(testEvent, {
      origin: "scc",
      route: "PATCH /api/protests/[id]"
    });

    assert.equal(dispatchResult.success, false);
    assert.equal(dispatchResult.status, "failed");
    assert.equal(dispatchResult.http_status, 401);
    assert.match(dispatchResult.error, /DirectApiAuthorizationRequired/);
    assert.match(dispatchResult.error, /Shared Access Signature/);
  } finally {
    delete process.env.POWER_AUTOMATE_OUTBOUND_URL;
    mockServer.close();
  }
});
