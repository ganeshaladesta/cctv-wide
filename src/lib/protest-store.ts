/**
 * SCC - EAGLE EYES — Unjuk Rasa (Protest) Monitoring Data Store
 * Copyright: Developed by Ganesha Ladesta
 *
 * Implements high-performance dual-mode persistence:
 * 1. Supabase (PostgreSQL) when credentials are provided in environment
 * 2. SQLite (node:sqlite) / In-Memory state fallback when Supabase is not configured
 *
 * Features:
 * - Strict separation of Excel source fields and operator fields
 * - Idempotent batch upserting (never overwrites operator notes)
 * - Complete audit history of status transitions
 * - Spatial distance calculation to 23,356 CCTV catalog
 * - Soft delete enforcement
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  ProtestEvent,
  ProtestStatus,
  ProtestUrgency,
  ProtestFilterParams,
  ProtestStats,
  ProtestOperatorReport,
  ProtestStatusHistory,
  ProtestCameraLink,
  ProtestSyncLog,
  UserProfile,
  ProtestPoint,
  ProtestElement,
  ProtestCrowdObservation,
  DailyUnrasSituationOverview
} from "@/lib/types/protests";
import { getDataStore } from "@/lib/data-store";
import { Camera } from "@/lib/types";
import {
  isSupabaseConfigured,
  queryProtestsFromSupabase,
  getProtestByIdFromSupabase,
  createProtestInSupabase,
  updateProtestInSupabase,
  updateStatusInSupabase,
  fetchReportsFromSupabase,
  addReportInSupabase,
  fetchCameraLinksFromSupabase,
  linkCameraInSupabase,
  unlinkCameraInSupabase,
  fetchStatusHistoryFromSupabase,
  fetchStatsFromSupabase,
  fetchSyncLogsFromSupabase,
  fetchSyncLogByIdFromSupabase,
  createSyncLogInSupabase,
  updateSyncLogInSupabase,
  upsertExcelBatchInSupabase
} from "./supabase-protest-service";
import { deriveTahunBulan, deriveEventTimestamps, generateIdKejadian, generateKodeUnras } from "./unras-helpers";

// Haversine distance in meters
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Initial default seed protest events across key Indonesian locations
const SEED_PROTESTS: Array<Omit<ProtestEvent, "id"> & { id?: string }> = [
  {
    id: "evt-001-dki-dpr",
    id_kejadian: "UNRAS-2026-JKT-001",
    kode_unras: "KODE-001-DPR",
    tanggal: "2026-11-14",
    waktu_mulai: "09:00:00",
    waktu_selesai: "16:00:00",
    event_datetime: "2026-11-14T09:00:00+07:00",
    lokasi: "Gedung DPR/MPR RI, Jl. Gatot Subroto No.1",
    titik_kumpul: "Depan TVRI & Pintu Utama GBK Senayan",
    sasaran_aksi: "Gedung DPR/MPR RI & Gerbang Tol Senayan",
    isu_tuntutan: "Tuntutan Evaluasi Upah Minimum Provinsi (UMP) dan Kebijakan Ketenagakerjaan",
    estimasi_massa_source: 1500,
    organisasi_kelompok: "Konfederasi Serikat Pekerja Seluruh Indonesia (KSPSI) & Elemen Buruh",
    korlap_pimpinan: "Bambang Sudrajat (Koordinator Lapangan)",
    wilayah_hukum: "Polda Metro Jaya / Polres Metro Jakarta Pusat",
    provinsi: "DKI Jakarta",
    kota_kabupaten: "Jakarta Pusat",
    keterangan_source: "Aksi damai penyampaian aspirasi perihal UMP 2027",
    status: "scheduled",
    urgency: "high",
    category_id: null,
    category_name: "Ketenagakerjaan & Buruh",
    validated_lat: -6.2104,
    validated_lng: 106.8001,
    has_coordinates: true,
    actual_crowd_size: null,
    situation_summary: "Kordinasi dengan Polres Metro Jakpus sedang berlangsung. Titik kumpul di depan TVRI.",
    editorial_draft: null,
    editorial_final: null,
    is_archived: false,
    completed_at: null,
    completed_by_id: null,
    completed_by_name: null,
    created_at: "2026-11-10T08:00:00.000Z",
    updated_at: "2026-11-10T08:00:00.000Z",
    deleted_at: null,
    last_synced_at: "2026-11-12T05:00:00.000Z"
  },
  {
    id: "evt-002-dki-kpu",
    id_kejadian: "UNRAS-2026-JKT-002",
    kode_unras: "KODE-002-KPU",
    tanggal: "2026-11-13",
    waktu_mulai: "13:30:00",
    waktu_selesai: "18:00:00",
    event_datetime: "2026-11-13T13:30:00+07:00",
    lokasi: "Kantor KPU RI, Jl. Imam Bonjol No.29, Menteng",
    titik_kumpul: "Taman Suropati & Bunderan HI",
    sasaran_aksi: "Kantor KPU RI",
    isu_tuntutan: "Penyampaian aspirasi transparansi regulasi dan data publik",
    estimasi_massa_source: 350,
    organisasi_kelompok: "Aliansi Mahasiswa Peduli Demokrasi",
    korlap_pimpinan: "Rizky Firmansyah",
    wilayah_hukum: "Polda Metro Jaya / Polres Metro Jakarta Pusat",
    provinsi: "DKI Jakarta",
    kota_kabupaten: "Jakarta Pusat",
    keterangan_source: "Rencana massa berkumpul di Taman Suropati jam 13.00",
    status: "ongoing",
    urgency: "medium",
    category_id: null,
    category_name: "Mahasiswa & Pemuda",
    validated_lat: -6.1994,
    validated_lng: 106.8326,
    has_coordinates: true,
    actual_crowd_size: 400,
    situation_summary: "Massa terpantau bergerak dari Taman Suropati menuju gerbang KPU RI. Situasi lalu lintas padat lancar.",
    editorial_draft: "Jakarta, 13 November 2026 — Sekitar 400 massa dari Aliansi Mahasiswa berkumpul di depan Kantor KPU RI Jl. Imam Bonjol...",
    editorial_final: null,
    is_archived: false,
    completed_at: null,
    completed_by_id: null,
    completed_by_name: null,
    created_at: "2026-11-11T09:00:00.000Z",
    updated_at: "2026-11-13T06:30:00.000Z",
    deleted_at: null,
    last_synced_at: "2026-11-13T05:00:00.000Z"
  },
  {
    id: "evt-003-bdg-gedungsate",
    id_kejadian: "UNRAS-2026-JBR-001",
    kode_unras: "KODE-003-GSATE",
    tanggal: "2026-11-13",
    waktu_mulai: "10:00:00",
    waktu_selesai: "15:00:00",
    event_datetime: "2026-11-13T10:00:00+07:00",
    lokasi: "Gedung Sate Bandung, Jl. Diponegoro No.22",
    titik_kumpul: "Lapangan Gasibu",
    sasaran_aksi: "Kantor Gubernur Jawa Barat (Gedung Sate)",
    isu_tuntutan: "Penolakan alih fungsi lahan lindung dan tuntutan konservasi DAS Citarum",
    estimasi_massa_source: 800,
    organisasi_kelompok: "Koalisi Masyarakat Peduli Lingkungan Jawa Barat",
    korlap_pimpinan: "Asep Sunandar",
    wilayah_hukum: "Polda Jabar / Polrestabes Bandung",
    provinsi: "Jawa Barat",
    kota_kabupaten: "Bandung",
    keterangan_source: "Aksi long march dari Gasibu ke Gerbang Gedung Sate",
    status: "monitoring",
    urgency: "medium",
    category_id: null,
    category_name: "Agraria & Lingkungan",
    validated_lat: -6.9025,
    validated_lng: 107.6186,
    has_coordinates: true,
    actual_crowd_size: 750,
    situation_summary: "Massa tertib menggelar orasi dan teatrikal di depan gerbang utama Gedung Sate. Pengalihan arus lalu lintas oleh Dishub Kota Bandung.",
    editorial_draft: null,
    editorial_final: null,
    is_archived: false,
    completed_at: null,
    completed_by_id: null,
    completed_by_name: null,
    created_at: "2026-11-09T08:00:00.000Z",
    updated_at: "2026-11-13T04:15:00.000Z",
    deleted_at: null,
    last_synced_at: "2026-11-13T05:00:00.000Z"
  },
  {
    id: "evt-004-sby-grahadi",
    id_kejadian: "UNRAS-2026-JTM-001",
    kode_unras: "KODE-004-GRAHADI",
    tanggal: "2026-11-12",
    waktu_mulai: "08:30:00",
    waktu_selesai: "14:00:00",
    event_datetime: "2026-11-12T08:30:00+07:00",
    lokasi: "Gedung Negara Grahadi, Jl. Gubernur Suryo No.7",
    titik_kumpul: "Taman Apsari Surabaya",
    sasaran_aksi: "Gedung Negara Grahadi Surabaya",
    isu_tuntutan: "Aspirasi nelayan pesisir perihal zona tangkap dan subsidi bahan bakar",
    estimasi_massa_source: 500,
    organisasi_kelompok: "Serikat Nelayan Tradisional Pantura",
    korlap_pimpinan: "H. Sukirno",
    wilayah_hukum: "Polda Jatim / Polrestabes Surabaya",
    provinsi: "Jawa Timur",
    kota_kabupaten: "Surabaya",
    keterangan_source: "Perwakilan aksi diterima audiensi oleh Sekda Prov Jatim",
    status: "completed",
    urgency: "low",
    category_id: null,
    category_name: "Masyarakat & Warga",
    validated_lat: -7.2618,
    validated_lng: 112.7441,
    has_coordinates: true,
    actual_crowd_size: 450,
    situation_summary: "Aksi selesai dengan damai setelah audiensi diterima pukul 13.00. Massa membubarkan diri dengan tertib.",
    editorial_draft: null,
    editorial_final: "Surabaya, 12 November 2026 — Rangkaian aksi unjuk rasa Serikat Nelayan Tradisional di Gedung Grahadi berlangsung kondusif dan berakhir aman.",
    is_archived: true,
    completed_at: "2026-11-12T14:30:00.000Z",
    completed_by_id: "usr-operator-001",
    completed_by_name: "Operator Lapangan SCC",
    created_at: "2026-11-08T08:00:00.000Z",
    updated_at: "2026-11-12T14:30:00.000Z",
    deleted_at: null,
    last_synced_at: "2026-11-12T05:00:00.000Z"
  },
  {
    id: "evt-005-unmapped-semarang",
    id_kejadian: "UNRAS-2026-JTG-001",
    kode_unras: "KODE-005-SMG",
    tanggal: "2026-11-15",
    waktu_mulai: "10:00:00",
    waktu_selesai: "15:00:00",
    event_datetime: "2026-11-15T10:00:00+07:00",
    lokasi: "Kantor Disnakertrans Jawa Tengah, Semarang",
    titik_kumpul: null,
    sasaran_aksi: "Kantor Disnakertrans",
    isu_tuntutan: "Pengawasan keselamatan kerja K3 kawasan industri",
    estimasi_massa_source: 200,
    organisasi_kelompok: "Aliansi Pekerja Industri Jawa Tengah",
    korlap_pimpinan: "Suryono",
    wilayah_hukum: "Polda Jateng / Polrestabes Semarang",
    provinsi: "Jawa Tengah",
    kota_kabupaten: "Semarang",
    keterangan_source: "Data masuk via laporan intelijen daerah, koordinat GPS menunggu validasi",
    status: "scheduled",
    urgency: "low",
    category_id: null,
    category_name: "Ketenagakerjaan & Buruh",
    validated_lat: null,
    validated_lng: null,
    has_coordinates: false,
    actual_crowd_size: null,
    situation_summary: "Menunggu validasi titik koordinat GPS pasti oleh petugas monitor wilayah.",
    editorial_draft: null,
    editorial_final: null,
    is_archived: false,
    completed_at: null,
    completed_by_id: null,
    completed_by_name: null,
    created_at: "2026-11-11T10:00:00.000Z",
    updated_at: "2026-11-11T10:00:00.000Z",
    deleted_at: null,
    last_synced_at: "2026-11-12T05:00:00.000Z"
  }
];

class ProtestDataStore {
  private db: DatabaseSync | null = null;
  private dbInitialized = false;
  private memoryEvents = new Map<string, ProtestEvent>();
  private memoryReports = new Map<string, ProtestOperatorReport[]>();
  private memoryHistory = new Map<string, ProtestStatusHistory[]>();
  private memoryLinks = new Map<string, ProtestCameraLink[]>();
  private memoryPoints = new Map<string, ProtestPoint>();
  private memoryElements = new Map<string, ProtestElement>();
  private memoryObservations = new Map<string, ProtestCrowdObservation>();
  private memorySyncLogs: ProtestSyncLog[] = [];

  constructor() {
    this.init();
  }

  private init() {
    if (this.dbInitialized) return;
    const dataDir = path.join(process.cwd(), "data");
    const dbPath = path.join(dataDir, "pantau-nusantara.sqlite");
    const schemaPath = path.join(process.cwd(), "src", "lib", "db", "schema.sql");

    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new DatabaseSync(dbPath);
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA synchronous = NORMAL;");

      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, "utf8");
        try {
          this.db.exec(schemaSql);
        } catch {
          // If bulk exec fails (e.g. index referencing not yet migrated column), execute per-statement
          const statements = schemaSql.split(";").map((s) => s.trim()).filter(Boolean);
          for (const stmt of statements) {
            try {
              this.db.exec(stmt + ";");
            } catch {
              // Ignore individual statement failure so remaining tables are created
            }
          }
        }
      }

      // Self-healing migration for SQLite columns
      try {
        const auditCols = (this.db.prepare("PRAGMA table_info(master_data_audit_review)").all() as Array<{ name: string }>).map((c) => c.name);
        if (auditCols.length > 0 && !auditCols.includes("review_status")) {
          this.db.exec("ALTER TABLE master_data_audit_review ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending_review';");
          this.db.exec("CREATE INDEX IF NOT EXISTS idx_audit_review_status ON master_data_audit_review(review_status);");
        }
      } catch {}
      const syncCols = (this.db.prepare("PRAGMA table_info(protest_sync_logs)").all() as Array<{ name: string }>).map((c) => c.name);
      if (!syncCols.includes("period_start")) {
        this.db.exec("ALTER TABLE protest_sync_logs ADD COLUMN period_start TEXT;");
      }
      if (!syncCols.includes("period_end")) {
        this.db.exec("ALTER TABLE protest_sync_logs ADD COLUMN period_end TEXT;");
      }
      if (!syncCols.includes("records_received")) {
        this.db.exec("ALTER TABLE protest_sync_logs ADD COLUMN records_received INTEGER DEFAULT 0;");
      }
      if (!syncCols.includes("records_failed")) {
        this.db.exec("ALTER TABLE protest_sync_logs ADD COLUMN records_failed INTEGER DEFAULT 0;");
      }

      const protestCols = (this.db.prepare("PRAGMA table_info(protests)").all() as Array<{ name: string }>).map((c) => c.name);
      if (!protestCols.includes("event_datetime")) {
        this.db.exec("ALTER TABLE protests ADD COLUMN event_datetime TEXT;");
        this.db.exec("CREATE INDEX IF NOT EXISTS idx_protests_event_datetime ON protests(event_datetime);");
      }
      if (!protestCols.includes("suggested_lat")) {
        this.db.exec("ALTER TABLE protests ADD COLUMN suggested_lat REAL;");
      }
      if (!protestCols.includes("suggested_lng")) {
        this.db.exec("ALTER TABLE protests ADD COLUMN suggested_lng REAL;");
      }
      if (!protestCols.includes("suggested_address")) {
        this.db.exec("ALTER TABLE protests ADD COLUMN suggested_address TEXT;");
      }
      if (!protestCols.includes("geocoding_provider")) {
        this.db.exec("ALTER TABLE protests ADD COLUMN geocoding_provider TEXT;");
      }
      if (!protestCols.includes("geocoding_confidence")) {
        this.db.exec("ALTER TABLE protests ADD COLUMN geocoding_confidence TEXT;");
      }
      if (!protestCols.includes("location_validation_status")) {
        this.db.exec("ALTER TABLE protests ADD COLUMN location_validation_status TEXT DEFAULT 'unmapped';");
      }
      if (!protestCols.includes("geocoding_alternatives")) {
        this.db.exec("ALTER TABLE protests ADD COLUMN geocoding_alternatives TEXT DEFAULT '[]';");
      }
      if (!protestCols.includes("validated_at")) {
        this.db.exec("ALTER TABLE protests ADD COLUMN validated_at TEXT;");
      }
      if (!protestCols.includes("validated_by_id")) {
        this.db.exec("ALTER TABLE protests ADD COLUMN validated_by_id TEXT;");
      }
      if (!protestCols.includes("validated_by_name")) {
        this.db.exec("ALTER TABLE protests ADD COLUMN validated_by_name TEXT;");
      }

      // Excel C:AC Source Attributes migration
      const cAcFields = [
        { name: "urutan_bulan", def: "INTEGER" },
        { name: "tahun", def: "INTEGER" },
        { name: "bulan", def: "TEXT" },
        { name: "kategori_kejadian", def: "TEXT DEFAULT 'Unjuk Rasa'" },
        { name: "kp_kpw", def: "TEXT" },
        { name: "regional", def: "TEXT" },
        { name: "kategori_isu", def: "TEXT" },
        { name: "dampak", def: "TEXT DEFAULT 'Tidak Ada'" },
        { name: "keterangan_dampak", def: "TEXT" },
        { name: "nama_pelapor", def: "TEXT" },
        { name: "info_awal", def: "TEXT" },
        { name: "tindak_lanjut", def: "TEXT" },
        { name: "progres_asistensi", def: "TEXT" },
        { name: "realisasi", def: "TEXT" }
      ];
      for (const col of cAcFields) {
        if (!protestCols.includes(col.name)) {
          this.db.exec(`ALTER TABLE protests ADD COLUMN ${col.name} ${col.def};`);
        }
      }

      // Migration 008 multi-point tables & columns self-healing
      try {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS protest_points (
            id TEXT PRIMARY KEY,
            protest_id TEXT NOT NULL REFERENCES protests(id) ON DELETE CASCADE,
            point_name TEXT NOT NULL,
            location_address TEXT,
            provinsi TEXT,
            kota_kabupaten TEXT,
            regional TEXT,
            latitude REAL,
            longitude REAL,
            status TEXT NOT NULL DEFAULT 'scheduled',
            urgency TEXT NOT NULL DEFAULT 'medium',
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_protest_points_protest_id ON protest_points(protest_id);
          CREATE INDEX IF NOT EXISTS idx_protest_points_status ON protest_points(status);
          CREATE INDEX IF NOT EXISTS idx_protest_points_coords ON protest_points(latitude, longitude);

          CREATE TABLE IF NOT EXISTS protest_elements (
            id TEXT PRIMARY KEY,
            point_id TEXT NOT NULL REFERENCES protest_points(id) ON DELETE CASCADE,
            protest_id TEXT NOT NULL REFERENCES protests(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            leader_name TEXT,
            demand_summary TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_protest_elements_point_id ON protest_elements(point_id);
          CREATE INDEX IF NOT EXISTS idx_protest_elements_protest_id ON protest_elements(protest_id);

          CREATE TABLE IF NOT EXISTS protest_crowd_observations (
            id TEXT PRIMARY KEY,
            point_id TEXT NOT NULL REFERENCES protest_points(id) ON DELETE CASCADE,
            element_id TEXT REFERENCES protest_elements(id) ON DELETE SET NULL,
            element_name TEXT NOT NULL,
            crowd_estimate INTEGER NOT NULL,
            observation_timestamp TEXT NOT NULL,
            observer_source TEXT,
            verification_status TEXT NOT NULL DEFAULT 'unverified',
            notes TEXT,
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_crowd_obs_point_id ON protest_crowd_observations(point_id);
          CREATE INDEX IF NOT EXISTS idx_crowd_obs_timestamp ON protest_crowd_observations(observation_timestamp);
        `);

        const linkCols = (this.db.prepare("PRAGMA table_info(protest_camera_links)").all() as Array<{ name: string }>).map((c) => c.name);
        if (!linkCols.includes("point_id")) {
          this.db.exec("ALTER TABLE protest_camera_links ADD COLUMN point_id TEXT;");
          this.db.exec("CREATE INDEX IF NOT EXISTS idx_camera_links_point_id ON protest_camera_links(point_id);");
        }
      } catch (errMigration008) {
        console.warn("[ProtestDataStore] Migration 008 init notice:", errMigration008);
      }

      // Only seed dummy data if explicitly enabled via SEED_DUMMY_DATA=true
      if (process.env.SEED_DUMMY_DATA === "true") {
        const row = this.db.prepare("SELECT COUNT(*) as count FROM protests").get() as { count: number };
        if (row.count === 0) {
          this.seedInitialData();
        }
      }

      this.dbInitialized = true;
    } catch (err) {
      console.warn("[ProtestDataStore] SQLite unavailable, falling back to In-Memory mode:", err);
      // Fallback in-memory seed (only if explicitly enabled)
      if (process.env.SEED_DUMMY_DATA === "true") {
        for (const p of SEED_PROTESTS) {
          const item: ProtestEvent = {
            ...p,
            id: p.id || crypto.randomUUID()
          };
          this.memoryEvents.set(item.id, item);
        }
      }
      this.dbInitialized = true;
    }
  }

  public clearAllProtests(): { deleted: number } {
    this.init();
    if (this.db) {
      const countRow = this.db.prepare("SELECT COUNT(*) as count FROM protests").get() as { count: number };
      const count = countRow?.count || 0;
      this.db.exec("DELETE FROM protest_crowd_observations;");
      this.db.exec("DELETE FROM protest_elements;");
      this.db.exec("DELETE FROM protest_points;");
      this.db.exec("DELETE FROM protest_operator_reports;");
      this.db.exec("DELETE FROM protest_status_history;");
      this.db.exec("DELETE FROM protest_camera_links;");
      this.db.exec("DELETE FROM protest_attachments;");
      this.db.exec("DELETE FROM protest_sync_logs;");
      this.db.exec("DELETE FROM protests;");
      return { deleted: count };
    } else {
      const count = this.memoryEvents.size;
      this.memoryEvents.clear();
      this.memoryReports.clear();
      this.memoryHistory.clear();
      this.memoryLinks.clear();
      this.memoryPoints.clear();
      this.memoryElements.clear();
      this.memoryObservations.clear();
      this.memorySyncLogs = [];
      return { deleted: count };
    }
  }

  private seedInitialData() {
    if (!this.db) return;
    const stmt = this.db.prepare(`
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

    for (const p of SEED_PROTESTS) {
      const id = p.id || crypto.randomUUID();
      stmt.run(
        id,
        p.id_kejadian,
        p.kode_unras,
        p.tanggal,
        p.waktu_mulai,
        p.waktu_selesai,
        p.event_datetime || null,
        p.lokasi,
        p.titik_kumpul,
        p.sasaran_aksi,
        p.isu_tuntutan,
        p.estimasi_massa_source,
        p.organisasi_kelompok,
        p.korlap_pimpinan,
        p.wilayah_hukum,
        p.provinsi,
        p.kota_kabupaten,
        p.keterangan_source,
        p.status,
        p.urgency,
        p.category_id,
        p.validated_lat,
        p.validated_lng,
        p.has_coordinates ? 1 : 0,
        p.actual_crowd_size,
        p.situation_summary,
        p.editorial_draft,
        p.editorial_final,
        p.is_archived ? 1 : 0,
        p.completed_at,
        p.completed_by_id,
        p.completed_by_name,
        p.created_at,
        p.updated_at,
        p.deleted_at,
        p.last_synced_at
      );
    }

    // Link default camera for Event 1 (DPR RI -> nearby Jakarta camera)
    const linkStmt = this.db.prepare(`
      INSERT INTO protest_camera_links (
        id, protest_id, camera_id, camera_name, distance_meters, notes, is_recommended, linked_by_id, linked_by_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    linkStmt.run(
      crypto.randomUUID(),
      "evt-001-dki-dpr",
      "amg-cctv-sarinah",
      "CCTV Sarinah (Thamrin)",
      3200,
      "Kamera koridor utama pengalihan rute Thamrin-Sudirman",
      1,
      "usr-operator-001",
      "Operator Lapangan SCC",
      new Date().toISOString()
    );

    // Initial sync log
    const syncLogStmt = this.db.prepare(`
      INSERT INTO protest_sync_logs (
        id, started_at, completed_at, status, triggered_by, triggered_by_user,
        source_worksheet, records_processed, records_created, records_updated, records_skipped,
        error_details, duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    syncLogStmt.run(
      crypto.randomUUID(),
      "2026-11-13T05:00:00.000Z",
      "2026-11-13T05:00:02.140Z",
      "success",
      "scheduler_cron",
      "System Daily Cron (05:00 WIB)",
      "NEW UNRAS 2022-2026",
      5,
      5,
      0,
      0,
      null,
      2140
    );
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  async queryProtests(filters: ProtestFilterParams = {}): Promise<{
    total: number;
    page: number;
    limit: number;
    data: ProtestEvent[];
  }> {
    if (isSupabaseConfigured()) {
      try {
        return await queryProtestsFromSupabase(filters);
      } catch (err) {
        console.error("[ProtestDataStore] Supabase queryProtests failed, falling back to local SQLite:", err);
      }
    }
    return this.queryProtestsLocal(filters);
  }

  queryProtestsLocal(filters: ProtestFilterParams = {}): {
    total: number;
    page: number;
    limit: number;
    data: ProtestEvent[];
  } {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;

    if (this.db) {
      let whereClauses = ["deleted_at IS NULL"];
      const params: (string | number | null)[] = [];

      if (filters.status) {
        if (filters.status === "active") {
          whereClauses.push("status IN ('scheduled', 'ongoing', 'monitoring') AND is_archived = 0");
        } else if (filters.status !== "all") {
          whereClauses.push("status = ?");
          params.push(filters.status);
        }
      }

      if (filters.is_archived !== undefined) {
        const isArch = filters.is_archived === true || filters.is_archived === "true";
        whereClauses.push("is_archived = ?");
        params.push(isArch ? 1 : 0);
      }

      if (filters.urgency) {
        whereClauses.push("urgency = ?");
        params.push(filters.urgency);
      }

      if (filters.has_coords !== undefined) {
        const hasCoords = filters.has_coords === true || filters.has_coords === "true";
        whereClauses.push(hasCoords ? "validated_lat IS NOT NULL" : "validated_lat IS NULL");
      }

      if (filters.province) {
        whereClauses.push("LOWER(provinsi) LIKE ?");
        params.push(`%${filters.province.toLowerCase()}%`);
      }

      if (filters.city) {
        whereClauses.push("LOWER(kota_kabupaten) LIKE ?");
        params.push(`%${filters.city.toLowerCase()}%`);
      }

      // Strict Operational Date Filter in Asia/Jakarta (WIB)
      const targetDate = (filters.operational_date || filters.date || "").trim();
      if (targetDate) {
        const dateWib = targetDate === "today"
          ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
          : targetDate.slice(0, 10);

        const startWib = new Date(`${dateWib}T00:00:00+07:00`);
        const endWib = new Date(startWib.getTime() + 86400000);
        const nextDateWib = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(endWib);

        const startWibIso = `${dateWib}T00:00:00+07:00`;
        const endWibIso = `${nextDateWib}T00:00:00+07:00`;
        const startUtcIso = startWib.toISOString();
        const endUtcIso = endWib.toISOString();

        whereClauses.push(`(
          tanggal = ?
          OR (
            (tanggal IS NULL OR trim(tanggal) = '')
            AND (
              (event_datetime >= ? AND event_datetime < ?)
              OR (event_datetime >= ? AND event_datetime < ?)
            )
          )
        )`);
        params.push(dateWib, startWibIso, endWibIso, startUtcIso, endUtcIso);
      } else {
        if (filters.date_from) {
          whereClauses.push("tanggal >= ?");
          params.push(filters.date_from);
        }

        if (filters.date_to) {
          whereClauses.push("tanggal <= ?");
          params.push(filters.date_to);
        }
      }

      if (filters.q && filters.q.trim()) {
        const term = `%${filters.q.trim().toLowerCase()}%`;
        whereClauses.push(
          "(LOWER(isu_tuntutan) LIKE ? OR LOWER(lokasi) LIKE ? OR LOWER(organisasi_kelompok) LIKE ? OR LOWER(korlap_pimpinan) LIKE ? OR LOWER(kategori_isu) LIKE ? OR LOWER(nama_pelapor) LIKE ? OR LOWER(id_kejadian) LIKE ? OR LOWER(kode_unras) LIKE ?)"
        );
        params.push(term, term, term, term, term, term, term, term);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

      const countRow = this.db.prepare(`SELECT COUNT(*) as total FROM protests ${whereSql}`).get(...params) as { total: number };
      const total = countRow ? countRow.total : 0;

      const orderCol = filters.sort_by === "urgency" ? "CASE urgency WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END" : filters.sort_by === "created_at" ? "created_at" : "tanggal";
      const orderDir = filters.sort_order === "asc" ? "ASC" : "DESC";

      const rows = this.db.prepare(`
        SELECT * FROM protests
        ${whereSql}
        ORDER BY ${orderCol} ${orderDir}, id DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as Array<Record<string, unknown>>;

      const data: ProtestEvent[] = rows.map((r) => this.mapRowToProtest(r));

      return { total, page, limit, data };
    }

    // Fallback Memory Query
    let items = Array.from(this.memoryEvents.values()).filter((e) => !e.deleted_at);

    if (filters.status) {
      if (filters.status === "active") {
        items = items.filter((e) => ["scheduled", "ongoing", "monitoring"].includes(e.status) && !e.is_archived);
      } else if (filters.status !== "all") {
        items = items.filter((e) => e.status === filters.status);
      }
    }

    if (filters.is_archived !== undefined) {
      const isArch = filters.is_archived === true || filters.is_archived === "true";
      items = items.filter((e) => e.is_archived === isArch);
    }

    if (filters.urgency) {
      items = items.filter((e) => e.urgency === filters.urgency);
    }

    if (filters.has_coords !== undefined) {
      const hasCoords = filters.has_coords === true || filters.has_coords === "true";
      items = items.filter((e) => (hasCoords ? e.validated_lat !== null : e.validated_lat === null));
    }

    // Strict Operational Date Filter in Asia/Jakarta (WIB) for in-memory fallback
    const targetDateMem = (filters.operational_date || filters.date || "").trim();
    if (targetDateMem) {
      const dateWib = targetDateMem === "today"
        ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
        : targetDateMem.slice(0, 10);
      const startWibMs = new Date(`${dateWib}T00:00:00+07:00`).getTime();
      const endWibMs = startWibMs + 86400000;

      items = items.filter((e) => {
        if (e.tanggal === dateWib) return true;
        if (!e.tanggal && e.event_datetime) {
          const ms = new Date(e.event_datetime).getTime();
          return ms >= startWibMs && ms < endWibMs;
        }
        return false;
      });
    } else {
      if (filters.date_from) {
        items = items.filter((e) => e.tanggal >= filters.date_from!);
      }
      if (filters.date_to) {
        items = items.filter((e) => e.tanggal <= filters.date_to!);
      }
    }

    if (filters.q && filters.q.trim()) {
      const term = filters.q.trim().toLowerCase();
      items = items.filter(
        (e) =>
          e.isu_tuntutan.toLowerCase().includes(term) ||
          e.lokasi.toLowerCase().includes(term) ||
          (e.organisasi_kelompok && e.organisasi_kelompok.toLowerCase().includes(term)) ||
          (e.korlap_pimpinan && e.korlap_pimpinan.toLowerCase().includes(term)) ||
          (e.kategori_isu && e.kategori_isu.toLowerCase().includes(term)) ||
          (e.nama_pelapor && e.nama_pelapor.toLowerCase().includes(term)) ||
          e.id_kejadian.toLowerCase().includes(term) ||
          e.kode_unras.toLowerCase().includes(term)
      );
    }

    const total = items.length;
    items.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    const data = items.slice(offset, offset + limit);

    return { total, page, limit, data };
  }

  async getProtestById(idOrIdentity: string): Promise<ProtestEvent | null> {
    if (isSupabaseConfigured()) {
      try {
        const item = await getProtestByIdFromSupabase(idOrIdentity);
        if (item) {
          item.points = await this.getPointsByProtestId(item.id);
          if (item.points.length === 0) item.points = this.synthesizePointsForLegacyEvent(item);
          return item;
        }
      } catch (err) {
        console.error("[ProtestDataStore] Supabase getProtestById failed, falling back to local SQLite:", err);
      }
    }
    const protest = this.getProtestByIdLocal(idOrIdentity);
    if (protest) {
      protest.points = await this.getPointsByProtestId(protest.id);
      if (protest.points.length === 0) protest.points = this.synthesizePointsForLegacyEvent(protest);
    }
    return protest;
  }

  getProtestByIdSync(idOrIdentity: string): ProtestEvent | null {
    return this.getProtestByIdLocal(idOrIdentity);
  }

  getProtestByIdLocal(idOrIdentity: string): ProtestEvent | null {
    if (this.db) {
      const row = this.db.prepare(`
        SELECT * FROM protests
        WHERE (id = ? OR id_kejadian = ? OR kode_unras = ?) AND deleted_at IS NULL
        LIMIT 1
      `).get(idOrIdentity, idOrIdentity, idOrIdentity) as Record<string, unknown> | undefined;

      if (!row) return null;
      const protest = this.mapRowToProtest(row);

      // Attach relations
      protest.reports = this.getOperatorReportsLocal(protest.id);
      protest.status_history = this.getStatusHistoryLocal(protest.id);
      protest.camera_links = this.getCameraLinksLocal(protest.id);
      return protest;
    }

    // In-Memory
    const item = Array.from(this.memoryEvents.values()).find(
      (e) =>
        (e.id === idOrIdentity || e.id_kejadian === idOrIdentity || e.kode_unras === idOrIdentity) &&
        !e.deleted_at
    );
    if (!item) return null;
    item.reports = this.memoryReports.get(item.id) || [];
    item.status_history = this.memoryHistory.get(item.id) || [];
    item.camera_links = this.memoryLinks.get(item.id) || [];
    return item;
  }

  // ---------------------------------------------------------------------------
  // Mutators & Operator Workflows
  // ---------------------------------------------------------------------------

  async createProtest(
    input: Partial<ProtestEvent> & {
      id_kejadian: string;
      tanggal: string;
      lokasi: string;
      isu_tuntutan: string;
    },
    user?: UserProfile
  ): Promise<ProtestEvent> {
    if (isSupabaseConfigured()) {
      try {
        const created = await createProtestInSupabase(input, user);
        if (this.db) {
          try { this.createProtestLocal(input, user); } catch {}
        }
        return created;
      } catch (err) {
        console.error("[ProtestDataStore] Supabase createProtest failed:", err);
        throw err;
      }
    }
    return this.createProtestLocal(input, user);
  }

  createProtestLocal(
    input: Partial<ProtestEvent> & {
      id_kejadian: string;
      tanggal: string;
      lokasi: string;
      isu_tuntutan: string;
    },
    user?: UserProfile
  ): ProtestEvent {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const hasCoords = input.validated_lat != null && input.validated_lng != null;
    const tb = deriveTahunBulan(input.tanggal || "");
    const timestamps = deriveEventTimestamps(input.tanggal || "", input.waktu_mulai || "09:00 WIB");
    const autoIdKejadian = input.id_kejadian || generateIdKejadian(input.provinsi, input.tanggal);
    const autoKodeUnras = input.kode_unras || generateKodeUnras(input.tanggal, input.lokasi);

    const newEvent: ProtestEvent = {
      id,
      id_kejadian: autoIdKejadian,
      kode_unras: autoKodeUnras,
      tanggal: input.tanggal,
      waktu_mulai: timestamps.normalizedTime,
      waktu_selesai: input.waktu_selesai || null,
      event_datetime: input.event_datetime || timestamps.eventDatetimeIso,
      lokasi: input.lokasi,
      titik_kumpul: input.titik_kumpul || null,
      sasaran_aksi: input.sasaran_aksi || null,
      isu_tuntutan: input.isu_tuntutan,
      estimasi_massa_source: input.estimasi_massa_source ?? null,
      organisasi_kelompok: input.organisasi_kelompok || null,
      korlap_pimpinan: input.korlap_pimpinan || null,
      wilayah_hukum: input.wilayah_hukum || null,
      provinsi: input.provinsi || null,
      kota_kabupaten: input.kota_kabupaten || null,
      keterangan_source: input.keterangan_source || null,
      raw_source_payload: input.raw_source_payload || {},
      status: input.status || "scheduled",
      urgency: input.urgency || "medium",
      category_id: input.category_id || null,
      category_name: input.category_name || null,
      validated_lat: input.validated_lat ?? null,
      validated_lng: input.validated_lng ?? null,
      has_coordinates: hasCoords,
      location_validation_status: input.location_validation_status || (hasCoords ? "verified" : (input.suggested_lat ? "pending_validation" : "unmapped")),
      suggested_lat: input.suggested_lat != null ? Number(input.suggested_lat) : null,
      suggested_lng: input.suggested_lng != null ? Number(input.suggested_lng) : null,
      suggested_address: input.suggested_address || null,
      geocoding_provider: input.geocoding_provider || null,
      geocoding_confidence: input.geocoding_confidence || null,
      geocoding_alternatives: input.geocoding_alternatives || [],
      validated_at: hasCoords ? now : null,
      validated_by_id: hasCoords ? (user?.id || null) : null,
      validated_by_name: hasCoords ? (user?.name || null) : null,
      actual_crowd_size: input.actual_crowd_size ?? null,
      situation_summary: input.situation_summary || null,
      editorial_draft: input.editorial_draft || null,
      editorial_final: input.editorial_final || null,
      is_archived: input.is_archived || false,
      completed_at: null,
      completed_by_id: null,
      completed_by_name: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      last_synced_at: null,

      // Excel C:AC Source Attributes
      urutan_bulan: input.urutan_bulan ?? null,
      tahun: input.tahun || tb.tahun,
      bulan: input.bulan || tb.bulan,
      kategori_kejadian: input.kategori_kejadian || "Unjuk Rasa",
      kp_kpw: input.kp_kpw || (input.provinsi === "DKI Jakarta" ? "KPBI" : "KPwDN"),
      regional: input.regional || (input.provinsi === "DKI Jakarta" ? "Kantor Pusat" : "Jawa"),
      kategori_isu: input.kategori_isu || null,
      dampak: input.dampak || "Tidak Ada",
      keterangan_dampak: input.keterangan_dampak || null,
      nama_pelapor: input.nama_pelapor || user?.name || null,
      info_awal: input.info_awal || null,
      tindak_lanjut: input.tindak_lanjut || null,
      progres_asistensi: input.progres_asistensi || null,
      realisasi: input.realisasi || null
    };

    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO protests (
          id, id_kejadian, kode_unras, tanggal, waktu_mulai, waktu_selesai, event_datetime,
          lokasi, titik_kumpul, sasaran_aksi, isu_tuntutan, estimasi_massa_source,
          organisasi_kelompok, korlap_pimpinan, wilayah_hukum, provinsi, kota_kabupaten,
          keterangan_source, raw_source_payload, status, urgency, category_id,
          validated_lat, validated_lng, has_coordinates, actual_crowd_size, situation_summary,
          editorial_draft, editorial_final, is_archived, completed_at, completed_by_id,
          completed_by_name, suggested_lat, suggested_lng, suggested_address, geocoding_provider,
          geocoding_confidence, location_validation_status, geocoding_alternatives, validated_at,
          validated_by_id, validated_by_name, created_at, updated_at, deleted_at, last_synced_at,
          urutan_bulan, tahun, bulan, kategori_kejadian, kp_kpw, regional,
          kategori_isu, dampak, keterangan_dampak, nama_pelapor, info_awal, tindak_lanjut,
          progres_asistensi, realisasi
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?
        )
      `);

      stmt.run(
        newEvent.id,
        newEvent.id_kejadian,
        newEvent.kode_unras,
        newEvent.tanggal,
        newEvent.waktu_mulai,
        newEvent.waktu_selesai,
        newEvent.event_datetime || null,
        newEvent.lokasi,
        newEvent.titik_kumpul,
        newEvent.sasaran_aksi,
        newEvent.isu_tuntutan,
        newEvent.estimasi_massa_source,
        newEvent.organisasi_kelompok,
        newEvent.korlap_pimpinan,
        newEvent.wilayah_hukum,
        newEvent.provinsi,
        newEvent.kota_kabupaten,
        newEvent.keterangan_source,
        JSON.stringify(newEvent.raw_source_payload || {}),
        newEvent.status,
        newEvent.urgency,
        newEvent.category_id,
        newEvent.validated_lat,
        newEvent.validated_lng,
        newEvent.has_coordinates ? 1 : 0,
        newEvent.actual_crowd_size,
        newEvent.situation_summary,
        newEvent.editorial_draft,
        newEvent.editorial_final,
        newEvent.is_archived ? 1 : 0,
        newEvent.completed_at ?? null,
        newEvent.completed_by_id ?? null,
        newEvent.completed_by_name ?? null,
        newEvent.suggested_lat ?? null,
        newEvent.suggested_lng ?? null,
        newEvent.suggested_address ?? null,
        newEvent.geocoding_provider ?? null,
        newEvent.geocoding_confidence ?? null,
        newEvent.location_validation_status ?? "unmapped",
        JSON.stringify(newEvent.geocoding_alternatives || []),
        newEvent.validated_at ?? null,
        newEvent.validated_by_id ?? null,
        newEvent.validated_by_name ?? null,
        newEvent.created_at,
        newEvent.updated_at,
        newEvent.deleted_at,
        newEvent.last_synced_at,
        newEvent.urutan_bulan ?? null,
        newEvent.tahun ?? null,
        newEvent.bulan ?? null,
        newEvent.kategori_kejadian ?? null,
        newEvent.kp_kpw ?? null,
        newEvent.regional ?? null,
        newEvent.kategori_isu ?? null,
        newEvent.dampak ?? null,
        newEvent.keterangan_dampak ?? null,
        newEvent.nama_pelapor ?? null,
        newEvent.info_awal ?? null,
        newEvent.tindak_lanjut ?? null,
        newEvent.progres_asistensi ?? null,
        newEvent.realisasi ?? null
      );
    } else {
      this.memoryEvents.set(newEvent.id, newEvent);
    }

    // Record initial status history
    this.recordStatusHistory({
      protest_id: newEvent.id,
      from_status: null,
      to_status: newEvent.status,
      reason: "Pembuatan data aksi baru oleh operator",
      user
    });

    return newEvent;
  }

  async updateProtest(
    id: string,
    updates: Partial<ProtestEvent>,
    user?: UserProfile
  ): Promise<ProtestEvent | null> {
    if (isSupabaseConfigured()) {
      try {
        const res = await updateProtestInSupabase(id, updates);
        if (this.db) {
          try { this.updateProtestLocal(id, updates, user); } catch {}
        }
        return res;
      } catch (err) {
        console.error("[ProtestDataStore] Supabase updateProtest failed:", err);
        throw err;
      }
    }
    return this.updateProtestLocal(id, updates, user);
  }

  updateProtestLocal(
    id: string,
    updates: Partial<ProtestEvent>,
    user?: UserProfile
  ): ProtestEvent | null {
    const existing = this.getProtestByIdLocal(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updatedLat = updates.validated_lat !== undefined ? updates.validated_lat : existing.validated_lat;
    const updatedLng = updates.validated_lng !== undefined ? updates.validated_lng : existing.validated_lng;
    const hasCoords = updatedLat != null && updatedLng != null;

    const updatedStatus = updates.location_validation_status !== undefined
      ? updates.location_validation_status
      : (hasCoords ? "verified" : existing.location_validation_status || "unmapped");

    const tb = updates.tanggal ? deriveTahunBulan(updates.tanggal) : null;
    const timestamps = updates.tanggal ? deriveEventTimestamps(updates.tanggal, updates.waktu_mulai || existing.waktu_mulai || "09:00 WIB") : null;

    const updatedEvent: ProtestEvent = {
      ...existing,
      ...updates,
      id: existing.id,
      id_kejadian: existing.id_kejadian, // immutable source identity
      kode_unras: existing.kode_unras,
      event_datetime: updates.event_datetime || (timestamps ? timestamps.eventDatetimeIso : existing.event_datetime),
      urutan_bulan: updates.urutan_bulan !== undefined ? updates.urutan_bulan : existing.urutan_bulan,
      tahun: updates.tahun !== undefined ? updates.tahun : (tb ? tb.tahun : existing.tahun),
      bulan: updates.bulan !== undefined ? updates.bulan : (tb ? tb.bulan : existing.bulan),
      kategori_kejadian: updates.kategori_kejadian !== undefined ? updates.kategori_kejadian : (existing.kategori_kejadian || "Unjuk Rasa"),
      kp_kpw: updates.kp_kpw !== undefined ? updates.kp_kpw : existing.kp_kpw,
      regional: updates.regional !== undefined ? updates.regional : existing.regional,
      kategori_isu: updates.kategori_isu !== undefined ? updates.kategori_isu : existing.kategori_isu,
      dampak: updates.dampak !== undefined ? updates.dampak : (existing.dampak || "Tidak Ada"),
      keterangan_dampak: updates.keterangan_dampak !== undefined ? updates.keterangan_dampak : existing.keterangan_dampak,
      nama_pelapor: updates.nama_pelapor !== undefined ? updates.nama_pelapor : existing.nama_pelapor,
      info_awal: updates.info_awal !== undefined ? updates.info_awal : existing.info_awal,
      tindak_lanjut: updates.tindak_lanjut !== undefined ? updates.tindak_lanjut : existing.tindak_lanjut,
      progres_asistensi: updates.progres_asistensi !== undefined ? updates.progres_asistensi : existing.progres_asistensi,
      realisasi: updates.realisasi !== undefined ? updates.realisasi : existing.realisasi,
      validated_lat: updatedLat,
      validated_lng: updatedLng,
      has_coordinates: hasCoords,
      location_validation_status: updatedStatus,
      updated_at: now
    };

    if (this.db) {
      this.db.prepare(`
        UPDATE protests SET
          tanggal = ?,
          waktu_mulai = ?,
          waktu_selesai = ?,
          event_datetime = ?,
          lokasi = ?,
          titik_kumpul = ?,
          sasaran_aksi = ?,
          isu_tuntutan = ?,
          organisasi_kelompok = ?,
          korlap_pimpinan = ?,
          wilayah_hukum = ?,
          provinsi = ?,
          kota_kabupaten = ?,
          status = ?,
          urgency = ?,
          category_id = ?,
          validated_lat = ?,
          validated_lng = ?,
          has_coordinates = ?,
          actual_crowd_size = ?,
          situation_summary = ?,
          editorial_draft = ?,
          editorial_final = ?,
          is_archived = ?,
          completed_at = ?,
          completed_by_id = ?,
          completed_by_name = ?,
          suggested_lat = ?,
          suggested_lng = ?,
          suggested_address = ?,
          geocoding_provider = ?,
          geocoding_confidence = ?,
          location_validation_status = ?,
          geocoding_alternatives = ?,
          validated_at = ?,
          validated_by_id = ?,
          validated_by_name = ?,
          urutan_bulan = ?,
          tahun = ?,
          bulan = ?,
          kategori_kejadian = ?,
          kp_kpw = ?,
          regional = ?,
          kategori_isu = ?,
          dampak = ?,
          keterangan_dampak = ?,
          nama_pelapor = ?,
          info_awal = ?,
          tindak_lanjut = ?,
          progres_asistensi = ?,
          realisasi = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        updatedEvent.tanggal,
        updatedEvent.waktu_mulai,
        updatedEvent.waktu_selesai,
        updatedEvent.event_datetime || null,
        updatedEvent.lokasi,
        updatedEvent.titik_kumpul,
        updatedEvent.sasaran_aksi,
        updatedEvent.isu_tuntutan,
        updatedEvent.organisasi_kelompok,
        updatedEvent.korlap_pimpinan,
        updatedEvent.wilayah_hukum,
        updatedEvent.provinsi,
        updatedEvent.kota_kabupaten,
        updatedEvent.status,
        updatedEvent.urgency,
        updatedEvent.category_id,
        updatedEvent.validated_lat,
        updatedEvent.validated_lng,
        updatedEvent.has_coordinates ? 1 : 0,
        updatedEvent.actual_crowd_size,
        updatedEvent.situation_summary,
        updatedEvent.editorial_draft,
        updatedEvent.editorial_final,
        updatedEvent.is_archived ? 1 : 0,
        updatedEvent.completed_at ?? null,
        updatedEvent.completed_by_id ?? null,
        updatedEvent.completed_by_name ?? null,
        updatedEvent.suggested_lat ?? null,
        updatedEvent.suggested_lng ?? null,
        updatedEvent.suggested_address ?? null,
        updatedEvent.geocoding_provider ?? null,
        updatedEvent.geocoding_confidence ?? null,
        updatedEvent.location_validation_status ?? "unmapped",
        JSON.stringify(updatedEvent.geocoding_alternatives || []),
        updatedEvent.validated_at ?? null,
        updatedEvent.validated_by_id ?? null,
        updatedEvent.validated_by_name ?? null,
        updatedEvent.urutan_bulan ?? null,
        updatedEvent.tahun ?? null,
        updatedEvent.bulan ?? null,
        updatedEvent.kategori_kejadian ?? null,
        updatedEvent.kp_kpw ?? null,
        updatedEvent.regional ?? null,
        updatedEvent.kategori_isu ?? null,
        updatedEvent.dampak ?? null,
        updatedEvent.keterangan_dampak ?? null,
        updatedEvent.nama_pelapor ?? null,
        updatedEvent.info_awal ?? null,
        updatedEvent.tindak_lanjut ?? null,
        updatedEvent.progres_asistensi ?? null,
        updatedEvent.realisasi ?? null,
        now,
        existing.id
      );
    } else {
      this.memoryEvents.set(existing.id, updatedEvent);
    }

    if (updates.status && updates.status !== existing.status) {
      const effectiveUser = user || {
        id: "usr-system-admin",
        email: "admin@scc.go.id",
        name: "Petugas Operator SCC",
        role: "operator" as const,
        agency: "SCC - EAGLE EYES"
      };
      this.recordStatusHistory({
        protest_id: existing.id,
        from_status: existing.status,
        to_status: updates.status,
        reason: updates.situation_summary || `Perubahan status oleh ${effectiveUser.name}`,
        user: effectiveUser
      });
    }

    return updatedEvent;
  }

  async updateProtestStatus(
    id: string,
    newStatus: ProtestStatus,
    reason: string | null,
    user: UserProfile
  ): Promise<ProtestEvent | null> {
    if (isSupabaseConfigured()) {
      try {
        const res = await updateStatusInSupabase(id, newStatus, reason, user);
        if (this.db && res) {
          try { this.updateProtestStatusLocal(id, newStatus, reason, user); } catch {}
        }
        return res;
      } catch (err) {
        console.error("[ProtestDataStore] Supabase updateProtestStatus failed:", err);
        throw err;
      }
    }
    return this.updateProtestStatusLocal(id, newStatus, reason, user);
  }

  updateProtestStatusLocal(
    id: string,
    newStatus: ProtestStatus,
    reason: string | null,
    user: UserProfile
  ): ProtestEvent | null {
    const existing = this.getProtestByIdLocal(id);
    if (!existing) return null;

    const isArchived = newStatus === "completed" || newStatus === "cancelled";
    const completedAt = newStatus === "completed" ? new Date().toISOString() : existing.completed_at;

    const updated = this.updateProtestLocal(
      id,
      {
        status: newStatus,
        is_archived: isArchived,
        completed_at: completedAt,
        completed_by_id: newStatus === "completed" ? user.id : existing.completed_by_id,
        completed_by_name: newStatus === "completed" ? user.name : existing.completed_by_name
      },
      user
    );

    if (updated) {
      this.recordStatusHistory({
        protest_id: id,
        from_status: existing.status,
        to_status: newStatus,
        reason,
        user
      });
    }

    return updated;
  }

  softDeleteProtest(id: string, user?: UserProfile): boolean {
    const now = new Date().toISOString();
    if (this.db) {
      const res = this.db.prepare("UPDATE protests SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
      return res.changes > 0;
    }
    const existing = this.memoryEvents.get(id);
    if (existing) {
      existing.deleted_at = now;
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Reports, CCTV Links & Status History
  // ---------------------------------------------------------------------------

  async addOperatorReport(
    input: {
      protest_id: string;
      report_type: "initial" | "progress" | "summary";
      content: string;
      crowd_estimate?: number | null;
      is_pinned?: boolean;
    },
    user: UserProfile
  ): Promise<ProtestOperatorReport> {
    if (isSupabaseConfigured()) {
      try {
        const res = await addReportInSupabase(input, user);
        if (this.db) {
          try { this.addOperatorReportLocal(input, user); } catch {}
        }
        return res;
      } catch (err) {
        console.error("[ProtestDataStore] Supabase addReport failed:", err);
        throw err;
      }
    }
    return this.addOperatorReportLocal(input, user);
  }

  addOperatorReportLocal(
    input: {
      protest_id: string;
      report_type: "initial" | "progress" | "summary";
      content: string;
      crowd_estimate?: number | null;
      is_pinned?: boolean;
    },
    user: UserProfile
  ): ProtestOperatorReport {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const report: ProtestOperatorReport = {
      id,
      protest_id: input.protest_id,
      report_type: input.report_type,
      author_id: user.id,
      author_name: user.name,
      author_role: user.role,
      content: input.content,
      crowd_estimate: input.crowd_estimate ?? null,
      is_pinned: input.is_pinned ?? false,
      created_at: now,
      updated_at: now
    };

    if (this.db) {
      this.db.prepare(`
        INSERT INTO protest_operator_reports (
          id, protest_id, report_type, author_id, author_name, author_role,
          content, crowd_estimate, is_pinned, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        report.id,
        report.protest_id,
        report.report_type,
        report.author_id,
        report.author_name,
        report.author_role,
        report.content,
        report.crowd_estimate,
        report.is_pinned ? 1 : 0,
        report.created_at,
        report.updated_at || null
      );
    } else {
      const list = this.memoryReports.get(input.protest_id) || [];
      list.unshift(report);
      this.memoryReports.set(input.protest_id, list);
    }

    // Update protest situation summary & crowd size if summary report
    if (input.report_type === "summary" || input.crowd_estimate) {
      this.updateProtest(
        input.protest_id,
        {
          ...(input.crowd_estimate ? { actual_crowd_size: input.crowd_estimate } : {}),
          situation_summary: input.content
        },
        user
      );
    }

    return report;
  }

  async getOperatorReports(protestId: string): Promise<ProtestOperatorReport[]> {
    if (isSupabaseConfigured()) {
      try {
        return await fetchReportsFromSupabase(protestId);
      } catch (err) {
        console.error("[ProtestDataStore] Supabase getOperatorReports failed, falling back to local SQLite:", err);
      }
    }
    return this.getOperatorReportsLocal(protestId);
  }

  getOperatorReportsLocal(protestId: string): ProtestOperatorReport[] {
    if (this.db) {
      const rows = this.db.prepare(`
        SELECT * FROM protest_operator_reports
        WHERE protest_id = ?
        ORDER BY is_pinned DESC, created_at DESC
      `).all(protestId) as Array<Record<string, unknown>>;

      return rows.map((r) => ({
        id: String(r.id),
        protest_id: String(r.protest_id),
        report_type: r.report_type as "initial" | "progress" | "summary",
        author_id: String(r.author_id),
        author_name: String(r.author_name),
        author_role: (r.author_role || "operator") as UserProfile["role"],
        content: String(r.content),
        crowd_estimate: r.crowd_estimate != null ? Number(r.crowd_estimate) : null,
        is_pinned: Boolean(r.is_pinned),
        created_at: String(r.created_at),
        updated_at: String(r.updated_at)
      }));
    }

    return this.memoryReports.get(protestId) || [];
  }

  private recordStatusHistory(params: {
    protest_id: string;
    from_status: ProtestStatus | null;
    to_status: ProtestStatus;
    reason: string | null;
    user?: UserProfile;
  }): void {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const history: ProtestStatusHistory = {
      id,
      protest_id: params.protest_id,
      from_status: params.from_status,
      to_status: params.to_status,
      reason: params.reason,
      changed_by_id: params.user?.id || "00000000-0000-0000-0000-000000000000",
      changed_by_name: params.user?.name || "System",
      created_at: now
    };

    if (this.db) {
      this.db.prepare(`
        INSERT INTO protest_status_history (
          id, protest_id, from_status, to_status, reason, changed_by_id, changed_by_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        history.id,
        history.protest_id,
        history.from_status,
        history.to_status,
        history.reason,
        history.changed_by_id,
        history.changed_by_name,
        history.created_at
      );
    } else {
      const list = this.memoryHistory.get(params.protest_id) || [];
      list.unshift(history);
      this.memoryHistory.set(params.protest_id, list);
    }
  }

  async getStatusHistory(protestId: string): Promise<ProtestStatusHistory[]> {
    if (isSupabaseConfigured()) {
      try {
        return await fetchStatusHistoryFromSupabase(protestId);
      } catch (err) {
        console.error("[ProtestDataStore] Supabase getStatusHistory failed, falling back to local SQLite:", err);
      }
    }
    return this.getStatusHistoryLocal(protestId);
  }

  getStatusHistoryLocal(protestId: string): ProtestStatusHistory[] {
    if (this.db) {
      const rows = this.db.prepare(`
        SELECT * FROM protest_status_history
        WHERE protest_id = ?
        ORDER BY created_at DESC
      `).all(protestId) as Array<Record<string, unknown>>;

      return rows.map((r) => ({
        id: String(r.id),
        protest_id: String(r.protest_id),
        from_status: r.from_status as ProtestStatus | null,
        to_status: r.to_status as ProtestStatus,
        reason: r.reason ? String(r.reason) : null,
        changed_by_id: String(r.changed_by_id),
        changed_by_name: String(r.changed_by_name),
        created_at: String(r.created_at)
      }));
    }

    return this.memoryHistory.get(protestId) || [];
  }

  async linkCamera(
    input: {
      protest_id: string;
      point_id?: string | null;
      camera_id: string;
      notes?: string | null;
      is_recommended?: boolean;
    },
    user: UserProfile
  ): Promise<ProtestCameraLink | null> {
    if (isSupabaseConfigured()) {
      try {
        const cctvStore = getDataStore();
        const camera = cctvStore.getCameraById(input.camera_id);
        const protest = await this.getProtestById(input.protest_id);
        let distanceMeters = 0;
        if (input.point_id) {
          const pt = await this.getPointById(input.point_id);
          if (pt && pt.latitude != null && pt.longitude != null && camera) {
            distanceMeters = calculateDistanceMeters(
              pt.latitude,
              pt.longitude,
              camera.latitude,
              camera.longitude
            );
          }
        } else if (protest && protest.validated_lat != null && protest.validated_lng != null && camera) {
          distanceMeters = calculateDistanceMeters(
            protest.validated_lat,
            protest.validated_lng,
            camera.latitude,
            camera.longitude
          );
        }
        const res = await linkCameraInSupabase({
          protest_id: input.protest_id,
          point_id: input.point_id,
          camera_id: input.camera_id,
          camera_name: camera?.name || input.camera_id,
          camera_stream_url: camera?.stream_url,
          camera_protocol: camera?.protocol,
          camera_status: camera?.status,
          distance_meters: distanceMeters,
          notes: input.notes,
          is_recommended: input.is_recommended,
          linked_by_id: user.id,
          linked_by_name: user.name
        });
        if (this.db) {
          try { this.linkCameraLocal(input, user); } catch {}
        }
        return res;
      } catch (err) {
        console.error("[ProtestDataStore] Supabase linkCamera failed:", err);
        throw err;
      }
    }
    return this.linkCameraLocal(input, user);
  }

  linkCameraLocal(
    input: {
      protest_id: string;
      point_id?: string | null;
      camera_id: string;
      notes?: string | null;
      is_recommended?: boolean;
    },
    user: UserProfile
  ): ProtestCameraLink | null {
    const cctvStore = getDataStore();
    const camera = cctvStore.getCameraById(input.camera_id);
    const protest = this.getProtestByIdLocal(input.protest_id);
    if (!protest) return null;

    let distanceMeters = 0;
    if (input.point_id) {
      const pt = this.getPointByIdLocal(input.point_id);
      if (pt && pt.latitude != null && pt.longitude != null && camera) {
        distanceMeters = calculateDistanceMeters(
          pt.latitude,
          pt.longitude,
          camera.latitude,
          camera.longitude
        );
      }
    } else if (protest.validated_lat != null && protest.validated_lng != null && camera) {
      distanceMeters = calculateDistanceMeters(
        protest.validated_lat,
        protest.validated_lng,
        camera.latitude,
        camera.longitude
      );
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const link: ProtestCameraLink = {
      id,
      protest_id: input.protest_id,
      point_id: input.point_id || null,
      camera_id: camera?.id || input.camera_id,
      camera_name: camera?.name || input.camera_id,
      camera_stream_url: camera?.stream_url || "",
      camera_protocol: camera?.protocol || "HLS",
      camera_status: camera?.status || "ONLINE",
      distance_meters: distanceMeters,
      notes: input.notes || null,
      is_recommended: input.is_recommended || false,
      linked_by_id: user.id,
      linked_by_name: user.name,
      created_at: now,
      camera
    };

    if (this.db) {
      this.db.prepare(`
        INSERT INTO protest_camera_links (
          id, protest_id, point_id, camera_id, camera_name, camera_stream_url, camera_protocol,
          camera_status, distance_meters, notes, is_recommended, linked_by_id, linked_by_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(protest_id, camera_id) DO UPDATE SET
          point_id = excluded.point_id,
          distance_meters = excluded.distance_meters,
          notes = excluded.notes,
          camera_status = excluded.camera_status
      `).run(
        link.id,
        link.protest_id,
        link.point_id || null,
        link.camera_id,
        link.camera_name,
        link.camera_stream_url || null,
        link.camera_protocol || null,
        link.camera_status || null,
        link.distance_meters,
        link.notes || null,
        link.is_recommended ? 1 : 0,
        link.linked_by_id,
        link.linked_by_name,
        link.created_at
      );
    } else {
      const targetCamId = camera?.id || input.camera_id;
      const list = this.memoryLinks.get(input.protest_id) || [];
      const filtered = list.filter((l) => l.camera_id !== targetCamId);
      filtered.push(link);
      this.memoryLinks.set(input.protest_id, filtered);
    }

    return link;
  }

  async unlinkCamera(protestId: string, cameraId: string): Promise<boolean> {
    if (isSupabaseConfigured()) {
      try {
        const res = await unlinkCameraInSupabase(protestId, cameraId);
        if (this.db) {
          try { this.unlinkCameraLocal(protestId, cameraId); } catch {}
        }
        return res;
      } catch (err) {
        console.error("[ProtestDataStore] Supabase unlinkCamera failed:", err);
        throw err;
      }
    }
    return this.unlinkCameraLocal(protestId, cameraId);
  }

  unlinkCameraLocal(protestId: string, cameraId: string): boolean {
    if (this.db) {
      const res = this.db.prepare("DELETE FROM protest_camera_links WHERE protest_id = ? AND camera_id = ?").run(protestId, cameraId);
      return res.changes > 0;
    }
    const list = this.memoryLinks.get(protestId) || [];
    const filtered = list.filter((l) => l.camera_id !== cameraId);
    this.memoryLinks.set(protestId, filtered);
    return true;
  }

  async getCameraLinks(protestId: string): Promise<ProtestCameraLink[]> {
    if (isSupabaseConfigured()) {
      try {
        return await fetchCameraLinksFromSupabase(protestId);
      } catch (err) {
        console.error("[ProtestDataStore] Supabase getCameraLinks failed, falling back to local SQLite:", err);
      }
    }
    return this.getCameraLinksLocal(protestId);
  }

  getCameraLinksLocal(protestId: string, pointId?: string): ProtestCameraLink[] {
    const cctvStore = getDataStore();
    if (this.db) {
      let query = `
        SELECT * FROM protest_camera_links
        WHERE protest_id = ?
      `;
      const params: any[] = [protestId];
      if (pointId) {
        query += ` AND (point_id = ? OR point_id IS NULL)`;
        params.push(pointId);
      }
      query += ` ORDER BY distance_meters ASC`;

      const rows = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>;

      return rows.map((r) => {
        const camId = String(r.camera_id);
        return {
          id: String(r.id),
          protest_id: String(r.protest_id),
          point_id: r.point_id ? String(r.point_id) : null,
          camera_id: camId,
          camera_name: String(r.camera_name),
          camera_stream_url: r.camera_stream_url ? String(r.camera_stream_url) : undefined,
          camera_protocol: r.camera_protocol ? String(r.camera_protocol) : undefined,
          camera_status: r.camera_status ? String(r.camera_status) : undefined,
          distance_meters: Number(r.distance_meters || 0),
          notes: r.notes ? String(r.notes) : null,
          is_recommended: Boolean(r.is_recommended),
          linked_by_id: String(r.linked_by_id),
          linked_by_name: String(r.linked_by_name),
          created_at: String(r.created_at),
          camera: cctvStore.getCameraById(camId)
        };
      });
    }

    const list = this.memoryLinks.get(protestId) || [];
    if (pointId) {
      return list.filter((l) => !l.point_id || l.point_id === pointId);
    }
    return list;
  }

  /**
   * Spatial CCTV Recommendation Engine:
   * Finds the nearest cameras from the 23,356 CCTV catalog to a given coordinate.
   */
  getNearbyCamerasForCoordinates(
    lat: number,
    lng: number,
    radiusMeters = 5000,
    limit = 10
  ): Array<any> {
    const cctvStore = getDataStore();
    const allCameras = cctvStore.getAllCameras();
    const matches: Array<any> = [];

    // Pre-filter bounding box (~0.05 degrees ~ 5.5km)
    const latDelta = radiusMeters / 111000;
    const lngDelta = radiusMeters / (111000 * Math.cos((lat * Math.PI) / 180));

    for (const cam of allCameras) {
      if (
        Math.abs(cam.latitude - lat) <= latDelta &&
        Math.abs(cam.longitude - lng) <= lngDelta
      ) {
        const d = calculateDistanceMeters(lat, lng, cam.latitude, cam.longitude);
        if (d <= radiusMeters) {
          matches.push({
            id: cam.id,
            name: cam.name,
            location: cam.location,
            latitude: cam.latitude,
            longitude: cam.longitude,
            city_id: cam.city_id,
            city_name: cam.city_name,
            source_id: cam.source_id,
            source_name: cam.source_name,
            stream_url: cam.stream_url,
            status: cam.status,
            distance_meters: Math.round(d),
            camera: cam
          });
        }
      }
    }

    matches.sort((a, b) => a.distance_meters - b.distance_meters);
    return matches.slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Idempotent Excel Synchronization
  // ---------------------------------------------------------------------------

  /**
   * Upsert records parsed from OneDrive worksheet 'NEW UNRAS 2022-2026'
   * CRITICAL GUARANTEE: Never overwrites operator-managed fields!
   */
  async upsertFromExcelBatch(
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
      raw_source_payload?: Record<string, unknown>;
    }>
  ): Promise<{
    processed: number;
    created: number;
    updated: number;
    skipped: number;
    failed?: number;
  }> {
    if (isSupabaseConfigured()) {
      try {
        const res = await upsertExcelBatchInSupabase(records as any);
        if (this.db) {
          try { this.upsertFromExcelBatchLocal(records); } catch {}
        }
        return {
          processed: res.inserted + res.updated + res.skipped + (res.failed || 0),
          created: res.inserted,
          error: res.error,
          ...res
        };
      } catch (err) {
        console.error("[ProtestDataStore] Supabase upsertExcelBatch failed:", err);
        throw err;
      }
    }
    return this.upsertFromExcelBatchLocal(records);
  }

  upsertFromExcelBatchLocal(
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
      raw_source_payload?: Record<string, unknown>;
    }>
  ): {
    processed: number;
    created: number;
    updated: number;
    skipped: number;
  } {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (const rec of records) {
      if (!rec.id_kejadian || !rec.isu_tuntutan || !rec.lokasi) {
        skipped++;
        continue;
      }

      const existing = this.getProtestByIdLocal(rec.id_kejadian);

      if (existing) {
        // UPDATE ONLY EXCEL FIELDS — PRESERVE OPERATOR FIELDS
        if (this.db) {
          this.db.prepare(`
            UPDATE protests SET
              kode_unras = ?,
              tanggal = ?,
              waktu_mulai = ?,
              waktu_selesai = ?,
              event_datetime = ?,
              lokasi = ?,
              titik_kumpul = ?,
              sasaran_aksi = ?,
              isu_tuntutan = ?,
              estimasi_massa_source = ?,
              organisasi_kelompok = ?,
              korlap_pimpinan = ?,
              wilayah_hukum = ?,
              provinsi = ?,
              kota_kabupaten = ?,
              keterangan_source = ?,
              raw_source_payload = ?,
              regional = COALESCE(?, regional),
              kategori_isu = COALESCE(?, kategori_isu),
              dampak = COALESCE(?, dampak),
              last_synced_at = ?,
              updated_at = ?
            WHERE id = ?
          `).run(
            rec.kode_unras || existing.kode_unras,
            rec.tanggal || existing.tanggal,
            rec.waktu_mulai ?? existing.waktu_mulai,
            rec.waktu_selesai ?? existing.waktu_selesai,
            (rec.event_datetime ?? existing.event_datetime) || null,
            rec.lokasi || existing.lokasi,
            rec.titik_kumpul ?? existing.titik_kumpul,
            rec.sasaran_aksi ?? existing.sasaran_aksi,
            rec.isu_tuntutan || existing.isu_tuntutan,
            rec.estimasi_massa_source ?? existing.estimasi_massa_source,
            rec.organisasi_kelompok ?? existing.organisasi_kelompok,
            rec.korlap_pimpinan ?? existing.korlap_pimpinan,
            rec.wilayah_hukum ?? existing.wilayah_hukum,
            rec.provinsi ?? existing.provinsi,
            rec.kota_kabupaten ?? existing.kota_kabupaten,
            rec.keterangan_source ?? existing.keterangan_source,
            JSON.stringify(rec.raw_source_payload || {}),
            (rec as any).regional ?? null,
            (rec as any).kategori_isu ?? null,
            (rec as any).dampak ?? null,
            now,
            now,
            existing.id
          );
        } else {
          existing.kode_unras = rec.kode_unras || existing.kode_unras;
          existing.tanggal = rec.tanggal || existing.tanggal;
          existing.waktu_mulai = rec.waktu_mulai ?? existing.waktu_mulai;
          existing.waktu_selesai = rec.waktu_selesai ?? existing.waktu_selesai;
          existing.event_datetime = rec.event_datetime ?? existing.event_datetime;
          existing.lokasi = rec.lokasi || existing.lokasi;
          existing.titik_kumpul = rec.titik_kumpul ?? existing.titik_kumpul;
          existing.sasaran_aksi = rec.sasaran_aksi ?? existing.sasaran_aksi;
          existing.isu_tuntutan = rec.isu_tuntutan || existing.isu_tuntutan;
          existing.estimasi_massa_source = rec.estimasi_massa_source ?? existing.estimasi_massa_source;
          existing.organisasi_kelompok = rec.organisasi_kelompok ?? existing.organisasi_kelompok;
          existing.korlap_pimpinan = rec.korlap_pimpinan ?? existing.korlap_pimpinan;
          existing.wilayah_hukum = rec.wilayah_hukum ?? existing.wilayah_hukum;
          existing.provinsi = rec.provinsi ?? existing.provinsi;
          existing.kota_kabupaten = rec.kota_kabupaten ?? existing.kota_kabupaten;
          existing.keterangan_source = rec.keterangan_source ?? existing.keterangan_source;
          existing.raw_source_payload = rec.raw_source_payload || {};
          existing.last_synced_at = now;
          existing.updated_at = now;
        }
        updated++;
      } else {
        // CREATE NEW PROTEST FROM EXCEL
        const id = crypto.randomUUID();
        const newEvent: ProtestEvent = {
          id,
          id_kejadian: rec.id_kejadian,
          kode_unras: rec.kode_unras || `UNR-${Date.now()}`,
          tanggal: rec.tanggal,
          waktu_mulai: rec.waktu_mulai || null,
          waktu_selesai: rec.waktu_selesai || null,
          event_datetime: rec.event_datetime || null,
          lokasi: rec.lokasi,
          titik_kumpul: rec.titik_kumpul || null,
          sasaran_aksi: rec.sasaran_aksi || null,
          isu_tuntutan: rec.isu_tuntutan,
          estimasi_massa_source: rec.estimasi_massa_source ?? null,
          organisasi_kelompok: rec.organisasi_kelompok || null,
          korlap_pimpinan: rec.korlap_pimpinan || null,
          wilayah_hukum: rec.wilayah_hukum || null,
          provinsi: rec.provinsi || null,
          kota_kabupaten: rec.kota_kabupaten || null,
          keterangan_source: rec.keterangan_source || null,
          raw_source_payload: rec.raw_source_payload || {},
          status: "scheduled",
          urgency: (rec.estimasi_massa_source && rec.estimasi_massa_source >= 1000) ? "high" : "medium",
          category_id: null,
          category_name: null,
          validated_lat: null,
          validated_lng: null,
          has_coordinates: false,
          actual_crowd_size: null,
          situation_summary: null,
          editorial_draft: null,
          editorial_final: null,
          is_archived: false,
          completed_at: null,
          completed_by_id: null,
          completed_by_name: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          last_synced_at: now
        };

        if (this.db) {
          this.db.prepare(`
            INSERT INTO protests (
              id, id_kejadian, kode_unras, tanggal, waktu_mulai, waktu_selesai, event_datetime,
              lokasi, titik_kumpul, sasaran_aksi, isu_tuntutan, estimasi_massa_source,
              organisasi_kelompok, korlap_pimpinan, wilayah_hukum, provinsi, kota_kabupaten,
              keterangan_source, raw_source_payload, status, urgency, category_id,
              validated_lat, validated_lng, has_coordinates, actual_crowd_size, situation_summary,
              editorial_draft, editorial_final, is_archived, completed_at, completed_by_id,
              completed_by_name, created_at, updated_at, deleted_at, last_synced_at,
              regional, kategori_isu, dampak
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?
            )
          `).run(
            newEvent.id,
            newEvent.id_kejadian,
            newEvent.kode_unras,
            newEvent.tanggal,
            newEvent.waktu_mulai,
            newEvent.waktu_selesai,
            newEvent.event_datetime || null,
            newEvent.lokasi,
            newEvent.titik_kumpul,
            newEvent.sasaran_aksi,
            newEvent.isu_tuntutan,
            newEvent.estimasi_massa_source,
            newEvent.organisasi_kelompok,
            newEvent.korlap_pimpinan,
            newEvent.wilayah_hukum,
            newEvent.provinsi,
            newEvent.kota_kabupaten,
            newEvent.keterangan_source,
            JSON.stringify(newEvent.raw_source_payload || {}),
            newEvent.status,
            newEvent.urgency,
            newEvent.category_id,
            newEvent.validated_lat,
            newEvent.validated_lng,
            newEvent.has_coordinates ? 1 : 0,
            newEvent.actual_crowd_size,
            newEvent.situation_summary,
            newEvent.editorial_draft,
            newEvent.editorial_final,
            newEvent.is_archived ? 1 : 0,
            newEvent.completed_at,
            newEvent.completed_by_id,
            newEvent.completed_by_name,
            newEvent.created_at,
            newEvent.updated_at,
            newEvent.deleted_at,
            newEvent.last_synced_at,
            (rec as any).regional ?? null,
            (rec as any).kategori_isu ?? null,
            (rec as any).dampak ?? null
          );
        } else {
          this.memoryEvents.set(newEvent.id, newEvent);
        }
        created++;
      }
    }

    return {
      processed: records.length,
      created,
      updated,
      skipped
    };
  }

  // ---------------------------------------------------------------------------
  // Sync Logs
  // ---------------------------------------------------------------------------

  async createSyncLog(initial: {
    id?: string;
    started_at?: string;
    completed_at?: string | null;
    period_start?: string | null;
    period_end?: string | null;
    status?: ProtestSyncLog["status"];
    triggered_by: ProtestSyncLog["triggered_by"];
    triggered_by_user?: string | null;
    source_worksheet?: string;
    records_received?: number;
    records_processed?: number;
    records_created?: number;
    records_updated?: number;
    records_skipped?: number;
    records_failed?: number;
    error_details?: string | null;
    duration_ms?: number | null;
  }): Promise<ProtestSyncLog> {
    const local = this.createSyncLogLocal(initial);
    if (isSupabaseConfigured()) {
      try {
        await createSyncLogInSupabase(local);
      } catch (err) {
        console.error("[ProtestDataStore] Supabase createSyncLog failed:", err);
      }
    }
    return local;
  }

  createSyncLogLocal(initial: {
    id?: string;
    started_at?: string;
    completed_at?: string | null;
    period_start?: string | null;
    period_end?: string | null;
    status?: ProtestSyncLog["status"];
    triggered_by: ProtestSyncLog["triggered_by"];
    triggered_by_user?: string | null;
    source_worksheet?: string;
    records_received?: number;
    records_processed?: number;
    records_created?: number;
    records_updated?: number;
    records_skipped?: number;
    records_failed?: number;
    error_details?: string | null;
    duration_ms?: number | null;
  }): ProtestSyncLog {
    const id = initial.id || crypto.randomUUID();
    const now = initial.started_at || new Date().toISOString();
    const log: ProtestSyncLog = {
      id,
      started_at: now,
      completed_at: initial.completed_at || null,
      period_start: initial.period_start || null,
      period_end: initial.period_end || null,
      status: initial.status || "running",
      triggered_by: initial.triggered_by,
      triggered_by_user: initial.triggered_by_user || null,
      source_worksheet: initial.source_worksheet || "NEW UNRAS 2022-2026",
      records_received: initial.records_received || 0,
      records_processed: initial.records_processed || 0,
      records_created: initial.records_created || 0,
      records_updated: initial.records_updated || 0,
      records_skipped: initial.records_skipped || 0,
      records_failed: initial.records_failed || 0,
      error_details: initial.error_details || null,
      duration_ms: initial.duration_ms ?? null
    };

    if (this.db) {
      this.db.prepare(`
        INSERT INTO protest_sync_logs (
          id, started_at, completed_at, period_start, period_end, status, triggered_by, triggered_by_user,
          source_worksheet, records_received, records_processed, records_created, records_updated, records_skipped,
          records_failed, error_details, duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        log.id,
        log.started_at,
        log.completed_at || null,
        log.period_start || null,
        log.period_end || null,
        log.status,
        log.triggered_by,
        log.triggered_by_user || null,
        log.source_worksheet,
        log.records_received || 0,
        log.records_processed,
        log.records_created,
        log.records_updated,
        log.records_skipped,
        log.records_failed || 0,
        log.error_details || null,
        log.duration_ms ?? null
      );
    } else {
      this.memorySyncLogs.unshift(log);
    }

    return log;
  }

  async updateSyncLog(
    id: string,
    updates: Partial<ProtestSyncLog>
  ): Promise<ProtestSyncLog | null> {
    const local = this.updateSyncLogLocal(id, updates);
    if (isSupabaseConfigured()) {
      try {
        await updateSyncLogInSupabase(id, updates);
      } catch (err) {
        console.error("[ProtestDataStore] Supabase updateSyncLog failed:", err);
      }
    }
    return local;
  }

  updateSyncLogLocal(
    id: string,
    updates: Partial<ProtestSyncLog>
  ): ProtestSyncLog | null {
    const now = new Date().toISOString();
    if (this.db) {
      const existing = this.db.prepare("SELECT * FROM protest_sync_logs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      if (!existing) return null;

      const startedAt = new Date(String(existing.started_at)).getTime();
      const completedAt = updates.completed_at || now;
      const durationMs = Math.round(new Date(completedAt).getTime() - startedAt);

      this.db.prepare(`
        UPDATE protest_sync_logs SET
          completed_at = ?,
          period_start = ?,
          period_end = ?,
          status = ?,
          records_received = ?,
          records_processed = ?,
          records_created = ?,
          records_updated = ?,
          records_skipped = ?,
          records_failed = ?,
          error_details = ?,
          duration_ms = ?
        WHERE id = ?
      `).run(
        completedAt,
        updates.period_start !== undefined ? updates.period_start : (existing.period_start ? String(existing.period_start) : null),
        updates.period_end !== undefined ? updates.period_end : (existing.period_end ? String(existing.period_end) : null),
        String(updates.status || existing.status),
        Number(updates.records_received ?? existing.records_received ?? 0),
        Number(updates.records_processed ?? existing.records_processed ?? 0),
        Number(updates.records_created ?? existing.records_created ?? 0),
        Number(updates.records_updated ?? existing.records_updated ?? 0),
        Number(updates.records_skipped ?? existing.records_skipped ?? 0),
        Number(updates.records_failed ?? existing.records_failed ?? 0),
        updates.error_details !== undefined ? updates.error_details : (existing.error_details ? String(existing.error_details) : null),
        durationMs,
        id
      );

      const updated = this.db.prepare("SELECT * FROM protest_sync_logs WHERE id = ?").get(id) as Record<string, unknown>;
      return {
        id: String(updated.id),
        started_at: String(updated.started_at),
        completed_at: updated.completed_at ? String(updated.completed_at) : null,
        period_start: updated.period_start ? String(updated.period_start) : null,
        period_end: updated.period_end ? String(updated.period_end) : null,
        status: updated.status as ProtestSyncLog["status"],
        triggered_by: updated.triggered_by as ProtestSyncLog["triggered_by"],
        triggered_by_user: updated.triggered_by_user ? String(updated.triggered_by_user) : null,
        source_worksheet: String(updated.source_worksheet),
        records_received: Number(updated.records_received || 0),
        records_processed: Number(updated.records_processed || 0),
        records_created: Number(updated.records_created || 0),
        records_updated: Number(updated.records_updated || 0),
        records_skipped: Number(updated.records_skipped || 0),
        records_failed: Number(updated.records_failed || 0),
        error_details: updated.error_details ? String(updated.error_details) : null,
        duration_ms: updated.duration_ms != null ? Number(updated.duration_ms) : null
      };
    }

    const log = this.memorySyncLogs.find((l) => l.id === id);
    if (!log) return null;
    Object.assign(log, updates);
    log.completed_at = updates.completed_at || now;
    log.duration_ms = new Date(log.completed_at).getTime() - new Date(log.started_at).getTime();
    return log;
  }

  async getSyncLogs(limit = 20): Promise<ProtestSyncLog[]> {
    if (isSupabaseConfigured()) {
      try {
        return await fetchSyncLogsFromSupabase(limit);
      } catch (err) {
        console.error("[ProtestDataStore] Supabase getSyncLogs failed, falling back to local SQLite:", err);
      }
    }
    return this.getSyncLogsLocal(limit);
  }

  getSyncLogsLocal(limit = 20): ProtestSyncLog[] {
    if (this.db) {
      const rows = this.db.prepare(`
        SELECT * FROM protest_sync_logs
        ORDER BY started_at DESC
        LIMIT ?
      `).all(limit) as Array<Record<string, unknown>>;

      return rows.map((r) => ({
        id: String(r.id),
        started_at: String(r.started_at),
        completed_at: r.completed_at ? String(r.completed_at) : null,
        period_start: r.period_start ? String(r.period_start) : null,
        period_end: r.period_end ? String(r.period_end) : null,
        status: r.status as ProtestSyncLog["status"],
        triggered_by: r.triggered_by as ProtestSyncLog["triggered_by"],
        triggered_by_user: r.triggered_by_user ? String(r.triggered_by_user) : null,
        source_worksheet: String(r.source_worksheet),
        records_received: Number(r.records_received || 0),
        records_processed: Number(r.records_processed || 0),
        records_created: Number(r.records_created || 0),
        records_updated: Number(r.records_updated || 0),
        records_skipped: Number(r.records_skipped || 0),
        records_failed: Number(r.records_failed || 0),
        error_details: r.error_details ? String(r.error_details) : null,
        duration_ms: r.duration_ms != null ? Number(r.duration_ms) : null
      }));
    }

    return this.memorySyncLogs.slice(0, limit);
  }

  async getSyncLogById(id: string): Promise<ProtestSyncLog | null> {
    if (isSupabaseConfigured()) {
      try {
        const remote = await fetchSyncLogByIdFromSupabase(id);
        if (remote) return remote;
      } catch (err) {
        console.error("[ProtestDataStore] Supabase getSyncLogById failed, fallback to local:", err);
      }
    }
    return this.getSyncLogByIdLocal(id);
  }

  getSyncLogByIdLocal(id: string): ProtestSyncLog | null {
    if (this.db) {
      const r = this.db.prepare("SELECT * FROM protest_sync_logs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      if (!r) return null;
      return {
        id: String(r.id),
        started_at: String(r.started_at),
        completed_at: r.completed_at ? String(r.completed_at) : null,
        period_start: r.period_start ? String(r.period_start) : null,
        period_end: r.period_end ? String(r.period_end) : null,
        status: r.status as ProtestSyncLog["status"],
        triggered_by: r.triggered_by as ProtestSyncLog["triggered_by"],
        triggered_by_user: r.triggered_by_user ? String(r.triggered_by_user) : null,
        source_worksheet: String(r.source_worksheet),
        records_received: Number(r.records_received || 0),
        records_processed: Number(r.records_processed || 0),
        records_created: Number(r.records_created || 0),
        records_updated: Number(r.records_updated || 0),
        records_skipped: Number(r.records_skipped || 0),
        records_failed: Number(r.records_failed || 0),
        error_details: r.error_details ? String(r.error_details) : null,
        duration_ms: r.duration_ms != null ? Number(r.duration_ms) : null
      };
    }
    const log = this.memorySyncLogs.find((l) => l.id === id);
    return log || null;
  }

  // ---------------------------------------------------------------------------
  // Statistics & KPIs
  // ---------------------------------------------------------------------------

  async getStats(): Promise<ProtestStats> {
    if (isSupabaseConfigured()) {
      try {
        return await fetchStatsFromSupabase();
      } catch (err) {
        console.error("[ProtestDataStore] Supabase getStats failed, falling back to local SQLite:", err);
      }
    }
    return this.getStatsLocal();
  }

  getStatsLocal(): ProtestStats {
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

    if (this.db) {
      const row = this.db.prepare(`
        SELECT
          COUNT(*) as total_events,
          SUM(CASE WHEN status = 'scheduled' AND is_archived = 0 THEN 1 ELSE 0 END) as scheduled_events,
          SUM(CASE WHEN status = 'ongoing' AND is_archived = 0 THEN 1 ELSE 0 END) as ongoing_events,
          SUM(CASE WHEN status = 'monitoring' AND is_archived = 0 THEN 1 ELSE 0 END) as monitoring_events,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_events,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_events,
          SUM(CASE WHEN urgency IN ('high', 'critical') AND is_archived = 0 THEN 1 ELSE 0 END) as high_critical_urgency,
          SUM(CASE WHEN (validated_lat IS NULL OR validated_lng IS NULL) AND is_archived = 0 THEN 1 ELSE 0 END) as events_without_coords,
          SUM(CASE WHEN tanggal = ? THEN 1 ELSE 0 END) as today_events,
          SUM(CASE WHEN status = 'completed' AND SUBSTR(completed_at, 1, 10) = ? THEN 1 ELSE 0 END) as completed_today
        FROM protests
        WHERE deleted_at IS NULL
      `).get(todayStr, todayStr) as Record<string, number>;

      const linkRow = this.db.prepare("SELECT COUNT(*) as links FROM protest_camera_links").get() as { links: number };
      const lastSyncRow = this.db.prepare("SELECT completed_at FROM protest_sync_logs WHERE status = 'success' ORDER BY started_at DESC LIMIT 1").get() as { completed_at?: string } | undefined;

      return {
        total_events: Number(row.total_events || 0),
        scheduled_events: Number(row.scheduled_events || 0),
        ongoing_events: Number(row.ongoing_events || 0),
        monitoring_events: Number(row.monitoring_events || 0),
        completed_events: Number(row.completed_events || 0),
        cancelled_events: Number(row.cancelled_events || 0),
        high_critical_urgency: Number(row.high_critical_urgency || 0),
        events_without_coords: Number(row.events_without_coords || 0),
        today_events: Number(row.today_events || 0),
        completed_today: Number(row.completed_today || 0),
        total_camera_links: Number(linkRow?.links || 0),
        last_successful_sync: lastSyncRow?.completed_at || null
      };
    }

    const items = Array.from(this.memoryEvents.values()).filter((e) => !e.deleted_at);
    let scheduled = 0;
    let ongoing = 0;
    let monitoring = 0;
    let completed = 0;
    let cancelled = 0;
    let highCritical = 0;
    let noCoords = 0;
    let todayCount = 0;
    let completedToday = 0;

    for (const e of items) {
      if (e.status === "scheduled" && !e.is_archived) scheduled++;
      if (e.status === "ongoing" && !e.is_archived) ongoing++;
      if (e.status === "monitoring" && !e.is_archived) monitoring++;
      if (e.status === "completed") completed++;
      if (e.status === "cancelled") cancelled++;
      if (["high", "critical"].includes(e.urgency) && !e.is_archived) highCritical++;
      if (!e.validated_lat && !e.is_archived) noCoords++;
      if (e.tanggal === todayStr) todayCount++;
      if (e.status === "completed" && e.completed_at && e.completed_at.startsWith(todayStr)) completedToday++;
    }

    return {
      total_events: items.length,
      scheduled_events: scheduled,
      ongoing_events: ongoing,
      monitoring_events: monitoring,
      completed_events: completed,
      cancelled_events: cancelled,
      high_critical_urgency: highCritical,
      events_without_coords: noCoords,
      today_events: todayCount,
      completed_today: completedToday,
      total_camera_links: this.memoryLinks.size,
      last_successful_sync: this.memorySyncLogs.find((l) => l.status === "success")?.completed_at || null
    };
  }

  // ---------------------------------------------------------------------------
  // Multi-Point UNRAS & Crowd Observation Methods (Migration 008)
  // ---------------------------------------------------------------------------

  async createPoint(input: Partial<ProtestPoint> & { protest_id: string; point_name: string }): Promise<ProtestPoint> {
    this.init();
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const point: ProtestPoint = {
      id,
      protest_id: input.protest_id,
      point_name: input.point_name,
      location_address: input.location_address || null,
      provinsi: input.provinsi || null,
      kota_kabupaten: input.kota_kabupaten || null,
      regional: input.regional || null,
      latitude: input.latitude != null ? Number(input.latitude) : null,
      longitude: input.longitude != null ? Number(input.longitude) : null,
      status: input.status || "scheduled",
      urgency: input.urgency || "medium",
      notes: input.notes || null,
      created_at: now,
      updated_at: now
    };

    if (this.db) {
      this.db.prepare(`
        INSERT INTO protest_points (
          id, protest_id, point_name, location_address, provinsi, kota_kabupaten,
          regional, latitude, longitude, status, urgency, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        point.id,
        point.protest_id,
        point.point_name,
        point.location_address ?? null,
        point.provinsi ?? null,
        point.kota_kabupaten ?? null,
        point.regional ?? null,
        point.latitude ?? null,
        point.longitude ?? null,
        point.status,
        point.urgency,
        point.notes ?? null,
        point.created_at,
        point.updated_at
      );
    } else {
      this.memoryPoints.set(point.id, point);
    }

    return point;
  }

  async getPointsByProtestId(protestId: string): Promise<ProtestPoint[]> {
    this.init();
    let points: ProtestPoint[] = [];

    if (this.db) {
      const rows = this.db.prepare(`
        SELECT * FROM protest_points
        WHERE protest_id = ?
        ORDER BY created_at ASC
      `).all(protestId) as Array<Record<string, unknown>>;

      points = rows.map((r) => ({
        id: String(r.id),
        protest_id: String(r.protest_id),
        point_name: String(r.point_name),
        location_address: r.location_address ? String(r.location_address) : null,
        provinsi: r.provinsi ? String(r.provinsi) : null,
        kota_kabupaten: r.kota_kabupaten ? String(r.kota_kabupaten) : null,
        regional: r.regional ? String(r.regional) : null,
        latitude: r.latitude != null ? Number(r.latitude) : null,
        longitude: r.longitude != null ? Number(r.longitude) : null,
        status: (r.status as ProtestStatus) || "scheduled",
        urgency: (r.urgency as ProtestUrgency) || "medium",
        notes: r.notes ? String(r.notes) : null,
        created_at: String(r.created_at),
        updated_at: String(r.updated_at)
      }));
    } else {
      points = Array.from(this.memoryPoints.values()).filter((p) => p.protest_id === protestId);
    }

    // Attach elements, crowd observations, and metrics for each point
    for (const pt of points) {
      const elements = await this.getElementsByPointId(pt.id);
      const observations = await this.getCrowdObservationsByPoint(pt.id);

      let totalPointCrowd = 0;
      let totalPointDelta = 0;
      const hasAnyObservations = observations.length > 0;

      for (const el of elements) {
        const elObs = observations
          .filter((o) => o.element_id === el.id || o.element_name.toLowerCase() === el.name.toLowerCase())
          .sort((a, b) => b.observation_timestamp.localeCompare(a.observation_timestamp));

        el.observations = elObs;
        if (elObs.length > 0) {
          el.latest_crowd = elObs[0].crowd_estimate;
          el.previous_crowd = elObs.length > 1 ? elObs[1].crowd_estimate : undefined;
          el.crowd_delta = el.previous_crowd !== undefined ? el.latest_crowd - el.previous_crowd : 0;
          el.verification_status = elObs[0].verification_status;
          el.last_observed_at = elObs[0].observation_timestamp;

          totalPointCrowd += el.latest_crowd;
          totalPointDelta += el.crowd_delta;
        } else {
          el.latest_crowd = 0;
          el.crowd_delta = 0;
          el.verification_status = "unverified";
        }
      }

      pt.elements = elements;
      pt.current_crowd_total = totalPointCrowd;
      pt.crowd_change_delta = totalPointDelta;
      pt.crowd_trend = !hasAnyObservations
        ? "none"
        : totalPointDelta > 0
        ? "up"
        : totalPointDelta < 0
        ? "down"
        : "stable";

      if (observations.length > 0) {
        pt.last_observation_at = observations[0].observation_timestamp;
      }
    }

    return points;
  }

  getPointByIdLocal(pointId: string): ProtestPoint | null {
    this.init();
    if (this.db) {
      const r = this.db.prepare("SELECT * FROM protest_points WHERE id = ?").get(pointId) as Record<string, unknown> | undefined;
      if (!r) return null;
      return {
        id: String(r.id),
        protest_id: String(r.protest_id),
        point_name: String(r.point_name),
        location_address: r.location_address ? String(r.location_address) : null,
        provinsi: r.provinsi ? String(r.provinsi) : null,
        kota_kabupaten: r.kota_kabupaten ? String(r.kota_kabupaten) : null,
        regional: r.regional ? String(r.regional) : null,
        latitude: r.latitude != null ? Number(r.latitude) : null,
        longitude: r.longitude != null ? Number(r.longitude) : null,
        status: (r.status as ProtestStatus) || "scheduled",
        urgency: (r.urgency as ProtestUrgency) || "medium",
        notes: r.notes ? String(r.notes) : null,
        created_at: String(r.created_at),
        updated_at: String(r.updated_at)
      };
    }
    return this.memoryPoints.get(pointId) || null;
  }

  async getPointById(pointId: string): Promise<ProtestPoint | null> {
    const pt = this.getPointByIdLocal(pointId);
    if (!pt) return null;

    const elements = await this.getElementsByPointId(pt.id);
    const observations = await this.getCrowdObservationsByPoint(pt.id);
    pt.elements = elements;

    let totalPointCrowd = 0;
    let totalPointDelta = 0;
    for (const el of elements) {
      const elObs = observations
        .filter((o) => o.element_id === el.id || o.element_name.toLowerCase() === el.name.toLowerCase())
        .sort((a, b) => b.observation_timestamp.localeCompare(a.observation_timestamp));
      el.observations = elObs;
      if (elObs.length > 0) {
        el.latest_crowd = elObs[0].crowd_estimate;
        el.previous_crowd = elObs.length > 1 ? elObs[1].crowd_estimate : undefined;
        el.crowd_delta = el.previous_crowd !== undefined ? el.latest_crowd - el.previous_crowd : 0;
        el.verification_status = elObs[0].verification_status;
        el.last_observed_at = elObs[0].observation_timestamp;

        totalPointCrowd += el.latest_crowd;
        totalPointDelta += el.crowd_delta;
      }
    }
    pt.current_crowd_total = totalPointCrowd;
    pt.crowd_change_delta = totalPointDelta;
    pt.crowd_trend = observations.length === 0 ? "none" : totalPointDelta > 0 ? "up" : totalPointDelta < 0 ? "down" : "stable";
    if (observations.length > 0) {
      pt.last_observation_at = observations[0].observation_timestamp;
    }
    return pt;
  }

  async updatePoint(pointId: string, updates: Partial<ProtestPoint>): Promise<ProtestPoint | null> {
    this.init();
    const existing = this.getPointByIdLocal(pointId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: ProtestPoint = {
      ...existing,
      ...updates,
      updated_at: now
    };

    if (this.db) {
      this.db.prepare(`
        UPDATE protest_points SET
          point_name = ?,
          location_address = ?,
          provinsi = ?,
          kota_kabupaten = ?,
          regional = ?,
          latitude = ?,
          longitude = ?,
          status = ?,
          urgency = ?,
          notes = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        updated.point_name,
        updated.location_address ?? null,
        updated.provinsi ?? null,
        updated.kota_kabupaten ?? null,
        updated.regional ?? null,
        updated.latitude != null ? Number(updated.latitude) : null,
        updated.longitude != null ? Number(updated.longitude) : null,
        updated.status,
        updated.urgency,
        updated.notes ?? null,
        updated.updated_at,
        pointId
      );
    } else {
      this.memoryPoints.set(pointId, updated);
    }

    return updated;
  }

  async deletePoint(pointId: string): Promise<boolean> {
    this.init();
    if (this.db) {
      this.db.prepare("DELETE FROM protest_crowd_observations WHERE point_id = ?").run(pointId);
      this.db.prepare("DELETE FROM protest_elements WHERE point_id = ?").run(pointId);
      const res = this.db.prepare("DELETE FROM protest_points WHERE id = ?").run(pointId);
      return res.changes > 0;
    }
    this.memoryPoints.delete(pointId);
    return true;
  }

  async createElement(input: Partial<ProtestElement> & { point_id: string; protest_id: string; name: string }): Promise<ProtestElement> {
    this.init();
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const elem: ProtestElement = {
      id,
      point_id: input.point_id,
      protest_id: input.protest_id,
      name: input.name,
      leader_name: input.leader_name || null,
      demand_summary: input.demand_summary || null,
      status: input.status || "active",
      created_at: now,
      updated_at: now
    };

    if (this.db) {
      this.db.prepare(`
        INSERT INTO protest_elements (
          id, point_id, protest_id, name, leader_name, demand_summary, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        elem.id,
        elem.point_id,
        elem.protest_id,
        elem.name,
        elem.leader_name ?? null,
        elem.demand_summary ?? null,
        elem.status,
        elem.created_at,
        elem.updated_at
      );
    } else {
      this.memoryElements.set(elem.id, elem);
    }

    return elem;
  }

  async getElementsByPointId(pointId: string): Promise<ProtestElement[]> {
    this.init();
    if (this.db) {
      const rows = this.db.prepare(`
        SELECT * FROM protest_elements
        WHERE point_id = ?
        ORDER BY created_at ASC
      `).all(pointId) as Array<Record<string, unknown>>;

      return rows.map((r) => ({
        id: String(r.id),
        point_id: String(r.point_id),
        protest_id: String(r.protest_id),
        name: String(r.name),
        leader_name: r.leader_name ? String(r.leader_name) : null,
        demand_summary: r.demand_summary ? String(r.demand_summary) : null,
        status: (r.status as any) || "active",
        created_at: String(r.created_at),
        updated_at: String(r.updated_at)
      }));
    }

    return Array.from(this.memoryElements.values()).filter((e) => e.point_id === pointId);
  }

  async addCrowdObservation(input: Partial<ProtestCrowdObservation> & { point_id: string; element_name: string; crowd_estimate: number }): Promise<ProtestCrowdObservation> {
    this.init();
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const obs: ProtestCrowdObservation = {
      id,
      point_id: input.point_id,
      element_id: input.element_id || null,
      element_name: input.element_name,
      crowd_estimate: Math.max(0, Number(input.crowd_estimate) || 0),
      observation_timestamp: input.observation_timestamp || now,
      observer_source: input.observer_source || "SCC Command Center",
      verification_status: input.verification_status || "unverified",
      notes: input.notes || null,
      created_at: now
    };

    if (this.db) {
      this.db.prepare(`
        INSERT INTO protest_crowd_observations (
          id, point_id, element_id, element_name, crowd_estimate,
          observation_timestamp, observer_source, verification_status, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        obs.id,
        obs.point_id,
        obs.element_id ?? null,
        obs.element_name,
        obs.crowd_estimate,
        obs.observation_timestamp,
        obs.observer_source ?? null,
        obs.verification_status,
        obs.notes ?? null,
        obs.created_at
      );
    } else {
      this.memoryObservations.set(obs.id, obs);
    }

    return obs;
  }

  async getCrowdObservationsByPoint(pointId: string): Promise<ProtestCrowdObservation[]> {
    this.init();
    if (this.db) {
      const rows = this.db.prepare(`
        SELECT * FROM protest_crowd_observations
        WHERE point_id = ?
        ORDER BY observation_timestamp DESC
      `).all(pointId) as Array<Record<string, unknown>>;

      return rows.map((r) => ({
        id: String(r.id),
        point_id: String(r.point_id),
        element_id: r.element_id ? String(r.element_id) : null,
        element_name: String(r.element_name),
        crowd_estimate: Number(r.crowd_estimate || 0),
        observation_timestamp: String(r.observation_timestamp),
        observer_source: r.observer_source ? String(r.observer_source) : null,
        verification_status: (r.verification_status as any) || "unverified",
        notes: r.notes ? String(r.notes) : null,
        created_at: String(r.created_at)
      }));
    }

    return Array.from(this.memoryObservations.values())
      .filter((o) => o.point_id === pointId)
      .sort((a, b) => b.observation_timestamp.localeCompare(a.observation_timestamp));
  }

  synthesizePointsForLegacyEvent(event: ProtestEvent): ProtestPoint[] {
    const rawElements = event.organisasi_kelompok
      ? event.organisasi_kelompok
          .split(/[,;\/\n]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 1)
      : [];

    const pointId = `point-${event.id}-primary`;
    const totalCrowd = event.actual_crowd_size ?? event.estimasi_massa_source ?? 0;

    const elements: ProtestElement[] = [];
    if (rawElements.length > 0) {
      const crowdPerElem = Math.round(totalCrowd / rawElements.length);
      for (let i = 0; i < rawElements.length; i++) {
        const elemName = rawElements[i];
        elements.push({
          id: `elem-${event.id}-${i}`,
          point_id: pointId,
          protest_id: event.id,
          name: elemName,
          leader_name: i === 0 ? event.korlap_pimpinan : null,
          status: "active",
          latest_crowd: i === 0 ? (totalCrowd - crowdPerElem * (rawElements.length - 1)) : crowdPerElem,
          previous_crowd: undefined,
          crowd_delta: 0,
          verification_status: event.actual_crowd_size != null ? "verified" : "unverified",
          last_observed_at: event.updated_at || event.created_at,
          created_at: event.created_at,
          updated_at: event.updated_at
        });
      }
    } else {
      elements.push({
        id: `elem-${event.id}-0`,
        point_id: pointId,
        protest_id: event.id,
        name: "Elemen Massa Teridentifikasi",
        leader_name: event.korlap_pimpinan,
        status: "active",
        latest_crowd: totalCrowd,
        previous_crowd: undefined,
        crowd_delta: 0,
        verification_status: event.actual_crowd_size != null ? "verified" : "unverified",
        last_observed_at: event.updated_at || event.created_at,
        created_at: event.created_at,
        updated_at: event.updated_at
      });
    }

    return [
      {
        id: pointId,
        protest_id: event.id,
        point_name: event.lokasi || "Titik Utama",
        location_address: event.lokasi,
        provinsi: event.provinsi,
        kota_kabupaten: event.kota_kabupaten,
        regional: event.regional,
        latitude: event.validated_lat,
        longitude: event.validated_lng,
        status: event.status,
        urgency: event.urgency,
        notes: event.situation_summary,
        created_at: event.created_at,
        updated_at: event.updated_at,
        elements,
        current_crowd_total: totalCrowd,
        crowd_trend: "none",
        crowd_change_delta: 0,
        last_observation_at: event.updated_at || event.created_at,
        parent_title: event.isu_tuntutan,
        parent_kode_unras: event.kode_unras,
        parent_id_kejadian: event.id_kejadian,
        parent_tanggal: event.tanggal
      }
    ];
  }

  async getDailySituationOverview(dateStr: string): Promise<DailyUnrasSituationOverview> {
    this.init();
    const cleanDate = (dateStr || "").slice(0, 10) || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    const startWib = new Date(`${cleanDate}T00:00:00+07:00`);
    const endWib = new Date(startWib.getTime() + 86400000);
    const nextDateWib = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(endWib);

    const startWibIso = `${cleanDate}T00:00:00+07:00`;
    const endWibIso = `${nextDateWib}T00:00:00+07:00`;
    const startUtcIso = startWib.toISOString();
    const endUtcIso = endWib.toISOString();

    let protests: ProtestEvent[] = [];
    if (this.db) {
      const rows = this.db.prepare(`
        SELECT * FROM protests
        WHERE deleted_at IS NULL
          AND (
            tanggal = ?
            OR (
              (tanggal IS NULL OR trim(tanggal) = '')
              AND (
                (event_datetime >= ? AND event_datetime < ?)
                OR (event_datetime >= ? AND event_datetime < ?)
              )
            )
          )
      `).all(cleanDate, startWibIso, endWibIso, startUtcIso, endUtcIso) as Array<Record<string, unknown>>;
      protests = rows.map((r) => this.mapRowToProtest(r));
    } else {
      const startWibMs = startWib.getTime();
      const endWibMs = endWib.getTime();
      protests = Array.from(this.memoryEvents.values()).filter((e) => {
        if (e.deleted_at) return false;
        if (e.tanggal === cleanDate) return true;
        if (!e.tanggal && e.event_datetime) {
          const ms = new Date(e.event_datetime).getTime();
          return ms >= startWibMs && ms < endWibMs;
        }
        return false;
      });
    }

    const allPoints: ProtestPoint[] = [];
    const affectedProvincesSet = new Set<string>();
    const affectedRegionsSet = new Set<string>();
    const linkedCameraIdsSet = new Set<string>();
    let totalIdentifiedElements = 0;

    for (const p of protests) {
      if (p.provinsi) affectedProvincesSet.add(p.provinsi);
      if (p.regional) affectedRegionsSet.add(p.regional);

      // Fetch points for this protest
      let points = await this.getPointsByProtestId(p.id);
      if (points.length === 0) {
        // Fallback synthesis from legacy event
        points = this.synthesizePointsForLegacyEvent(p);
      }

      // Link cameras and attach parent metadata
      const allParentCameraLinks = this.getCameraLinksLocal(p.id);
      for (const link of allParentCameraLinks) {
        linkedCameraIdsSet.add(link.camera_id);
      }

      for (const pt of points) {
        pt.parent_title = p.isu_tuntutan;
        pt.parent_kode_unras = p.kode_unras;
        pt.parent_id_kejadian = p.id_kejadian;
        pt.parent_tanggal = p.tanggal;

        if (points.length === 1) {
          pt.linked_cameras = allParentCameraLinks;
          pt.linked_camera_count = allParentCameraLinks.length;
        } else {
          const ptLinks = allParentCameraLinks.filter((l) => l.point_id === pt.id);
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
      selected_date: dateStr,
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

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mapRowToProtest(r: Record<string, unknown>): ProtestEvent {
    let rawPayload: Record<string, unknown> = {};
    try {
      if (typeof r.raw_source_payload === "string") {
        rawPayload = JSON.parse(r.raw_source_payload);
      }
    } catch {}

    const vLat = r.validated_lat != null ? Number(r.validated_lat) : null;
    const vLng = r.validated_lng != null ? Number(r.validated_lng) : null;

    return {
      id: String(r.id),
      id_kejadian: String(r.id_kejadian),
      kode_unras: String(r.kode_unras),
      tanggal: String(r.tanggal),
      waktu_mulai: r.waktu_mulai ? String(r.waktu_mulai) : null,
      waktu_selesai: r.waktu_selesai ? String(r.waktu_selesai) : null,
      event_datetime: r.event_datetime ? String(r.event_datetime) : null,
      lokasi: String(r.lokasi),
      titik_kumpul: r.titik_kumpul ? String(r.titik_kumpul) : null,
      sasaran_aksi: r.sasaran_aksi ? String(r.sasaran_aksi) : null,
      isu_tuntutan: String(r.isu_tuntutan),
      estimasi_massa_source: r.estimasi_massa_source != null ? Number(r.estimasi_massa_source) : null,
      organisasi_kelompok: r.organisasi_kelompok ? String(r.organisasi_kelompok) : null,
      korlap_pimpinan: r.korlap_pimpinan ? String(r.korlap_pimpinan) : null,
      wilayah_hukum: r.wilayah_hukum ? String(r.wilayah_hukum) : null,
      provinsi: r.provinsi ? String(r.provinsi) : null,
      kota_kabupaten: r.kota_kabupaten ? String(r.kota_kabupaten) : null,
      keterangan_source: r.keterangan_source ? String(r.keterangan_source) : null,
      raw_source_payload: rawPayload,
      status: r.status as ProtestStatus,
      urgency: (r.urgency || "medium") as ProtestUrgency,
      category_id: r.category_id ? String(r.category_id) : null,
      validated_lat: vLat,
      validated_lng: vLng,
      has_coordinates: vLat != null && vLng != null,
      suggested_lat: r.suggested_lat != null ? Number(r.suggested_lat) : null,
      suggested_lng: r.suggested_lng != null ? Number(r.suggested_lng) : null,
      suggested_address: r.suggested_address ? String(r.suggested_address) : null,
      geocoding_provider: r.geocoding_provider ? String(r.geocoding_provider) : null,
      geocoding_confidence: (r.geocoding_confidence as any) || null,
      location_validation_status: (r.location_validation_status as any) || (vLat != null ? "verified" : (r.suggested_lat != null ? "pending_validation" : "unmapped")),
      geocoding_alternatives: r.geocoding_alternatives ? (typeof r.geocoding_alternatives === "string" ? JSON.parse(r.geocoding_alternatives) : r.geocoding_alternatives) : [],
      actual_crowd_size: r.actual_crowd_size != null ? Number(r.actual_crowd_size) : null,
      situation_summary: r.situation_summary ? String(r.situation_summary) : null,
      editorial_draft: r.editorial_draft ? String(r.editorial_draft) : null,
      editorial_final: r.editorial_final ? String(r.editorial_final) : null,
      is_archived: Boolean(r.is_archived),
      completed_at: r.completed_at ? String(r.completed_at) : null,
      completed_by_id: r.completed_by_id ? String(r.completed_by_id) : null,
      completed_by_name: r.completed_by_name ? String(r.completed_by_name) : null,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      deleted_at: r.deleted_at ? String(r.deleted_at) : null,
      last_synced_at: r.last_synced_at ? String(r.last_synced_at) : null,

      // Excel C:AC Source Attributes
      urutan_bulan: r.urutan_bulan != null ? Number(r.urutan_bulan) : null,
      tahun: r.tahun != null ? Number(r.tahun) : (r.tanggal ? new Date(String(r.tanggal)).getFullYear() : null),
      bulan: r.bulan ? String(r.bulan) : null,
      kategori_kejadian: r.kategori_kejadian ? String(r.kategori_kejadian) : "Unjuk Rasa",
      kp_kpw: r.kp_kpw ? String(r.kp_kpw) : null,
      regional: r.regional ? String(r.regional) : null,
      kategori_isu: r.kategori_isu ? String(r.kategori_isu) : null,
      dampak: r.dampak ? String(r.dampak) : "Tidak Ada",
      keterangan_dampak: r.keterangan_dampak ? String(r.keterangan_dampak) : null,
      nama_pelapor: r.nama_pelapor ? String(r.nama_pelapor) : null,
      info_awal: r.info_awal ? String(r.info_awal) : null,
      tindak_lanjut: r.tindak_lanjut ? String(r.tindak_lanjut) : null,
      progres_asistensi: r.progres_asistensi ? String(r.progres_asistensi) : null,
      realisasi: r.realisasi ? String(r.realisasi) : null
    };
  }
}

// Global Singleton
let globalProtestStore: ProtestDataStore | null = null;

export function getProtestStore(): ProtestDataStore {
  if (!globalProtestStore) {
    globalProtestStore = new ProtestDataStore();
  }
  return globalProtestStore;
}

export const protestStore = getProtestStore();
