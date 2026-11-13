/**
 * SCC - EAGLE EYES: Local Excel Unras Synchronization Tool
 * 100% Free, Automated, No-License-Required Alternative to Power Automate.
 *
 * Reads '06. Database Kejadian Unras*.xlsx' (sheet 'NEW UNRAS 2022-2026')
 * Normalizes rows, filters rolling 7-day window, and synchronizes to:
 * 1. Local SQLite database (pantau-nusantara.sqlite)
 * 2. Remote SCC API / Supabase (if VERCEL_URL is configured)
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// Load xlsx
let XLSX;
try {
  const xlsxModule = await import("xlsx");
  XLSX = xlsxModule.default || xlsxModule;
} catch {
  console.error("❌ Package 'xlsx' belum terpasang. Jalankan: npm install xlsx");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// 1. Locate Excel Workbook
function findLatestExcelFile() {
  if (process.argv[2] && fs.existsSync(process.argv[2])) {
    return path.resolve(process.argv[2]);
  }

  const userProfile = process.env.USERPROFILE || "C:\\Users\\dtiadm";
  const searchDirs = [
    path.join(userProfile, "Downloads"),
    "D:\\OneDrive - Bank Indonesia",
    "D:\\OneDrive - Bank Indonesia\\Desktop",
    "D:\\OneDrive - Bank Indonesia\\Documents",
    path.join(userProfile, "OneDrive"),
    path.join(userProfile, "Desktop"),
    path.join(rootDir, "data")
  ];

  const candidateFiles = [];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (
          file.toLowerCase().includes("unras") &&
          file.toLowerCase().endsWith(".xlsx") &&
          !file.startsWith("~$")
        ) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          candidateFiles.push({ filePath: fullPath, mtime: stat.mtimeMs });
        }
      }
    } catch {
      // ignore
    }
  }

  if (candidateFiles.length === 0) return null;

  candidateFiles.sort((a, b) => b.mtime - a.mtime);
  return candidateFiles[0].filePath;
}

// 2. Parse Environment Config
function getTargetConfig() {
  let vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  let syncSecret = process.env.UNRAS_SYNC_SECRET || "";

  const envLocalPath = path.join(rootDir, ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const envContent = fs.readFileSync(envLocalPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...valParts] = trimmed.split("=");
      const val = valParts.join("=").trim().replace(/^["']|["']$/g, "");
      if (key.trim() === "UNRAS_SYNC_SECRET" && !syncSecret) syncSecret = val;
      if ((key.trim() === "VERCEL_URL" || key.trim() === "API_URL") && !vercelUrl) vercelUrl = val;
    }
  }

  return { vercelUrl, syncSecret };
}

// 3. Normalize Row from 'NEW UNRAS 2022-2026'
function mapExcelRow(r, index) {
  const tanggalRaw = r["Tanggal Kejadian"] || r["TANGGAL"] || r["Tanggal"] || "";
  const isoRaw = r["WAKTU DAN TGL KEJADIAN ISO"] || r["WAKTU DAN TGL KEJADIAN FIX"] || "";
  const aliansi = r["Aliansi"] || r["ORGANISASI"] || r["Organisasi/Kelompok"] || "";
  const lokasi = r["Lokasi Unras"] || r["LOKASI"] || r["Lokasi"] || r["Sasaran"] || "Lokasi Belum Ditentukan";
  const tuntutan = r["Tuntutan"] || r["ISU"] || r["Isu Tuntutan"] || r["Kategori Isu"] || "Aksi Unjuk Rasa";
  const jumlahMassa = r["Jumlah Massa"] || r["JUMLAH MASSA"] || r["Estimasi Massa"] || 0;
  const korlap = r["Nama Pelapor"] || r["KORLAP"] || r["Korlap"] || "";
  const wilayahHukum = r["KP/KPw"] || r["Regional"] || r["WILAYAH HUKUM"] || "";
  const provinsi = r["Provinsi"] || r["PROVINSI"] || "DKI Jakarta";
  const kotaKabupaten = r["Lokasi"] || r["KOTA/KABUPATEN"] || "";
  const keterangan = r["Ringkasan Situasi"] || r["Info Awal Unras"] || r["KETERANGAN"] || "";

  let finalISO = "";
  if (isoRaw) {
    finalISO = String(isoRaw).trim();
    if (!finalISO.includes("Z") && !finalISO.includes("+")) {
      finalISO = `${finalISO}+07:00`;
    }
  }

  let finalTanggal = "";
  if (typeof tanggalRaw === "number" && tanggalRaw > 30000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + tanggalRaw * 86400000);
    finalTanggal = d.toISOString().split("T")[0];
  } else if (finalISO) {
    finalTanggal = finalISO.split("T")[0];
  } else {
    finalTanggal = new Date().toISOString().split("T")[0];
  }

  let finalWaktu = "09:00 WIB";
  if (r["Waktu"]) {
    const wNum = Number(r["Waktu"]);
    if (!isNaN(wNum) && wNum > 0 && wNum < 1) {
      const totalSeconds = Math.round(wNum * 86400);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      finalWaktu = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} WIB`;
    } else {
      finalWaktu = String(r["Waktu"]).trim();
    }
  } else if (finalISO && finalISO.includes("T")) {
    const timePart = finalISO.split("T")[1].substring(0, 5);
    finalWaktu = `${timePart} WIB`;
  }

  let idKejadian = r["ID KEJADIAN"] ? String(r["ID KEJADIAN"]).trim() : "";
  if (!idKejadian) {
    const hash = crypto
      .createHash("md5")
      .update(`${finalTanggal}_${lokasi}_${aliansi}_${tuntutan}`)
      .digest("hex")
      .slice(0, 8)
      .toUpperCase();
    idKejadian = `KEJ-${finalTanggal.replace(/-/g, "")}-${hash}`;
  }

  const kodeUnras = r["KODE_UNRAS"] ? String(r["KODE_UNRAS"]).trim() : `U-${idKejadian.slice(-8)}`;

  return {
    "ID KEJADIAN": idKejadian,
    "KODE_UNRAS": kodeUnras,
    "TANGGAL": finalTanggal,
    "WAKTU": finalWaktu,
    "WAKTU DAN TGL KEJADIAN ISO": finalISO,
    "LOKASI": lokasi,
    "TITIK KUMPUL": r["Titik Kumpul"] || r["TITIK KUMPUL"] || null,
    "SASARAN": r["Sasaran"] || r["SASARAN"] || lokasi,
    "ISU": tuntutan,
    "JUMLAH MASSA": typeof jumlahMassa === "number" ? jumlahMassa : parseInt(String(jumlahMassa).replace(/\D/g, "") || "0", 10),
    "ORGANISASI": aliansi,
    "KORLAP": korlap,
    "WILAYAH HUKUM": wilayahHukum,
    "PROVINSI": provinsi,
    "KOTA/KABUPATEN": kotaKabupaten,
    "LATITUDE": r["LATITUDE"] || r["Latitude"] || undefined,
    "LONGITUDE": r["LONGITUDE"] || r["Longitude"] || undefined,
    "STATUS": r["Status Kejadian"] || r["STATUS"] || "ongoing",
    "KETERANGAN": keterangan
  };
}

// 4. Upsert Directly to Local SQLite
async function syncToLocalSQLite(events) {
  const dbPath = path.join(rootDir, "data", "pantau-nusantara.sqlite");
  if (!fs.existsSync(dbPath)) return { inserted: 0, updated: 0 };

  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbPath);
    let inserted = 0;
    let updated = 0;
    const nowStr = new Date().toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO protests (
        id, id_kejadian, kode_unras, tanggal, waktu_mulai, waktu_selesai, event_datetime,
        lokasi, titik_kumpul, sasaran_aksi, isu_tuntutan, estimasi_massa_source,
        organisasi_kelompok, korlap_pimpinan, wilayah_hukum, provinsi, kota_kabupaten,
        keterangan_source, status, urgency, category_id, validated_lat, validated_lng,
        has_coordinates, actual_crowd_size, situation_summary, editorial_draft,
        editorial_final, is_archived, completed_at, completed_by_id, completed_by_name,
        created_at, updated_at, deleted_at, last_synced_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    const updateStmt = db.prepare(`
      UPDATE protests SET
        kode_unras = ?, tanggal = ?, waktu_mulai = ?, event_datetime = ?,
        lokasi = ?, titik_kumpul = ?, sasaran_aksi = ?, isu_tuntutan = ?,
        estimasi_massa_source = ?, organisasi_kelompok = ?, korlap_pimpinan = ?,
        wilayah_hukum = ?, provinsi = ?, kota_kabupaten = ?, keterangan_source = ?,
        last_synced_at = ?, updated_at = ?
      WHERE id = ?
    `);

    for (const ev of events) {
      const existing = db.prepare("SELECT id FROM protests WHERE id_kejadian = ?").get(ev["ID KEJADIAN"]);
      if (existing) {
        updateStmt.run(
          ev["KODE_UNRAS"], ev["TANGGAL"], ev["WAKTU"], ev["WAKTU DAN TGL KEJADIAN ISO"],
          ev["LOKASI"], ev["TITIK KUMPUL"] || null, ev["SASARAN"] || null, ev["ISU"],
          ev["JUMLAH MASSA"] || null, ev["ORGANISASI"] || null, ev["KORLAP"] || null,
          ev["WILAYAH HUKUM"] || null, ev["PROVINSI"] || "DKI Jakarta", ev["KOTA/KABUPATEN"] || null,
          ev["KETERANGAN"] || null, nowStr, nowStr, existing.id
        );
        updated++;
      } else {
        const newId = crypto.randomUUID();
        const hasCoords = ev["LATITUDE"] && ev["LONGITUDE"] ? 1 : 0;
        insertStmt.run(
          newId, ev["ID KEJADIAN"], ev["KODE_UNRAS"], ev["TANGGAL"], ev["WAKTU"], null,
          ev["WAKTU DAN TGL KEJADIAN ISO"], ev["LOKASI"], ev["TITIK KUMPUL"] || null,
          ev["SASARAN"] || null, ev["ISU"], ev["JUMLAH MASSA"] || null,
          ev["ORGANISASI"] || null, ev["KORLAP"] || null, ev["WILAYAH HUKUM"] || null,
          ev["PROVINSI"] || "DKI Jakarta", ev["KOTA/KABUPATEN"] || null, ev["KETERANGAN"] || null,
          "ongoing", "medium", null, ev["LATITUDE"] || null, ev["LONGITUDE"] || null,
          hasCoords, null, null, null, null,
          0, null, null, null, nowStr, nowStr, null, nowStr
        );
        inserted++;
      }
    }

    return { inserted, updated };
  } catch (err) {
    console.warn("⚠️  Peringatan SQLite lokal:", err.message);
    return { inserted: 0, updated: 0, error: err.message };
  }
}

// 5. Main Synchronization Execution
async function run() {
  console.log("================================================================================");
  console.log("=== SCC - EAGLE EYES: Sinkronisasi Otomatis Excel Unras (Solusi Gratis)     ===");
  console.log("================================================================================\n");

  const excelPath = findLatestExcelFile();
  if (!excelPath) {
    console.error("❌ Berkas Excel Unras tidak ditemukan!");
    console.error("   Pastikan berkas '06. Database Kejadian Unras.xlsx' ada di folder Downloads, Desktop, atau data.");
    process.exit(1);
  }

  console.log(`📁 Berkas Excel terdeteksi: ${excelPath}`);
  console.log(`⏱  Waktu berkas: ${fs.statSync(excelPath).mtime.toLocaleString("id-ID")}\n`);

  console.log("📖 Membaca lembar kerja 'NEW UNRAS 2022-2026'...");
  const workbook = XLSX.readFile(excelPath);
  const sheetName = "NEW UNRAS 2022-2026";

  if (!workbook.Sheets[sheetName]) {
    console.error(`❌ Lembar kerja '${sheetName}' tidak ditemukan di berkas Excel.`);
    console.error(`   Lembar yang tersedia: ${workbook.SheetNames.join(", ")}`);
    process.exit(1);
  }

  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
  console.log(`✔ Berhasil membaca total ${rawRows.length} baris dari Excel.\n`);

  // Calculate Rolling 7-Day Window
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = new Date();
  const periodEndMs = now.getTime();
  const periodStartMs = periodEndMs - SEVEN_DAYS_MS;
  const periodEndISO = now.toISOString();
  const periodStartISO = new Date(periodStartMs).toISOString();

  const isSyncAll = process.argv.includes("--all") || process.env.SYNC_ALL === "true";

  if (isSyncAll) {
    console.log("🗓  Mode Sinkronisasi: SEMUA DATA (Full Sync --all)\n");
  } else {
    console.log("🗓  Jendela Waktu Sinkronisasi (Rolling 7 Hari):");
    console.log(`   Mulai  : ${periodStartISO} (${new Date(periodStartMs).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB)`);
    console.log(`   Selesai: ${periodEndISO} (${now.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB)\n`);
  }

  const windowEvents = [];
  let skippedTotal = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const mapped = mapExcelRow(rawRows[i], i);
    if (!mapped["WAKTU DAN TGL KEJADIAN ISO"]) {
      if (isSyncAll && mapped["TANGGAL"]) {
        windowEvents.push(mapped);
        continue;
      }
      skippedTotal++;
      continue;
    }

    const eventMs = Date.parse(mapped["WAKTU DAN TGL KEJADIAN ISO"]);
    if (isNaN(eventMs)) {
      if (isSyncAll && mapped["TANGGAL"]) {
        windowEvents.push(mapped);
        continue;
      }
      skippedTotal++;
      continue;
    }

    if (isSyncAll || (eventMs >= periodStartMs && eventMs < periodEndMs)) {
      windowEvents.push(mapped);
    } else {
      skippedTotal++;
    }
  }

  console.log(`🎯 Hasil Filter Jendela 7 Hari:`);
  console.log(`   - Data masuk jendela 7 hari : ${windowEvents.length} kejadian unras`);
  console.log(`   - Data di luar jendela 7 hari: ${skippedTotal} baris dilewati (arsip/historis)\n`);

  if (windowEvents.length === 0) {
    console.log("ℹ  Tidak ada kejadian unras dalam jendela 7 hari terakhir.");
    process.exit(0);
  }

  // 1. Always Sync to Local Database
  console.log("💾 Menyimpan ke Database Lokal (SQLite)...");
  const localStats = await syncToLocalSQLite(windowEvents);
  console.log(`   ✔ Data baru masuk (Insert) : ${localStats.inserted}`);
  console.log(`   ✔ Data diperbarui (Update)  : ${localStats.updated}`);
  console.log(`   ✔ Database lokal sekarang berisi ${windowEvents.length} data riil unras!\n`);

  // 2. Optionally Sync to Remote Vercel / Supabase API
  const { vercelUrl, syncSecret } = getTargetConfig();

  if (vercelUrl && !vercelUrl.includes("your-project") && !vercelUrl.includes("example")) {
    let cleanUrl = vercelUrl;
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      cleanUrl = `https://${cleanUrl}`;
    }
    const endpointUrl = `${cleanUrl.replace(/\/+$/, "")}/api/integrations/unras/sync`;

    console.log(`🚀 Mengirim ke API Serverless Vercel / Supabase:`);
    console.log(`   URL: ${endpointUrl}`);

    if (!syncSecret) {
      console.warn("   ⚠️  UNRAS_SYNC_SECRET belum diisi di .env.local, sinkronisasi cloud dilewati.");
    } else {
      try {
        const payload = {
          sync_type: "rolling_7d",
          timezone: "Asia/Jakarta",
          period_start: periodStartISO,
          period_end: periodEndISO,
          events: windowEvents
        };

        const response = await fetch(endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${syncSecret}`
          },
          body: JSON.stringify(payload)
        });

        const respText = await response.text();
        let respJson = null;
        try {
          respJson = JSON.parse(respText);
        } catch {
          respJson = { raw: respText };
        }

        if (response.ok) {
          console.log(`   🎉 Cloud Supabase Berhasil Diperbarui (HTTP ${response.status})!`);
          if (respJson.summary) {
            console.log(`      - Cloud Inserted: ${respJson.summary.inserted}`);
            console.log(`      - Cloud Updated : ${respJson.summary.updated}`);
          }
        } else {
          console.warn(`   ⚠️  Cloud mengembalikan status HTTP ${response.status}: ${respJson.error || respText}`);
        }
      } catch (err) {
        console.warn(`   ⚠️  Tidak dapat menghubungi cloud: ${err.message}`);
      }
    }
  }

  console.log("\n================================================================================");
  console.log("=== SELESAI: Data riil Excel unras siap dipantau di SCC - EAGLE EYES!         ===");
  console.log("================================================================================");
}

run();
