/**
 * SCC - EAGLE EYES — Unjuk Rasa (Protest) Monitoring Types & Interfaces
 * Copyright: Developed by Ganesha Ladesta
 */

import { Camera } from "@/lib/types";

export type ProtestStatus =
  | "scheduled" // Rencana / Terjadwal
  | "ongoing" // Sedang Berlangsung
  | "monitoring" // Dalam Pemantauan Khusus
  | "completed" // Selesai / Terkendali
  | "cancelled"; // Batal / Tidak Jadi

export type ProtestUrgency = "low" | "medium" | "high" | "critical";

export type ReportType =
  | "initial" // Info Awal
  | "progress" // Perkembangan / Follow-up
  | "summary"; // Situasi Akhir / Summary

export type UserRole = "admin" | "operator" | "viewer";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  agency?: string;
}

export interface ProtestCategory {
  id: string;
  code: string;
  name: string;
  description?: string;
  color?: string;
}

/**
 * Protest Event Model
 * Source Excel fields from worksheet 'NEW UNRAS 2022-2026' are strictly separated
 * from operator-managed and system fields.
 */
export interface ProtestEvent {
  // Primary & Identity Keys
  id: string; // UUID primary key
  id_kejadian: string; // Excel: ID KEJADIAN (external unique identity)
  kode_unras: string; // Excel: KODE_UNRAS (external reference)

  // Source Excel Ingested Attributes
  tanggal: string; // YYYY-MM-DD
  waktu_mulai: string | null; // HH:mm:ss or HH:mm
  waktu_selesai: string | null; // HH:mm:ss or HH:mm
  event_datetime?: string | null; // ISO 8601 timestamp from 'WAKTU DAN TGL KEJADIAN ISO'
  lokasi: string; // Lokasi / Tempat Aksi
  titik_kumpul: string | null; // Titik Kumpul massa
  sasaran_aksi: string | null; // Sasaran / Objek Aksi
  isu_tuntutan: string; // Tuntutan / Isu yang diangkat
  estimasi_massa_source: number | null; // Estimasi massa dari Excel
  organisasi_kelompok: string | null; // Elemen / Ormas / Aliansi
  korlap_pimpinan: string | null; // Koordinator Lapangan / Pimpinan Aksi
  wilayah_hukum: string | null; // Polda / Polres wilayah hukum
  provinsi: string | null; // Nama Provinsi
  kota_kabupaten: string | null; // Nama Kota/Kabupaten
  keterangan_source: string | null; // Catatan asli dari sumber Excel
  raw_source_payload?: Record<string, unknown>; // JSON dump dari row asli Excel

  // Excel C:AC Source Attributes
  urutan_bulan?: number | null; // Col B: Urutan Bulan
  tahun?: number | null; // Col C: Tahun (derived from tanggal)
  bulan?: string | null; // Col D: Bulan (derived from tanggal)
  kategori_kejadian?: string | null; // Col E: Kategori Kejadian (default: 'Unjuk Rasa')
  kp_kpw?: string | null; // Col F: KP/KPw ('KPBI', 'KPwDN')
  regional?: string | null; // Col G: Regional ('Kantor Pusat', 'Jawa', 'Sumatera', 'KTI', 'Papua')
  kategori_isu?: string | null; // Col S: Kategori Isu
  dampak?: string | null; // Col T: Dampak ('Tidak Ada', 'Ada')
  keterangan_dampak?: string | null; // Col U: Keterangan Dampak
  nama_pelapor?: string | null; // Col V: Nama Pelapor
  info_awal?: string | null; // Col W: Info Awal Unras
  tindak_lanjut?: string | null; // Col X: Tindak Lanjut KPBI
  progres_asistensi?: string | null; // Col AA: Progres Asistensi
  realisasi?: string | null; // Col AC: Realisasi ('Terealisasi', 'Audiensi', 'Dibatalkan', 'Tidak Terealisasi', 'Mediasi', 'Dialihkan')

  // Operator-Managed & Validated Attributes (NEVER overwritten by Excel sync)
  status: ProtestStatus;
  urgency: ProtestUrgency;
  category_id: string | null;
  category_name?: string | null;
  validated_lat: number | null; // Validated GPS Latitude
  validated_lng: number | null; // Validated GPS Longitude
  has_coordinates: boolean;
  actual_crowd_size: number | null; // Update jumlah massa real di lapangan
  situation_summary: string | null; // Ringkasan situasi dari operator
  editorial_draft: string | null; // Draft redaksi otomatis
  editorial_final: string | null; // Redaksi resmi final yang disetujui operator
  is_archived: boolean;
  completed_at: string | null;
  completed_by_id: string | null;
  completed_by_name: string | null;

  // Geocoding Intelligence & Verification Workflow
  suggested_lat?: number | null;
  suggested_lng?: number | null;
  suggested_address?: string | null;
  geocoding_provider?: string | null;
  geocoding_confidence?: "high" | "medium" | "low" | null;
  location_validation_status?: "unmapped" | "pending_validation" | "verified" | "rejected";
  geocoding_alternatives?: Array<{
    lat: number;
    lng: number;
    address: string;
    score?: number;
    provider?: string;
  }> | null;
  validated_at?: string | null;
  validated_by_id?: string | null;
  validated_by_name?: string | null;

  // Metadata & Auditing
  created_at: string;
  updated_at: string;
  deleted_at: string | null; // Soft delete timestamp
  last_synced_at: string | null;
  source_type?: "manual" | "excel_sync";

  // Joined relations (optional in queries)
  reports?: ProtestOperatorReport[];
  status_history?: ProtestStatusHistory[];
  camera_links?: ProtestCameraLink[];
  attachments?: ProtestAttachment[];
  points?: ProtestPoint[];
}

/**
 * Operator Situational & Field Reports
 */
export interface ProtestOperatorReport {
  id: string; // UUID
  protest_id: string;
  report_type: ReportType;
  author_id: string;
  author_name: string;
  author_role: UserRole;
  content: string;
  crowd_estimate: number | null;
  is_pinned?: boolean;
  created_at: string;
  updated_at?: string;
}

/**
 * Status Transition Audit History
 */
export interface ProtestStatusHistory {
  id: string; // UUID
  protest_id: string;
  from_status: ProtestStatus | null;
  to_status: ProtestStatus;
  reason: string | null;
  changed_by_id: string;
  changed_by_name: string;
  created_at: string;
}

/**
 * Protest to CCTV Camera Linkage
 */
export interface ProtestCameraLink {
  id: string; // UUID
  protest_id: string;
  point_id?: string | null; // Optional reference to specific point within the protest
  camera_id: string; // Reference to CCTV camera in 23,356 dataset
  camera_name: string;
  camera_stream_url?: string;
  camera_protocol?: string;
  camera_status?: string;
  distance_meters: number;
  notes: string | null;
  is_recommended?: boolean;
  linked_by_id: string;
  linked_by_name: string;
  created_at: string;
  camera?: Camera;
}

/**
 * Raw Row Format from Microsoft OneDrive Worksheet 'NEW UNRAS 2022-2026'
 */
export interface ExcelProtestRow {
  'ID KEJADIAN'?: string;
  'KODE_UNRAS'?: string;
  'ID UNRAS'?: string;
  'TANGGAL'?: string;
  'WAKTU'?: string;
  'WAKTU DAN TGL KEJADIAN ISO'?: string;
  'LOKASI'?: string;
  'TITIK KUMPUL'?: string;
  'SASARAN'?: string;
  'ISU'?: string;
  'JUMLAH MASSA'?: string | number;
  'ORGANISASI'?: string;
  'KORLAP'?: string;
  'WILAYAH HUKUM'?: string;
  'KP/KPw'?: string;
  'PROVINSI'?: string;
  'KOTA/KABUPATEN'?: string;
  'LATITUDE'?: number;
  'LONGITUDE'?: number;
  'STATUS'?: string;
  'KETERANGAN'?: string;

  // Flexible snake_case aliases (Power Automate & JSON integrations)
  id_kejadian?: string;
  kode_unras?: string;
  id_unras?: string;
  tanggal_kejadian?: string;
  tanggal?: string;
  waktu?: string;
  waktu_mulai?: string;
  lokasi?: string;
  titik_kumpul?: string;
  sasaran?: string;
  sasaran_aksi?: string;
  isu?: string;
  tuntutan?: string;
  isu_tuntutan?: string;
  jumlah_massa?: string | number;
  estimasi_massa?: string | number;
  organisasi?: string;
  aliansi?: string;
  organisasi_kelompok?: string;
  korlap?: string;
  korlap_pimpinan?: string;
  kp?: string;
  kp_kpw?: string;
  wilayah_hukum?: string;
  regional?: string;
  provinsi?: string;
  kota?: string;
  kota_kabupaten?: string;
  kategori_isu?: string;
  dampak?: string;
  ringkasan_situasi?: string;
  keterangan?: string;
  latitude?: number;
  longitude?: number;
  status?: string;
  [key: string]: any;
}

/**
 * Sync History & Audit Logs
 */
export interface ProtestSyncLog {
  id: string; // UUID
  started_at: string;
  completed_at: string | null;
  period_start?: string | null; // Same-day (H-0) start boundary (ISO)
  period_end?: string | null; // Same-day (H-0) end boundary (ISO)
  status: "running" | "success" | "partial" | "failed" | "skipped";
  triggered_by: "power_automate" | "scheduler_cron" | "manual_admin" | "system";
  triggered_by_user?: string | null;
  source_worksheet: string;
  records_received?: number;
  records_processed: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  records_failed?: number;
  error_details: string | null;
  duration_ms: number | null;
}

/**
 * Contract for POST /api/integrations/unras/sync & /api/protests/sync
 * Scheduled Sync (Same-Day H-0 Asia/Jakarta) -> Vercel API
 */
export type ProtestSyncType = "same_day" | "same_day_h0" | "rolling_7d" | "rolling_7_days";

export interface ProtestSyncPayload {
  sync_type?: ProtestSyncType;
  timezone?: "Asia/Jakarta";
  period_start?: string; // ISO 8601 string (00:00:00 WIB today)
  period_end?: string; // ISO 8601 string (00:00:00 WIB tomorrow)
  events: ExcelProtestRow[];
}

export type RollingSyncPayload = ProtestSyncPayload;

export interface ProtestSyncResult {
  success: boolean;
  status: "success" | "partial" | "failed" | "skipped";
  execution_id: string;
  period_start: string;
  period_end: string;
  summary: {
    received: number;
    processed: number;
    inserted: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  errors?: string[];
  duration_ms: number;
}

export type RollingSyncResult = ProtestSyncResult;

/**
 * Protest File Attachments
 */
export interface ProtestAttachment {
  id: string; // UUID
  protest_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size_bytes: number;
  uploaded_by_id: string;
  uploaded_by_name: string;
  created_at: string;
}

/**
 * Query Filter Parameters
 */
export interface ProtestFilterParams {
  q?: string;
  status?: ProtestStatus | "active" | "all"; // "active" excludes completed & cancelled
  urgency?: ProtestUrgency;
  category?: string;
  province?: string;
  city?: string;
  operational_date?: string; // YYYY-MM-DD or 'today' (Asia/Jakarta)
  date?: string; // Alias for operational_date (Asia/Jakarta)
  date_from?: string; // YYYY-MM-DD
  date_to?: string; // YYYY-MM-DD
  has_coords?: boolean | "true" | "false";
  location_validation_status?: "unmapped" | "pending_validation" | "verified" | "rejected" | "all";
  geocoding_confidence?: "high" | "medium" | "low" | "all";
  is_archived?: boolean | "true" | "false";
  page?: number;
  limit?: number;
  sort_by?: "tanggal" | "created_at" | "urgency" | "status";
  sort_order?: "asc" | "desc";
}

/**
 * Dashboard Summary Statistics
 */
export interface ProtestStats {
  total_events: number;
  scheduled_events: number;
  ongoing_events: number;
  monitoring_events: number;
  completed_events: number;
  cancelled_events: number;
  high_critical_urgency: number;
  events_without_coords: number;
  pending_validation_count?: number;
  verified_locations_count?: number;
  today_events: number;
  completed_today: number;
  total_camera_links: number;
  last_successful_sync: string | null;
}


// ============================================================================
// Multi-Point UNRAS Situational Monitoring Types
// ============================================================================

export interface ProtestPoint {
  id: string; // UUID
  protest_id: string;
  point_name: string; // Specific physical location e.g. "Pintu Utama Gerbang DPR/MPR RI"
  location_address?: string | null;
  provinsi?: string | null;
  kota_kabupaten?: string | null;
  regional?: string | null;
  latitude: number | null;
  longitude: number | null;
  status: ProtestStatus;
  urgency: ProtestUrgency;
  notes?: string | null;
  created_at: string;
  updated_at: string;

  // Runtime aggregated fields
  elements?: ProtestElement[];
  current_crowd_total?: number;
  crowd_trend?: "up" | "down" | "stable" | "none";
  crowd_change_delta?: number;
  last_observation_at?: string | null;
  linked_camera_count?: number;
  linked_cameras?: ProtestCameraLink[];
  parent_title?: string;
  parent_kode_unras?: string;
  parent_id_kejadian?: string;
  parent_tanggal?: string;
}

export interface ProtestElement {
  id: string; // UUID
  point_id: string;
  protest_id: string;
  name: string; // Name of organization, alliance, labor union, or student body
  leader_name?: string | null; // Korlap / Pimpinan Aksi
  demand_summary?: string | null;
  status: "active" | "disbanded" | "merged";
  created_at: string;
  updated_at: string;

  // Runtime observation stats
  latest_crowd?: number;
  previous_crowd?: number;
  crowd_delta?: number;
  verification_status?: "verified" | "unverified";
  last_observed_at?: string | null;
  observations?: ProtestCrowdObservation[];
}

export interface ProtestCrowdObservation {
  id: string; // UUID
  point_id: string;
  element_id?: string | null;
  element_name: string;
  crowd_estimate: number;
  observation_timestamp: string; // ISO 8601
  observer_source?: string | null; // e.g. "CCTV Pantau", "Polres", "Petugas Lapangan"
  verification_status: "verified" | "unverified";
  notes?: string | null;
  created_at: string;
}

export interface DailyUnrasSituationOverview {
  selected_date: string; // YYYY-MM-DD (Asia/Jakarta)
  total_events: number;
  total_points: number;
  total_active_points: number; // ongoing + monitoring
  ongoing_points_count: number;
  monitoring_points_count: number;
  scheduled_points_count: number;
  completed_points_count: number;
  total_estimated_crowd: number;
  total_identified_elements: number;
  affected_provinces_count: number;
  affected_provinces: string[];
  affected_regions_count: number;
  affected_regions: string[];
  linked_cctv_count: number;
  points: ProtestPoint[];
}
