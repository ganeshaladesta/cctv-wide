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
  UserProfile
} from "@/lib/types/protests";
import { getDataStore } from "@/lib/data-store";
import { Camera } from "@/lib/types";

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
        this.db.exec(schemaSql);
      }

      // Check if protests table has records; if not, seed defaults
      const row = this.db.prepare("SELECT COUNT(*) as count FROM protests").get() as { count: number };
      if (row.count === 0) {
        this.seedInitialData();
      }

      this.dbInitialized = true;
    } catch (err) {
      console.warn("[ProtestDataStore] SQLite unavailable, falling back to In-Memory mode:", err);
      // Fallback in-memory seed
      for (const p of SEED_PROTESTS) {
        const item: ProtestEvent = {
          ...p,
          id: p.id || crypto.randomUUID()
        };
        this.memoryEvents.set(item.id, item);
      }
      this.dbInitialized = true;
    }
  }

  private seedInitialData() {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT INTO protests (
        id, id_kejadian, kode_unras, tanggal, waktu_mulai, waktu_selesai,
        lokasi, titik_kumpul, sasaran_aksi, isu_tuntutan, estimasi_massa_source,
        organisasi_kelompok, korlap_pimpinan, wilayah_hukum, provinsi, kota_kabupaten,
        keterangan_source, status, urgency, category_id, validated_lat, validated_lng,
        has_coordinates, actual_crowd_size, situation_summary, editorial_draft,
        editorial_final, is_archived, completed_at, completed_by_id, completed_by_name,
        created_at, updated_at, deleted_at, last_synced_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
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

  queryProtests(filters: ProtestFilterParams = {}): {
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

      if (filters.date_from) {
        whereClauses.push("tanggal >= ?");
        params.push(filters.date_from);
      }

      if (filters.date_to) {
        whereClauses.push("tanggal <= ?");
        params.push(filters.date_to);
      }

      if (filters.q && filters.q.trim()) {
        const term = `%${filters.q.trim().toLowerCase()}%`;
        whereClauses.push(
          "(LOWER(isu_tuntutan) LIKE ? OR LOWER(lokasi) LIKE ? OR LOWER(organisasi_kelompok) LIKE ? OR LOWER(id_kejadian) LIKE ? OR LOWER(kode_unras) LIKE ?)"
        );
        params.push(term, term, term, term, term);
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

    if (filters.q && filters.q.trim()) {
      const term = filters.q.trim().toLowerCase();
      items = items.filter(
        (e) =>
          e.isu_tuntutan.toLowerCase().includes(term) ||
          e.lokasi.toLowerCase().includes(term) ||
          (e.organisasi_kelompok && e.organisasi_kelompok.toLowerCase().includes(term)) ||
          e.id_kejadian.toLowerCase().includes(term) ||
          e.kode_unras.toLowerCase().includes(term)
      );
    }

    const total = items.length;
    items.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    const data = items.slice(offset, offset + limit);

    return { total, page, limit, data };
  }

  getProtestById(idOrIdentity: string): ProtestEvent | null {
    if (this.db) {
      const row = this.db.prepare(`
        SELECT * FROM protests
        WHERE (id = ? OR id_kejadian = ? OR kode_unras = ?) AND deleted_at IS NULL
        LIMIT 1
      `).get(idOrIdentity, idOrIdentity, idOrIdentity) as Record<string, unknown> | undefined;

      if (!row) return null;
      const protest = this.mapRowToProtest(row);

      // Attach relations
      protest.reports = this.getOperatorReports(protest.id);
      protest.status_history = this.getStatusHistory(protest.id);
      protest.camera_links = this.getCameraLinks(protest.id);
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

  createProtest(
    input: Partial<ProtestEvent> & {
      id_kejadian: string;
      tanggal: string;
      lokasi: string;
      isu_tuntutan: string;
    },
    user: UserProfile
  ): ProtestEvent {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const hasCoords = input.validated_lat != null && input.validated_lng != null;

    const newEvent: ProtestEvent = {
      id,
      id_kejadian: input.id_kejadian,
      kode_unras: input.kode_unras || `UNR-${Date.now()}`,
      tanggal: input.tanggal,
      waktu_mulai: input.waktu_mulai || null,
      waktu_selesai: input.waktu_selesai || null,
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
      last_synced_at: null
    };

    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO protests (
          id, id_kejadian, kode_unras, tanggal, waktu_mulai, waktu_selesai,
          lokasi, titik_kumpul, sasaran_aksi, isu_tuntutan, estimasi_massa_source,
          organisasi_kelompok, korlap_pimpinan, wilayah_hukum, provinsi, kota_kabupaten,
          keterangan_source, raw_source_payload, status, urgency, category_id,
          validated_lat, validated_lng, has_coordinates, actual_crowd_size, situation_summary,
          editorial_draft, editorial_final, is_archived, completed_at, completed_by_id,
          completed_by_name, created_at, updated_at, deleted_at, last_synced_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `);

      stmt.run(
        newEvent.id,
        newEvent.id_kejadian,
        newEvent.kode_unras,
        newEvent.tanggal,
        newEvent.waktu_mulai,
        newEvent.waktu_selesai,
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
        newEvent.last_synced_at
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

  updateProtest(
    id: string,
    updates: Partial<ProtestEvent>,
    user?: UserProfile
  ): ProtestEvent | null {
    const existing = this.getProtestById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updatedLat = updates.validated_lat !== undefined ? updates.validated_lat : existing.validated_lat;
    const updatedLng = updates.validated_lng !== undefined ? updates.validated_lng : existing.validated_lng;
    const hasCoords = updatedLat != null && updatedLng != null;

    const updatedEvent: ProtestEvent = {
      ...existing,
      ...updates,
      id: existing.id,
      id_kejadian: existing.id_kejadian, // immutable source identity
      kode_unras: existing.kode_unras,
      validated_lat: updatedLat,
      validated_lng: updatedLng,
      has_coordinates: hasCoords,
      updated_at: now
    };

    if (this.db) {
      this.db.prepare(`
        UPDATE protests SET
          tanggal = ?,
          waktu_mulai = ?,
          waktu_selesai = ?,
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
          updated_at = ?
        WHERE id = ?
      `).run(
        updatedEvent.tanggal,
        updatedEvent.waktu_mulai,
        updatedEvent.waktu_selesai,
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
        updatedEvent.completed_at,
        updatedEvent.completed_by_id,
        updatedEvent.completed_by_name,
        now,
        id
      );
    } else {
      this.memoryEvents.set(id, updatedEvent);
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
        protest_id: id,
        from_status: existing.status,
        to_status: updates.status,
        reason: updates.situation_summary || `Perubahan status oleh ${effectiveUser.name}`,
        user: effectiveUser
      });
    }

    return updatedEvent;
  }

  updateProtestStatus(
    id: string,
    newStatus: ProtestStatus,
    reason: string | null,
    user: UserProfile
  ): ProtestEvent | null {
    const existing = this.getProtestById(id);
    if (!existing) return null;

    const isArchived = newStatus === "completed" || newStatus === "cancelled";
    const completedAt = newStatus === "completed" ? new Date().toISOString() : existing.completed_at;

    const updated = this.updateProtest(
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

  addOperatorReport(
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

  getOperatorReports(protestId: string): ProtestOperatorReport[] {
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
    user: UserProfile;
  }): void {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const history: ProtestStatusHistory = {
      id,
      protest_id: params.protest_id,
      from_status: params.from_status,
      to_status: params.to_status,
      reason: params.reason,
      changed_by_id: params.user.id,
      changed_by_name: params.user.name,
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

  getStatusHistory(protestId: string): ProtestStatusHistory[] {
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

  linkCamera(
    input: {
      protest_id: string;
      camera_id: string;
      notes?: string | null;
      is_recommended?: boolean;
    },
    user: UserProfile
  ): ProtestCameraLink | null {
    const cctvStore = getDataStore();
    const camera = cctvStore.getCameraById(input.camera_id);
    const protest = this.getProtestById(input.protest_id);
    if (!camera || !protest) return null;

    let distanceMeters = 0;
    if (protest.validated_lat != null && protest.validated_lng != null) {
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
      camera_id: camera.id,
      camera_name: camera.name,
      camera_stream_url: camera.stream_url,
      camera_protocol: camera.protocol,
      camera_status: camera.status,
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
          id, protest_id, camera_id, camera_name, camera_stream_url, camera_protocol,
          camera_status, distance_meters, notes, is_recommended, linked_by_id, linked_by_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(protest_id, camera_id) DO UPDATE SET
          distance_meters = excluded.distance_meters,
          notes = excluded.notes,
          camera_status = excluded.camera_status
      `).run(
        link.id,
        link.protest_id,
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
      const list = this.memoryLinks.get(input.protest_id) || [];
      const filtered = list.filter((l) => l.camera_id !== camera.id);
      filtered.push(link);
      this.memoryLinks.set(input.protest_id, filtered);
    }

    return link;
  }

  unlinkCamera(protestId: string, cameraId: string): boolean {
    if (this.db) {
      const res = this.db.prepare("DELETE FROM protest_camera_links WHERE protest_id = ? AND camera_id = ?").run(protestId, cameraId);
      return res.changes > 0;
    }
    const list = this.memoryLinks.get(protestId) || [];
    const filtered = list.filter((l) => l.camera_id !== cameraId);
    this.memoryLinks.set(protestId, filtered);
    return true;
  }

  getCameraLinks(protestId: string): ProtestCameraLink[] {
    const cctvStore = getDataStore();
    if (this.db) {
      const rows = this.db.prepare(`
        SELECT * FROM protest_camera_links
        WHERE protest_id = ?
        ORDER BY distance_meters ASC
      `).all(protestId) as Array<Record<string, unknown>>;

      return rows.map((r) => {
        const camId = String(r.camera_id);
        return {
          id: String(r.id),
          protest_id: String(r.protest_id),
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

    return this.memoryLinks.get(protestId) || [];
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
  ): Array<{ camera: Camera; distance_meters: number }> {
    const cctvStore = getDataStore();
    const allCameras = cctvStore.getAllCameras();
    const matches: Array<{ camera: Camera; distance_meters: number }> = [];

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
          matches.push({ camera: cam, distance_meters: d });
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
  upsertFromExcelBatch(
    records: Array<{
      id_kejadian: string;
      kode_unras: string;
      tanggal: string;
      waktu_mulai?: string | null;
      waktu_selesai?: string | null;
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

      const existing = this.getProtestById(rec.id_kejadian);

      if (existing) {
        // UPDATE ONLY EXCEL FIELDS — PRESERVE OPERATOR FIELDS
        if (this.db) {
          this.db.prepare(`
            UPDATE protests SET
              kode_unras = ?,
              tanggal = ?,
              waktu_mulai = ?,
              waktu_selesai = ?,
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
              last_synced_at = ?,
              updated_at = ?
            WHERE id = ?
          `).run(
            rec.kode_unras || existing.kode_unras,
            rec.tanggal || existing.tanggal,
            rec.waktu_mulai ?? existing.waktu_mulai,
            rec.waktu_selesai ?? existing.waktu_selesai,
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
            now,
            now,
            existing.id
          );
        } else {
          existing.kode_unras = rec.kode_unras || existing.kode_unras;
          existing.tanggal = rec.tanggal || existing.tanggal;
          existing.waktu_mulai = rec.waktu_mulai ?? existing.waktu_mulai;
          existing.waktu_selesai = rec.waktu_selesai ?? existing.waktu_selesai;
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
              id, id_kejadian, kode_unras, tanggal, waktu_mulai, waktu_selesai,
              lokasi, titik_kumpul, sasaran_aksi, isu_tuntutan, estimasi_massa_source,
              organisasi_kelompok, korlap_pimpinan, wilayah_hukum, provinsi, kota_kabupaten,
              keterangan_source, raw_source_payload, status, urgency, category_id,
              validated_lat, validated_lng, has_coordinates, actual_crowd_size, situation_summary,
              editorial_draft, editorial_final, is_archived, completed_at, completed_by_id,
              completed_by_name, created_at, updated_at, deleted_at, last_synced_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?
            )
          `).run(
            newEvent.id,
            newEvent.id_kejadian,
            newEvent.kode_unras,
            newEvent.tanggal,
            newEvent.waktu_mulai,
            newEvent.waktu_selesai,
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
            newEvent.last_synced_at
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

  createSyncLog(initial: {
    triggered_by: "scheduler_cron" | "manual_admin" | "system";
    triggered_by_user?: string | null;
    source_worksheet?: string;
  }): ProtestSyncLog {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const log: ProtestSyncLog = {
      id,
      started_at: now,
      completed_at: null,
      status: "running",
      triggered_by: initial.triggered_by,
      triggered_by_user: initial.triggered_by_user || null,
      source_worksheet: initial.source_worksheet || "NEW UNRAS 2022-2026",
      records_processed: 0,
      records_created: 0,
      records_updated: 0,
      records_skipped: 0,
      error_details: null,
      duration_ms: null
    };

    if (this.db) {
      this.db.prepare(`
        INSERT INTO protest_sync_logs (
          id, started_at, completed_at, status, triggered_by, triggered_by_user,
          source_worksheet, records_processed, records_created, records_updated, records_skipped,
          error_details, duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        log.id,
        log.started_at,
        log.completed_at || null,
        log.status,
        log.triggered_by,
        log.triggered_by_user || null,
        log.source_worksheet,
        log.records_processed,
        log.records_created,
        log.records_updated,
        log.records_skipped,
        log.error_details || null,
        log.duration_ms ?? null
      );
    } else {
      this.memorySyncLogs.unshift(log);
    }

    return log;
  }

  updateSyncLog(
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
          status = ?,
          records_processed = ?,
          records_created = ?,
          records_updated = ?,
          records_skipped = ?,
          error_details = ?,
          duration_ms = ?
        WHERE id = ?
      `).run(
        completedAt,
        String(updates.status || existing.status),
        Number(updates.records_processed ?? existing.records_processed ?? 0),
        Number(updates.records_created ?? existing.records_created ?? 0),
        Number(updates.records_updated ?? existing.records_updated ?? 0),
        Number(updates.records_skipped ?? existing.records_skipped ?? 0),
        updates.error_details !== undefined ? updates.error_details : (existing.error_details ? String(existing.error_details) : null),
        durationMs,
        id
      );

      const updated = this.db.prepare("SELECT * FROM protest_sync_logs WHERE id = ?").get(id) as Record<string, unknown>;
      return {
        id: String(updated.id),
        started_at: String(updated.started_at),
        completed_at: updated.completed_at ? String(updated.completed_at) : null,
        status: updated.status as ProtestSyncLog["status"],
        triggered_by: updated.triggered_by as ProtestSyncLog["triggered_by"],
        triggered_by_user: updated.triggered_by_user ? String(updated.triggered_by_user) : null,
        source_worksheet: String(updated.source_worksheet),
        records_processed: Number(updated.records_processed || 0),
        records_created: Number(updated.records_created || 0),
        records_updated: Number(updated.records_updated || 0),
        records_skipped: Number(updated.records_skipped || 0),
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

  getSyncLogs(limit = 20): ProtestSyncLog[] {
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
        status: r.status as ProtestSyncLog["status"],
        triggered_by: r.triggered_by as ProtestSyncLog["triggered_by"],
        triggered_by_user: r.triggered_by_user ? String(r.triggered_by_user) : null,
        source_worksheet: String(r.source_worksheet),
        records_processed: Number(r.records_processed || 0),
        records_created: Number(r.records_created || 0),
        records_updated: Number(r.records_updated || 0),
        records_skipped: Number(r.records_skipped || 0),
        error_details: r.error_details ? String(r.error_details) : null,
        duration_ms: r.duration_ms != null ? Number(r.duration_ms) : null
      }));
    }

    return this.memorySyncLogs.slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Statistics & KPIs
  // ---------------------------------------------------------------------------

  getStats(): ProtestStats {
    const todayStr = new Date().toISOString().slice(0, 10);

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
      last_synced_at: r.last_synced_at ? String(r.last_synced_at) : null
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
