/**
 * SCC - EAGLE EYES: Unjuk Rasa Rolling 7-Day Sync Engine
 * Contract: Power Automate (SCC_UNRAS_ROLLING_7D_SYNC) -> Vercel API -> Supabase / Local Store
 * Worksheet: 'NEW UNRAS 2022-2026'
 */

import crypto from "node:crypto";
import { protestStore } from "./protest-store";
import {
  ExcelProtestRow,
  ProtestEvent,
  ProtestSyncLog,
  RollingSyncPayload,
  RollingSyncResult
} from "./types/protests";
import {
  normalizeCrowdEstimate,
  validateIndonesianCoordinates,
  inferProtestCategory
} from "./ms-graph-sync";

// Maximum window duration: 7 days + 5 minutes clock skew margin
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_WINDOW_TOLERANCE_MS = SEVEN_DAYS_MS + 5 * 60 * 1000;
const MAX_BATCH_LIMIT = 1000;

// In-memory concurrency lock
let isRollingSyncActive = false;
let rollingSyncStartedAt: number | null = null;
const SYNC_LOCK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes failsafe

/**
 * Calculates exact rolling 7-day synchronization window for Asia/Jakarta (WIB)
 * period_end = current execution time
 * period_start = period_end minus exactly 7 days
 * Inclusion rule: event_datetime >= period_start AND event_datetime < period_end
 */
export function calculateRolling7DayWindow(refDate: Date = new Date()): {
  period_start: string;
  period_end: string;
  period_start_ms: number;
  period_end_ms: number;
} {
  const period_end_ms = refDate.getTime();
  const period_start_ms = period_end_ms - SEVEN_DAYS_MS;

  return {
    period_start: new Date(period_start_ms).toISOString(),
    period_end: new Date(period_end_ms).toISOString(),
    period_start_ms,
    period_end_ms
  };
}

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
 * Validates request schema and 7-day window constraints
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

  if (payload.sync_type !== "rolling_7d") {
    return {
      valid: false,
      error: `sync_type '${payload.sync_type}' tidak didukung. Wajib 'rolling_7d'.`
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
      error: `Rentang waktu melebihi batas maksimum 7 hari (${(windowDurationMs / 86400000).toFixed(2)} hari).`
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

/**
 * Core Rolling 7-Day Synchronization Processor
 */
export async function processRolling7DaySync(
  payload: RollingSyncPayload,
  triggeredBy: ProtestSyncLog["triggered_by"] = "power_automate",
  triggeredByUser?: string
): Promise<RollingSyncResult> {
  const startTime = Date.now();
  const executionId = `sync-7d-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

  // 1. Concurrency Guard Lock
  if (isRollingSyncActive) {
    if (rollingSyncStartedAt && Date.now() - rollingSyncStartedAt < SYNC_LOCK_TIMEOUT_MS) {
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

  isRollingSyncActive = true;
  rollingSyncStartedAt = Date.now();

  // 2. Validate Request
  const validation = validateRollingSyncRequest(payload);
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

      // Rule: Rolling 7-day boundary check: event_datetime >= period_start && event_datetime < period_end
      // Exact start boundary is INCLUDED; exact end boundary is EXCLUDED
      if (timeParsed.epochMs < startMs) {
        skipped++;
        errors.push(
          `[ID: ${idKejadian}] Dilewati: Waktu kejadian (${timeParsed.iso}) lebih lampau dari batas period_start (${payload.period_start}).`
        );
        continue;
      }

      if (timeParsed.epochMs >= endMs) {
        skipped++;
        errors.push(
          `[ID: ${idKejadian}] Dilewati: Waktu kejadian (${timeParsed.iso}) di luar atau di masa depan batas period_end (${payload.period_end}).`
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
      const upsertStats = protestStore.upsertFromExcelBatch(validBatchForStore);
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
    isRollingSyncActive = false;
    rollingSyncStartedAt = null;
  }
}
