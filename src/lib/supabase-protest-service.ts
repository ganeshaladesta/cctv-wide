/**
 * SCC - EAGLE EYES: Supabase Protest Persistence Service
 * Authoritative cloud database client for PostgreSQL / Supabase
 */

import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";
import {
  ProtestEvent,
  ProtestFilterParams,
  ProtestStats,
  ProtestStatusHistory,
  ProtestOperatorReport,
  ProtestCameraLink,
  ProtestSyncLog
} from "./types/protests";

export { isSupabaseConfigured };

/**
 * Format database row into typed ProtestEvent
 */
function mapRowToProtest(row: any): ProtestEvent {
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
    status: row.status || "scheduled",
    urgency: row.urgency || "medium",
    category_id: row.category_id,
    category_name: row.category_name,
    validated_lat: row.validated_lat !== null && row.validated_lat !== undefined ? Number(row.validated_lat) : null,
    validated_lng: row.validated_lng !== null && row.validated_lng !== undefined ? Number(row.validated_lng) : null,
    has_coordinates: Boolean(row.has_coordinates || (row.validated_lat !== null && row.validated_lng !== null)),
    actual_crowd_size: row.actual_crowd_size,
    situation_summary: row.situation_summary,
    editorial_draft: row.editorial_draft,
    editorial_final: row.editorial_final,
    is_archived: Boolean(row.is_archived),
    completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    completed_by_id: row.completed_by_id,
    completed_by_name: row.completed_by_name,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    last_synced_at: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
    source_type: row.source_type || (row.raw_source_payload?.source_type) || "excel_sync"
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
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
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
    } else if (filters.status !== "all") {
      query = query.eq("status", filters.status);
    }
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

  // Full-text search
  if (filters.q && filters.q.trim()) {
    const term = `%${filters.q.trim()}%`;
    query = query.or(
      `isu_tuntutan.ilike.${term},lokasi.ilike.${term},organisasi_kelompok.ilike.${term},kode_unras.ilike.${term},id_kejadian.ilike.${term}`
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

  return {
    total: count || 0,
    page,
    limit,
    data: (data || []).map(mapRowToProtest)
  };
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
  return mapRowToProtest(data);
}

/**
 * 3. Create Protest Event in Supabase
 */
export async function createProtestInSupabase(
  payload: Partial<ProtestEvent> & { source_type?: string },
  user?: any
): Promise<ProtestEvent> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const row = {
    id_kejadian: payload.id_kejadian || `MANUAL-${Date.now()}`,
    kode_unras: payload.kode_unras || `UR-${Date.now().toString().slice(-6)}`,
    tanggal: payload.tanggal,
    waktu_mulai: payload.waktu_mulai ? payload.waktu_mulai.slice(0, 8) : null,
    waktu_selesai: payload.waktu_selesai ? payload.waktu_selesai.slice(0, 8) : null,
    event_datetime: payload.event_datetime || (payload.tanggal ? `${payload.tanggal}T09:00:00+07:00` : new Date().toISOString()),
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
    actual_crowd_size: payload.actual_crowd_size || null,
    situation_summary: payload.situation_summary || null,
    editorial_draft: payload.editorial_draft || null,
    editorial_final: payload.editorial_final || null,
    is_archived: Boolean(payload.is_archived),
    source_type: payload.source_type || "manual",
    raw_source_payload: { source_type: payload.source_type || "manual" }
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
  if (updates.validated_lat !== undefined) patch.validated_lat = updates.validated_lat;
  if (updates.validated_lng !== undefined) patch.validated_lng = updates.validated_lng;
  if (updates.is_archived !== undefined) patch.is_archived = updates.is_archived;
  if (updates.lokasi !== undefined) patch.lokasi = updates.lokasi;
  if (updates.isu_tuntutan !== undefined) patch.isu_tuntutan = updates.isu_tuntutan;
  if (updates.tanggal !== undefined) patch.tanggal = updates.tanggal;
  if (updates.titik_kumpul !== undefined) patch.titik_kumpul = updates.titik_kumpul;
  if (updates.sasaran_aksi !== undefined) patch.sasaran_aksi = updates.sasaran_aksi;
  if (updates.organisasi_kelompok !== undefined) patch.organisasi_kelompok = updates.organisasi_kelompok;
  if (updates.korlap_pimpinan !== undefined) patch.korlap_pimpinan = updates.korlap_pimpinan;
  if (updates.wilayah_hukum !== undefined) patch.wilayah_hukum = updates.wilayah_hukum;
  if (updates.provinsi !== undefined) patch.provinsi = updates.provinsi;
  if (updates.kota_kabupaten !== undefined) patch.kota_kabupaten = updates.kota_kabupaten;
  if (updates.completed_at !== undefined) patch.completed_at = updates.completed_at;
  if (updates.completed_by_id !== undefined) patch.completed_by_id = updates.completed_by_id;
  if (updates.completed_by_name !== undefined) patch.completed_by_name = updates.completed_by_name;

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

  // Update status in protests
  const { data: updated, error: updateErr } = await supabase
    .from("protests")
    .update({
      status: toStatus,
      completed_at: isCompleted ? new Date().toISOString() : null,
      completed_by_id: isCompleted ? user.id : null,
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
  await supabase.from("protest_status_history").insert({
    protest_id: existing.id,
    from_status: fromStatus,
    to_status: toStatus,
    reason: reason || null,
    changed_by_id: user.id,
    changed_by_name: user.name
  });

  return mapRowToProtest(updated);
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
    author_id: data.author_id,
    author_name: data.author_name,
    author_role: data.author_role || "operator",
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
  return data.map((l) => ({
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
    created_at: new Date(l.created_at).toISOString()
  }));
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
    linked_by_id: link.linked_by_id,
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
    lastSyncRes
  ] = await Promise.all([
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status", "scheduled"),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status", "ongoing"),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status", "monitoring"),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status", "completed"),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status", "cancelled"),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).in("urgency", ["high", "critical"]),
    supabase.from("protests").select("*", { count: "exact", head: true }).is("deleted_at", null).or("validated_lat.is.null,validated_lng.is.null"),
    supabase.from("protest_sync_logs").select("completed_at").eq("status", "success").order("completed_at", { ascending: false }).limit(1).maybeSingle()
  ]);

  const today = new Date().toISOString().split("T")[0];
  const { count: todayCount } = await supabase
    .from("protests")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("tanggal", today);

  const { count: completedTodayCount } = await supabase
    .from("protests")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("status", "completed")
    .eq("tanggal", today);

  return {
    total_events: totalRes.count || 0,
    scheduled_events: schedRes.count || 0,
    ongoing_events: ongoingRes.count || 0,
    monitoring_events: monRes.count || 0,
    completed_events: compRes.count || 0,
    cancelled_events: cancRes.count || 0,
    high_critical_urgency: highCritRes.count || 0,
    events_without_coords: noCoordsRes.count || 0,
    today_events: todayCount || 0,
    completed_today: completedTodayCount || 0,
    total_camera_links: 0,
    last_successful_sync: lastSyncRes.data?.completed_at || null
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
): Promise<{ processed: number; created: number; inserted: number; updated: number; skipped: number; failed: number }> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const now = new Date().toISOString();

  for (const rec of records) {
    if (!rec.id_kejadian || !rec.isu_tuntutan || !rec.lokasi) {
      skipped++;
      continue;
    }

    try {
      // Check if row already exists in Supabase
      const { data: existing, error: findErr } = await supabase
        .from("protests")
        .select("id, id_kejadian, status, validated_lat, validated_lng, actual_crowd_size, situation_summary, editorial_draft, editorial_final, is_archived, source_type")
        .eq("id_kejadian", rec.id_kejadian)
        .maybeSingle();

      if (findErr) {
        failed++;
        continue;
      }

      if (existing) {
        // UPDATE EXCEL FIELDS ONLY — DO NOT TOUCH OPERATOR FIELDS
        const updatePayload: Record<string, any> = {
          kode_unras: rec.kode_unras,
          tanggal: rec.tanggal,
          waktu_mulai: rec.waktu_mulai ? rec.waktu_mulai.slice(0, 8) : null,
          waktu_selesai: rec.waktu_selesai ? rec.waktu_selesai.slice(0, 8) : null,
          event_datetime: rec.event_datetime || null,
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
          last_synced_at: now,
          updated_at: now
        };

        // If coordinates not validated by operator yet, apply Excel coords if present
        if (existing.validated_lat === null && existing.validated_lng === null) {
          if (rec.validated_lat !== undefined && rec.validated_lng !== undefined) {
            updatePayload.validated_lat = rec.validated_lat;
            updatePayload.validated_lng = rec.validated_lng;
          }
        }

        const { error: updErr } = await supabase
          .from("protests")
          .update(updatePayload)
          .eq("id", existing.id);

        if (updErr) {
          failed++;
        } else {
          updated++;
        }
      } else {
        // INSERT NEW ROW
        const insertPayload = {
          id_kejadian: rec.id_kejadian,
          kode_unras: rec.kode_unras,
          tanggal: rec.tanggal,
          waktu_mulai: rec.waktu_mulai ? rec.waktu_mulai.slice(0, 8) : null,
          waktu_selesai: rec.waktu_selesai ? rec.waktu_selesai.slice(0, 8) : null,
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
          status: "scheduled",
          urgency: "medium",
          source_type: "excel_sync",
          validated_lat: rec.validated_lat ?? null,
          validated_lng: rec.validated_lng ?? null,
          raw_source_payload: rec.raw_source_payload || {},
          last_synced_at: now,
          created_at: now,
          updated_at: now
        };

        const { error: insErr } = await supabase.from("protests").insert(insertPayload);
        if (insErr) {
          failed++;
        } else {
          inserted++;
        }
      }
    } catch {
      failed++;
    }
  }

  return { processed: records.length, created: inserted, inserted, updated, skipped, failed };
}
