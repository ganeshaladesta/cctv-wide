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
  const updated = 0;
  let skipped = 0;
  let failed = 0;
  const seenPayloadIds = new Set<string>();

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
    const periodDateWib = payload.period_start
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(startMs))
      : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

    // 4. Validate and Normalize Each Row in Batch
    for (let i = 0; i < payload.events.length; i++) {
      const row = payload.events[i] as Record<string, any>;
      const rowIndex = i + 1;

      if (!row || typeof row !== "object") {
        skipped++;
        errors.push(`[Baris ${rowIndex}] Dilewati: Baris data bukan objek JSON yang valid.`);
        continue;
      }

      // 1. Resolve Identifiers (supports Excel Header format AND snake_case format)
      const rawIdKejadian = getField(row, "ID KEJADIAN", "id_kejadian", "ID_KEJADIAN", "idKejadian");
      const rawKodeUnras = getField(row, "ID UNRAS", "KODE_UNRAS", "id_unras", "kode_unras", "KODE UNRAS", "kodeUnras");

      // Extract raw date for deterministic key derivation
      const rawDate = getField(row, "TANGGAL", "tanggal", "tanggal_kejadian", "WAKTU DAN TGL KEJADIAN ISO", "event_date");
      let dateStr = periodDateWib;
      if (rawDate) {
        const match = String(rawDate).match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
        if (match) {
          dateStr = `${match[1]}-${match[2]}-${match[3]}`;
        }
      }
      const cleanDateCompact = dateStr.replace(/-/g, "");

      let idKejadian = "";
      let kodeUnras = "";

      if (rawIdKejadian && String(rawIdKejadian).trim() !== "") {
        idKejadian = String(rawIdKejadian).trim();
        kodeUnras = rawKodeUnras ? String(rawKodeUnras).trim() : idKejadian;
      } else if (rawKodeUnras && String(rawKodeUnras).trim() !== "") {
        // Safe deterministic identifier strategy when ID KEJADIAN is empty in Excel:
        // KEJ-YYYYMMDD-{ID_UNRAS} (e.g. KEJ-20261120-U1473)
        kodeUnras = String(rawKodeUnras).trim();
        idKejadian = `KEJ-${cleanDateCompact}-${kodeUnras}`;
      } else {
        // Neither identifier is provided: Return validation error rather than silently creating duplicates
        skipped++;
        errors.push(`[Baris ${rowIndex}] Dilewati: 'ID KEJADIAN' dan 'ID UNRAS'/'KODE_UNRAS' keduanya kosong. Rekor tidak dapat diidentifikasi secara unik.`);
        continue;
      }

      // In-payload duplicate check: process first occurrence, skip subsequent occurrences
      if (seenPayloadIds.has(idKejadian)) {
        skipped++;
        errors.push(`[ID: ${idKejadian}] Dilewati: Duplikasi ID kejadian berulang di dalam payload batch yang sama (kejadian pertama telah diproses).`);
        continue;
      }
      seenPayloadIds.add(idKejadian);

      // 2. Event Timestamp Extraction & Boundary Check
      const rawTimeISO = getField(row, "WAKTU DAN TGL KEJADIAN ISO", "tanggal_kejadian", "event_datetime");
      const timeParsed = parseSourceEventDatetime(rawTimeISO, dateStr);

      if (!timeParsed.iso || timeParsed.epochMs === null) {
        skipped++;
        errors.push(`[ID: ${idKejadian}] Dilewati: ${timeParsed.error || "Timestamp kejadian tidak valid"}.`);
        continue;
      }

      // Rolling 7-day boundary check: event_datetime >= period_start && event_datetime < period_end
      // Half-open interval [startMs, endMs)
      if (timeParsed.epochMs < startMs) {
        skipped++;
        errors.push(`[ID: ${idKejadian}] Dilewati: Waktu kejadian (${timeParsed.iso}) lebih lampau dari batas awal jendela 7 hari (${payload.period_start}).`);
        continue;
      }

      if (timeParsed.epochMs >= endMs) {
        skipped++;
        errors.push(`[ID: ${idKejadian}] Dilewati: Waktu kejadian (${timeParsed.iso}) di luar atau melebihi batas akhir jendela 7 hari (${payload.period_end}).`);
        continue;
      }

      // 3. Extract core fields with flexible field normalization
      const lokasi = String(getField(row, "LOKASI", "lokasi") || "Lokasi Belum Ditentukan").trim();
      const titikKumpul = getField(row, "TITIK KUMPUL", "titik_kumpul") ? String(getField(row, "TITIK KUMPUL", "titik_kumpul")).trim() : null;
      const sasaranAksi = getField(row, "SASARAN", "sasaran", "sasaran_aksi") ? String(getField(row, "SASARAN", "sasaran", "sasaran_aksi")).trim() : null;
      const isu = String(getField(row, "ISU", "tuntutan", "isu_tuntutan", "isu") || "Aksi Unjuk Rasa").trim();
      const tanggal = dateStr;

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

      const organisasi = getField(row, "ORGANISASI", "aliansi", "organisasi_kelompok", "organisasi") ? String(getField(row, "ORGANISASI", "aliansi", "organisasi_kelompok", "organisasi")).trim() : null;
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
        lokasi,
        titik_kumpul: titikKumpul,
        sasaran_aksi: sasaranAksi,
        isu_tuntutan: isu,
        estimasi_massa_source: crowd,
        organisasi_kelompok: organisasi,
        korlap_pimpinan: korlap,
        wilayah_hukum: wilayahHukum,
        provinsi,
        kota_kabupaten: kotaKabupaten,
        keterangan_source: keterangan,
        validated_lat: coords.lat,
        validated_lng: coords.lng,
        category_id: category,
        raw_source_payload: row as unknown as Record<string, unknown>,
        regional,
        kategori_isu: kategoriIsu,
        dampak
      } as any);
    }

    // 5. Execute Batch Insertion (Insert only new events, skip existing)
    if (validBatchForStore.length > 0) {
      const upsertStats = await protestStore.upsertFromExcelBatch(validBatchForStore);
      inserted = upsertStats.created;
      // updated is guaranteed to be 0: sync skips existing events, never updates
      skipped += upsertStats.skipped;
      failed += (validBatchForStore.length - (inserted + upsertStats.skipped));
      if ((upsertStats as any).error) {
        errors.push(`[Database Error]: ${(upsertStats as any).error}`);
      }
    }

    const durationMs = Date.now() - startTime;
    let finalStatus: ProtestSyncLog["status"] = "success";
    if (failed > 0) {
      if (inserted > 0) {
        finalStatus = "partial";
      } else {
        finalStatus = "failed";
      }
    }

    const finalLog: Partial<ProtestSyncLog> = {
      completed_at: new Date().toISOString(),
      status: finalStatus,
      records_received: payload.events.length,
      records_processed: validBatchForStore.length,
      records_created: inserted,
      records_updated: 0,
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
        processed: validBatchForStore.length,
        inserted,
        updated: 0,
        skipped,
        failed
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
      records_processed: validBatchForStore.length,
      records_created: inserted,
      records_updated: 0,
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
        processed: validBatchForStore.length,
        inserted,
        updated: 0,
        skipped,
        failed: payload.events.length - inserted
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
