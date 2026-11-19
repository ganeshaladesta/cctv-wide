/**
 * SCC - EAGLE EYES: Unjuk Rasa Same-Day (H-0) Sync Engine
 * Contract: Scheduled Sync (05:00 WIB Asia/Jakarta) -> Vercel API -> Supabase / Local Store
 * Worksheet: 'NEW UNRAS 2022-2026'
 *
 * Boundary: Current Calendar Day in Asia/Jakarta (00:00:00 WIB today <= event < 00:00:00 WIB tomorrow)
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

// Maximum window duration: 24 hours (1 calendar day in Asia/Jakarta) + 10 minutes clock skew margin
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_WINDOW_TOLERANCE_MS = ONE_DAY_MS + 10 * 60 * 1000;
const MAX_BATCH_LIMIT = 1000;

// In-memory concurrency lock
let isSameDaySyncActive = false;
let sameDaySyncStartedAt: number | null = null;
const SYNC_LOCK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes failsafe

/**
 * Calculates exact Same-Day (H-0) synchronization window for Asia/Jakarta (WIB)
 * Start: 00:00:00 WIB today, inclusive
 * End: 00:00:00 WIB tomorrow, exclusive (exact 24-hour window)
 * Inclusion rule: event_datetime >= period_start AND event_datetime < period_end
 */
export function calculateSameDayWindow(refDate: Date = new Date()): {
  date_wib: string;
  period_start: string;
  period_end: string;
  period_start_ms: number;
  period_end_ms: number;
} {
  const date_wib = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(refDate);

  const startWib = new Date(`${date_wib}T00:00:00+07:00`);
  const endWib = new Date(startWib.getTime() + ONE_DAY_MS);

  return {
    date_wib,
    period_start: startWib.toISOString(),
    period_end: endWib.toISOString(),
    period_start_ms: startWib.getTime(),
    period_end_ms: endWib.getTime()
  };
}

// Backwards-compatibility alias
export const calculateRolling7DayWindow = calculateSameDayWindow;

/**
 * Extracts and strictly validates the event timestamp from:
 * 'WAKTU DAN TGL KEJADIAN ISO'
 *
 * Rules:
 * - Do NOT use file modification or record update timestamps.
 * - Do NOT infer from unrelated columns if the timestamp is missing.
 */
export function parseSourceEventDatetime(
  rawISO: any,
  fallbackTanggal?: any
): { iso: string | null; epochMs: number | null; error?: string } {
  // Primary: Check 'WAKTU DAN TGL KEJADIAN ISO'
  const val = rawISO !== undefined && rawISO !== null && String(rawISO).trim() !== ""
    ? String(rawISO).trim()
    : null;

  if (val) {
    const parsed = Date.parse(val);
    if (!isNaN(parsed)) {
      return { iso: new Date(parsed).toISOString(), epochMs: parsed };
    }
    return {
      iso: null,
      epochMs: null,
      error: `Format timestamp ISO tidak valid: '${val}'`
    };
  }

  // Fallback: Check if TANGGAL is a clean ISO string (e.g., YYYY-MM-DD)
  if (fallbackTanggal) {
    const tStr = String(fallbackTanggal).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(tStr)) {
      // Default to 00:00:00 WIB (+07:00)
      const wibISO = `${tStr}T00:00:00+07:00`;
      const parsed = Date.parse(wibISO);
      if (!isNaN(parsed)) {
        return { iso: new Date(parsed).toISOString(), epochMs: parsed };
      }
    }
  }

  return {
    iso: null,
    epochMs: null,
    error: "Field 'WAKTU DAN TGL KEJADIAN ISO' kosong atau tidak dapat diuraikan"
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
 * Validates request schema and Same-Day (H-0) window constraints
 */
export function validateRollingSyncRequest(payload: any): {
  valid: boolean;
  error?: string;
  startMs?: number;
  endMs?: number;
} {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Payload request tidak valid (bukan JSON object)." };
  }

  const validSyncTypes = ["same_day", "same_day_h0", "rolling_7d"];
  if (!validSyncTypes.includes(payload.sync_type)) {
    return {
      valid: false,
      error: `sync_type '${payload.sync_type}' tidak didukung. Wajib 'same_day' atau 'same_day_h0'.`
    };
  }

  if (payload.timezone !== "Asia/Jakarta") {
    return {
      valid: false,
      error: `timezone '${payload.timezone}' tidak valid. Wajib 'Asia/Jakarta'.`
    };
  }

  if (!payload.period_start || !payload.period_end) {
    return {
      valid: false,
      error: "period_start dan period_end wajib disertakan dalam format ISO 8601."
    };
  }

  const startMs = Date.parse(payload.period_start);
  const endMs = Date.parse(payload.period_end);

  if (isNaN(startMs) || isNaN(endMs)) {
    return { valid: false, error: "period_start atau period_end bukan timestamp ISO yang valid." };
  }

  if (startMs >= endMs) {
    return { valid: false, error: "period_start harus lebih awal daripada period_end." };
  }

  const windowDurationMs = endMs - startMs;
  if (windowDurationMs > MAX_WINDOW_TOLERANCE_MS) {
    return {
      valid: false,
      error: `Rentang waktu melebihi batas sinkronisasi H-0 hari yang sama (${(windowDurationMs / 3600000).toFixed(2)} jam, maks 24 jam).`
    };
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

  return { valid: true, startMs, endMs };
}

export const validateSameDaySyncRequest = validateRollingSyncRequest;

/**
 * Core Same-Day (H-0) Synchronization Processor
 */
export async function processSameDaySync(
  payload: ProtestSyncPayload,
  triggeredBy: ProtestSyncLog["triggered_by"] = "power_automate",
  triggeredByUser?: string
): Promise<ProtestSyncResult> {
  const startTime = Date.now();
  const executionId = `sync-h0-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

  // 1. Concurrency Guard Lock
  if (isSameDaySyncActive) {
    if (sameDaySyncStartedAt && Date.now() - sameDaySyncStartedAt < SYNC_LOCK_TIMEOUT_MS) {
      return {
        success: false,
        status: "skipped",
        execution_id: executionId,
        period_start: payload.period_start,
        period_end: payload.period_end,
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

  isSameDaySyncActive = true;
  sameDaySyncStartedAt = Date.now();

  // 2. Validate Request
  const validation = validateRollingSyncRequest(payload);
  if (!validation.valid || validation.startMs === undefined || validation.endMs === undefined) {
    isSameDaySyncActive = false;
    sameDaySyncStartedAt = null;
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

  // 3. Create Audit Log Record
  await protestStore.createSyncLog({
    id: executionId,
    started_at: new Date(startTime).toISOString(),
    completed_at: null,
    period_start: payload.period_start,
    period_end: payload.period_end,
    status: "running",
    triggered_by: triggeredBy,
    triggered_by_user: triggeredByUser || null,
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

  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

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
    // 4. Validate Each Row in Batch
    for (let i = 0; i < payload.events.length; i++) {
      const row = payload.events[i];
      const rowIndex = i + 1;

      // Rule: Primary identity ID KEJADIAN must be present
      const idKejadian = row["ID KEJADIAN"] ? String(row["ID KEJADIAN"]).trim() : "";
      if (!idKejadian) {
        skipped++;
        errors.push(`[Baris ${rowIndex}] Dilewati: 'ID KEJADIAN' kosong atau tidak valid.`);
        continue;
      }

      // Rule: Event timestamp extraction from 'WAKTU DAN TGL KEJADIAN ISO'
      const timeParsed = parseSourceEventDatetime(
        row["WAKTU DAN TGL KEJADIAN ISO"],
        row.TANGGAL
      );

      if (!timeParsed.iso || timeParsed.epochMs === null) {
        skipped++;
        errors.push(
          `[ID: ${idKejadian}] Dilewati: ${timeParsed.error || "Timestamp kejadian tidak valid"}.`
        );
        continue;
      }

      // Rule: Same-Day (H-0) boundary check: event_datetime >= period_start && event_datetime < period_end
      // Exact start boundary (00:00:00 WIB today) is INCLUDED; exact end boundary (00:00:00 WIB tomorrow) is EXCLUDED
      if (timeParsed.epochMs < startMs) {
        skipped++;
        errors.push(
          `[ID: ${idKejadian}] Dilewati: Waktu kejadian (${timeParsed.iso}) lebih lampau dari hari ini (kemarin/historis).`
        );
        continue;
      }

      if (timeParsed.epochMs >= endMs) {
        skipped++;
        errors.push(
          `[ID: ${idKejadian}] Dilewati: Waktu kejadian (${timeParsed.iso}) di luar atau di masa depan hari ini (besok atau lebih).`
        );
        continue;
      }

      // Extract core fields
      const kodeUnras = row["KODE_UNRAS"] ? String(row["KODE_UNRAS"]).trim() : idKejadian;
      const lokasi = row.LOKASI ? String(row.LOKASI).trim() : "Lokasi Belum Ditentukan";
      const isu = row.ISU ? String(row.ISU).trim() : "Aksi Unjuk Rasa";
      const tanggal = row.TANGGAL ? String(row.TANGGAL).trim() : timeParsed.iso.split("T")[0];
      const waktu = row.WAKTU ? String(row.WAKTU).trim() : "09:00 WIB";

      const crowd = typeof row["JUMLAH MASSA"] === "number"
        ? row["JUMLAH MASSA"]
        : normalizeCrowdEstimate(row["JUMLAH MASSA"]).count;

      const coords = validateIndonesianCoordinates(row.LATITUDE, row.LONGITUDE);
      const category = inferProtestCategory(isu, row.ORGANISASI || "");

      validBatchForStore.push({
        id_kejadian: idKejadian,
        kode_unras: kodeUnras,
        tanggal,
        waktu_mulai: waktu,
        waktu_selesai: null,
        event_datetime: timeParsed.iso,
        lokasi,
        titik_kumpul: row["TITIK KUMPUL"] || null,
        sasaran_aksi: row.SASARAN || null,
        isu_tuntutan: isu,
        estimasi_massa_source: crowd || null,
        organisasi_kelompok: row.ORGANISASI || null,
        korlap_pimpinan: row.KORLAP || null,
        wilayah_hukum: row["WILAYAH HUKUM"] || null,
        provinsi: row.PROVINSI || "DKI Jakarta",
        kota_kabupaten: row["KOTA/KABUPATEN"] || null,
        keterangan_source: row.KETERANGAN || null,
        validated_lat: coords.lat,
        validated_lng: coords.lng,
        category_id: category,
        raw_source_payload: row as unknown as Record<string, unknown>
      });
    }

    // 5. Execute Idempotent Batch Upsert
    if (validBatchForStore.length > 0) {
      const upsertStats = await protestStore.upsertFromExcelBatch(validBatchForStore);
      inserted = upsertStats.created;
      updated = upsertStats.updated;
      failed += (validBatchForStore.length - (inserted + updated));
    }

    const durationMs = Date.now() - startTime;
    let finalStatus: ProtestSyncLog["status"] = "success";
    if (failed > 0 || (skipped > 0 && errors.length > 0)) {
      if (inserted + updated > 0) {
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
      records_updated: updated,
      records_skipped: skipped,
      records_failed: failed,
      error_details: errors.length > 0 ? errors.slice(0, 50).join(" | ") : null,
      duration_ms: durationMs
    };

    await protestStore.updateSyncLog(executionId, finalLog);

    return {
      success: finalStatus !== "failed",
      status: finalStatus,
      execution_id: executionId,
      period_start: payload.period_start,
      period_end: payload.period_end,
      summary: {
        received: payload.events.length,
        processed: validBatchForStore.length,
        inserted,
        updated,
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
      records_updated: updated,
      records_skipped: skipped,
      records_failed: payload.events.length - (inserted + updated),
      error_details: errors.join(" | "),
      duration_ms: durationMs
    });

    return {
      success: false,
      status: "failed",
      execution_id: executionId,
      period_start: payload.period_start,
      period_end: payload.period_end,
      summary: {
        received: payload.events.length,
        processed: validBatchForStore.length,
        inserted,
        updated,
        skipped,
        failed: payload.events.length - (inserted + updated)
      },
      errors,
      duration_ms: durationMs
    };
  } finally {
    isSameDaySyncActive = false;
    sameDaySyncStartedAt = null;
  }
}

// Backwards-compatibility alias
export const processRolling7DaySync = processSameDaySync;
