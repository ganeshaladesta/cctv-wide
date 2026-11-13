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

  // Metadata & Auditing
  created_at: string;
  updated_at: string;
  deleted_at: string | null; // Soft delete timestamp
  last_synced_at: string | null;

  // Joined relations (optional in queries)
  reports?: ProtestOperatorReport[];
  status_history?: ProtestStatusHistory[];
  camera_links?: ProtestCameraLink[];
  attachments?: ProtestAttachment[];
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
  'TANGGAL': string;
  'WAKTU'?: string;
  'LOKASI': string;
  'TITIK KUMPUL'?: string;
  'SASARAN'?: string;
  'ISU': string;
  'JUMLAH MASSA'?: string | number;
  'ORGANISASI'?: string;
  'KORLAP'?: string;
  'WILAYAH HUKUM'?: string;
  'PROVINSI'?: string;
  'KOTA/KABUPATEN'?: string;
  'LATITUDE'?: number;
  'LONGITUDE'?: number;
  'STATUS'?: string;
  'KETERANGAN'?: string;
}

/**
 * Sync History & Audit Logs
 */
export interface ProtestSyncLog {
  id: string; // UUID
  started_at: string;
  completed_at: string | null;
  status: "running" | "success" | "partial" | "failed" | "skipped";
  triggered_by: "scheduler_cron" | "manual_admin" | "system";
  triggered_by_user?: string | null;
  source_worksheet: string;
  records_processed: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  error_details: string | null;
  duration_ms: number | null;
}

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
  date_from?: string; // YYYY-MM-DD
  date_to?: string; // YYYY-MM-DD
  has_coords?: boolean | "true" | "false";
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
  today_events: number;
  completed_today: number;
  total_camera_links: number;
  last_successful_sync: string | null;
}
