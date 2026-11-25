import { ProtestEvent, ProtestSyncLog } from "./types/protests";
import { protestStore } from "./protest-store";

export interface OutboundSyncFields {
  "URUTAN BULAN"?: number | null;
  "TAHUN"?: number | null;
  "BULAN"?: string | null;
  "KATEGORI KEJADIAN"?: string | null;
  "KP/KPW"?: string | null;
  "REGIONAL"?: string | null;
  "PROVINSI"?: string | null;
  "WILAYAH HUKUM"?: string | null;
  "LOKASI"?: string | null; // Excel Col I 'Lokasi' (City / Administrative area)
  "WAKTU"?: string | null;
  "TANGGAL"?: string | null;
  "WAKTU DAN TGL KEJADIAN"?: string | null;
  "STATUS KEJADIAN"?: string | null;
  "LOKASI UNRAS"?: string | null; // Excel Col P 'Lokasi Unras' (Specific venue)
  "TUJUAN"?: string | null;
  "TITIK KUMPUL"?: string | null;
  "SASARAN AKSI"?: string | null;
  "ALIANSI/MASSA"?: string | null;
  "KORLAP/PIMPINAN"?: string | null;
  "ESTIMASI JUMLAH MASSA"?: number | null;
  "TUNTUTAN"?: string | null;
  "KATEGORI ISU"?: string | null;
  "DAMPAK KEJADIAN"?: string | null;
  "KETERANGAN DAMPAK"?: string | null;
  "NAMA PELAPOR"?: string | null;
  "INFO AWAL UNRAS"?: string | null;
  "TINDAK LANJUT KPw BI"?: string | null;
  "PROGRES ASISTENSI"?: string | null;
  "REALISASI"?: string | null;
  "JARAK LOKASI UNRAS"?: string | null;
  "REDAKSI"?: string | null;
}

export interface OutboundSyncPayload {
  origin: "scc";
  event_type: "unras.updated";
  id_unras: string;
  id_kejadian: string;
  fields: OutboundSyncFields;
}

export interface OutboundSyncResult {
  success: boolean;
  status: "success" | "skipped" | "failed" | "not_found" | "conflict";
  http_status?: number;
  error?: string;
  duration_ms: number;
  payload?: OutboundSyncPayload;
}

export interface DispatchOutboundOptions {
  origin?: "scc" | "excel";
  triggeredBy?: string;
  forceSync?: boolean;
  route?: string;
}

/**
 * Emits safe server-side structured diagnostic logs without exposing secrets,
 * webhook URLs, or query-string tokens.
 */
function logOutboundDiagnostic(info: {
  correlation_id: string;
  event: string;
  route?: string;
  protest_id: string;
  id_unras?: string | null;
  has_outbound_url: boolean;
  has_kode_unras: boolean;
  result: "started" | "skipped" | "success" | "failed";
  http_status?: number | null;
  duration_ms: number;
  error?: string | null;
}) {
  const sanitized = {
    correlation_id: info.correlation_id,
    event: info.event,
    route: info.route || "unknown",
    protest_id: info.protest_id,
    has_outbound_url: info.has_outbound_url,
    has_kode_unras: info.has_kode_unras,
    result: info.result,
    http_status: info.http_status ?? null,
    duration_ms: info.duration_ms,
    error: info.error ? String(info.error).slice(0, 200) : null
  };
  console.log(`[UNRAS Outbound Sync]`, JSON.stringify(sanitized));
}

/**
 * Maps SCC internal status to the authoritative Excel status vocabulary:
 * - 'Belum Berlangsung'
 * - 'Sedang Berlangsung'
 * - 'Selesai'
 */
export function mapSCCStatusToExcelStatus(status?: string | null): "Belum Berlangsung" | "Sedang Berlangsung" | "Selesai" {
  if (!status) return "Belum Berlangsung";
  const s = String(status).toLowerCase().trim();
  switch (s) {
    case "completed":
    case "selesai":
      return "Selesai";
    case "ongoing":
    case "monitoring":
    case "sedang berlangsung":
      return "Sedang Berlangsung";
    case "scheduled":
    case "cancelled":
    case "belum berlangsung":
    default:
      return "Belum Berlangsung";
  }
}

/**
 * Resolves outbound crowd estimate prioritizing operator-entered actual_crowd_size.
 * If operator explicitly clears actual_crowd_size (null), returns null (does not restore source estimate).
 */
export function resolveOutboundCrowdSize(event: ProtestEvent): number | null {
  if (typeof event.actual_crowd_size === "number") {
    return event.actual_crowd_size;
  }
  if (event.actual_crowd_size === null) {
    return null;
  }
  return event.estimasi_massa_source ?? null;
}

/**
 * Resolves outbound editorial text prioritizing editorial_final, then editorial_draft.
 * If both are empty / cleared, returns null (never falls back to stale redaksi).
 */
export function resolveOutboundEditorial(event: ProtestEvent): string | null {
  if (event.editorial_final !== undefined && event.editorial_final !== null && String(event.editorial_final).trim() !== "") {
    return String(event.editorial_final).trim();
  }
  if (event.editorial_draft !== undefined && event.editorial_draft !== null && String(event.editorial_draft).trim() !== "") {
    return String(event.editorial_draft).trim();
  }
  return null;
}

/**
 * Builds the strictly validated outbound JSON contract for Power Automate flow 'SCC_TO_UNRAS_EXCEL'.
 * 
 * Rules:
 * - Matching Key: ID UNRAS (mapped to data.kode_unras)
 * - Location contract:
 *     Excel 'Lokasi' (City) <= SCC kota_kabupaten
 *     Excel 'Lokasi Unras' (Venue) <= SCC lokasi
 * - Operator overwrite fields:
 *     1. SCC status -> Excel STATUS KEJADIAN (mapped to Excel vocabulary)
 *     2. SCC actual_crowd_size -> Excel ESTIMASI JUMLAH MASSA (cleared stays null)
 *     3. SCC editorial_final / editorial_draft -> Excel REDAKSI (cleared stays null, no stale fallback)
 * - NEVER includes or updates 'BATAS' column.
 * - NEVER alters or mutates ID UNRAS or ID KEJADIAN.
 */
export function buildOutboundPayload(event: ProtestEvent): OutboundSyncPayload {
  // 1. Status mapping: Always reflect latest operator-approved SCC status, preserving Excel status vocabulary
  const statusKejadian = mapSCCStatusToExcelStatus(event.status || event.status_sumber);

  // 2. Crowd size mapping: latest actual_crowd_size, explicit clear remains null
  const crowdSize = resolveOutboundCrowdSize(event);

  // 3. Editorial mapping: editorial_final > editorial_draft, cleared remains null
  const editorial = resolveOutboundEditorial(event);

  // Wilayah / KP: prefer explicit kp_kpw, fallback to wilayah_hukum, default KPBI
  const kp = event.kp_kpw || (event.provinsi === "DKI Jakarta" ? "KPBI" : "KPwDN");

  return {
    origin: "scc",
    event_type: "unras.updated",
    id_unras: event.kode_unras || "",
    id_kejadian: event.id_kejadian || "",
    fields: {
      "URUTAN BULAN": event.urutan_bulan ?? null,
      "TAHUN": event.tahun ?? null,
      "BULAN": event.bulan ?? null,
      "KATEGORI KEJADIAN": event.kategori_kejadian ?? null,
      "KP/KPW": kp,
      "REGIONAL": event.regional || (event.provinsi === "DKI Jakarta" ? "Kantor Pusat" : "Jawa"),
      "PROVINSI": event.provinsi || "DKI Jakarta",
      "WILAYAH HUKUM": event.wilayah_hukum ?? null,
      "LOKASI": event.kota_kabupaten ?? null, // Excel Col I 'Lokasi' (City / Administrative area)
      "WAKTU": event.waktu_mulai || "09:00:00",
      "TANGGAL": event.tanggal || null,
      "WAKTU DAN TGL KEJADIAN": event.event_datetime || null,
      "STATUS KEJADIAN": statusKejadian,
      "LOKASI UNRAS": event.lokasi || null, // Excel Col P 'Lokasi Unras' (Specific venue)
      "TUJUAN": event.tujuan ?? null,
      "TITIK KUMPUL": event.titik_kumpul ?? null,
      "SASARAN AKSI": event.sasaran_aksi ?? null,
      "ALIANSI/MASSA": event.organisasi_kelompok ?? null,
      "KORLAP/PIMPINAN": event.korlap_pimpinan ?? null,
      "ESTIMASI JUMLAH MASSA": crowdSize,
      "TUNTUTAN": event.isu_tuntutan || null,
      "KATEGORI ISU": event.kategori_isu ?? null,
      "DAMPAK KEJADIAN": event.dampak || "Tidak Ada",
      "KETERANGAN DAMPAK": event.keterangan_dampak ?? null,
      "NAMA PELAPOR": event.nama_pelapor ?? null,
      "INFO AWAL UNRAS": event.info_awal ?? null,
      "TINDAK LANJUT KPw BI": event.tindak_lanjut ?? null,
      "PROGRES ASISTENSI": event.progres_asistensi ?? null,
      "REALISASI": event.realisasi || "Terealisasi",
      "JARAK LOKASI UNRAS": event.jarak_lokasi_unras ?? null,
      "REDAKSI": editorial
    }
  };
}

/**
 * Dispatches outbound synchronization event from SCC to Excel via Power Automate HTTP trigger.
 * 
 * Safety Features:
 * - Loop prevention: Discards execution if origin is 'excel'.
 * - 10-second timeout with AbortController.
 * - Exponential backoff retry (up to 2 retries) on transient network or 5xx server errors.
 * - Explicit HTTP status handling: 404 (Not Found in Excel), 409 (Ambiguous/Multiple Rows in Excel).
 * - Audit logging into sync logs.
 */
export async function dispatchOutboundSync(
  event: ProtestEvent,
  options: DispatchOutboundOptions = {}
): Promise<OutboundSyncResult> {
  const startTime = Date.now();
  const correlationId = `outbound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Loop Prevention check (Rule 1 & Rule 2)
  if (options.origin === "excel") {
    logOutboundDiagnostic({
      correlation_id: correlationId,
      event: "unras.updated",
      route: options.route,
      protest_id: event.id,
      has_outbound_url: Boolean(process.env.POWER_AUTOMATE_OUTBOUND_URL || process.env.UNRAS_OUTBOUND_WEBHOOK_URL),
      has_kode_unras: Boolean(event.kode_unras),
      result: "skipped",
      duration_ms: Date.now() - startTime,
      error: "Loop prevention: origin is excel"
    });
    return {
      success: true,
      status: "skipped",
      duration_ms: Date.now() - startTime
    };
  }

  // 2. Build validated payload & verify matching key (ID UNRAS)
  const payload = buildOutboundPayload(event);

  if (!payload.id_unras || payload.id_unras.trim() === "") {
    logOutboundDiagnostic({
      correlation_id: correlationId,
      event: "unras.updated",
      route: options.route,
      protest_id: event.id,
      has_outbound_url: Boolean(process.env.POWER_AUTOMATE_OUTBOUND_URL || process.env.UNRAS_OUTBOUND_WEBHOOK_URL),
      has_kode_unras: false,
      result: "failed",
      duration_ms: Date.now() - startTime,
      error: "Event missing id_unras (ID UNRAS) required for Excel row lookup."
    });
    return {
      success: false,
      status: "failed",
      error: "Event missing id_unras (ID UNRAS) required for Excel row lookup.",
      duration_ms: Date.now() - startTime,
      payload
    };
  }

  // 3. Outbound URL resolution
  const outboundUrl = process.env.POWER_AUTOMATE_OUTBOUND_URL || process.env.UNRAS_OUTBOUND_WEBHOOK_URL;
  if (!outboundUrl || outboundUrl.trim() === "") {
    logOutboundDiagnostic({
      correlation_id: correlationId,
      event: "unras.updated",
      route: options.route,
      protest_id: event.id,
      id_unras: payload.id_unras,
      has_outbound_url: false,
      has_kode_unras: true,
      result: "skipped",
      duration_ms: Date.now() - startTime,
      error: "Power Automate outbound webhook URL is not configured (POWER_AUTOMATE_OUTBOUND_URL)."
    });
    // If webhook URL is not configured, do not throw or fail the operator mutation
    return {
      success: true,
      status: "skipped",
      error: "Power Automate outbound webhook URL is not configured (POWER_AUTOMATE_OUTBOUND_URL).",
      duration_ms: Date.now() - startTime,
      payload
    };
  }

  logOutboundDiagnostic({
    correlation_id: correlationId,
    event: "unras.updated",
    route: options.route,
    protest_id: event.id,
    id_unras: payload.id_unras,
    has_outbound_url: true,
    has_kode_unras: true,
    result: "started",
    duration_ms: Date.now() - startTime
  });

  const maxRetries = 2;
  let lastError: string | null = null;
  let responseStatus = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(outboundUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sync-Origin": "scc",
          "X-Sync-Event": "unras.updated",
          "X-Sync-Key": payload.id_unras
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      responseStatus = response.status;

      // HTTP 200 or 204: Excel row updated successfully
      if (response.status === 200 || response.status === 204) {
        const durationMs = Date.now() - startTime;
        
        // Update protest outbound sync state
        try {
          await protestStore.updateProtest(event.id, {
            last_outbound_synced_at: new Date().toISOString(),
            outbound_sync_status: "success"
          }, { id: "system-outbound-sync", name: "Outbound Sync Service", email: "system@scc.go.id", role: "admin" });
        } catch {}

        // Record audit sync log
        try {
          await recordOutboundSyncLog({
            status: "success",
            kode_unras: payload.id_unras,
            id_kejadian: payload.id_kejadian,
            durationMs,
            records_updated: 1
          });
        } catch {}

        logOutboundDiagnostic({
          correlation_id: correlationId,
          event: "unras.updated",
          route: options.route,
          protest_id: event.id,
          id_unras: payload.id_unras,
          has_outbound_url: true,
          has_kode_unras: true,
          result: "success",
          http_status: response.status,
          duration_ms: durationMs
        });

        return {
          success: true,
          status: "success",
          http_status: response.status,
          duration_ms: durationMs,
          payload
        };
      }

      // HTTP 404: Excel row with this ID UNRAS not found
      if (response.status === 404) {
        const durationMs = Date.now() - startTime;
        lastError = `ID UNRAS '${payload.id_unras}' tidak ditemukan di tabel Excel Table3 (HTTP 404).`;
        
        try {
          await protestStore.updateProtest(event.id, {
            outbound_sync_status: "failed"
          }, { id: "system-outbound-sync", name: "Outbound Sync Service", email: "system@scc.go.id", role: "admin" });
        } catch {}

        logOutboundDiagnostic({
          correlation_id: correlationId,
          event: "unras.updated",
          route: options.route,
          protest_id: event.id,
          id_unras: payload.id_unras,
          has_outbound_url: true,
          has_kode_unras: true,
          result: "failed",
          http_status: 404,
          duration_ms: durationMs,
          error: lastError
        });

        return {
          success: false,
          status: "not_found",
          http_status: 404,
          error: lastError,
          duration_ms: durationMs,
          payload
        };
      }

      // HTTP 409: Duplicate rows found with same ID UNRAS in Excel Table3
      if (response.status === 409) {
        const durationMs = Date.now() - startTime;
        lastError = `ID UNRAS '${payload.id_unras}' ambigu: Ditemukan lebih dari 1 baris di tabel Excel (HTTP 409). Update ditolak untuk keamanan.`;
        
        try {
          await protestStore.updateProtest(event.id, {
            outbound_sync_status: "failed"
          }, { id: "system-outbound-sync", name: "Outbound Sync Service", email: "system@scc.go.id", role: "admin" });
        } catch {}

        logOutboundDiagnostic({
          correlation_id: correlationId,
          event: "unras.updated",
          route: options.route,
          protest_id: event.id,
          id_unras: payload.id_unras,
          has_outbound_url: true,
          has_kode_unras: true,
          result: "failed",
          http_status: 409,
          duration_ms: durationMs,
          error: lastError
        });

        return {
          success: false,
          status: "conflict",
          http_status: 409,
          error: lastError,
          duration_ms: durationMs,
          payload
        };
      }

      // 5xx Server errors: retry
      if (response.status >= 500 && attempt < maxRetries) {
        lastError = `Server error dari Power Automate (HTTP ${response.status}). Percobaan ulang ${attempt + 1}/${maxRetries}...`;
        await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
        continue;
      }

      // 401 Unauthorized: DirectApiAuthorizationRequired / Missing SAS signature
      if (response.status === 401) {
        const errorText = await response.text().catch(() => "");
        lastError = `Power Automate 401 Unauthorized (DirectApiAuthorizationRequired): URL webhook di POWER_AUTOMATE_OUTBOUND_URL tidak menyertakan tanda tangan Shared Access Signature (sp, sv, sig). ${errorText}`.trim();
        break;
      }

      // Other 4xx client errors: non-retryable
      const errorText = await response.text().catch(() => "");
      lastError = `Power Automate merespons HTTP ${response.status}: ${errorText || "Permintaan tidak dapat diproses"}`;
      break;

    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAbort = err.name === "AbortError";
      lastError = isAbort
        ? "Batas waktu koneksi ke Power Automate habis (10 detik timeout)."
        : (err.message || String(err));

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
        continue;
      }
    }
  }

  const durationMs = Date.now() - startTime;

  // Mark failure in DB state
  try {
    await protestStore.updateProtest(event.id, {
      outbound_sync_status: "failed"
    }, { id: "system-outbound-sync", name: "Outbound Sync Service", email: "system@scc.go.id", role: "admin" });
  } catch {}

  // Record audit failure log
  try {
    await recordOutboundSyncLog({
      status: "failed",
      kode_unras: payload.id_unras,
      id_kejadian: payload.id_kejadian,
      durationMs,
      error_details: lastError
    });
  } catch {}

  logOutboundDiagnostic({
    correlation_id: correlationId,
    event: "unras.updated",
    route: options.route,
    protest_id: event.id,
    id_unras: payload.id_unras,
    has_outbound_url: true,
    has_kode_unras: true,
    result: "failed",
    http_status: responseStatus || 500,
    duration_ms: durationMs,
    error: lastError
  });

  return {
    success: false,
    status: "failed",
    http_status: responseStatus || 500,
    error: lastError || "Gagal mengirim pembaruan ke Excel",
    duration_ms: durationMs,
    payload
  };
}

/**
 * Audit log recording for outbound synchronization operations.
 */
async function recordOutboundSyncLog(params: {
  status: "success" | "failed";
  kode_unras: string;
  id_kejadian: string;
  durationMs: number;
  records_updated?: number;
  error_details?: string | null;
}) {
  const logId = `outbound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  await protestStore.createSyncLog({
    id: logId,
    started_at: now,
    completed_at: now,
    status: params.status,
    triggered_by: "system",
    triggered_by_user: "SCC Outbound Dispatcher",
    source_worksheet: "SCC_TO_UNRAS_EXCEL (Table3)",
    records_received: 1,
    records_processed: 1,
    records_created: 0,
    records_updated: params.records_updated || 0,
    records_skipped: 0,
    records_failed: params.status === "failed" ? 1 : 0,
    error_details: params.error_details || null,
    duration_ms: params.durationMs
  });
}
