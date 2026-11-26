import assert from "node:assert/strict";
import { getProtestStore } from "../src/lib/protest-store.ts";

function formatCctvIndicator(cameraLinks) {
  const validLinks = (Array.isArray(cameraLinks) ? cameraLinks : []).filter(
    (l) => l && typeof l.camera_id === "string" && l.camera_id.trim().length > 0
  );
  const uniqueCount = new Set(validLinks.map((l) => l.camera_id.trim())).size;
  return uniqueCount > 0 ? `${uniqueCount} CCTV Tertaut` : "Belum Ada CCTV";
}

async function runTests() {
  console.log("=== TEST: CCTV Linked Indicator on Incident Cards ===");
  const store = getProtestStore();
  const testUser = {
    id: "op-test-001",
    name: "Operator SCC",
    email: "operator@scc.bi.go.id",
    role: "operator"
  };

  const testSuffix = Date.now().toString().slice(-6);
  const testDate = "2099-12-31";
  const createdEvent = store.createProtestLocal(
    {
      id_kejadian: `TEST-CCTV-IND-${testSuffix}`,
      kode_unras: `UNR-CCTV-${testSuffix}`,
      tanggal: testDate,
      waktu_mulai: "09:00 WIB",
      lokasi: "Kantor Pusat Bank Indonesia, Jakarta",
      isu_tuntutan: "Verifikasi Indikator Tautan CCTV Incident Card",
      provinsi: "DKI JAKARTA",
      kota_kabupaten: "JAKARTA PUSAT",
      status: "ongoing",
      urgency: "high"
    },
    testUser
  );

  const protestId = createdEvent.id;

  try {
    // TEST CASE 1: Incident with zero linked cameras -> "Belum Ada CCTV"
    let queryRes = store.queryProtestsLocal({ q: createdEvent.kode_unras, limit: 10 });
    let incident = queryRes.data.find((e) => e.id === protestId);
    assert.ok(incident, "Incident should be returned by queryProtestsLocal");
    assert.ok(Array.isArray(incident.camera_links), "camera_links must be attached as an array on queryProtests");
    assert.equal(incident.camera_links.length, 0, "Initial camera_links count must be 0");
    assert.equal(formatCctvIndicator(incident.camera_links), "Belum Ada CCTV");
    console.log("PASS [1/6]: Zero linked cameras -> 'Belum Ada CCTV'");

    // TEST CASE 2 & 4: Link 1 camera -> indicator updates immediately to "1 CCTV Tertaut"
    store.linkCameraLocal(
      {
        protest_id: protestId,
        camera_id: "cam-test-bi-001",
        notes: "Kamera pantauan gerbang utama"
      },
      testUser
    );

    queryRes = store.queryProtestsLocal({ q: createdEvent.kode_unras, limit: 10 });
    incident = queryRes.data.find((e) => e.id === protestId);
    assert.equal(incident.camera_links.length, 1, "camera_links count must be 1 after linking 1 camera");
    assert.equal(formatCctvIndicator(incident.camera_links), "1 CCTV Tertaut");
    assert.ok(incident.camera_links[0].camera, "Fallback camera metadata object must be populated even if camera ID is not in static catalog");
    assert.equal(incident.camera_links[0].camera.id, "cam-test-bi-001");
    console.log("PASS [2/6 & 4/6]: Link 1 camera -> immediately updates to '1 CCTV Tertaut' (with fallback metadata support)");

    // TEST CASE 3: Incident with three linked cameras -> "3 CCTV Tertaut"
    store.linkCameraLocal(
      {
        protest_id: protestId,
        camera_id: "cam-test-bi-002"
      },
      testUser
    );
    store.linkCameraLocal(
      {
        protest_id: protestId,
        camera_id: "cam-test-bi-003"
      },
      testUser
    );

    queryRes = store.queryProtestsLocal({ q: createdEvent.kode_unras, limit: 10 });
    incident = queryRes.data.find((e) => e.id === protestId);
    assert.equal(incident.camera_links.length, 3, "camera_links count must be 3 after linking 3 cameras");
    assert.equal(formatCctvIndicator(incident.camera_links), "3 CCTV Tertaut");
    console.log("PASS [3/6]: Three linked cameras -> '3 CCTV Tertaut'");

    // TEST CASE 5: Unlink a camera -> indicator updates immediately to "2 CCTV Tertaut"
    const unlinked = store.unlinkCameraLocal(protestId, "cam-test-bi-002");
    assert.equal(unlinked, true, "unlinkCameraLocal should return true");

    queryRes = store.queryProtestsLocal({ q: createdEvent.kode_unras, limit: 10 });
    incident = queryRes.data.find((e) => e.id === protestId);
    assert.equal(incident.camera_links.length, 2, "camera_links count must be 2 after unlinking 1 camera");
    assert.equal(formatCctvIndicator(incident.camera_links), "2 CCTV Tertaut");
    console.log("PASS [5/6]: Unlink a camera -> immediately updates to '2 CCTV Tertaut'");

    // TEST CASE 6: Refresh / re-query & ignore invalid/empty camera_id relationships
    const refreshedIncident = store.getProtestByIdLocal(protestId);
    assert.ok(refreshedIncident, "getProtestByIdLocal should return incident on refresh");
    assert.equal(refreshedIncident.camera_links.length, 2);
    assert.equal(formatCctvIndicator(refreshedIncident.camera_links), "2 CCTV Tertaut");
    assert.equal(
      formatCctvIndicator([
        ...refreshedIncident.camera_links,
        { id: "bad-1", protest_id: protestId, camera_id: "" },
        { id: "bad-2", protest_id: protestId, camera_id: "   " },
        { id: "dup-1", protest_id: protestId, camera_id: "cam-test-bi-001" }
      ]),
      "2 CCTV Tertaut",
      "Invalid or duplicate camera relationships must not be counted"
    );
    console.log("PASS [6/6]: Refresh consistency & invalid/duplicate camera relationships ignored");
  } finally {
    // Cleanup test data
    store.unlinkCameraLocal(protestId, "cam-test-bi-001");
    store.unlinkCameraLocal(protestId, "cam-test-bi-002");
    store.unlinkCameraLocal(protestId, "cam-test-bi-003");
    if (store.db) {
      store.db.prepare("DELETE FROM protests WHERE id = ?").run(protestId);
    }
    if (store.memoryEvents) {
      store.memoryEvents.delete(protestId);
    }
  }

  console.log("=== ALL 6 CCTV LINK INDICATOR TEST CASES PASSED ===");
}

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
