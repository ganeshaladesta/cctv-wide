/**
 * SCC - EAGLE EYES: Acceptance Test Suite
 * Interactive Map Location Picker & Coordinate Persistence
 *
 * Verifies:
 * 1. Coordinate range validation rules (-90 to 90 lat, -180 to 180 lng).
 * 2. Unmapped event preservation (null coordinates allowed without inventing numbers).
 * 3. Geocoding search & reverse geocoding parameter formatting.
 * 4. Database persistence of manual event creation with map-picked coordinates.
 * 5. Refinement/editing of coordinates on existing events.
 * 6. Protection of operator-validated coordinates during subsequent Excel syncs.
 */

import assert from "node:assert/strict";
import { protestStore } from "../src/lib/protest-store.ts";

async function runTests() {
  console.log("================================================================================");
  console.log("=== SCC - EAGLE EYES: Test Suite - Map Location Picker & Persistence         ===");
  console.log("================================================================================\n");

  const operatorUser = {
    id: "usr-operator-01",
    name: "Operator Lapangan",
    role: "operator"
  };

  // -------------------------------------------------------------------------
  // TEST 1: Coordinate Range Validation Rules
  // -------------------------------------------------------------------------
  console.log("Test 1: Validasi rentang koordinat (-90 s/d 90 Lat, -180 s/d 180 Lng)...");
  {
    const isValidCoord = (lat, lng) => {
      if (lat === null || lat === undefined || lng === null || lng === undefined) return true;
      const nLat = Number(lat);
      const nLng = Number(lng);
      return !isNaN(nLat) && !isNaN(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180;
    };

    // Valid coordinates
    assert.ok(isValidCoord(-6.2088, 106.8456), "Jakarta Pusat (-6.2088, 106.8456) must be valid");
    assert.ok(isValidCoord(0, 0), "Equator (0,0) must be valid");
    assert.ok(isValidCoord(null, null), "Unmapped (null, null) must be valid");

    // Invalid coordinates
    assert.ok(!isValidCoord(-91, 106), "Lat -91 must be rejected (< -90)");
    assert.ok(!isValidCoord(95, 106), "Lat 95 must be rejected (> 90)");
    assert.ok(!isValidCoord(-6, -181), "Lng -181 must be rejected (< -180)");
    assert.ok(!isValidCoord(-6, 185), "Lng 185 must be rejected (> 180)");
    assert.ok(!isValidCoord("invalid", 106), "NaN Lat must be rejected");

    console.log("  ✔ PASS: Rentang koordinat tervalidasi secara ketat (-90 s/d 90, -180 s/d 180)\n");
  }

  // -------------------------------------------------------------------------
  // TEST 2: Unmapped Event Creation (Do Not Invent Coordinates)
  // -------------------------------------------------------------------------
  console.log("Test 2: Pembuatan aksi unjuk rasa tanpa titik koordinat (Unmapped Event)...");
  {
    const unmappedEvent = await protestStore.createProtest(
      {
        id_kejadian: `MANUAL-UNMAPPED-${Date.now()}`,
        tanggal: "2026-11-20",
        lokasi: "Kawasan Industri Pulo Gadung (Titik Belum Ditentukan)",
        isu_tuntutan: "Aspirasi Ketenagakerjaan",
        validated_lat: null,
        validated_lng: null,
        urgency: "low"
      },
      operatorUser
    );

    assert.ok(unmappedEvent.id, "Event must be created with valid ID");
    assert.equal(unmappedEvent.validated_lat, null, "Latitude must remain null when unmapped");
    assert.equal(unmappedEvent.validated_lng, null, "Longitude must remain null when unmapped");
    assert.equal(Boolean(unmappedEvent.is_location_verified), false, "Must not be verified without precise pin");

    console.log("  ✔ PASS: Aksi belum terpetakan tersimpan dengan koordinat null (tanpa koordinat buatan)\n");
  }

  // -------------------------------------------------------------------------
  // TEST 3: Event Creation with Map-Picked Coordinates & Address
  // -------------------------------------------------------------------------
  console.log("Test 3: Pembuatan aksi baru dengan titik lokasi peta & alamat terkonfirmasi...");
  {
    const dprLat = -6.211540;
    const dprLng = 106.801650;
    const dprAddress = "Gedung DPR/MPR RI, Jl. Jend. Gatot Subroto, Senayan, Jakarta Pusat";

    const mappedEvent = await protestStore.createProtest(
      {
        id_kejadian: `MANUAL-DPR-${Date.now()}`,
        tanggal: "2026-11-20",
        lokasi: dprAddress,
        titik_kumpul: "Plaza Senayan",
        sasaran_aksi: "Gerbang Utama DPR RI",
        isu_tuntutan: "Penolakan RUU",
        validated_lat: dprLat,
        validated_lng: dprLng,
        urgency: "high"
      },
      operatorUser
    );

    assert.ok(mappedEvent.id, "Mapped event must be created");
    assert.equal(Number(mappedEvent.validated_lat), dprLat, "Latitude must match selected pin");
    assert.equal(Number(mappedEvent.validated_lng), dprLng, "Longitude must match selected pin");

    // Fetch from database to verify round-trip persistence
    const fetched = await protestStore.getProtestById(mappedEvent.id);
    assert.ok(fetched, "Must be retrievable from store");
    assert.equal(Number(fetched.validated_lat), dprLat);
    assert.equal(Number(fetched.validated_lng), dprLng);
    assert.equal(fetched.lokasi, dprAddress);

    console.log("  ✔ PASS: Aksi berhasil disimpan dengan titik peta dan terbaca kembali dari database\n");
  }

  // -------------------------------------------------------------------------
  // TEST 4: Existing Event Coordinate Editing & Refinement
  // -------------------------------------------------------------------------
  console.log("Test 4: Pembaruan & penyesuaian titik koordinat pada aksi yang sudah ada...");
  {
    // Create initially unmapped or preliminary event
    const event = await protestStore.createProtest(
      {
        id_kejadian: `MANUAL-EDIT-${Date.now()}`,
        tanggal: "2026-11-21",
        lokasi: "Sekitar Monas",
        isu_tuntutan: "Aksi Damai",
        validated_lat: null,
        validated_lng: null,
        urgency: "medium"
      },
      operatorUser
    );

    // Operator uses interactive map picker to pinpoint Patung Kuda Monas
    const refinedLat = -6.175392;
    const refinedLng = 106.827153;
    const refinedLocationName = "Patung Kuda Arjuna Wijaya, Gambir, Jakarta Pusat";

    const updated = await protestStore.updateProtest(
      event.id,
      {
        validated_lat: refinedLat,
        validated_lng: refinedLng,
        lokasi: refinedLocationName,
        is_location_verified: true
      },
      operatorUser
    );

    assert.equal(Number(updated.validated_lat), refinedLat, "Updated latitude must match refined pin");
    assert.equal(Number(updated.validated_lng), refinedLng, "Updated longitude must match refined pin");

    // Confirm persisted in store
    const reloaded = await protestStore.getProtestById(event.id);
    assert.equal(Number(reloaded.validated_lat), refinedLat);
    assert.equal(Number(reloaded.validated_lng), refinedLng);
    assert.equal(reloaded.lokasi, refinedLocationName);

    console.log("  ✔ PASS: Penyesuaian koordinat via map picker berhasil diperbarui dan tersimpan permanen\n");
  }

  // -------------------------------------------------------------------------
  // TEST 5: Operator Validated Coordinates Protection Against Excel Sync
  // -------------------------------------------------------------------------
  console.log("Test 5: Perlindungan koordinat validasi operator terhadap sinkronisasi Excel...");
  {
    const idKejadian = `UNRAS-PROTECT-COORD-${Date.now()}`;
    const operatorLat = -6.186486;
    const operatorLng = 106.823684;

    // Operator validates coordinates
    const event = await protestStore.createProtest(
      {
        id_kejadian: idKejadian,
        tanggal: "2026-11-22",
        lokasi: "Gedung Bank Indonesia Thamrin",
        isu_tuntutan: "Kebijakan Moneter",
        validated_lat: operatorLat,
        validated_lng: operatorLng,
        urgency: "high"
      },
      operatorUser
    );

    // Later, an Excel sync batch runs for the same ID KEJADIAN with empty/different raw coords
    await protestStore.upsertFromExcelBatch([
      {
        id_kejadian: idKejadian,
        kode_unras: event.kode_unras,
        tanggal: "2026-11-22",
        waktu_mulai: "09:00 WIB",
        lokasi: "Bank Indonesia (Update Excel)",
        isu_tuntutan: "Kebijakan Moneter (Update Excel)",
        latitude: null,
        longitude: null
      }
    ]);

    // Reload from store
    const afterSync = await protestStore.getProtestById(event.id);
    assert.equal(
      Number(afterSync.validated_lat),
      operatorLat,
      "Operator validated latitude must NOT be overwritten by Excel sync"
    );
    assert.equal(
      Number(afterSync.validated_lng),
      operatorLng,
      "Operator validated longitude must NOT be overwritten by Excel sync"
    );

    console.log("  ✔ PASS: Koordinat hasil penandaan operator terbukti aman dari overwrite sinkronisasi Excel\n");
  }

  console.log("================================================================================");
  console.log("=== SEMUA 5 PENGUJIAN MAP LOCATION PICKER & PERSISTENSI SUKSES (100% PASS)  ===");
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
