/**
 * SCC - EAGLE EYES: Supabase Protest Persistence Service
 * Authoritative cloud database client for PostgreSQL / Supabase
 */

import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";
import { getDataStore } from "./data-store";
import { normalizeTimeString } from "./time-normalization";
import { geocodingService } from "./geocoding/geocoding-service";
import { ensureValidUuid } from "./auth-roles";
import {
  deriveTahunBulan,
  deriveEventTimestamps,
  generateIdKejadian,
  generateKodeUnras,
  normalizeProtestStatus,
  synthesizePointsForLegacyEvent,
  mapSourceStatusToProtestStatus
} from "./unras-helpers";
import {
  ProtestEvent,
  ProtestFilterParams,
  ProtestStats,
  ProtestStatusHistory,
  ProtestOperatorReport,
  ProtestCameraLink,
  ProtestSyncLog,
  DailyUnrasSituationOverview,
  ProtestPoint,
  ProtestStatus,
  ProtestUrgency,
  SourceStatusCategory,
  IdentityRegistryEntry
} from "./types/protests";
import {
  generateExactFingerprint,
  generateSemanticFingerprint,
  generateSourceKey,
  ExistingProtestComparisonItem
} from "./unras-identity-registry";

export { isSupabaseConfigured };

/**
 * Format database row into typed ProtestEvent
 */
function mapRowToProtest(row: any): ProtestEvent {
  const hasCoords = Boolean(row.has_coordinates || (row.validated_lat !== null && row.validated_lng !== null));
  return {
    id: row.id,
    id_kejadian: row.id_kejadian,
    kode_unras: row.kode_unras,
    tanggal: typeof row.tanggal === "string" ? row.tanggal.split("T")[0] : String(row.tanggal || ""),
    waktu_mulai: row.waktu_mulai ? String(row.waktu_mulai).slice(0, 8) : null,
    waktu_selesai: row.waktu_selesai ? String(row.waktu_selesai).slice(0, 8) : null,
    event_datetime: row.event_datetime ? new Date(row.event_datetime).toISOString() : null,
    lokasi: row.lokasi,
    titik_kumpul: row.titik_kumpul,
    sasaran_aksi: row.sasaran_aksi,
    isu_tuntutan: row.isu_tuntutan,
    estimasi_massa_source: row.estimasi_massa_source,
    organisasi_kelompok: row.organisasi_kelompok,
    korlap_pimpinan: row.korlap_pimpinan,
    wilayah_hukum: row.wilayah_hukum,
    provinsi: row.provinsi || "DKI Jakarta",
    kota_kabupaten: row.kota_kabupaten,
    keterangan_source: row.keterangan_source,
    status: normalizeProtestStatus(row.status),
    status_sumber: (row.status_sumber as SourceStatusCategory) || null,
    urgency: row.urgency || "medium",
    category_id: row.category_id,
    category_name: row.category_name,
    validated_lat: row.validated_lat !== null && row.validated_lat !== undefined ? Number(row.validated_lat) : null,
    validated_lng: row.validated_lng !== null && row.validated_lng !== undefined ? Number(row.validated_lng) : null,
    has_coordinates: hasCoords,
    actual_crowd_size: row.actual_crowd_size,
    situation_summary: row.situation_summary,
    editorial_draft: row.editorial_draft,
    editorial_final: row.editorial_final,
    is_archived: Boolean(row.is_archived),
    completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    completed_by_id: row.completed_by_id,
    completed_by_name: row.completed_by_name,

    // Geocoding intelligence attributes
    suggested_lat: row.suggested_lat !== null && row.suggested_lat !== undefined ? Number(row.suggested_lat) : null,
    suggested_lng: row.suggested_lng !== null && row.suggested_lng !== undefined ? Number(row.suggested_lng) : null,
    suggested_address: row.suggested_address || null,
    geocoding_provider: row.geocoding_provider || null,
    geocoding_confidence: row.geocoding_confidence || null,
    location_validation_status: row.location_validation_status || (hasCoords ? "verified" : "unmapped"),
    geocoding_alternatives: Array.isArray(row.geocoding_alternatives) ? row.geocoding_alternatives : [],
    validated_at: row.validated_at ? new Date(row.validated_at).toISOString() : null,
    validated_by_id: row.validated_by_id || null,
    validated_by_name: row.validated_by_name || null,

    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    last_synced_at: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
    source_type: row.source_type || (row.raw_source_payload?.source_type) || "excel_sync",

    // Excel C:AC Source Attributes
    urutan_bulan: row.urutan_bulan !== null && row.urutan_bulan !== undefined ? Number(row.urutan_bulan) : null,
    tahun: row.tahun !== null && row.tahun !== undefined ? Number(row.tahun) : (row.tanggal ? new Date(row.tanggal).getFullYear() : null),
    bulan: row.bulan || null,
    kategori_kejadian: row.kategori_kejadian || "Unjuk Rasa",
    kp_kpw: row.kp_kpw || null,
    regional: row.regional || null,
    kategori_isu: row.kategori_isu || null,
    dampak: row.dampak || "Tidak Ada",
    keterangan_dampak: row.keterangan_dampak || null,
    nama_pelapor: row.nama_pelapor || null,
    info_awal: row.info_awal || null,
    tindak_lanjut: row.tindak_lanjut || null,
    progres_asistensi: row.progres_asistensi || null,
    realisasi: row.realisasi || null,
    tujuan: row.tujuan || null,
    jarak_lokasi_unras: row.jarak_lokasi_unras || null,
    redaksi: row.redaksi || null,
    last_outbound_synced_at: row.last_outbound_synced_at ? new Date(row.last_outbound_synced_at).toISOString() : null,
    outbound_sync_status: (row.outbound_sync_status as any) || 'none'
  };
}

/**
 * 1. Query Protests with Filtering & Pagination from Supabase
 */
export async function queryProtestsFromSupabase(filters: ProtestFilterParams = {}): Promise<{
  total: number;
  page: number;
  limit: number;
  data: ProtestEvent[];
}> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(500, Math.max(1, Number(filters.limit) || 20));
  const offset = (page - 1) * limit;

  let query = supabase
    .from("protests")
    .select("*", { count: "exact" })
    .is("deleted_at", null);

  // Status Filter
  if (filters.status) {
    if (filters.status === "active") {
      query = query
        .in("status", ["scheduled", "ongoing", "monitoring"])
        .eq("is_archived", false);
    } else if (filters.status === "completed") {
      // Tab Selesai (Arsip): status_sumber = 'Selesai' OR status = 'completed'
      query = query.or("status_sumber.eq.Selesai,status.eq.completed");
    } else if (filters.status === "ongoing") {
      // Tab Sedang Berlangsung: status_sumber = 'Sedang Berlangsung'
      query = query.eq("status_sumber", "Sedang Berlangsung");
    } else if (filters.status === "scheduled") {
      // Tab Belum Berlangsung: status_sumber = 'Belum Berlangsung'
      query = query.eq("status_sumber", "Belum Berlangsung");
    } else if (filters.status !== "all") {
      query = query.eq("status", filters.status);
    }
  }

  // Source Status Filter
  if (filters.status_sumber && filters.status_sumber !== "all") {
    query = query.eq("status_sumber", filters.status_sumber);
  }

  // Archived Filter
  if (filters.is_archived !== undefined) {
    const isArch = filters.is_archived === true || String(filters.is_archived) === "true";
    query = query.eq("is_archived", isArch);
  }

  // Urgency Filter
  if (filters.urgency && (filters.urgency as string) !== "all") {
    query = query.eq("urgency", filters.urgency);
  }

  // Coordinates Filter
  if (filters.has_coords !== undefined && (filters.has_coords as any) !== "all") {
    const hasC = filters.has_coords === true || String(filters.has_coords) === "true";
    if (hasC) {
      query = query.not("validated_lat", "is", null).not("validated_lng", "is", null);
    } else {
      query = query.or("validated_lat.is.null,validated_lng.is.null");
    }
  }

  // Location Validation Status Filter
  if (filters.location_validation_status && filters.location_validation_status !== "all") {
    query = query.eq("location_validation_status", filters.location_validation_status);
  }

  // Geocoding Confidence Filter
  if (filters.geocoding_confidence && filters.geocoding_confidence !== "all") {
    query = query.eq("geocoding_confidence", filters.geocoding_confidence);
  }

  // Province & City Filter
  if (filters.province) {
    query = query.ilike("provinsi", `%${filters.province}%`);
  }
  if (filters.city) {
    query = query.ilike("kota_kabupaten", `%${filters.city}%`);
  }

  // Date Range Filter
  if (filters.date_from) {
    query = query.gte("tanggal", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("tanggal", filters.date_to);
  }

  // Strict Operational Date Filter in Asia/Jakarta (WIB)
  const targetDate = (filters.operational_date || filters.date || "").trim();
  if (targetDate) {
    const dateWib = targetDate === "today"
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
      : targetDate.slice(0, 10);

    const startWib = new Date(`${dateWib}T00:00:00+07:00`);
    const endWib = new Date(startWib.getTime() + 86400000);
    const startUtcIso = startWib.toISOString();
    const endUtcIso = endWib.toISOString();

    query = query.or(`tanggal.eq.${dateWib},and(tanggal.is.null,event_datetime.gte.${startUtcIso},event_datetime.lt.${endUtcIso})`);
  }

  // Full-text search
  if (filters.q && filters.q.trim()) {
    const term = `%${filters.q.trim()}%`;
    query = query.or(
      `isu_tuntutan.ilike.${term},lokasi.ilike.${term},organisasi_kelompok.ilike.${term},korlap_pimpinan.ilike.${term},kategori_isu.ilike.${term},nama_pelapor.ilike.${term},kode_unras.ilike.${term},id_kejadian.ilike.${term}`
    );
  }

  // Sorting
  const sortBy = filters.sort_by === "created_at" ? "created_at" : "tanggal";
  const ascending = filters.sort_order === "asc";
  query = query.order(sortBy, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) {
    throw new Error(`Supabase query error: ${error.message}`);
  }

  const protests = (data || []).map(mapRowToProtest);
  await attachCameraLinksInSupabase(protests);

  return {
    total: count || 0,
    page,
    limit,
    data: protests
  };
}

/**
 * Batch-attaches valid linked CCTV records from `protest_camera_links` to an array of ProtestEvents
 * in a single query (avoiding N+1 requests per incident card).
 */
async function attachCameraLinksInSupabase(protests: ProtestEvent[]): Promise<void> {
  if (!protests || protests.length === 0) return;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const protestIds = Array.from(new Set(protests.map((p) => p.id).filter(Boolean)));
  if (protestIds.length === 0) return;

  try {
    const { data, error } = await supabase
      .from("protest_camera_links")
      .select("*")
      .in("protest_id", protestIds)
      .order("distance_meters", { ascending: true });

    if (error || !Array.isArray(data)) {
      for (const p of protests) {
        if (!Array.isArray(p.camera_links)) p.camera_links = [];
      }
      return;
    }

    const cctvStore = getDataStore();
    const linksByProtest = new Map<string, ProtestCameraLink[]>();
    const seenPerProtest = new Map<string, Set<string>>();

    for (const l of data) {
      const protestId = l.protest_id ? String(l.protest_id).trim() : "";
      const cameraId = l.camera_id ? String(l.camera_id).trim() : "";
      if (!protestId || !cameraId) continue;

      let seen = seenPerProtest.get(protestId);
      if (!seen) {
        seen = new Set<string>();
        seenPerProtest.set(protestId, seen);
      }
      if (seen.has(cameraId)) continue;
      seen.add(cameraId);

      const cam = cctvStore.getCameraById(cameraId);
      const linkObj: ProtestCameraLink = {
        id: String(l.id),
        protest_id: protestId,
        point_id: l.point_id ? String(l.point_id) : undefined,
        camera_id: cameraId,
        camera_name: l.camera_name ? String(l.camera_name) : cameraId,
        camera_stream_url: l.camera_stream_url || undefined,
        camera_protocol: l.camera_protocol || undefined,
        camera_status: l.camera_status || "ONLINE",
        distance_meters: Number(l.distance_meters) || 0,
        notes: l.notes || null,
        is_recommended: Boolean(l.is_recommended),
        linked_by_id: l.linked_by_id ? String(l.linked_by_id) : "system",
        linked_by_name: l.linked_by_name ? String(l.linked_by_name) : "Operator SCC",
        created_at: l.created_at ? new Date(l.created_at).toISOString() : new Date().toISOString(),
        camera: cam || {
          id: cameraId,
          name: l.camera_name ? String(l.camera_name) : cameraId,
          province_id: "",
          province_name: "",
          city_id: "",
          city_name: "",
          source_id: "",
          source_name: "",
          location: "",
          latitude: 0,
          longitude: 0,
          stream_url: l.camera_stream_url || "",
          source_url: "",
          protocol: (l.camera_protocol as any) || "HLS",
          status: (l.camera_status as any) || "ONLINE",
          last_checked_at: new Date().toISOString(),
          created_at: l.created_at ? String(l.created_at) : new Date().toISOString(),
          updated_at: l.created_at ? String(l.created_at) : new Date().toISOString()
        }
      };

      const list = linksByProtest.get(protestId) || [];
      list.push(linkObj);
      linksByProtest.set(protestId, list);
    }

    for (const p of protests) {
      p.camera_links = linksByProtest.get(p.id) || [];
    }
  } catch {
    for (const p of protests) {
      if (!Array.isArray(p.camera_links)) p.camera_links = [];
    }
  }
}

/**
 * 2. Get Single Protest by ID or ID KEJADIAN from Supabase
 */
export async function getProtestByIdFromSupabase(id: string): Promise<ProtestEvent | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  let query = supabase.from("protests").select("*").is("deleted_at", null);
  if (isUUID) {
    query = query.eq("id", id);
  } else {
    query = query.or(`id_kejadian.eq.${id},kode_unras.eq.${id}`);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  const protest = mapRowToProtest(data);
  await attachCameraLinksInSupabase([protest]);
  return protest;
}

/**
 * 3. Create Protest Event in Supabase
 */
export async function createProtestInSupabase(
  payload: Partial<ProtestEvent> & { source_type?: string },
  _user?: any
): Promise<ProtestEvent> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const tb = deriveTahunBulan(payload.tanggal || "");
  const timestamps = deriveEventTimestamps(payload.tanggal || "", payload.waktu_mulai || "09:00 WIB");
  const autoIdKejadian = payload.id_kejadian || generateIdKejadian(payload.provinsi, payload.tanggal);
  const autoKodeUnras = payload.kode_unras || generateKodeUnras(payload.tanggal, payload.lokasi);

  const row = {
    id_kejadian: autoIdKejadian,
    kode_unras: autoKodeUnras,
    tanggal: payload.tanggal,
    waktu_mulai: timestamps.normalizedTime,
    waktu_selesai: payload.waktu_selesai ? normalizeTimeString(payload.waktu_selesai).time : null,
    event_datetime: payload.event_datetime || timestamps.eventDatetimeIso,
    lokasi: payload.lokasi,
    titik_kumpul: payload.titik_kumpul || null,
    sasaran_aksi: payload.sasaran_aksi || null,
    isu_tuntutan: payload.isu_tuntutan,
    estimasi_massa_source: payload.estimasi_massa_source || null,
    organisasi_kelompok: payload.organisasi_kelompok || null,
    korlap_pimpinan: payload.korlap_pimpinan || null,
    wilayah_hukum: payload.wilayah_hukum || null,
    provinsi: payload.provinsi || "DKI Jakarta",
    kota_kabupaten: payload.kota_kabupaten || null,
    keterangan_source: payload.keterangan_source || null,
    status: payload.status || "scheduled",
    urgency: payload.urgency || "medium",
    category_id: payload.category_id || null,
    validated_lat: payload.validated_lat !== undefined && payload.validated_lat !== null ? Number(payload.validated_lat) : null,
    validated_lng: payload.validated_lng !== undefined && payload.validated_lng !== null ? Number(payload.validated_lng) : null,
    location_validation_status: payload.location_validation_status || (payload.validated_lat && payload.validated_lng ? "verified" : (payload.suggested_lat ? "pending_validation" : "unmapped")),
    suggested_lat: payload.suggested_lat ? Number(payload.suggested_lat) : null,
    suggested_lng: payload.suggested_lng ? Number(payload.suggested_lng) : null,
    suggested_address: payload.suggested_address || null,
    geocoding_provider: payload.geocoding_provider || null,
    geocoding_confidence: payload.geocoding_confidence || null,
    geocoding_alternatives: payload.geocoding_alternatives || [],
    validated_at: payload.validated_lat && payload.validated_lng ? new Date().toISOString() : null,
    actual_crowd_size: payload.actual_crowd_size || null,
    situation_summary: payload.situation_summary || null,
    editorial_draft: payload.editorial_draft || null,
    editorial_final: payload.editorial_final || null,
    is_archived: Boolean(payload.is_archived),
    source_type: payload.source_type || "manual",
    raw_source_payload: { source_type: payload.source_type || "manual" },

    // Excel C:AC Source Attributes
    urutan_bulan: payload.urutan_bulan ?? null,
    tahun: payload.tahun || tb.tahun,
    bulan: payload.bulan || tb.bulan,
    kategori_kejadian: payload.kategori_kejadian || "Unjuk Rasa",
    kp_kpw: payload.kp_kpw || (payload.provinsi === "DKI Jakarta" ? "KPBI" : "KPwDN"),
    regional: payload.regional || (payload.provinsi === "DKI Jakarta" ? "Kantor Pusat" : "Jawa"),
    kategori_isu: payload.kategori_isu || null,
    dampak: payload.dampak || "Tidak Ada",
    keterangan_dampak: payload.keterangan_dampak || null,
    nama_pelapor: payload.nama_pelapor || (_user?.name || null),
    info_awal: payload.info_awal || null,
    tindak_lanjut: payload.tindak_lanjut || null,
    progres_asistensi: payload.progres_asistensi || null,
    realisasi: payload.realisasi || null
  };

  const { data, error } = await supabase
    .from("protests")
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal menyimpan data ke Supabase: ${error.message}`);
  }

  return mapRowToProtest(data);
}

/**
 * 4. Update Protest in Supabase
 */
export async function updateProtestInSupabase(
  id: string,
  updates: Partial<ProtestEvent>
): Promise<ProtestEvent | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const existing = await getProtestByIdFromSupabase(id);
  if (!existing) return null;

  const patch: Record<string, any> = {
    updated_at: new Date().toISOString()
  };

  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.urgency !== undefined) patch.urgency = updates.urgency;
  if (updates.actual_crowd_size !== undefined) patch.actual_crowd_size = updates.actual_crowd_size;
  if (updates.situation_summary !== undefined) patch.situation_summary = updates.situation_summary;
  if (updates.editorial_draft !== undefined) patch.editorial_draft = updates.editorial_draft;
  if (updates.editorial_final !== undefined) patch.editorial_final = updates.editorial_final;
  if (updates.validated_lat !== undefined) {
    patch.validated_lat = updates.validated_lat;
    if (updates.validated_lat !== null) {
      patch.location_validation_status = "verified";
      patch.validated_at = new Date().toISOString();
    } else {
      patch.location_validation_status = "unmapped";
    }
  }
  if (updates.validated_lng !== undefined) {
    patch.validated_lng = updates.validated_lng;
    if (updates.validated_lng !== null && patch.location_validation_status !== "unmapped") {
      patch.location_validation_status = "verified";
      patch.validated_at = new Date().toISOString();
    }
  }
  if (updates.location_validation_status !== undefined) {
    patch.location_validation_status = updates.location_validation_status;
  }
  if (updates.suggested_lat !== undefined) patch.suggested_lat = updates.suggested_lat;
  if (updates.suggested_lng !== undefined) patch.suggested_lng = updates.suggested_lng;
  if (updates.suggested_address !== undefined) patch.suggested_address = updates.suggested_address;
  if (updates.geocoding_provider !== undefined) patch.geocoding_provider = updates.geocoding_provider;
  if (updates.geocoding_confidence !== undefined) patch.geocoding_confidence = updates.geocoding_confidence;
  if (updates.geocoding_alternatives !== undefined) patch.geocoding_alternatives = updates.geocoding_alternatives;
  if (updates.validated_by_id !== undefined) patch.validated_by_id = updates.validated_by_id ? ensureValidUuid(updates.validated_by_id) : null;
  if (updates.validated_by_name !== undefined) patch.validated_by_name = updates.validated_by_name;
  if (updates.is_archived !== undefined) patch.is_archived = updates.is_archived;
  if (updates.lokasi !== undefined) patch.lokasi = updates.lokasi;
  if (updates.isu_tuntutan !== undefined) patch.isu_tuntutan = updates.isu_tuntutan;
  if (updates.tanggal !== undefined) patch.tanggal = updates.tanggal;
  if (updates.waktu_mulai !== undefined) patch.waktu_mulai = updates.waktu_mulai ? normalizeTimeString(updates.waktu_mulai).time : null;
  if (updates.waktu_selesai !== undefined) patch.waktu_selesai = updates.waktu_selesai ? normalizeTimeString(updates.waktu_selesai).time : null;
  if (updates.titik_kumpul !== undefined) patch.titik_kumpul = updates.titik_kumpul;
  if (updates.sasaran_aksi !== undefined) patch.sasaran_aksi = updates.sasaran_aksi;
  if (updates.organisasi_kelompok !== undefined) patch.organisasi_kelompok = updates.organisasi_kelompok;
  if (updates.korlap_pimpinan !== undefined) patch.korlap_pimpinan = updates.korlap_pimpinan;
  if (updates.wilayah_hukum !== undefined) patch.wilayah_hukum = updates.wilayah_hukum;
  if (updates.provinsi !== undefined) patch.provinsi = updates.provinsi;
  if (updates.kota_kabupaten !== undefined) patch.kota_kabupaten = updates.kota_kabupaten;
  if (updates.completed_at !== undefined) patch.completed_at = updates.completed_at;
  if (updates.completed_by_id !== undefined) patch.completed_by_id = updates.completed_by_id ? ensureValidUuid(updates.completed_by_id) : null;
  if (updates.completed_by_name !== undefined) patch.completed_by_name = updates.completed_by_name;

  // Excel C:AC Source Attributes
  if (updates.urutan_bulan !== undefined) patch.urutan_bulan = updates.urutan_bulan;
  if (updates.kategori_kejadian !== undefined) patch.kategori_kejadian = updates.kategori_kejadian;
  if (updates.kp_kpw !== undefined) patch.kp_kpw = updates.kp_kpw;
  if (updates.regional !== undefined) patch.regional = updates.regional;
  if (updates.kategori_isu !== undefined) patch.kategori_isu = updates.kategori_isu;
  if (updates.dampak !== undefined) patch.dampak = updates.dampak;
  if (updates.keterangan_dampak !== undefined) patch.keterangan_dampak = updates.keterangan_dampak;
  if (updates.nama_pelapor !== undefined) patch.nama_pelapor = updates.nama_pelapor;
  if (updates.info_awal !== undefined) patch.info_awal = updates.info_awal;
  if (updates.tindak_lanjut !== undefined) patch.tindak_lanjut = updates.tindak_lanjut;
  if (updates.progres_asistensi !== undefined) patch.progres_asistensi = updates.progres_asistensi;
  if (updates.realisasi !== undefined) patch.realisasi = updates.realisasi;
  if (updates.status_sumber !== undefined) patch.status_sumber = updates.status_sumber;
  if (updates.tujuan !== undefined) patch.tujuan = updates.tujuan;
  if (updates.jarak_lokasi_unras !== undefined) patch.jarak_lokasi_unras = updates.jarak_lokasi_unras;
  if (updates.redaksi !== undefined) patch.redaksi = updates.redaksi;
  if (updates.last_outbound_synced_at !== undefined) patch.last_outbound_synced_at = updates.last_outbound_synced_at;
  if (updates.outbound_sync_status !== undefined) patch.outbound_sync_status = updates.outbound_sync_status;

  if (updates.tanggal !== undefined) {
    patch.tanggal = updates.tanggal;
    const tb = deriveTahunBulan(updates.tanggal);
    patch.tahun = updates.tahun !== undefined ? updates.tahun : tb.tahun;
    patch.bulan = updates.bulan !== undefined ? updates.bulan : tb.bulan;
    const timestamps = deriveEventTimestamps(updates.tanggal, updates.waktu_mulai || existing.waktu_mulai || "09:00 WIB");
    patch.event_datetime = timestamps.eventDatetimeIso;
  } else {
    if (updates.tahun !== undefined) patch.tahun = updates.tahun;
    if (updates.bulan !== undefined) patch.bulan = updates.bulan;
  }

  const { data, error } = await supabase
    .from("protests")
    .update(patch)
    .eq("id", existing.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal memperbarui data di Supabase: ${error.message}`);
  }

  return mapRowToProtest(data);
}

/**
 * 5. Update Status with History Audit in Supabase
 */
export async function updateStatusInSupabase(
  id: string,
  toStatus: string,
  reason: string | null,
  user: { id: string; name: string }
): Promise<ProtestEvent | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const existing = await getProtestByIdFromSupabase(id);
  if (!existing) return null;

  const fromStatus = existing.status;
  const isCompleted = toStatus === "completed";
  const isArchived = toStatus === "completed" || toStatus === "cancelled";
  const validUserId = ensureValidUuid(user.id);

  // Update status in protests
  const { data: updated, error: updateErr } = await supabase
    .from("protests")
    .update({
      status: toStatus,
      is_archived: isArchived,
      completed_at: isCompleted ? new Date().toISOString() : null,
      completed_by_id: isCompleted ? validUserId : null,
      completed_by_name: isCompleted ? user.name : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", existing.id)
    .select()
    .single();

  if (updateErr) {
    throw new Error(`Gagal mengubah status di Supabase: ${updateErr.message}`);
  }

  // Insert status history audit log
  const { error: histErr } = await supabase.from("protest_status_history").insert({
    protest_id: existing.id,
    from_status: fromStatus,
    to_status: toStatus,
    reason: reason || null,
    changed_by_id: validUserId,
    changed_by_name: user.name
  });
  if (histErr) {
    console.error("[updateStatusInSupabase] Warning: Failed to insert status history:", histErr.message);
  }

  return mapRowToProtest(updated);
}

/**
 * 5.1 Update Source-Owned Status Field (status_sumber) in Supabase
 * Strictly preserves operator-managed fields (status, urgency, validated_lat, etc.)
 */
export async function updateProtestSourceStatusInSupabase(
  id: string,
  newStatusSumber: SourceStatusCategory,
  rawSourceStatus?: string | null,
  actorName: string = "Power Automate Sync"
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const existing = await getProtestByIdFromSupabase(id);
  if (!existing) return false;

  const previous = existing.status_sumber || null;
  if (previous === newStatusSumber) return false;

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("protests")
    .update({
      status_sumber: newStatusSumber,
      updated_at: now
    })
    .eq("id", existing.id);

  if (updateErr) {
    console.error("[updateProtestSourceStatusInSupabase] Error updating status_sumber:", updateErr);
    throw new Error(`Gagal memperbarui status_sumber di Supabase: ${updateErr.message}`);
  }

  const toProtestStatus = mapSourceStatusToProtestStatus(newStatusSumber);
  const fromProtestStatus = previous ? mapSourceStatusToProtestStatus(previous) : existing.status;

  const { error: histErr } = await supabase.from("protest_status_history").insert({
    protest_id: existing.id,
    from_status: fromProtestStatus,
    to_status: toProtestStatus,
    reason: `Sinkronisasi status sumber Excel: '${rawSourceStatus || newStatusSumber}'`,
    changed_by_id: "power_automate",
    changed_by_name: actorName
  });

  if (histErr) {
    console.warn("[updateProtestSourceStatusInSupabase] Warning: Failed to insert status history:", histErr.message);
  }

  return true;
}

/**
 * 6. Operator Reports in Supabase
 */
export async function fetchReportsFromSupabase(protestId: string): Promise<ProtestOperatorReport[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const protest = await getProtestByIdFromSupabase(protestId);
  if (!protest) return [];

  const { data, error } = await supabase
    .from("protest_operator_reports")
    .select("*")
    .eq("protest_id", protest.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    protest_id: r.protest_id,
    report_type: r.report_type,
    author_id: r.author_id,
    author_name: r.author_name,
    author_role: r.author_role,
    content: r.content,
    crowd_estimate: r.crowd_estimate,
    is_pinned: Boolean(r.is_pinned),
    created_at: new Date(r.created_at).toISOString(),
    updated_at: new Date(r.updated_at).toISOString()
  }));
}

export async function addReportInSupabase(
  data: Partial<ProtestOperatorReport>,
  user?: any
): Promise<ProtestOperatorReport> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const protest = await getProtestByIdFromSupabase(data.protest_id!);
  if (!protest) throw new Error("Aksi unras tidak ditemukan.");

  const row = {
    protest_id: protest.id,
    report_type: data.report_type || "progress",
    author_id: ensureValidUuid(user?.id || data.author_id),
    author_name: user?.name || data.author_name,
    author_role: user?.role || data.author_role || "operator",
    content: data.content,
    crowd_estimate: data.crowd_estimate || null,
    is_pinned: Boolean(data.is_pinned)
  };

  const { data: created, error } = await supabase
    .from("protest_operator_reports")
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal menyimpan laporan ke Supabase: ${error.message}`);
  }

  // Also update situation_summary on protest
  await supabase
    .from("protests")
    .update({
      situation_summary: data.content,
      actual_crowd_size: data.crowd_estimate || undefined,
      updated_at: new Date().toISOString()
    })
    .eq("id", protest.id);

  return {
    id: created.id,
    protest_id: created.protest_id,
    report_type: created.report_type,
    author_id: created.author_id,
    author_name: created.author_name,
    author_role: created.author_role,
    content: created.content,
    crowd_estimate: created.crowd_estimate,
    is_pinned: Boolean(created.is_pinned),
    created_at: new Date(created.created_at).toISOString(),
    updated_at: new Date(created.updated_at).toISOString()
  };
}

/**
 * 7. Camera Links in Supabase
 */
export async function fetchCameraLinksFromSupabase(protestId: string): Promise<ProtestCameraLink[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const protest = await getProtestByIdFromSupabase(protestId);
  if (!protest) return [];

  const { data, error } = await supabase
    .from("protest_camera_links")
    .select("*")
    .eq("protest_id", protest.id);

  if (error || !data) return [];
  const cctvStore = getDataStore();
  return data.map((l) => {
    const cam = cctvStore.getCameraById(l.camera_id);
    return {
      id: l.id,
      protest_id: l.protest_id,
      camera_id: l.camera_id,
      camera_name: l.camera_name,
      camera_stream_url: l.camera_stream_url,
      camera_protocol: l.camera_protocol,
      camera_status: l.camera_status,
      distance_meters: Number(l.distance_meters) || 0,
      notes: l.notes,
      is_recommended: Boolean(l.is_recommended),
      linked_by_id: l.linked_by_id,
      linked_by_name: l.linked_by_name,
      created_at: new Date(l.created_at).toISOString(),
      camera: cam || {
        id: l.camera_id,
        name: l.camera_name,
        province_id: "",
        province_name: "",
        city_id: "",
        city_name: "",
        source_id: "",
        source_name: "",
        location: "",
        latitude: 0,
        longitude: 0,
        stream_url: l.camera_stream_url || "",
        source_url: "",
        protocol: (l.camera_protocol as any) || "HLS",
        status: (l.camera_status as any) || "ONLINE",
        last_checked_at: new Date().toISOString(),
        created_at: l.created_at,
        updated_at: l.created_at
      }
    };
  });
}

export async function linkCameraInSupabase(link: Partial<ProtestCameraLink>): Promise<ProtestCameraLink> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const protest = await getProtestByIdFromSupabase(link.protest_id!);
  if (!protest) throw new Error("Aksi unras tidak ditemukan.");

  const row = {
    protest_id: protest.id,
    camera_id: link.camera_id,
    camera_name: link.camera_name,
    camera_stream_url: link.camera_stream_url || null,
    camera_protocol: link.camera_protocol || null,
    camera_status: link.camera_status || "ONLINE",
    distance_meters: link.distance_meters || 0,
    notes: link.notes || null,
    is_recommended: Boolean(link.is_recommended),
    linked_by_id: ensureValidUuid(link.linked_by_id),
    linked_by_name: link.linked_by_name
  };

  const { data, error } = await supabase
    .from("protest_camera_links")
    .upsert(row, { onConflict: "protest_id,camera_id" })
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal menautkan kamera ke Supabase: ${error.message}`);
  }

  return {
    id: data.id,
    protest_id: data.protest_id,
    camera_id: data.camera_id,
    camera_name: data.camera_name,
    camera_stream_url: data.camera_stream_url,
    camera_protocol: data.camera_protocol,
    camera_status: data.camera_status,
    distance_meters: Number(data.distance_meters) || 0,
    notes: data.notes,
    is_recommended: Boolean(data.is_recommended),
    linked_by_id: data.linked_by_id,
    linked_by_name: data.linked_by_name,
    created_at: new Date(data.created_at).toISOString()
  };
}

export async function unlinkCameraInSupabase(protestId: string, cameraId: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const protest = await getProtestByIdFromSupabase(protestId);
  if (!protest) return false;

  const { error } = await supabase
    .from("protest_camera_links")
    .delete()
    .eq("protest_id", protest.id)
    .eq("camera_id", cameraId);

  return !error;
}

/**
 * 8. Status History in Supabase
 */
export async function fetchStatusHistoryFromSupabase(protestId: string): Promise<ProtestStatusHistory[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const protest = await getProtestByIdFromSupabase(protestId);
  if (!protest) return [];

  const { data, error } = await supabase
    .from("protest_status_history")
    .select("*")
    .eq("protest_id", protest.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map((h) => ({
    id: h.id,
    protest_id: h.protest_id,
    from_status: h.from_status,
    to_status: h.to_status,
    reason: h.reason,
    changed_by_id: h.changed_by_id,
    changed_by_name: h.changed_by_name,
    created_at: new Date(h.created_at).toISOString()
  }));
}

/**
 * 9. KPI Statistics Directly from Supabase
 */
export async function fetchStatsFromSupabase(): Promise<ProtestStats> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const [
    totalRes,
    schedRes,
    ongoingRes,
    monRes,
    compRes,
    cancRes,
    highCritRes,
    noCoordsRes,
    pendingValRes,
    verifiedLocRes,
    lastSyncRes,
    cameraLinksRes,
    sourceSchedRes,
    sourceOngoingRes,
    sourceCompRes,
    sourceNullRes
  ] = await Promise.all([
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status", "scheduled").eq("is_archived", false),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status", "ongoing").eq("is_archived", false),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status", "monitoring").eq("is_archived", false),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status", "completed"),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status", "cancelled"),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).in("urgency", ["high", "critical"]).eq("is_archived", false),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).or("validated_lat.is.null,validated_lng.is.null").eq("is_archived", false),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("location_validation_status", "pending_validation").eq("is_archived", false),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("location_validation_status", "verified"),
    supabase.from("protest_sync_logs").select("completed_at").eq("status", "success").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("protest_camera_links").select("*", { count: "exact", head: true }),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status_sumber", "Belum Berlangsung"),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status_sumber", "Sedang Berlangsung"),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status_sumber", "Selesai"),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).is("status_sumber", null)
  ]);

  const todayWib = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const startWib = new Date(`${todayWib}T00:00:00+07:00`);
  const endWib = new Date(startWib.getTime() + 86400000);
  const startUtcIso = startWib.toISOString();
  const endUtcIso = endWib.toISOString();

  const [todayRes, completedTodayRes] = await Promise.all([
    supabase
      .from("protests")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .or(`tanggal.eq.${todayWib},and(tanggal.is.null,event_datetime.gte.${startUtcIso},event_datetime.lt.${endUtcIso})`),
    supabase
      .from("protests")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "completed")
      .or(`tanggal.eq.${todayWib},completed_at.gte.${startUtcIso}`)
  ]);

  return {
    total_events: totalRes.count || 0,
    scheduled_events: schedRes.count || 0,
    ongoing_events: ongoingRes.count || 0,
    monitoring_events: monRes.count || 0,
    completed_events: compRes.count || 0,
    cancelled_events: cancRes.count || 0,
    high_critical_urgency: highCritRes.count || 0,
    events_without_coords: noCoordsRes.count || 0,
    pending_validation_count: pendingValRes.count || 0,
    verified_locations_count: verifiedLocRes.count || 0,
    today_events: todayRes.count || 0,
    completed_today: completedTodayRes.count || 0,
    total_camera_links: cameraLinksRes?.count || 0,
    last_successful_sync: lastSyncRes.data?.completed_at || null,
    source_status_scheduled: sourceSchedRes?.count || 0,
    source_status_ongoing: sourceOngoingRes?.count || 0,
    source_status_completed: sourceCompRes?.count || 0,
    source_status_unspecified: sourceNullRes?.count || 0
  };
}

/**
 * 9B. Daily UNRAS Situation Overview Directly from Supabase
 * Authoritative multi-point aggregation across all protest points for the specified monitoring date.
 */
export async function fetchDailySituationOverviewFromSupabase(dateStr: string): Promise<DailyUnrasSituationOverview> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const cleanDate = (dateStr || "").slice(0, 10) || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const startWib = new Date(`${cleanDate}T00:00:00+07:00`);
  const endWib = new Date(startWib.getTime() + 86400000);
  const startUtcIso = startWib.toISOString();
  const endUtcIso = endWib.toISOString();

  // Query today's non-deleted protests from Supabase
  const { data: rows, error } = await supabase
    .from("protests")
    .select("*")
    .is("deleted_at", null)
    .or(`tanggal.eq.${cleanDate},and(tanggal.is.null,event_datetime.gte.${startUtcIso},event_datetime.lt.${endUtcIso})`);

  if (error) {
    throw new Error(`Gagal memuat daily situation dari Supabase: ${error.message}`);
  }

  const protests: ProtestEvent[] = (rows || []).map(mapRowToProtest);
  const protestIds = protests.map((p) => p.id);

  // Batch query points and camera links if any protests exist today
  const allPointsMap = new Map<string, ProtestPoint[]>();
  const allLinksMap = new Map<string, ProtestCameraLink[]>();

  if (protestIds.length > 0) {
    try {
      const { data: ptRows, error: ptErr } = await supabase
        .from("protest_points")
        .select("*")
        .in("protest_id", protestIds);
      if (!ptErr && Array.isArray(ptRows)) {
        for (const r of ptRows) {
          const pt: ProtestPoint = {
            id: String(r.id),
            protest_id: String(r.protest_id),
            point_name: String(r.point_name),
            location_address: r.location_address ? String(r.location_address) : null,
            provinsi: r.provinsi ? String(r.provinsi) : null,
            kota_kabupaten: r.kota_kabupaten ? String(r.kota_kabupaten) : null,
            regional: r.regional ? String(r.regional) : null,
            latitude: r.latitude != null ? Number(r.latitude) : null,
            longitude: r.longitude != null ? Number(r.longitude) : null,
            status: normalizeProtestStatus(r.status),
            urgency: (r.urgency as ProtestUrgency) || "medium",
            notes: r.notes ? String(r.notes) : null,
            created_at: String(r.created_at),
            updated_at: String(r.updated_at)
          };
          const list = allPointsMap.get(pt.protest_id) || [];
          list.push(pt);
          allPointsMap.set(pt.protest_id, list);
        }
      }
    } catch {}

    try {
      const { data: linkRows, error: lkErr } = await supabase
        .from("protest_camera_links")
        .select("*")
        .in("protest_id", protestIds);
      if (!lkErr && Array.isArray(linkRows)) {
        const cctvStore = getDataStore();
        for (const r of linkRows) {
          const camId = r.camera_id ? String(r.camera_id).trim() : "";
          if (!camId) continue;
          const cam = cctvStore.getCameraById(camId);
          const lk: ProtestCameraLink = {
            id: String(r.id),
            protest_id: String(r.protest_id),
            point_id: r.point_id ? String(r.point_id) : undefined,
            camera_id: camId,
            camera_name: r.camera_name ? String(r.camera_name) : camId,
            camera_stream_url: r.camera_stream_url || undefined,
            camera_protocol: r.camera_protocol || undefined,
            camera_status: r.camera_status || "ONLINE",
            distance_meters: Number(r.distance_meters) || 0,
            notes: r.notes || null,
            is_recommended: Boolean(r.is_recommended),
            linked_by_id: String(r.linked_by_id),
            linked_by_name: String(r.linked_by_name),
            created_at: String(r.created_at),
            camera: cam || {
              id: camId,
              name: r.camera_name ? String(r.camera_name) : camId,
              province_id: "",
              province_name: "",
              city_id: "",
              city_name: "",
              source_id: "",
              source_name: "",
              location: "",
              latitude: 0,
              longitude: 0,
              stream_url: r.camera_stream_url || "",
              source_url: "",
              protocol: (r.camera_protocol as any) || "HLS",
              status: (r.camera_status as any) || "ONLINE",
              last_checked_at: new Date().toISOString(),
              created_at: String(r.created_at),
              updated_at: String(r.created_at)
            }
          };
          const list = allLinksMap.get(lk.protest_id) || [];
          if (!list.some((existing) => existing.camera_id === lk.camera_id)) {
            list.push(lk);
            allLinksMap.set(lk.protest_id, list);
          }
        }
      }
    } catch {}
  }

  const allPoints: ProtestPoint[] = [];
  const affectedProvincesSet = new Set<string>();
  const affectedRegionsSet = new Set<string>();
  const linkedCameraIdsSet = new Set<string>();
  let totalIdentifiedElements = 0;

  for (const p of protests) {
    if (p.provinsi && p.provinsi.trim()) affectedProvincesSet.add(p.provinsi.trim());
    if (p.regional && p.regional.trim()) affectedRegionsSet.add(p.regional.trim());

    let points = allPointsMap.get(p.id) || [];
    if (points.length === 0) {
      points = synthesizePointsForLegacyEvent(p);
    }

    const cameraLinks = allLinksMap.get(p.id) || [];
    for (const link of cameraLinks) {
      linkedCameraIdsSet.add(link.camera_id);
    }

    for (const pt of points) {
      pt.parent_title = p.isu_tuntutan;
      pt.parent_kode_unras = p.kode_unras;
      pt.parent_id_kejadian = p.id_kejadian;
      pt.parent_tanggal = p.tanggal;

      if (points.length === 1) {
        pt.linked_cameras = cameraLinks;
        pt.linked_camera_count = cameraLinks.length;
      } else {
        const ptLinks = cameraLinks.filter((l) => l.point_id === pt.id);
        pt.linked_cameras = ptLinks;
        pt.linked_camera_count = ptLinks.length;
      }

      if (pt.elements) {
        totalIdentifiedElements += pt.elements.length;
      }

      allPoints.push(pt);
    }
  }

  // Sort points: ongoing > monitoring > scheduled > others, then urgency, then crowd size DESC
  const statusWeight: Record<ProtestStatus, number> = {
    ongoing: 4,
    monitoring: 3,
    scheduled: 2,
    completed: 1,
    cancelled: 0
  };
  const urgencyWeight: Record<ProtestUrgency, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1
  };

  allPoints.sort((a, b) => {
    const sA = statusWeight[a.status] || 0;
    const sB = statusWeight[b.status] || 0;
    if (sA !== sB) return sB - sA;

    const uA = urgencyWeight[a.urgency] || 0;
    const uB = urgencyWeight[b.urgency] || 0;
    if (uA !== uB) return uB - uA;

    return (b.current_crowd_total || 0) - (a.current_crowd_total || 0);
  });

  const ongoingCount = allPoints.filter((pt) => pt.status === "ongoing").length;
  const monitoringCount = allPoints.filter((pt) => pt.status === "monitoring").length;
  const scheduledCount = allPoints.filter((pt) => pt.status === "scheduled").length;
  const completedCount = allPoints.filter((pt) => pt.status === "completed").length;
  const totalActivePoints = ongoingCount + monitoringCount;

  const totalEstimatedCrowd = allPoints.reduce((sum, pt) => sum + (pt.current_crowd_total || 0), 0);

  return {
    selected_date: cleanDate,
    total_events: protests.length,
    total_points: allPoints.length,
    total_active_points: totalActivePoints,
    ongoing_points_count: ongoingCount,
    monitoring_points_count: monitoringCount,
    scheduled_points_count: scheduledCount,
    completed_points_count: completedCount,
    total_estimated_crowd: totalEstimatedCrowd,
    total_identified_elements: totalIdentifiedElements,
    affected_provinces_count: affectedProvincesSet.size,
    affected_provinces: Array.from(affectedProvincesSet).sort(),
    affected_regions_count: affectedRegionsSet.size,
    affected_regions: Array.from(affectedRegionsSet).sort(),
    linked_cctv_count: linkedCameraIdsSet.size,
    points: allPoints
  };
}

/**
 * 10. Sync Logs in Supabase
 */
export async function fetchSyncLogsFromSupabase(limit = 10): Promise<ProtestSyncLog[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("protest_sync_logs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((l) => ({
    id: l.id,
    started_at: new Date(l.started_at).toISOString(),
    completed_at: l.completed_at ? new Date(l.completed_at).toISOString() : null,
    period_start: l.period_start ? new Date(l.period_start).toISOString() : undefined,
    period_end: l.period_end ? new Date(l.period_end).toISOString() : undefined,
    status: l.status,
    triggered_by: l.triggered_by,
    triggered_by_user: l.triggered_by_user,
    source_worksheet: l.source_worksheet,
    records_received: l.records_received || 0,
    records_processed: l.records_processed || 0,
    records_created: l.records_created || 0,
    records_updated: l.records_updated || 0,
    records_skipped: l.records_skipped || 0,
    records_failed: l.records_failed || 0,
    error_details: l.error_details,
    duration_ms: l.duration_ms
  }));
}

export async function createSyncLogInSupabase(log: Partial<ProtestSyncLog>): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase.from("protest_sync_logs").insert({
    id: log.id,
    started_at: log.started_at || new Date().toISOString(),
    period_start: log.period_start || null,
    period_end: log.period_end || null,
    status: log.status || "running",
    triggered_by: log.triggered_by || "system",
    triggered_by_user: log.triggered_by_user || null,
    source_worksheet: log.source_worksheet || "NEW UNRAS 2022-2026",
    records_received: log.records_received || 0,
    records_processed: log.records_processed || 0,
    records_created: log.records_created || 0,
    records_updated: log.records_updated || 0,
    records_skipped: log.records_skipped || 0,
    records_failed: log.records_failed || 0
  });
}

export async function updateSyncLogInSupabase(id: string, log: Partial<ProtestSyncLog>): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase
    .from("protest_sync_logs")
    .update({
      completed_at: log.completed_at || new Date().toISOString(),
      status: log.status,
      records_processed: log.records_processed,
      records_created: log.records_created,
      records_updated: log.records_updated,
      records_skipped: log.records_skipped,
      records_failed: log.records_failed,
      error_details: log.error_details || null,
      duration_ms: log.duration_ms || null
    })
    .eq("id", id);
}

export async function fetchSyncLogByIdFromSupabase(id: string): Promise<ProtestSyncLog | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("protest_sync_logs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as ProtestSyncLog;
}

/**
 * 11. Idempotent Batch Upsert from Excel into Supabase
 * Strictly preserves operator fields: status, reports, validated_lat, validated_lng,
 * crowd count, and operator notes.
 */
export async function upsertExcelBatchInSupabase(
  records: Array<{
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
  }>
): Promise<{ inserted: number; updated: number; skipped: number; failed: number; error?: string | null }> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let lastError: string | null = null;
  const now = new Date().toISOString();

  for (const rec of records) {
    if (!rec.id_kejadian || !rec.isu_tuntutan || !rec.lokasi) {
      skipped++;
      continue;
    }

    try {
      // Validate & normalize time inputs to PostgreSQL TIME (HH:MM:SS) format
      const normStart = normalizeTimeString(rec.waktu_mulai);
      if (normStart.error) {
        lastError = `[ID: ${rec.id_kejadian}] Field 'waktu_mulai' tidak valid: ${normStart.error}`;
        console.error(lastError);
        failed++;
        continue;
      }

      const normEnd = normalizeTimeString(rec.waktu_selesai);
      if (normEnd.error) {
        lastError = `[ID: ${rec.id_kejadian}] Field 'waktu_selesai' tidak valid: ${normEnd.error}`;
        console.error(lastError);
        failed++;
        continue;
      }

      // Check if row already exists in Supabase by kode_unras or id_kejadian
      let existing: any = null;
      if (rec.kode_unras) {
        const { data: byKode, error: errKode } = await supabase
          .from("protests")
          .select("id, id_kejadian, status, validated_lat, validated_lng, actual_crowd_size, situation_summary, editorial_draft, editorial_final, is_archived, source_type")
          .eq("kode_unras", rec.kode_unras)
          .is("deleted_at", null)
          .maybeSingle();
        if (!errKode && byKode) existing = byKode;
      }
      if (!existing && rec.id_kejadian) {
        const { data: byId, error: findErr } = await supabase
          .from("protests")
          .select("id, id_kejadian, status, validated_lat, validated_lng, actual_crowd_size, situation_summary, editorial_draft, editorial_final, is_archived, source_type")
          .eq("id_kejadian", rec.id_kejadian)
          .is("deleted_at", null)
          .maybeSingle();

        if (findErr) {
          lastError = findErr.message || JSON.stringify(findErr);
          console.error("[Supabase upsert findErr]", findErr);
          failed++;
          continue;
        }
        existing = byId;
      }

      if (existing) {
        // FULL OVERWRITE FOR MATCHED RECORD IN SUPABASE
        const updatePayload: Record<string, any> = {
          updated_at: now,
          last_synced_at: now
        };
        if (rec.tanggal !== undefined) updatePayload.tanggal = rec.tanggal;
        if (normStart.time !== undefined) updatePayload.waktu_mulai = normStart.time;
        if (normEnd.time !== undefined) updatePayload.waktu_selesai = normEnd.time;
        if (rec.event_datetime !== undefined) updatePayload.event_datetime = rec.event_datetime;
        if (rec.lokasi !== undefined) updatePayload.lokasi = rec.lokasi;
        if (rec.titik_kumpul !== undefined) updatePayload.titik_kumpul = rec.titik_kumpul;
        if (rec.sasaran_aksi !== undefined) updatePayload.sasaran_aksi = rec.sasaran_aksi;
        if (rec.isu_tuntutan !== undefined) updatePayload.isu_tuntutan = rec.isu_tuntutan;
        if (rec.estimasi_massa_source !== undefined) updatePayload.estimasi_massa_source = rec.estimasi_massa_source;
        if (rec.organisasi_kelompok !== undefined) updatePayload.organisasi_kelompok = rec.organisasi_kelompok;
        if (rec.korlap_pimpinan !== undefined) updatePayload.korlap_pimpinan = rec.korlap_pimpinan;
        if (rec.wilayah_hukum !== undefined) updatePayload.wilayah_hukum = rec.wilayah_hukum;
        if (rec.provinsi !== undefined) updatePayload.provinsi = rec.provinsi;
        if (rec.kota_kabupaten !== undefined) updatePayload.kota_kabupaten = rec.kota_kabupaten;
        if (rec.keterangan_source !== undefined) updatePayload.keterangan_source = rec.keterangan_source;
        if ((rec as any).status !== undefined) updatePayload.status = (rec as any).status;
        if ((rec as any).status_sumber !== undefined) updatePayload.status_sumber = (rec as any).status_sumber;
        if ((rec as any).regional !== undefined) updatePayload.regional = (rec as any).regional;
        if ((rec as any).kategori_isu !== undefined) updatePayload.kategori_isu = (rec as any).kategori_isu;
        if ((rec as any).dampak !== undefined) updatePayload.dampak = (rec as any).dampak;
        if ((rec as any).keterangan_dampak !== undefined) updatePayload.keterangan_dampak = (rec as any).keterangan_dampak;
        if ((rec as any).nama_pelapor !== undefined) updatePayload.nama_pelapor = (rec as any).nama_pelapor;
        if ((rec as any).info_awal !== undefined) updatePayload.info_awal = (rec as any).info_awal;
        if ((rec as any).tindak_lanjut !== undefined) updatePayload.tindak_lanjut = (rec as any).tindak_lanjut;
        if ((rec as any).progres_asistensi !== undefined) updatePayload.progres_asistensi = (rec as any).progres_asistensi;
        if ((rec as any).realisasi !== undefined) updatePayload.realisasi = (rec as any).realisasi;
        if ((rec as any).tujuan !== undefined) updatePayload.tujuan = (rec as any).tujuan;
        if ((rec as any).jarak_lokasi_unras !== undefined) updatePayload.jarak_lokasi_unras = (rec as any).jarak_lokasi_unras;
        if ((rec as any).redaksi !== undefined) {
          updatePayload.redaksi = (rec as any).redaksi;
          updatePayload.editorial_draft = (rec as any).redaksi;
        }
        if ((rec as any).kp_kpw !== undefined) updatePayload.kp_kpw = (rec as any).kp_kpw;
        if (rec.raw_source_payload !== undefined) updatePayload.raw_source_payload = rec.raw_source_payload;

        const { error: updErr } = await supabase.from("protests").update(updatePayload).eq("id", existing.id);
        if (updErr) {
          lastError = updErr.message || JSON.stringify(updErr);
          console.error("[Supabase upsert updErr]", updErr);
          failed++;
        } else {
          updated++;
        }
        continue;
      }

      // Auto-geocode suggestion for new row if coordinates are missing
      let geoSuggestion: any = null;
      if (!rec.validated_lat || !rec.validated_lng) {
        try {
          geoSuggestion = await geocodingService.geocodeProtestEvent(rec);
        } catch (geoErr) {
          console.warn(`[AutoGeocode skip on insert ${rec.id_kejadian}]:`, geoErr);
        }
      }

      // INSERT NEW ROW
      const hasDirectCoords = rec.validated_lat !== undefined && rec.validated_lat !== null && rec.validated_lng !== undefined && rec.validated_lng !== null;
      const insertPayload = {
        id_kejadian: rec.id_kejadian,
        kode_unras: rec.kode_unras,
        tanggal: rec.tanggal,
        waktu_mulai: normStart.time,
        waktu_selesai: normEnd.time,
        event_datetime: rec.event_datetime || `${rec.tanggal}T09:00:00+07:00`,
        lokasi: rec.lokasi,
        titik_kumpul: rec.titik_kumpul || null,
        sasaran_aksi: rec.sasaran_aksi || null,
        isu_tuntutan: rec.isu_tuntutan,
        estimasi_massa_source: rec.estimasi_massa_source || null,
        organisasi_kelompok: rec.organisasi_kelompok || null,
        korlap_pimpinan: rec.korlap_pimpinan || null,
        wilayah_hukum: rec.wilayah_hukum || null,
        provinsi: rec.provinsi || "DKI Jakarta",
        kota_kabupaten: rec.kota_kabupaten || null,
        keterangan_source: rec.keterangan_source || null,
        status: (rec as any).status || "scheduled",
        status_sumber: (rec as any).status_sumber || null,
        urgency: "medium",
        source_type: "excel_sync",
        validated_lat: hasDirectCoords ? rec.validated_lat : null,
        validated_lng: hasDirectCoords ? rec.validated_lng : null,
        location_validation_status: hasDirectCoords
          ? "verified"
          : (geoSuggestion?.suggested_lat ? geoSuggestion.location_validation_status : "unmapped"),
        suggested_lat: geoSuggestion?.suggested_lat || null,
        suggested_lng: geoSuggestion?.suggested_lng || null,
        suggested_address: geoSuggestion?.suggested_address || null,
        geocoding_provider: geoSuggestion?.geocoding_provider || null,
        geocoding_confidence: geoSuggestion?.geocoding_confidence || null,
        geocoding_alternatives: geoSuggestion?.geocoding_alternatives || [],
        raw_source_payload: rec.raw_source_payload || {},
        last_synced_at: now,
        created_at: now,
        updated_at: now
      };

      if ((rec as any).regional) (insertPayload as any).regional = (rec as any).regional;
      if ((rec as any).kategori_isu) (insertPayload as any).kategori_isu = (rec as any).kategori_isu;
      if ((rec as any).dampak) (insertPayload as any).dampak = (rec as any).dampak;
      if ((rec as any).keterangan_dampak) (insertPayload as any).keterangan_dampak = (rec as any).keterangan_dampak;
      if ((rec as any).nama_pelapor) (insertPayload as any).nama_pelapor = (rec as any).nama_pelapor;
      if ((rec as any).info_awal) (insertPayload as any).info_awal = (rec as any).info_awal;
      if ((rec as any).tindak_lanjut) (insertPayload as any).tindak_lanjut = (rec as any).tindak_lanjut;
      if ((rec as any).progres_asistensi) (insertPayload as any).progres_asistensi = (rec as any).progres_asistensi;
      if ((rec as any).realisasi) (insertPayload as any).realisasi = (rec as any).realisasi;
      if ((rec as any).tujuan) (insertPayload as any).tujuan = (rec as any).tujuan;
      if ((rec as any).jarak_lokasi_unras) (insertPayload as any).jarak_lokasi_unras = (rec as any).jarak_lokasi_unras;
      if ((rec as any).redaksi) {
        (insertPayload as any).redaksi = (rec as any).redaksi;
        (insertPayload as any).editorial_draft = (rec as any).redaksi;
      }
      if ((rec as any).kp_kpw) (insertPayload as any).kp_kpw = (rec as any).kp_kpw;

      const { error: insErr } = await supabase.from("protests").insert(insertPayload);
      if (insErr) {
        if (insErr.code === "23505" || String(insErr.message).includes("duplicate key") || String(insErr.message).includes("unique constraint")) {
          skipped++;
        } else {
          lastError = insErr.message || JSON.stringify(insErr);
          console.error("[Supabase upsert insErr]", insErr);
          failed++;
        }
      } else {
        inserted++;

        // Persist identity registry entries to Supabase so future sync runs can match even when Excel IDs are missing
        try {
          const tgl = rec.tanggal || (rec.event_datetime ? rec.event_datetime.slice(0, 10) : now.slice(0, 10));
          const fpExact = generateExactFingerprint(tgl, rec.lokasi, rec.organisasi_kelompok, rec.isu_tuntutan);
          const fpSem = generateSemanticFingerprint(tgl, rec.organisasi_kelompok, rec.isu_tuntutan);
          const srcKey = generateSourceKey(rec.kode_unras, rec.lokasi);

          const idEntries: Array<{
            canonical_id: string;
            identity_type: string;
            identity_key: string;
            event_date: string;
            confidence: string;
            metadata: Record<string, unknown>;
          }> = [
            {
              canonical_id: rec.id_kejadian,
              identity_type: "alias",
              identity_key: `ID:${rec.id_kejadian}`,
              event_date: tgl,
              confidence: "confirmed",
              metadata: {}
            }
          ];

          if (rec.kode_unras) {
            const cleanKode = String(rec.kode_unras).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (cleanKode) {
              idEntries.push({
                canonical_id: rec.id_kejadian,
                identity_type: "source_id",
                identity_key: `UNRAS:${cleanKode}`,
                event_date: tgl,
                confidence: "confirmed",
                metadata: {}
              });
              idEntries.push({
                canonical_id: rec.id_kejadian,
                identity_type: "source_id",
                identity_key: `SRC:${cleanKode}`,
                event_date: tgl,
                confidence: "confirmed",
                metadata: {}
              });
            }
          }

          await supabase.from("unras_identity_registry").upsert(idEntries, { onConflict: "identity_key" });
        } catch (regErr) {
          console.warn(`[Supabase identity registry upsert warning ${rec.id_kejadian}]:`, regErr);
        }
      }
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.error("[Supabase upsert catch]", err);
      failed++;
    }
  }

  return { inserted, updated, skipped, failed, error: lastError };
}

/**
 * Fetches all persistent identity mapping keys from Supabase unras_identity_registry
 */
export async function fetchIdentityKeysFromSupabase(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const supabase = getSupabaseAdminClient();
  if (!supabase) return map;

  try {
    const { data, error } = await supabase
      .from("unras_identity_registry")
      .select("identity_key, canonical_id");

    if (!error && Array.isArray(data)) {
      for (const r of data) {
        if (r.identity_key && r.canonical_id) {
          map.set(r.identity_key, r.canonical_id);
        }
      }
    }

    const { data: protestsData } = await supabase
      .from("protests")
      .select("id_kejadian, kode_unras")
      .is("deleted_at", null);

    if (Array.isArray(protestsData)) {
      for (const p of protestsData) {
        if (p.id_kejadian) map.set(`ID:${p.id_kejadian}`, p.id_kejadian);
        if (p.kode_unras) {
          const clean = String(p.kode_unras).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (clean) {
            map.set(`UNRAS:${clean}`, p.id_kejadian);
            map.set(`SRC:${clean}`, p.id_kejadian);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Supabase] fetchIdentityKeysFromSupabase error:", err);
  }
  return map;
}

/**
 * Fetches active (non-deleted) protests for a specific date from Supabase
 */
export async function fetchProtestsByDateFromSupabase(dateStr: string): Promise<ExistingProtestComparisonItem[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("protests")
      .select("id, id_kejadian, kode_unras, tanggal, lokasi, organisasi_kelompok, isu_tuntutan, created_at")
      .eq("tanggal", dateStr)
      .is("deleted_at", null);

    if (!error && Array.isArray(data)) {
      return data as ExistingProtestComparisonItem[];
    }
  } catch (err) {
    console.warn("[Supabase] fetchProtestsByDateFromSupabase error:", err);
  }
  return [];
}

/**
 * Persists an array of IdentityRegistryEntry items into Supabase unras_identity_registry
 */
export async function registerIdentityEntriesInSupabase(entries: IdentityRegistryEntry[]): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase || entries.length === 0) return;

  try {
    const payload = entries.map((e) => ({
      canonical_id: e.canonical_id,
      identity_type: e.identity_type,
      identity_key: e.identity_key,
      event_date: e.event_date,
      confidence: e.confidence,
      metadata: e.metadata || {}
    }));

    await supabase.from("unras_identity_registry").upsert(payload, { onConflict: "identity_key" });
  } catch (err) {
    console.warn("[Supabase] registerIdentityEntriesInSupabase error:", err);
  }
}


