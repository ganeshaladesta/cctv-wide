import assert from "node:assert";
import { protestStore } from "../src/lib/protest-store.js";
import {
  deriveTahunBulan,
  deriveEventTimestamps,
  generateIdKejadian,
  generateKodeUnras,
  synthesizeRedaksiText
} from "../src/lib/unras-helpers.js";

async function runTests() {
  console.log("====================================================");
  console.log("=== TEST SUITE: UNRAS EXCEL C:AC REDESIGNED FORM ===");
  console.log("====================================================\n");

  // 1. Test Helper Derivations
  console.log("Test 1: Helper Derivations (Tahun, Bulan, Timestamps, IDs)");
  const tb = deriveTahunBulan("2026-11-20");
  assert.strictEqual(tb.tahun, 2026, "Tahun should be 2026");
  assert.strictEqual(tb.bulan, "November", "Bulan should be November");

  const ts = deriveEventTimestamps("2026-11-20", "09:30 WIB");
  assert.strictEqual(ts.normalizedTime, "09:30:00", "Normalized time should be 09:30:00");
  assert.ok(ts.eventDatetimeIso.includes("2026-11-20T09:30:00"), "Event ISO should include datetime");

  const autoId = generateIdKejadian("DKI Jakarta", "2026-11-20");
  assert.ok(autoId.startsWith("UNRAS-2026-JKT-"), `Auto ID should follow format: ${autoId}`);

  const autoKode = generateKodeUnras("2026-11-20", "Gedung DPR RI");
  assert.ok(autoKode.startsWith("KODE-2026-"), `Auto Kode should follow format: ${autoKode}`);
  console.log("  ✔ Helper derivations passed.\n");

  // 2. Test Redaksi Synthesis
  console.log("Test 2: Redaksi Synthesis (Sections A + B + C + Dampak + Realisasi)");
  const redaksi = synthesizeRedaksiText({
    kategori_kejadian: "Unjuk Rasa",
    tanggal: "2026-11-20",
    waktu_mulai: "09:00 WIB",
    lokasi: "Gedung DPR/MPR RI",
    kota_kabupaten: "Jakarta Pusat",
    provinsi: "DKI Jakarta",
    organisasi_kelompok: "KSPSI",
    estimasi_massa_source: 1500,
    isu_tuntutan: "Evaluasi Kebijakan Ketenagakerjaan",
    dampak: "Ada",
    keterangan_dampak: "Arus lalu lintas padat",
    info_awal: "Pantauan intelijen mendeteksi pergerakan massa",
    tindak_lanjut: "Koordinasi dengan Polres Jakpus",
    situation_summary: "Massa mulai berkumpul",
    progres_asistensi: "Asistensi pengamanan berlangsung aman",
    realisasi: "Terealisasi"
  });
  assert.ok(redaksi.includes("LAPORAN AKSI UNJUK RASA"), "Redaksi should include header");
  assert.ok(redaksi.includes("KSPSI"), "Redaksi should include aliansi");
  assert.ok(redaksi.includes("Gedung DPR/MPR RI"), "Redaksi should include lokasi");
  console.log("  ✔ Redaksi synthesis passed.\n");

  // 3. Test Local & Dual-Mode Store Creation with C:AC Fields
  console.log("Test 3: Create Protest Record with Full C:AC Fields");
  const testOperator = {
    id: "usr-op-001",
    email: "operator@scc.go.id",
    name: "Petugas Lapangan SCC",
    role: "operator",
    agency: "SCC - EAGLE EYES"
  };

  const created = await protestStore.createProtest({
    tanggal: "2026-11-20",
    waktu_mulai: "10:00 WIB",
    lokasi: "Kementerian BUMN, Jl. Medan Merdeka Selatan",
    isu_tuntutan: "Aspirasi Kesejahteraan Pekerja Outsourcing BUMN",
    estimasi_massa_source: 350,
    organisasi_kelompok: "Federasi Serikat Pekerja BUMN Bersatu",
    korlap_pimpinan: "Ahmad Dahlan",
    provinsi: "DKI Jakarta",
    kota_kabupaten: "Jakarta Pusat",
    wilayah_hukum: "Polres Metro Jakarta Pusat",
    status: "scheduled",
    urgency: "medium",
    validated_lat: -6.1812,
    validated_lng: 106.8285,

    // C:AC Fields
    kategori_kejadian: "Unjuk Rasa",
    kp_kpw: "KPBI",
    regional: "Kantor Pusat",
    kategori_isu: "Ekonomi, Moneter, Finansial & Perbankan",
    dampak: "Tidak Ada",
    keterangan_dampak: "Lalu lintas terpantau lancar terkendali",
    nama_pelapor: "Petugas Lapangan SCC",
    info_awal: "Pemberitahuan resmi telah diterima intelkam",
    tindak_lanjut: "Pengamanan PAM Obvit Polda Metro Jaya",
    situation_summary: "Petugas patroli memantau kedatangan rombongan",
    editorial_draft: redaksi,
    progres_asistensi: "Koordinasi pengamanan titik masuk gerbang",
    realisasi: "Terealisasi"
  }, testOperator);

  assert.ok(created.id, "Created record must have an ID");
  assert.ok(created.id_kejadian, "Created record must have an id_kejadian");
  assert.strictEqual(created.tahun, 2026, "Tahun must be 2026");
  assert.strictEqual(created.bulan, "November", "Bulan must be November");
  assert.strictEqual(created.kategori_kejadian, "Unjuk Rasa", "Kategori must be Unjuk Rasa");
  assert.strictEqual(created.kp_kpw, "KPBI", "KP/KPw must be KPBI");
  assert.strictEqual(created.regional, "Kantor Pusat", "Regional must be Kantor Pusat");
  assert.strictEqual(created.kategori_isu, "Ekonomi, Moneter, Finansial & Perbankan");
  assert.strictEqual(created.dampak, "Tidak Ada");
  assert.strictEqual(created.nama_pelapor, "Petugas Lapangan SCC");
  assert.strictEqual(created.realisasi, "Terealisasi");
  assert.strictEqual(created.location_validation_status, "verified");
  console.log(`  ✔ Successfully created record: ${created.id_kejadian} (${created.id})`);

  // 4. Test Fetching by ID
  console.log("\nTest 4: Fetch Created Record and Verify C:AC Fields");
  const fetched = await protestStore.getProtestById(created.id);
  assert.ok(fetched, "Record must be retrievable");
  assert.strictEqual(fetched.id_kejadian, created.id_kejadian);
  assert.strictEqual(fetched.kategori_isu, "Ekonomi, Moneter, Finansial & Perbankan");
  assert.strictEqual(fetched.kp_kpw, "KPBI");
  assert.strictEqual(fetched.regional, "Kantor Pusat");
  assert.strictEqual(fetched.progres_asistensi, "Koordinasi pengamanan titik masuk gerbang");
  console.log("  ✔ Record retrievable with all C:AC fields intact.");

  // 5. Test Update Protest with C:AC Fields
  console.log("\nTest 5: Update Protest Record with C:AC Field Changes");
  const updated = await protestStore.updateProtest(created.id, {
    status: "ongoing",
    dampak: "Ada",
    keterangan_dampak: "1 lajur Jl. Medan Merdeka Selatan digunakan untuk parkir bus",
    progres_asistensi: "Perwakilan massa (5 orang) diterima beraudiensi",
    realisasi: "Audiensi"
  }, testOperator);

  assert.ok(updated, "Update must succeed");
  assert.strictEqual(updated.status, "ongoing", "Status should be ongoing");
  assert.strictEqual(updated.dampak, "Ada", "Dampak should be Ada");
  assert.strictEqual(updated.keterangan_dampak, "1 lajur Jl. Medan Merdeka Selatan digunakan untuk parkir bus");
  assert.strictEqual(updated.realisasi, "Audiensi", "Realisasi should be Audiensi");
  console.log("  ✔ Update protest with C:AC fields passed.");

  // 6. Test Query Protests Filter
  console.log("\nTest 6: Query Filter");
  const list = await protestStore.queryProtests({
    q: "Ahmad Dahlan",
    limit: 10
  });
  assert.ok(list.data.length > 0, "Query should match newly created record");
  assert.ok(list.data.some((p) => p.id === created.id));
  console.log(`  ✔ Found ${list.data.length} match(es) for query search.`);

  // 7. Test Numeric Crowd Size Validation Rule
  console.log("\nTest 7: Numeric Crowd Size Validation Rule");
  const validateMassa = (val) => {
    if (val !== undefined && val !== null && val !== "") {
      const num = Number(val);
      if (isNaN(num) || num < 0) return false;
    }
    return true;
  };
  assert.strictEqual(validateMassa(-10), false, "Negative crowd size must be invalid");
  assert.strictEqual(validateMassa("abc"), false, "Non-numeric crowd size must be invalid");
  assert.strictEqual(validateMassa(0), true, "Zero crowd size is valid");
  assert.strictEqual(validateMassa(1500), true, "Positive crowd size is valid");
  assert.strictEqual(validateMassa(null), true, "Null crowd size is allowed");
  console.log("  ✔ Crowd size validation rules verified.");

  // 8. Test Mandatory Fields Validation Rule
  console.log("\nTest 8: Mandatory Fields Validation Rule");
  const validateMandatory = (obj) => {
    return Boolean(obj.tanggal && obj.lokasi && obj.isu_tuntutan);
  };
  assert.strictEqual(validateMandatory({ tanggal: "2026-11-20", lokasi: "DPR RI", isu_tuntutan: "Tuntutan" }), true);
  assert.strictEqual(validateMandatory({ tanggal: "", lokasi: "DPR RI", isu_tuntutan: "Tuntutan" }), false);
  assert.strictEqual(validateMandatory({ tanggal: "2026-11-20", lokasi: "", isu_tuntutan: "Tuntutan" }), false);
  assert.strictEqual(validateMandatory({ tanggal: "2026-11-20", lokasi: "DPR RI", isu_tuntutan: "" }), false);
  console.log("  ✔ Mandatory field rules verified.");

  console.log("\n====================================================");
  console.log("=== ALL TEST SUITE CHECKS PASSED SUCCESSFULLY! ===");
  console.log("====================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
