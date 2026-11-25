/**
 * SCC - EAGLE EYES: Unjuk Rasa Rolling 7-Calendar-Day Sync Engine
 * Contract: Scheduled Sync (05:00 WIB Asia/Jakarta) & Manual Sync -> Vercel API -> Supabase / Local Store
 * Worksheet: 'NEW UNRAS 2022-2026'
 *
 * Boundary: Rolling 7 Calendar Days in Asia/Jakarta:
 * [00:00:00 WIB (Today - 6 days), 00:00:00 WIB (Today + 1 day)) (exclusive)
 * Total duration: exactly 7 days * 24 hours = 168 hours
 */

import crypto from "node:crypto";
import { protestStore } from "./protest-store";
import {
  ExcelProtestRow,
  ProtestEvent,
  ProtestSyncLog,
  ProtestSyncPayload,
  ProtestSyncResult,
  RollingSyncPayload,
  RollingSyncResult
} from "./types/protests";
import {
  normalizeCrowdEstimate,
  validateIndonesianCoordinates,
  inferProtestCategory
} from "./ms-graph-sync";
import { normalizeTimeString } from "./time-normalization";
import {
  classifyCandidate,
  ExistingProtestComparisonItem
} from "./unras-identity-registry";
import {
  mapSourceStatus,
  mapSourceStatusToProtestStatus
} from "./unras-helpers";

// Rolling 7-calendar-day window: 7 days (168 hours) + 2 hours clock skew margin
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
export const MAX_SAME_DAY_WINDOW_TOLERANCE_MS = 26 * 60 * 60 * 1000; // 26 hours
export const MAX_ROLLING_WINDOW_TOLERANCE_MS = 170 * 60 * 60 * 1000; // 170 hours
const MAX_BATCH_LIMIT = 1000;

// In-memory concurrency lock
let isRollingSyncActive = false;
let rollingSyncStartedAt: number | null = null;
const SYNC_LOCK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes failsafe

/**
 * Calculates exact Same-Day (H-0) calendar window for Asia/Jakarta (WIB)
 * Start: 00:00:00 WIB today, inclusive
 * End: 00:00:00 WIB tomorrow, exclusive
 * Total duration: 24 hours (1 calendar day)
 * Inclusion rule: event_datetime >= period_start AND event_datetime < period_end
 */
export function calculateSameDayWindow(refDate: Date = new Date()): {
  date_wib: string;
  start_date_wib: string;
  end_date_wib: string;
  period_start: string;
  period_end: string;
  period_start_ms: number;
  period_end_ms: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(refDate);

  const y = parts.find((p) => p.type === "year")?.value || String(refDate.getFullYear());
  const m = parts.find((p) => p.type === "month")?.value || String(refDate.getMonth() + 1).padStart(2, "0");
  const d = parts.find((p) => p.type === "day")?.value || String(refDate.getDate()).padStart(2, "0");

  const todayWib = `${y}-${m}-${d}`;
  if (todayWib.includes("--")) {
    throw new Error(`Malformed date_wib generated with double dash: ${todayWib}`);
  }

  const todayStartWib = new Date(`${todayWib}T00:00:00+07:00`);
  const tomorrowStartWib = new Date(todayStartWib.getTime() + ONE_DAY_MS);

  const period_start = todayStartWib.toISOString();
  const period_end = tomorrowStartWib.toISOString();

  if (period_start.includes("--") || period_end.includes("--")) {
    throw new Error(`Malformed ISO string generated with double dash: ${period_start}`);
  }

  const endParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(tomorrowStartWib);
  const ey = endParts.find((p) => p.type === "year")?.value;
  const em = endParts.find((p) => p.type === "month")?.value;
  const ed = endParts.find((p) => p.type === "day")?.value;
  const end_date_wib = `${ey}-${em}-${ed}`;

  return {
    date_wib: todayWib,
    start_date_wib: todayWib,
    end_date_wib,
    period_start,
    period_end,
    period_start_ms: todayStartWib.getTime(),
    period_end_ms: tomorrowStartWib.getTime()
  };
}

/**
 * Calculates exact Rolling 7-Calendar-Day synchronization window for Asia/Jakarta (WIB)
 * Start: 00:00:00 WIB (today - 6 days), inclusive
 * End: 00:00:00 WIB tomorrow (today + 1 day), exclusive
 * Total duration: 168 hours (7 calendar days)
 * Inclusion rule: event_datetime >= period_start AND event_datetime < period_end
 */
export function calculateRolling7DayWindow(refDate: Date = new Date()): {
  date_wib: string;
  start_date_wib: string;
  end_date_wib: string;
  period_start: string;
  period_end: string;
  period_start_ms: number;
  period_end_ms: number;
} {
  // Safe extraction of Asia/Jakarta date parts without string interpolation defects
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(refDate);

  const y = parts.find((p) => p.type === "year")?.value || String(refDate.getFullYear());
  const m = parts.find((p) => p.type === "month")?.value || String(refDate.getMonth() + 1).padStart(2, "0");
  const d = parts.find((p) => p.type === "day")?.value || String(refDate.getDate()).padStart(2, "0");

  const todayWib = `${y}-${m}-${d}`;
  if (todayWib.includes("--")) {
    throw new Error(`Malformed date_wib generated with double dash: ${todayWib}`);
  }

  const todayStartWib = new Date(`${todayWib}T00:00:00+07:00`);
  // Rolling 7 calendar days: Start is 6 days ago at 00:00:00 WIB, End is tomorrow at 00:00:00 WIB (exclusive)
  const startWib = new Date(todayStartWib.getTime() - 6 * ONE_DAY_MS);
  const endWib = new Date(todayStartWib.getTime() + ONE_DAY_MS);

  const period_start = startWib.toISOString();
  const period_end = endWib.toISOString();

  if (period_start.includes("--") || period_end.includes("--")) {
    throw new Error(`Malformed ISO string generated with double dash: ${period_start}`);
  }

  const startParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(startWib);
  const sy = startParts.find((p) => p.type === "year")?.value;
  const sm = startParts.find((p) => p.type === "month")?.value;
  const sd = startParts.find((p) => p.type === "day")?.value;
  const start_date_wib = `${sy}-${sm}-${sd}`;

  const endParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(endWib);
  const ey = endParts.find((p) => p.type === "year")?.value;
  const em = endParts.find((p) => p.type === "month")?.value;
  const ed = endParts.find((p) => p.type === "day")?.value;
  const end_date_wib = `${ey}-${em}-${ed}`;

  return {
    date_wib: todayWib,
    start_date_wib,
    end_date_wib,
    period_start,
    period_end,
    period_start_ms: startWib.getTime(),
    period_end_ms: endWib.getTime()
  };
}

/**
 * Extracts a field value case-insensitively across provided candidate keys
 */
function getField(row: Record<string, any>, ...keys: string[]): any {
  if (!row || typeof row !== "object") return undefined;
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
      return row[k];
    }
  }
  // Try case-insensitive lookup
  const rowKeys = Object.keys(row);
  for (const k of keys) {
    const kLower = k.toLowerCase().replace(/[\s_-]/g, "");
    const foundKey = rowKeys.find((rk) => rk.toLowerCase().replace(/[\s_-]/g, "") === kLower);
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== "") {
      return row[foundKey];
    }
  }
  return undefined;
}

/**
 * Checks if a candidate key is explicitly present in the row object (case-insensitive & snake/kebab-agnostic).
 */
export function hasRowField(row: Record<string, any>, ...candidateKeys: string[]): boolean {
  if (!row || typeof row !== "object") return false;
  for (const k of candidateKeys) {
    if (k in row) return true;
  }
  const rowKeys = Object.keys(row);
  for (const k of candidateKeys) {
    const kNorm = k.toLowerCase().replace(/[\s_-]/g, "");
    if (rowKeys.some((rk) => rk.toLowerCase().replace(/[\s_-]/g, "") === kNorm)) {
      return true;
    }
  }
  return false;
}

/**
 * Retrieves the raw value of a field if present, or undefined if omitted.
 */
export function getRawRowField(row: Record<string, any>, ...candidateKeys: string[]): any {
  if (!row || typeof row !== "object") return undefined;
  for (const k of candidateKeys) {
    if (k in row) return row[k];
  }
  const rowKeys = Object.keys(row);
  for (const k of candidateKeys) {
    const kNorm = k.toLowerCase().replace(/[\s_-]/g, "");
    const foundKey = rowKeys.find((rk) => rk.toLowerCase().replace(/[\s_-]/g, "") === kNorm);
    if (foundKey) return row[foundKey];
  }
  return undefined;
}

/**
 * Normalizes an explicit value preserving empty strings, numbers, booleans, and nulls
 */
export function parseExplicitString(val: any): string | null {
  if (val === null || val === undefined) return null;
  return String(val).trim();
}

/**
 * Extracts all mapped inbound fields from an Excel row with explicit presence checks.
 * Distinguishes between omitted fields and explicit empty string, 0, false, or null.
 */
export function extractInboundMappedUpdates(
  row: Record<string, any>,
  eventDateWib: string,
  timeParsedIso?: string | null
): Partial<ProtestEvent> {
  const updates: Partial<ProtestEvent> = {};

  // 1. Tanggal
  if (hasRowField(row, "tanggal_kejadian", "TANGGAL", "tanggal")) {
    updates.tanggal = eventDateWib;
  }

  // 2. Waktu mulai
  if (hasRowField(row, "WAKTU", "waktu", "waktu_mulai")) {
    const rawW = getRawRowField(row, "WAKTU", "waktu", "waktu_mulai");
    if (rawW === null || rawW === undefined || String(rawW).trim() === "") {
      updates.waktu_mulai = null;
    } else {
      const norm = normalizeTimeString(rawW);
      updates.waktu_mulai = norm.time || String(rawW).trim();
    }
  }

  // 3. Location & Venue (Section 4 Contract)
  // Excel 'Lokasi Unras' = Specific protest venue -> SCC 'lokasi'
  // Excel 'Lokasi' = City / administrative area -> SCC 'kota_kabupaten'
  const hasLokasiUnras = hasRowField(row, "lokasi_unras", "LOKASI UNRAS", "LOKASI_UNRAS");
  const hasLokasi = hasRowField(row, "LOKASI", "lokasi");
  const hasKota = hasRowField(row, "KOTA/KABUPATEN", "kota_kabupaten", "kota", "KOTA");

  if (hasLokasiUnras) {
    const rawVenue = getRawRowField(row, "lokasi_unras", "LOKASI UNRAS", "LOKASI_UNRAS");
    updates.lokasi = parseExplicitString(rawVenue) || "";
    if (hasLokasi || hasKota) {
      const rawCity = getRawRowField(row, "LOKASI", "lokasi", "KOTA/KABUPATEN", "kota_kabupaten", "kota", "KOTA");
      updates.kota_kabupaten = parseExplicitString(rawCity);
    }
  } else if (hasKota) {
    if (hasLokasi) {
      const rawVenue = getRawRowField(row, "LOKASI", "lokasi");
      updates.lokasi = parseExplicitString(rawVenue) || "";
    }
    const rawCity = getRawRowField(row, "KOTA/KABUPATEN", "kota_kabupaten", "kota", "KOTA");
    updates.kota_kabupaten = parseExplicitString(rawCity);
  } else if (hasLokasi) {
    const rawLoc = getRawRowField(row, "LOKASI", "lokasi");
    updates.lokasi = parseExplicitString(rawLoc) || "";
  }

  // 4. Titik kumpul & Sasaran
  if (hasRowField(row, "TITIK KUMPUL", "titik_kumpul")) {
    updates.titik_kumpul = parseExplicitString(getRawRowField(row, "TITIK KUMPUL", "titik_kumpul"));
  }
  if (hasRowField(row, "SASARAN", "sasaran", "sasaran_aksi")) {
    updates.sasaran_aksi = parseExplicitString(getRawRowField(row, "SASARAN", "sasaran", "sasaran_aksi"));
  }

  // 5. Isu & Tuntutan
  if (hasRowField(row, "ISU", "tuntutan", "isu_tuntutan", "isu")) {
    updates.isu_tuntutan = parseExplicitString(getRawRowField(row, "ISU", "tuntutan", "isu_tuntutan", "isu")) || "";
  }

  // 6. Jumlah Massa
  if (hasRowField(row, "JUMLAH MASSA", "jumlah_massa", "estimasi_massa")) {
    const rawM = getRawRowField(row, "JUMLAH MASSA", "jumlah_massa", "estimasi_massa");
    if (rawM === null || rawM === undefined || String(rawM).trim() === "") {
      updates.estimasi_massa_source = null;
      updates.actual_crowd_size = null;
    } else if (typeof rawM === "number") {
      updates.estimasi_massa_source = Math.round(rawM);
      updates.actual_crowd_size = Math.round(rawM);
    } else {
      const norm = normalizeCrowdEstimate(rawM);
      updates.estimasi_massa_source = norm.count;
      updates.actual_crowd_size = norm.count;
    }
  }

  // 7. Organisasi / Aliansi
  if (hasRowField(row, "ORGANISASI", "aliansi", "organisasi_kelompok", "organisasi")) {
    updates.organisasi_kelompok = parseExplicitString(getRawRowField(row, "ORGANISASI", "aliansi", "organisasi_kelompok", "organisasi"));
  }

  // 8. Korlap
  if (hasRowField(row, "KORLAP", "korlap", "korlap_pimpinan")) {
    updates.korlap_pimpinan = parseExplicitString(getRawRowField(row, "KORLAP", "korlap", "korlap_pimpinan"));
  }

  // 9. Wilayah Hukum & KP/KPw
  if (hasRowField(row, "KP/KPw", "kp", "kp_kpw")) {
    const kpVal = parseExplicitString(getRawRowField(row, "KP/KPw", "kp", "kp_kpw"));
    updates.kp_kpw = kpVal;
    if (!hasRowField(row, "WILAYAH HUKUM", "wilayah_hukum")) {
      updates.wilayah_hukum = kpVal;
    }
  }
  if (hasRowField(row, "WILAYAH HUKUM", "wilayah_hukum")) {
    updates.wilayah_hukum = parseExplicitString(getRawRowField(row, "WILAYAH HUKUM", "wilayah_hukum"));
  }

  // 10. Provinsi & Regional
  if (hasRowField(row, "PROVINSI", "provinsi")) {
    updates.provinsi = parseExplicitString(getRawRowField(row, "PROVINSI", "provinsi"));
  }
  if (hasRowField(row, "REGIONAL", "regional")) {
    updates.regional = parseExplicitString(getRawRowField(row, "REGIONAL", "regional"));
  }

  // 11. Kategori Isu & Dampak
  if (hasRowField(row, "kategori_isu", "KATEGORI ISU", "KATEGORI_ISU")) {
    updates.kategori_isu = parseExplicitString(getRawRowField(row, "kategori_isu", "KATEGORI ISU", "KATEGORI_ISU"));
  }
  if (hasRowField(row, "DAMPAK", "dampak")) {
    updates.dampak = parseExplicitString(getRawRowField(row, "DAMPAK", "dampak"));
  }
  if (hasRowField(row, "keterangan_dampak", "KETERANGAN DAMPAK")) {
    updates.keterangan_dampak = parseExplicitString(getRawRowField(row, "keterangan_dampak", "KETERANGAN DAMPAK"));
  }

  // 12. Ringkasan Situasi / Keterangan
  if (hasRowField(row, "KETERANGAN", "ringkasan_situasi", "keterangan_source", "keterangan")) {
    const rawKet = parseExplicitString(getRawRowField(row, "KETERANGAN", "ringkasan_situasi", "keterangan_source", "keterangan"));
    updates.keterangan_source = rawKet;
    updates.situation_summary = rawKet;
  }

  // 13. Status Sumber & Status Kejadian
  if (hasRowField(row, "Status Kejadian", "status_sumber", "STATUS SUMBER", "STATUS")) {
    const rawSt = getRawRowField(row, "Status Kejadian", "status_sumber", "STATUS SUMBER", "STATUS");
    const mappedSt = mapSourceStatus(rawSt);
    updates.status_sumber = mappedSt || null;
    updates.status = mapSourceStatusToProtestStatus(mappedSt);
  }

  // 14. Info Awal & Tindak Lanjut
  if (hasRowField(row, "info_awal_unras", "info_awal", "INFO AWAL UNRAS", "INFO AWAL")) {
    updates.info_awal = parseExplicitString(getRawRowField(row, "info_awal_unras", "info_awal", "INFO AWAL UNRAS", "INFO AWAL"));
  }
  if (hasRowField(row, "tindak_lanjut_kpbi", "tindak_lanjut", "TINDAK LANJUT KPBI", "TINDAK LANJUT")) {
    updates.tindak_lanjut = parseExplicitString(getRawRowField(row, "tindak_lanjut_kpbi", "tindak_lanjut", "TINDAK LANJUT KPBI", "TINDAK LANJUT"));
  }

  // 15. Redaksi & Editorial
  if (hasRowField(row, "redaksi", "REDAKSI", "editorial_draft")) {
    const red = parseExplicitString(getRawRowField(row, "redaksi", "REDAKSI", "editorial_draft"));
    updates.redaksi = red;
    updates.editorial_draft = red;
  }

  // 16. Pelapor, Progres, Realisasi
  if (hasRowField(row, "nama_pelapor", "NAMA PELAPOR")) {
    updates.nama_pelapor = parseExplicitString(getRawRowField(row, "nama_pelapor", "NAMA PELAPOR"));
  }
  if (hasRowField(row, "progres_asistensi", "PROGRES ASISTENSI")) {
    updates.progres_asistensi = parseExplicitString(getRawRowField(row, "progres_asistensi", "PROGRES ASISTENSI"));
  }
  if (hasRowField(row, "realisasi", "REALISASI")) {
    updates.realisasi = parseExplicitString(getRawRowField(row, "realisasi", "REALISASI"));
  }

  // 17. Tujuan & Jarak Lokasi
  if (hasRowField(row, "tujuan", "TUJUAN")) {
    updates.tujuan = parseExplicitString(getRawRowField(row, "tujuan", "TUJUAN"));
  }
  if (hasRowField(row, "jarak_lokasi_unras", "JARAK LOKASI UNRAS", "jarak")) {
    updates.jarak_lokasi_unras = parseExplicitString(getRawRowField(row, "jarak_lokasi_unras", "JARAK LOKASI UNRAS", "jarak"));
  }

  // 18. Coordinates
  if (hasRowField(row, "LATITUDE", "latitude") || hasRowField(row, "LONGITUDE", "longitude")) {
    const rawLat = getRawRowField(row, "LATITUDE", "latitude");
    const rawLng = getRawRowField(row, "LONGITUDE", "longitude");
    if (rawLat !== null && rawLat !== undefined && rawLat !== "" && rawLng !== null && rawLng !== undefined && rawLng !== "") {
      const latVal = typeof rawLat === "number" ? rawLat : parseFloat(String(rawLat).replace(",", "."));
      const lngVal = typeof rawLng === "number" ? rawLng : parseFloat(String(rawLng).replace(",", "."));
      if (!isNaN(latVal) && !isNaN(lngVal) && latVal >= -90 && latVal <= 90 && lngVal >= -180 && lngVal <= 180) {
        updates.validated_lat = latVal;
        updates.validated_lng = lngVal;
        updates.location_validation_status = "verified";
      }
    } else if (rawLat === null || rawLat === "" || rawLng === null || rawLng === "") {
      updates.validated_lat = null;
      updates.validated_lng = null;
      updates.location_validation_status = "unmapped";
    }
  }

  if (timeParsedIso) {
    updates.event_datetime = timeParsedIso;
  }

  updates.raw_source_payload = row;

  return updates;
}

/**
 * Extracts and strictly validates the event timestamp from:
 * 'WAKTU DAN TGL KEJADIAN ISO' or flexible event date fields
 *
 * Rules:
 * - Do NOT use file modification or record update timestamps.
 * - Normalize timestamp without timezone offset to +07:00 (Asia/Jakarta).
 * - Do NOT infer from unrelated columns if the timestamp is missing.
 */
export function parseSourceEventDatetime(
  rawISO: any,
  fallbackTanggal?: any
): { iso: string | null; epochMs: number | null; error?: string } {
  // Primary: Check 'WAKTU DAN TGL KEJADIAN ISO' / ISO string
  const val = rawISO !== undefined && rawISO !== null && String(rawISO).trim() !== ""
    ? String(rawISO).trim()
    : null;

  if (val) {
    if (val.includes("--")) {
      return {
        iso: null,
        epochMs: null,
        error: `Format timestamp ISO tidak valid (mengandung double dash): '${val}'`
      };
    }

    let normalizedIso = val;
    // If format is like "2026-11-20T00:00:00" without timezone offset, append +07:00 (Asia/Jakarta)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(val)) {
      normalizedIso = `${val}+07:00`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      normalizedIso = `${val}T09:00:00+07:00`;
    }

    const parsed = Date.parse(normalizedIso);
    if (!isNaN(parsed)) {
      return { iso: new Date(parsed).toISOString(), epochMs: parsed };
    }
    return {
      iso: null,
      epochMs: null,
      error: `Format timestamp ISO tidak valid: '${val}'`
    };
  }

  // Fallback: Check if fallbackTanggal is a clean date string
  if (fallbackTanggal) {
    if (String(fallbackTanggal).includes("--")) {
      return {
        iso: null,
        epochMs: null,
        error: `Format tanggal tidak valid (mengandung double dash): '${fallbackTanggal}'`
      };
    }
    const tStr = String(fallbackTanggal).trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(tStr)) {
      const wibISO = `${tStr}T09:00:00+07:00`;
      const parsed = Date.parse(wibISO);
      if (!isNaN(parsed)) {
        return { iso: new Date(parsed).toISOString(), epochMs: parsed };
      }
    }
  }

  return {
    iso: null,
    epochMs: null,
    error: "Field 'WAKTU DAN TGL KEJADIAN ISO' atau 'tanggal' kosong atau tidak dapat diuraikan"
  };
}

/**
 * Validates whether an incoming event identifier is well-formed and unique.
 * Rejects:
 * - null, undefined, non-string
 * - empty or whitespace-only strings
 * - strings ending with '-' (e.g. malformed fallback "KEJ-20261123-")
 * - strings containing double dash '--'
 * - prefix-only strings missing unique suffix (e.g. "KEJ-", "KEJ-20261123", "KEJ-20261123-")
 * - strings shorter than 5 characters
 */
export function isValidIdKejadian(id: unknown): id is string {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  if (trimmed === "") return false;
  if (trimmed.includes("--")) return false;
  if (trimmed.endsWith("-")) return false;
  if (trimmed.length < 5) return false;

  // Prefix-only patterns like "KEJ-", "KEJ-20261123", "KEJ-20261123-"
  if (/^KEJ(-\d{8})?-?$/i.test(trimmed)) return false;

  // If pattern is KEJ-YYYYMMDD-{suffix}, ensure suffix is meaningful
  const match = trimmed.match(/^KEJ-(\d{8})-(.+)$/i);
  if (match) {
    const suffix = match[2].trim();
    if (!suffix || suffix === "-" || suffix.length === 0) return false;
  }

  return true;
}

/**
 * Validates whether an incoming kode_unras is non-empty and well-formed.
 */
export function isValidKodeUnras(kode: unknown): kode is string {
  if (typeof kode !== "string") return false;
  const trimmed = kode.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "--") return false;
  return true;
}

/**
 * Normalizes text for deterministic hashing (trimmed, lowercased, collapsed spaces).
 */
export function normalizeContentString(val: unknown): string {
  if (val === undefined || val === null) return "";
  return String(val)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Checks if a value is empty or matches generic placeholder text.
 */
function isGenericOrEmpty(val: unknown, genericDefaults: string[] = []): boolean {
  if (val === undefined || val === null) return true;
  const norm = normalizeContentString(val);
  if (!norm || norm === "-" || norm === "--") return true;
  for (const def of genericDefaults) {
    if (norm === def.toLowerCase()) return true;
  }
  return false;
}

/**
 * Generates a stable deterministic fallback ID when both ID KEJADIAN and ID UNRAS are missing.
 * Structure: KEJ-YYYYMMDD-XXXXXXXXXXXXXXXX (16 uppercase hexadecimal chars from SHA-256)
 *
 * Requirements:
 * - Uses actual event date in WIB, NOT sync execution date.
 * - Normalized whitespace and casing.
 * - If essential fields (both location and issue) are missing or generic placeholders, returns null
 *   so the record can be skipped explicitly rather than generating a generic shared ID.
 */
export function generateDeterministicFallbackId(
  eventDateWib: string,
  lokasiRaw: unknown,
  aliansiRaw: unknown,
  isuRaw: unknown
): string | null {
  if (!eventDateWib || !/^\d{4}-\d{2}-\d{2}$/.test(eventDateWib)) {
    return null;
  }

  const isLokasiGeneric = isGenericOrEmpty(lokasiRaw, [
    "lokasi belum ditentukan",
    "tidak diketahui",
    "belum ditentukan",
    "tbd"
  ]);
  const isIsuGeneric = isGenericOrEmpty(isuRaw, [
    "aksi unjuk rasa",
    "tidak diketahui",
    "belum ditentukan",
    "tbd",
    "unjuk rasa"
  ]);

  // Essential field check: If both location and issue are generic or empty, do not generate shared ID
  if (isLokasiGeneric && isIsuGeneric) {
    return null;
  }

  const normDate = eventDateWib.trim();
  const normLokasi = normalizeContentString(lokasiRaw);
  const normAliansi = normalizeContentString(aliansiRaw);
  const normIsu = normalizeContentString(isuRaw);

  const hashInput = [normDate, normLokasi, normAliansi, normIsu].join("|");
  const hash = crypto
    .createHash("sha256")
    .update(hashInput, "utf8")
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();

  const cleanDateCompact = normDate.replace(/-/g, "");
  return `KEJ-${cleanDateCompact}-${hash}`;
}

/**
 * Timing-safe comparison of bearer token with secret
 */
export function verifyIntegrationToken(
  authHeader: string | null,
  expectedSecret: string | undefined
): boolean {
  if (!authHeader || !expectedSecret) return false;
  if (!authHeader.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7).trim();
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(expectedSecret);

  if (tokenBuf.length !== secretBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(tokenBuf, secretBuf);
}

/**
 * Generic sync request validator that validates window according to sync_type
 * - same_day / same_day_h0: maximum 26 hours
 * - rolling_7d / rolling_7_days: maximum 170 hours
 * Rejects mismatched or invalid windows
 */
export function validateSyncRequest(payload: any): {
  valid: boolean;
  error?: string;
  startMs?: number;
  endMs?: number;
} {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Payload request tidak valid (bukan JSON object)." };
  }

  // Gracefully default sync_type to "rolling_7d" if omitted
  const syncType = payload.sync_type || "rolling_7d";
  const validSyncTypes = ["rolling_7d", "rolling_7_days", "same_day", "same_day_h0"];
  if (!validSyncTypes.includes(syncType)) {
    return {
      valid: false,
      error: `sync_type '${payload.sync_type}' tidak didukung. Wajib 'rolling_7d' atau 'same_day'.`
    };
  }

  // Gracefully default timezone to "Asia/Jakarta" if omitted
  const tz = payload.timezone || "Asia/Jakarta";
  if (tz !== "Asia/Jakarta") {
    return {
      valid: false,
      error: `timezone '${payload.timezone}' tidak valid. Wajib 'Asia/Jakarta'.`
    };
  }

  // Double-dash defect check
  if (payload.period_start && String(payload.period_start).includes("--")) {
    return {
      valid: false,
      error: "period_start atau period_end mengandung format tanggal cacat dengan double dash ('--')."
    };
  }
  if (payload.period_end && String(payload.period_end).includes("--")) {
    return {
      valid: false,
      error: "period_start atau period_end mengandung format tanggal cacat dengan double dash ('--')."
    };
  }

  let pStartStr = payload.period_start ? String(payload.period_start).trim() : "";
  let pEndStr = payload.period_end ? String(payload.period_end).trim() : "";

  const isSameDayType = syncType === "same_day" || syncType === "same_day_h0";

  // Auto-populate default window if missing, matching sync_type
  if (!pStartStr || !pEndStr) {
    const defaultWindow = isSameDayType
      ? calculateSameDayWindow()
      : calculateRolling7DayWindow();
    pStartStr = defaultWindow.period_start;
    pEndStr = defaultWindow.period_end;
    payload.period_start = pStartStr;
    payload.period_end = pEndStr;
  }

  // Strict ISO 8601 pattern check (e.g. 2026-11-18T17:00:00.000Z or 2026-11-20T00:00:00+07:00)
  const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/;
  if (!isoPattern.test(pStartStr) || !isoPattern.test(pEndStr)) {
    return {
      valid: false,
      error: "period_start atau period_end bukan format ISO 8601 yang valid."
    };
  }

  const startMs = Date.parse(pStartStr);
  const endMs = Date.parse(pEndStr);

  if (isNaN(startMs) || isNaN(endMs)) {
    return { valid: false, error: "period_start atau period_end bukan timestamp ISO yang valid." };
  }

  if (startMs >= endMs) {
    return { valid: false, error: "period_start harus lebih awal daripada period_end." };
  }

  const windowDurationMs = endMs - startMs;
  if (isSameDayType) {
    if (windowDurationMs > MAX_SAME_DAY_WINDOW_TOLERANCE_MS) {
      return {
        valid: false,
        error: `Rentang waktu melebihi batas sinkronisasi same_day (${(windowDurationMs / 3600000).toFixed(2)} jam, maks 26 jam).`
      };
    }
  } else {
    if (windowDurationMs > MAX_ROLLING_WINDOW_TOLERANCE_MS) {
      return {
        valid: false,
        error: `Rentang waktu melebihi batas sinkronisasi rolling 7 hari (${(windowDurationMs / 3600000).toFixed(2)} jam, maks 170 jam).`
      };
    }
  }

  if (!Array.isArray(payload.events)) {
    return { valid: false, error: "Field 'events' wajib berupa array data unjuk rasa." };
  }

  if (payload.events.length > MAX_BATCH_LIMIT) {
    return {
      valid: false,
      error: `Jumlah data dalam satu batch (${payload.events.length}) melebihi batas maksimum (${MAX_BATCH_LIMIT}).`
    };
  }

  payload.sync_type = syncType;
  payload.timezone = tz;

  return { valid: true, startMs, endMs };
}

/**
 * Validates rolling 7-day sync request:
 * Rejects if sync_type is specified as same_day or anything other than rolling_7d / rolling_7_days.
 * Enforces max 170 hours window.
 */
export function validateRollingSyncRequest(payload: any): {
  valid: boolean;
  error?: string;
  startMs?: number;
  endMs?: number;
} {
  if (payload && typeof payload === "object" && payload.sync_type) {
    if (payload.sync_type !== "rolling_7d" && payload.sync_type !== "rolling_7_days") {
      return {
        valid: false,
        error: `sync_type '${payload.sync_type}' tidak cocok untuk sinkronisasi rolling 7 hari. Wajib 'rolling_7d'.`
      };
    }
  }
  return validateSyncRequest(payload);
}

/**
 * Validates same-day (H-0) sync request:
 * Rejects if sync_type is specified as rolling_7d or anything other than same_day / same_day_h0.
 * Enforces max 26 hours window.
 */
export function validateSameDaySyncRequest(payload: any): {
  valid: boolean;
  error?: string;
  startMs?: number;
  endMs?: number;
} {
  if (payload && typeof payload === "object") {
    if (!payload.sync_type) {
      payload.sync_type = "same_day";
    } else if (payload.sync_type !== "same_day" && payload.sync_type !== "same_day_h0") {
      return {
        valid: false,
        error: `sync_type '${payload.sync_type}' tidak cocok untuk sinkronisasi same_day (H-0). Wajib 'same_day'.`
      };
    }
  }
  return validateSyncRequest(payload);
}

/**
 * Core Synchronization Engine
 * Handles lock guard, validation, identifier resolution, event datetime boundary check,
 * insert-only / skip policy, database error resilience, and audit logging.
 */
async function processSyncCore(
  payload: ProtestSyncPayload,
  triggeredBy: ProtestSyncLog["triggered_by"] = "power_automate",
  triggeredByUser?: string,
  targetMode: "rolling_7d" | "same_day" = "rolling_7d"
): Promise<ProtestSyncResult> {
  const startTime = Date.now();
  let executionId = (payload as any).execution_id;
  let finalTriggeredBy = (payload as any).triggered_by || triggeredBy;
  let finalTriggeredByUser = (payload as any).triggered_by_user || triggeredByUser;

  if (!executionId) {
    // Check if there is an active manual trigger log waiting for Power Automate completion
    const recentLogs = await protestStore.getSyncLogs(5);
    const activeManual = recentLogs.find(
      (l) => l.status === "running" && l.triggered_by === "manual_admin" && (Date.now() - new Date(l.started_at).getTime() < 180000)
    );
    if (activeManual) {
      executionId = activeManual.id;
      finalTriggeredBy = activeManual.triggered_by;
      finalTriggeredByUser = activeManual.triggered_by_user || finalTriggeredByUser;
    } else {
      const prefix = targetMode === "same_day" ? "sync-sameday" : "sync-rolling7d";
      executionId = `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    }
  }

  // 1. Concurrency Guard Lock
  if (isRollingSyncActive) {
    if (rollingSyncStartedAt && Date.now() - rollingSyncStartedAt < SYNC_LOCK_TIMEOUT_MS) {
      return {
        success: false,
        status: "skipped",
        execution_id: executionId,
        period_start: payload.period_start || "",
        period_end: payload.period_end || "",
        summary: {
          received: payload.events?.length || 0,
          processed: 0,
          inserted: 0,
          updated: 0,
          skipped: payload.events?.length || 0,
          failed: 0
        },
        oldest_event_date: null,
        newest_event_date: null,
        inserted_by_event_date: {},
        diagnostics: {
          oldest_event_date: null,
          newest_event_date: null,
          inserted_by_event_date: {}
        },
        errors: ["Proses sinkronisasi lain sedang berjalan. Permintaan dilewati untuk mencegah data collision."],
        duration_ms: 0
      };
    }
  }

  isRollingSyncActive = true;
  rollingSyncStartedAt = Date.now();

  // 2. Validate Request according to target mode
  const validation = targetMode === "same_day"
    ? validateSameDaySyncRequest(payload)
    : validateRollingSyncRequest(payload);

  if (!validation.valid || validation.startMs === undefined || validation.endMs === undefined) {
    isRollingSyncActive = false;
    rollingSyncStartedAt = null;
    return {
      success: false,
      status: "failed",
      execution_id: executionId,
      period_start: payload.period_start || "",
      period_end: payload.period_end || "",
      summary: {
        received: payload.events?.length || 0,
        processed: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        failed: payload.events?.length || 0
      },
      oldest_event_date: null,
      newest_event_date: null,
      inserted_by_event_date: {},
      diagnostics: {
        oldest_event_date: null,
        newest_event_date: null,
        inserted_by_event_date: {}
      },
      errors: [validation.error || "Validasi gagal"],
      duration_ms: Date.now() - startTime
    };
  }

  const { startMs, endMs } = validation;

  // 3. Create or Update Audit Log Record
  const existingLog = await protestStore.getSyncLogById(executionId);
  if (existingLog) {
    await protestStore.updateSyncLog(executionId, {
      period_start: payload.period_start,
      period_end: payload.period_end,
      records_received: payload.events.length,
      status: "running"
    });
  } else {
    await protestStore.createSyncLog({
      id: executionId,
      started_at: new Date(startTime).toISOString(),
      completed_at: null,
      period_start: payload.period_start,
      period_end: payload.period_end,
      status: "running",
      triggered_by: finalTriggeredBy,
      triggered_by_user: finalTriggeredByUser || null,
      source_worksheet: "NEW UNRAS 2022-2026",
      records_received: payload.events.length,
      records_processed: 0,
      records_created: 0,
      records_updated: 0,
      records_skipped: 0,
      records_failed: 0,
      error_details: null,
      duration_ms: null
    });
  }

  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;
  let statusUpdated = 0;
  let skipped = 0;
  let failed = 0;
  const seenPayloadIds = new Set<string>();

  let oldestEventDate: string | null = null;
  let newestEventDate: string | null = null;
  let insertedByDate: Record<string, number> = {};

  const cachedRegistryKeys = await protestStore.getAllIdentityKeys();
  const protestsByDateCache = new Map<string, ExistingProtestComparisonItem[]>();

  const validBatchForStore: Array<{
    id_kejadian: string;
    kode_unras: string;
    tanggal: string;
    waktu_mulai?: string | null;
    waktu_selesai?: string | null;
    event_datetime?: string | null;
    lokasi: string;
    titik_kumpul?: string | null;
    sasaran_aksi?: string | null;
    isu_tuntutan: string;
    estimasi_massa_source?: number | null;
    organisasi_kelompok?: string | null;
    korlap_pimpinan?: string | null;
    wilayah_hukum?: string | null;
    provinsi?: string | null;
    kota_kabupaten?: string | null;
    keterangan_source?: string | null;
    validated_lat?: number | null;
    validated_lng?: number | null;
    category_id?: string | null;
    raw_source_payload?: Record<string, unknown>;
  }> = [];

  try {
    // 4. Validate and Normalize Each Row in Batch
    for (let i = 0; i < payload.events.length; i++) {
      const row = payload.events[i] as Record<string, any>;
      const rowIndex = i + 1;

      if (!row || typeof row !== "object") {
        skipped++;
        errors.push(`[Baris ${rowIndex}] Dilewati: Baris data bukan objek JSON yang valid.`);
        continue;
      }

      // Step 1: Event Timestamp Extraction & Boundary Check
      const rawTimeISO = getField(row, "WAKTU DAN TGL KEJADIAN ISO", "tanggal_kejadian", "event_datetime");
      const rawDate = getField(row, "TANGGAL", "tanggal", "tanggal_kejadian", "WAKTU DAN TGL KEJADIAN ISO", "event_date");

      const timeParsed = parseSourceEventDatetime(rawTimeISO, rawDate);

      if (!timeParsed.iso || timeParsed.epochMs === null) {
        skipped++;
        errors.push(`[Baris ${rowIndex}] Dilewati: ${timeParsed.error || "Timestamp kejadian tidak valid"}.`);
        continue;
      }

      // Read source-owned status (mapped from Power Automate: item()?['Status Kejadian'] -> status_sumber)
      const rawStatusSumber = getField(row, "status_sumber", "Status Kejadian", "status_kejadian");
      const mappedStatusSumber = mapSourceStatus(rawStatusSumber);

      // Derive event date in Asia/Jakarta (WIB)
      const eventDateWib = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date(timeParsed.epochMs));

      const cleanDateCompact = eventDateWib.replace(/-/g, "");

      // Step 2: Resolve Identifiers
      const rawIdKejadian = getField(row, "ID KEJADIAN", "id_kejadian", "ID_KEJADIAN", "idKejadian");
      const rawKodeUnras = getField(row, "ID UNRAS", "KODE_UNRAS", "id_unras", "kode_unras", "KODE UNRAS", "kodeUnras");

      let idKejadian = "";
      let kodeUnras = "";

      if (isValidIdKejadian(rawIdKejadian)) {
        idKejadian = rawIdKejadian.trim();
        kodeUnras = isValidKodeUnras(rawKodeUnras) ? rawKodeUnras.trim() : idKejadian;
      } else if (isValidKodeUnras(rawKodeUnras)) {
        // Safe deterministic identifier strategy when ID KEJADIAN is empty in Excel:
        // KEJ-YYYYMMDD-{ID_UNRAS} (e.g. KEJ-20261120-U1473)
        kodeUnras = rawKodeUnras.trim();
        idKejadian = `KEJ-${cleanDateCompact}-${kodeUnras}`;
      } else {
        // Both ID KEJADIAN and ID UNRAS / KODE_UNRAS are missing or invalid (e.g. malformed "KEJ-20261123-").
        // Generate deterministic fallback identifier using SHA-256 hash.
        const lokasiRaw = getField(row, "LOKASI", "lokasi");
        const aliansiRaw = getField(row, "ORGANISASI", "aliansi", "organisasi_kelompok", "organisasi");
        const isuRaw = getField(row, "ISU", "tuntutan", "isu_tuntutan", "isu");

        const fallbackId = generateDeterministicFallbackId(eventDateWib, lokasiRaw, aliansiRaw, isuRaw);
        if (!fallbackId) {
          skipped++;
          errors.push(`[Baris ${rowIndex}] Dilewati: 'ID KEJADIAN' dan 'ID UNRAS'/'KODE_UNRAS' keduanya kosong dan field esensial (lokasi/isu) tidak mencukupi untuk membuat ID fallback deterministik.`);
          continue;
        }
        idKejadian = fallbackId;
        kodeUnras = fallbackId;
      }

      // Extract complete mapped updates using field presence checks for full overwrite
      const mappedUpdates = extractInboundMappedUpdates(row, eventDateWib, timeParsed.iso);

      // Rolling window boundary check: event_datetime >= period_start && event_datetime < period_end
      // Half-open interval [startMs, endMs)
      if (timeParsed.epochMs < startMs) {
        // Task 10: Ensure older registered incidents can receive full updates even if their event date is outside the rolling 7-day window
        let canonicalId: string | null = null;
        if (idKejadian && cachedRegistryKeys.has(`ID:${idKejadian}`)) {
          canonicalId = cachedRegistryKeys.get(`ID:${idKejadian}`)!;
        } else if (idKejadian) {
          const inDb = await protestStore.getProtestById(idKejadian);
          if (inDb) canonicalId = inDb.id_kejadian;
        }

        if (canonicalId) {
          const updateRes = await protestStore.updateProtest(
            canonicalId,
            mappedUpdates,
            { id: "system-excel-sync", name: "Excel Inbound Sync", email: "system@scc.go.id", role: "admin" }
          );
          if (updateRes) {
            updated++;
            if (mappedStatusSumber) statusUpdated++;
          } else {
            skipped++;
          }
          errors.push(`[ID: ${idKejadian}] Rekor lama (${timeParsed.iso}) di luar jendela terdaftar di sistem: Data diperbarui (FULL OVERWRITE).`);
          continue;
        }

        skipped++;
        errors.push(`[Baris ${rowIndex}] Dilewati: Waktu kejadian (${timeParsed.iso}) lebih lampau dari batas awal jendela (${payload.period_start}).`);
        continue;
      }

      if (timeParsed.epochMs >= endMs) {
        skipped++;
        errors.push(`[Baris ${rowIndex}] Dilewati: Waktu kejadian (${timeParsed.iso}) di luar atau melebihi batas akhir jendela (${payload.period_end}).`);
        continue;
      }

      if (!oldestEventDate || eventDateWib < oldestEventDate) oldestEventDate = eventDateWib;
      if (!newestEventDate || eventDateWib > newestEventDate) newestEventDate = eventDateWib;

      // In-payload duplicate check: process first occurrence, skip subsequent occurrences
      if (seenPayloadIds.has(idKejadian)) {
        skipped++;
        errors.push(`[ID: ${idKejadian}] Dilewati: Duplikasi ID kejadian berulang di dalam payload batch yang sama (kejadian pertama telah diproses).`);
        continue;
      }
      seenPayloadIds.add(idKejadian);

      // Step 3: Extract core fields with flexible field normalization
      const lokasi = String(getField(row, "LOKASI", "lokasi") || "Lokasi Belum Ditentukan").trim();
      const titikKumpul = getField(row, "TITIK KUMPUL", "titik_kumpul") ? String(getField(row, "TITIK KUMPUL", "titik_kumpul")).trim() : null;
      const sasaranAksi = getField(row, "SASARAN", "sasaran", "sasaran_aksi") ? String(getField(row, "SASARAN", "sasaran", "sasaran_aksi")).trim() : null;
      const isu = String(getField(row, "ISU", "tuntutan", "isu_tuntutan", "isu") || "Aksi Unjuk Rasa").trim();
      const tanggal = eventDateWib;
      const organisasi = getField(row, "ORGANISASI", "aliansi", "organisasi_kelompok", "organisasi") ? String(getField(row, "ORGANISASI", "aliansi", "organisasi_kelompok", "organisasi")).trim() : null;

      // Time normalization
      const rawWaktu = getField(row, "WAKTU", "waktu", "waktu_mulai");
      let waktuNormalized: string | null = null;
      if (rawWaktu) {
        const norm = normalizeTimeString(rawWaktu);
        if (norm.error) {
          skipped++;
          errors.push(`[ID: ${idKejadian}] Field 'WAKTU' tidak valid: ${norm.error}`);
          continue;
        }
        waktuNormalized = norm.time;
      } else if (timeParsed.iso) {
        const wibTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(timeParsed.epochMs));
        waktuNormalized = wibTime !== "00:00:00" ? wibTime : "09:00:00";
      } else {
        waktuNormalized = "09:00:00";
      }

      // Step 4: 4-Tier Candidate Classification via Persistent Identity Registry
      if (!protestsByDateCache.has(eventDateWib)) {
        const sameDayExisting = await protestStore.getProtestsByDate(eventDateWib);
        protestsByDateCache.set(eventDateWib, sameDayExisting);
      }
      const sameDayExisting = protestsByDateCache.get(eventDateWib) || [];

      const candidateVerdict = classifyCandidate(
        {
          id_kejadian: idKejadian,
          kode_unras: kodeUnras,
          tanggal: eventDateWib,
          lokasi,
          organisasi_kelompok: organisasi,
          isu_tuntutan: isu
        },
        cachedRegistryKeys,
        sameDayExisting
      );

      if (candidateVerdict.action === "EXISTING") {
        if (candidateVerdict.canonicalId) {
          const updateRes = await protestStore.updateProtest(
            candidateVerdict.canonicalId,
            mappedUpdates,
            { id: "system-excel-sync", name: "Excel Inbound Sync", email: "system@scc.go.id", role: "admin" }
          );
          if (updateRes) {
            updated++;
            if (mappedStatusSumber) statusUpdated++;
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
        errors.push(`[ID: ${idKejadian}] Diperbarui (EXISTING - FULL OVERWRITE): ${candidateVerdict.reason}`);
        continue;
      }

      // action === "NEW": Update local caches so following rows in this batch recognize it
      sameDayExisting.push({
        id: idKejadian,
        id_kejadian: idKejadian,
        kode_unras: kodeUnras,
        tanggal: eventDateWib,
        lokasi,
        organisasi_kelompok: organisasi,
        isu_tuntutan: isu,
        created_at: new Date().toISOString()
      });
      cachedRegistryKeys.set(`ID:${idKejadian}`, idKejadian);
      const cleanKode = String(kodeUnras).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (cleanKode) {
        cachedRegistryKeys.set(`UNRAS:${cleanKode}`, idKejadian);
        cachedRegistryKeys.set(`SRC:${cleanKode}`, idKejadian);
      }

      // Coordinate validation: if provided, must be within valid geospatial ranges (-90..90, -180..180)
      const rawLat = getField(row, "LATITUDE", "latitude");
      const rawLng = getField(row, "LONGITUDE", "longitude");
      if (rawLat !== undefined && rawLat !== null && String(rawLat).trim() !== "") {
        const latVal = typeof rawLat === "number" ? rawLat : parseFloat(String(rawLat).replace(",", "."));
        if (isNaN(latVal) || latVal < -90 || latVal > 90) {
          skipped++;
          errors.push(`[ID: ${idKejadian}] Field 'LATITUDE' di luar rentang valid [-90, 90]: ${rawLat}`);
          continue;
        }
      }
      if (rawLng !== undefined && rawLng !== null && String(rawLng).trim() !== "") {
        const lngVal = typeof rawLng === "number" ? rawLng : parseFloat(String(rawLng).replace(",", "."));
        if (isNaN(lngVal) || lngVal < -180 || lngVal > 180) {
          skipped++;
          errors.push(`[ID: ${idKejadian}] Field 'LONGITUDE' di luar rentang valid [-180, 180]: ${rawLng}`);
          continue;
        }
      }

      // Crowd size normalization
      const rawCrowd = getField(row, "JUMLAH MASSA", "jumlah_massa", "estimasi_massa");
      let crowd: number | null = null;
      if (rawCrowd !== undefined && rawCrowd !== null && String(rawCrowd).trim() !== "") {
        if (typeof rawCrowd === "number") {
          crowd = Math.round(rawCrowd);
        } else {
          crowd = normalizeCrowdEstimate(rawCrowd).count;
        }
      }

      const korlap = getField(row, "KORLAP", "korlap", "korlap_pimpinan") ? String(getField(row, "KORLAP", "korlap", "korlap_pimpinan")).trim() : null;
      // Wilayah hukum preserves KPBI, KPwDN, or regional jurisdiction
      const wilayahHukum = getField(row, "WILAYAH HUKUM", "wilayah_hukum", "KP/KPw", "kp", "kp_kpw") ? String(getField(row, "WILAYAH HUKUM", "wilayah_hukum", "KP/KPw", "kp", "kp_kpw")).trim() : null;
      const regional = getField(row, "REGIONAL", "regional") ? String(getField(row, "REGIONAL", "regional")).trim() : null;
      const provinsi = String(getField(row, "PROVINSI", "provinsi") || "DKI Jakarta").trim();
      const kotaKabupaten = getField(row, "KOTA/KABUPATEN", "kota_kabupaten", "kota") ? String(getField(row, "KOTA/KABUPATEN", "kota_kabupaten", "kota")).trim() : null;
      const keterangan = getField(row, "KETERANGAN", "ringkasan_situasi", "keterangan_source", "keterangan") ? String(getField(row, "KETERANGAN", "ringkasan_situasi", "keterangan_source", "keterangan")).trim() : null;
      const kategoriIsu = getField(row, "kategori_isu", "KATEGORI_ISU") ? String(getField(row, "kategori_isu", "KATEGORI_ISU")).trim() : null;
      const dampak = getField(row, "DAMPAK", "dampak") ? String(getField(row, "DAMPAK", "dampak")).trim() : null;

      const coords = validateIndonesianCoordinates(rawLat, rawLng);
      const category = inferProtestCategory(isu, organisasi || "");

      validBatchForStore.push({
        id_kejadian: idKejadian,
        kode_unras: kodeUnras,
        tanggal,
        waktu_mulai: waktuNormalized,
        waktu_selesai: null,
        event_datetime: timeParsed.iso,
        lokasi: mappedUpdates.lokasi || lokasi,
        titik_kumpul: mappedUpdates.titik_kumpul ?? titikKumpul,
        sasaran_aksi: mappedUpdates.sasaran_aksi ?? sasaranAksi,
        isu_tuntutan: mappedUpdates.isu_tuntutan || isu,
        estimasi_massa_source: mappedUpdates.estimasi_massa_source ?? crowd,
        actual_crowd_size: mappedUpdates.actual_crowd_size ?? crowd,
        organisasi_kelompok: mappedUpdates.organisasi_kelompok ?? organisasi,
        korlap_pimpinan: mappedUpdates.korlap_pimpinan ?? korlap,
        wilayah_hukum: mappedUpdates.wilayah_hukum ?? wilayahHukum,
        provinsi: mappedUpdates.provinsi ?? provinsi,
        kota_kabupaten: mappedUpdates.kota_kabupaten ?? kotaKabupaten,
        keterangan_source: mappedUpdates.keterangan_source ?? keterangan,
        situation_summary: mappedUpdates.situation_summary ?? keterangan,
        validated_lat: mappedUpdates.validated_lat !== undefined ? mappedUpdates.validated_lat : coords.lat,
        validated_lng: mappedUpdates.validated_lng !== undefined ? mappedUpdates.validated_lng : coords.lng,
        category_id: category,
        status_sumber: mappedStatusSumber || null,
        status: mapSourceStatusToProtestStatus(mappedStatusSumber),
        raw_source_payload: row as unknown as Record<string, unknown>,
        regional: mappedUpdates.regional ?? regional,
        kategori_isu: mappedUpdates.kategori_isu ?? kategoriIsu,
        dampak: mappedUpdates.dampak ?? dampak,
        keterangan_dampak: mappedUpdates.keterangan_dampak ?? null,
        nama_pelapor: mappedUpdates.nama_pelapor ?? null,
        info_awal: mappedUpdates.info_awal ?? null,
        tindak_lanjut: mappedUpdates.tindak_lanjut ?? null,
        progres_asistensi: mappedUpdates.progres_asistensi ?? null,
        realisasi: mappedUpdates.realisasi ?? null,
        tujuan: mappedUpdates.tujuan ?? null,
        jarak_lokasi_unras: mappedUpdates.jarak_lokasi_unras ?? null,
        redaksi: mappedUpdates.redaksi ?? null,
        editorial_draft: mappedUpdates.editorial_draft ?? null,
        kp_kpw: mappedUpdates.kp_kpw ?? null
      } as any);
    }

    // 5. Execute Batch Insertion (Insert new events, full overwrite existing)
    if (validBatchForStore.length > 0) {
      const upsertStats = await protestStore.upsertFromExcelBatch(validBatchForStore);
      inserted = upsertStats.created;
      updated += (upsertStats.updated || 0);
      skipped += upsertStats.skipped;
      failed += (validBatchForStore.length - (inserted + (upsertStats.updated || 0) + upsertStats.skipped));
      if (upsertStats.insertedByDate) {
        insertedByDate = upsertStats.insertedByDate;
      }
      if ((upsertStats as any).error) {
        errors.push(`[Database Error]: ${(upsertStats as any).error}`);
      }
    }

    const durationMs = Date.now() - startTime;
    let finalStatus: ProtestSyncLog["status"] = "success";
    if (failed > 0) {
      if (inserted > 0 || updated > 0) {
        finalStatus = "partial";
      } else {
        finalStatus = "failed";
      }
    }

    const finalLog: Partial<ProtestSyncLog> = {
      completed_at: new Date().toISOString(),
      status: finalStatus,
      records_received: payload.events.length,
      records_processed: validBatchForStore.length + updated,
      records_created: inserted,
      records_updated: updated,
      records_skipped: skipped,
      records_failed: failed,
      error_details: errors.length > 0 ? errors.slice(0, 50).join(" | ") : null,
      duration_ms: durationMs
    };

    await protestStore.updateSyncLog(executionId, finalLog);

    const isSuccess = (finalStatus as ProtestSyncLog["status"]) !== "failed";

    return {
      success: isSuccess,
      status: finalStatus,
      execution_id: executionId,
      period_start: payload.period_start || "",
      period_end: payload.period_end || "",
      summary: {
        received: payload.events.length,
        processed: validBatchForStore.length + updated,
        inserted,
        updated,
        status_updated: statusUpdated,
        skipped,
        failed
      },
      oldest_event_date: oldestEventDate,
      newest_event_date: newestEventDate,
      inserted_by_event_date: insertedByDate,
      diagnostics: {
        oldest_event_date: oldestEventDate,
        newest_event_date: newestEventDate,
        inserted_by_event_date: insertedByDate
      },
      errors: errors.length > 0 ? errors : undefined,
      duration_ms: durationMs
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    errors.push(`Error internal saat sinkronisasi: ${err.message || String(err)}`);

    await protestStore.updateSyncLog(executionId, {
      completed_at: new Date().toISOString(),
      status: "failed",
      records_received: payload.events.length,
      records_processed: validBatchForStore.length + updated,
      records_created: inserted,
      records_updated: updated,
      records_skipped: skipped,
      records_failed: payload.events.length - inserted,
      error_details: errors.join(" | "),
      duration_ms: durationMs
    });

    return {
      success: false,
      status: "failed",
      execution_id: executionId,
      period_start: payload.period_start || "",
      period_end: payload.period_end || "",
      summary: {
        received: payload.events.length,
        processed: validBatchForStore.length + updated,
        inserted,
        updated,
        status_updated: statusUpdated,
        skipped,
        failed: payload.events.length - inserted
      },
      oldest_event_date: oldestEventDate,
      newest_event_date: newestEventDate,
      inserted_by_event_date: insertedByDate,
      diagnostics: {
        oldest_event_date: oldestEventDate,
        newest_event_date: newestEventDate,
        inserted_by_event_date: insertedByDate
      },
      errors,
      duration_ms: durationMs
    };
  } finally {
    isRollingSyncActive = false;
    rollingSyncStartedAt = null;
  }
}

/**
 * Core Rolling 7-Calendar-Day Synchronization Processor
 * Evaluates Excel UNRAS records from [today - 6 days, today + 1 day) WIB.
 * Skips existing records by id_kejadian and in-payload duplicate IDs.
 * Strictly preserves all operator-managed fields (updated: 0).
 */
export async function processRolling7DaySync(
  payload: ProtestSyncPayload,
  triggeredBy: ProtestSyncLog["triggered_by"] = "power_automate",
  triggeredByUser?: string
): Promise<ProtestSyncResult> {
  const cloned = { ...payload };
  if (!cloned.sync_type) {
    cloned.sync_type = "rolling_7d";
  }
  return processSyncCore(cloned, triggeredBy, triggeredByUser || "Manual Sync (Rolling 7-Day)", "rolling_7d");
}

/**
 * Core Same-Day (H-0) Synchronization Processor
 * Evaluates Excel UNRAS records for today's WIB calendar day [today 00:00:00+07:00, tomorrow 00:00:00+07:00).
 * Skips existing records by id_kejadian and in-payload duplicate IDs.
 * Strictly preserves all operator-managed fields (updated: 0).
 */
export async function processSameDaySync(
  payload: ProtestSyncPayload,
  triggeredBy: ProtestSyncLog["triggered_by"] = "power_automate",
  triggeredByUser?: string
): Promise<ProtestSyncResult> {
  const cloned = { ...payload };
  if (!cloned.sync_type) {
    cloned.sync_type = "same_day";
  }
  return processSyncCore(cloned, triggeredBy, triggeredByUser || "Scheduled Sync (05:00 WIB)", "same_day");
}
