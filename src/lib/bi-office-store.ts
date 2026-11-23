/**
 * SCC - EAGLE EYES — Bank Indonesia Offices Master Data Store
 * Copyright: Developed by Ganesha Ladesta
 *
 * Provides high-performance persistence, coordinate normalization,
 * spatial proximity analysis, and coordinate swap auditing for Bank Indonesia offices.
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  BIOffice,
  BIOfficeType,
  BIOfficeValidationStatus,
  BIOfficeAuditReport,
  BIOfficeValidationAuditItem
} from "@/lib/types/bi-offices";
import { calculateDistanceMeters } from "@/lib/protest-store";

// Helper to determine regional & island group from ADM code and name
function deriveRegionalMetadata(admCode: string, name: string): { regional: string; islandGroup: string; shortName: string; fullName: string } {
  const prefix = admCode ? admCode.slice(0, 2) : "";
  const codeNum = parseInt(prefix, 10);

  let islandGroup = "Jawa";
  let regional = "Jawa";

  if (codeNum >= 11 && codeNum <= 21) {
    islandGroup = "Sumatera";
    regional = "Sumatera";
  } else if (codeNum >= 31 && codeNum <= 36) {
    islandGroup = "Jawa";
    regional = "Jawa";
  } else if (codeNum >= 51 && codeNum <= 53) {
    islandGroup = "Bali & Nusa Tenggara";
    regional = "KTI";
  } else if (codeNum >= 61 && codeNum <= 65) {
    islandGroup = "Kalimantan";
    regional = "KTI";
  } else if (codeNum >= 71 && codeNum <= 76) {
    islandGroup = "Sulawesi";
    regional = "KTI";
  } else if (codeNum >= 81 && codeNum <= 82) {
    islandGroup = "Maluku & Papua";
    regional = "KTI";
  } else if (codeNum >= 91 && codeNum <= 96) {
    islandGroup = "Maluku & Papua";
    regional = "KTI";
  }

  let fullName = `Kantor Perwakilan Bank Indonesia ${name}`;
  if (name === "KOPERBI IKN") {
    fullName = "Kantor Perwakilan Bank Indonesia Ibu Kota Nusantara (KOPERBI IKN)";
    regional = "KTI";
    islandGroup = "Kalimantan";
  } else if (name === "Jakarta") {
    fullName = "Kantor Perwakilan Bank Indonesia Provinsi DKI Jakarta";
    regional = "Jawa";
    islandGroup = "Jawa";
  }

  return { regional, islandGroup, shortName: name, fullName };
}

// RFC 4180 Multiline CSV Parser
function parseCsvFull(text: string): { header: string[]; data: Record<string, string>[] } {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.some((f) => f.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((f) => f.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) return { header: [], data: [] };

  const header = rows[0].map((h) => h.replace(/[\u200B-\u200D\uFEFF]/g, "").trim());
  const data: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const rowObj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      rowObj[header[c]] = (rows[r][c] || "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    }
    data.push(rowObj);
  }
  return { header, data };
}

class BIOfficeDataStore {
  private db: DatabaseSync | null = null;
  private dbInitialized = false;
  private memoryOffices = new Map<string, BIOffice>();

  constructor() {
    this.init();
  }

  private init() {
    if (this.dbInitialized) return;
    const dataDir = path.join(process.cwd(), "data");
    const dbPath = path.join(dataDir, "pantau-nusantara.sqlite");

    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new DatabaseSync(dbPath);
      this.db.exec("PRAGMA busy_timeout = 5000;");
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA synchronous = NORMAL;");

      // Table DDL
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS bi_offices (
          id TEXT PRIMARY KEY,
          office_id TEXT UNIQUE NOT NULL,
          office_name TEXT NOT NULL,
          short_name TEXT NOT NULL,
          office_type TEXT NOT NULL,
          regional TEXT NOT NULL,
          island_group TEXT NOT NULL,
          latitude REAL,
          longitude REAL,
          address TEXT NOT NULL,
          postal_code TEXT,
          phone TEXT,
          fax TEXT,
          administrative_code TEXT,
          source TEXT NOT NULL DEFAULT 'koordinat (1).csv',
          validation_status TEXT NOT NULL DEFAULT 'verified',
          validation_reason TEXT,
          raw_coordinates_text TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_bi_offices_type ON bi_offices(office_type);
        CREATE INDEX IF NOT EXISTS idx_bi_offices_regional ON bi_offices(regional);
        CREATE INDEX IF NOT EXISTS idx_bi_offices_coords ON bi_offices(latitude, longitude);
        CREATE INDEX IF NOT EXISTS idx_bi_offices_validation ON bi_offices(validation_status);
      `);

      this.seedFromCsvIdempotent();
      this.dbInitialized = true;
    } catch (err) {
      console.warn("[BIOfficeStore] SQLite init warning, operating in memory fallback:", err);
      this.seedFromCsvIdempotent();
      this.dbInitialized = true;
    }
  }

  /**
   * Idempotently import 47 records from 'koordinat (1).csv' and record missing KPBI status.
   */
  public seedFromCsvIdempotent(): { imported: number; updated: number } {
    const csvPath = path.join(process.cwd(), "data", "koordinat (1).csv");
    if (!fs.existsSync(csvPath)) {
      console.warn("[BIOfficeStore] koordinat (1).csv not found at", csvPath);
      return { imported: 0, updated: 0 };
    }

    const raw = fs.readFileSync(csvPath, "utf8");
    const { data } = parseCsvFull(raw);
    const now = new Date().toISOString();
    let imported = 0;
    let updated = 0;

    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const rawName = r["Nama KPw"] || `KPw-${i + 1}`;
      const rawCoord = r["Titik Kordinat"] || "";
      const rawLongCol = r["Longtitude"] || "";
      const rawLatCol = r["Latitude"] || "";
      const address = r["Alamat"] || "";
      const postal = r["Kodepos"] || null;
      const phone = r["Telepon"] || null;
      const fax = r["Fax"] || null;
      const adm = r["ADM"] || null;

      // Coordinate validation & normalization:
      // The CSV has swapped column headers: "Longtitude" holds lat, "Latitude" holds lng.
      // "Titik Kordinat" is "lat, lng".
      const parts = rawCoord.split(",").map((s) => s.trim());
      let lat: number | null = null;
      let lng: number | null = null;
      let validationStatus: BIOfficeValidationStatus = "verified";
      let validationReason = "Koordinat valid sesuai batas geografis Indonesia";

      if (parts.length === 2) {
        const p0 = parseFloat(parts[0]);
        const p1 = parseFloat(parts[1]);

        if (!isNaN(p0) && !isNaN(p1)) {
          if (p0 >= -11.5 && p0 <= 6.5 && p1 >= 94.0 && p1 <= 142.0) {
            lat = p0;
            lng = p1;
          } else if (p1 >= -11.5 && p1 <= 6.5 && p0 >= 94.0 && p0 <= 142.0) {
            lat = p1;
            lng = p0;
            validationReason = "Koordinat dinormalisasi dari urutan terbalik";
          } else {
            validationStatus = "invalid_coordinates";
            validationReason = `Koordinat (${p0}, ${p1}) berada di luar batas kepulauan Indonesia`;
          }
        } else {
          validationStatus = "invalid_coordinates";
          validationReason = "Format angka koordinat tidak valid";
        }
      } else {
        validationStatus = "missing_coordinates";
        validationReason = "Kolom Titik Kordinat kosong atau tidak lengkap";
      }

      const meta = deriveRegionalMetadata(adm || "", rawName);
      const officeType: BIOfficeType = rawName === "KOPERBI IKN" ? "KOPERBI IKN" : "KPwDN";
      const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const id = `bi-off-${slug}`;
      const officeId = adm ? `KPW-${adm.replace(/\./g, "")}` : `KPW-${slug.toUpperCase()}`;

      const office: BIOffice = {
        id,
        office_id: officeId,
        office_name: meta.fullName,
        short_name: meta.shortName,
        office_type: officeType,
        regional: meta.regional,
        island_group: meta.islandGroup,
        latitude: lat,
        longitude: lng,
        address,
        postal_code: postal,
        phone,
        fax,
        administrative_code: adm,
        source: "koordinat (1).csv",
        validation_status: validationStatus,
        validation_reason: validationReason,
        raw_coordinates_text: rawCoord,
        created_at: now,
        updated_at: now
      };

      if (this.db) {
        try {
          const existing = this.db.prepare("SELECT id FROM bi_offices WHERE office_id = ? OR id = ?").get(office.office_id, office.id);
          if (existing) {
            this.db.prepare(`
              UPDATE bi_offices SET
                office_name = ?,
                short_name = ?,
                office_type = ?,
                regional = ?,
                island_group = ?,
                latitude = ?,
                longitude = ?,
                address = ?,
                postal_code = ?,
                phone = ?,
                fax = ?,
                administrative_code = ?,
                validation_status = ?,
                validation_reason = ?,
                raw_coordinates_text = ?,
                updated_at = ?
              WHERE id = ?
            `).run(
              office.office_name,
              office.short_name,
              office.office_type,
              office.regional,
              office.island_group,
              office.latitude ?? null,
              office.longitude ?? null,
              office.address,
              office.postal_code ?? null,
              office.phone ?? null,
              office.fax ?? null,
              office.administrative_code ?? null,
              office.validation_status,
              office.validation_reason,
              office.raw_coordinates_text ?? null,
              now,
              office.id
            );
            updated++;
          } else {
            this.db.prepare(`
              INSERT INTO bi_offices (
                id, office_id, office_name, short_name, office_type, regional, island_group,
                latitude, longitude, address, postal_code, phone, fax, administrative_code,
                source, validation_status, validation_reason, raw_coordinates_text, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              office.id,
              office.office_id,
              office.office_name,
              office.short_name,
              office.office_type,
              office.regional,
              office.island_group,
              office.latitude ?? null,
              office.longitude ?? null,
              office.address,
              office.postal_code ?? null,
              office.phone ?? null,
              office.fax ?? null,
              office.administrative_code ?? null,
              office.source,
              office.validation_status,
              office.validation_reason,
              office.raw_coordinates_text ?? null,
              office.created_at,
              office.updated_at
            );
            imported++;
          }
        } catch (dbErr) {
          // If SQLite is busy or locked, fallback to memory
        }
      }

      this.memoryOffices.set(office.id, office);
    }

    // Permanent official Kantor Pusat Bank Indonesia (KPBI) headquarters record
    const kpbiOffice: BIOffice = {
      id: "bi-off-kpbi-pusat",
      office_id: "KPBI",
      office_name: "Kantor Pusat Bank Indonesia (KPBI)",
      short_name: "KPBI",
      office_type: "Kantor Pusat",
      regional: "Kantor Pusat",
      island_group: "Jawa",
      latitude: -6.1817,
      longitude: 106.8207194,
      address: "Jl. M.H. Thamrin No. 2, Gambir, Jakarta Pusat, DKI Jakarta, Indonesia",
      postal_code: "10110",
      phone: "(021) 131",
      fax: null,
      administrative_code: "31.71.01",
      source: "Official Bank Indonesia Registry",
      validation_status: "verified",
      validation_reason: "Koordinat resmi terverifikasi Kantor Pusat Bank Indonesia (KPBI)",
      raw_coordinates_text: "-6.1817, 106.8207194",
      created_at: now,
      updated_at: now
    };

    if (this.db) {
      try {
        const existingKpbi = this.db.prepare(
          "SELECT id FROM bi_offices WHERE id = ? OR office_id = ? OR office_id = 'KPBI-PUSAT' OR office_name LIKE '%Kantor Pusat Bank Indonesia%'"
        ).get(kpbiOffice.id, kpbiOffice.office_id);

        if (existingKpbi) {
          this.db.prepare(`
            UPDATE bi_offices SET
              office_id = ?,
              office_name = ?,
              short_name = ?,
              office_type = ?,
              regional = ?,
              island_group = ?,
              latitude = ?,
              longitude = ?,
              address = ?,
              source = ?,
              validation_status = ?,
              validation_reason = ?,
              raw_coordinates_text = ?,
              updated_at = ?
            WHERE id = ?
          `).run(
            kpbiOffice.office_id,
            kpbiOffice.office_name,
            kpbiOffice.short_name,
            kpbiOffice.office_type,
            kpbiOffice.regional,
            kpbiOffice.island_group,
            kpbiOffice.latitude,
            kpbiOffice.longitude,
            kpbiOffice.address,
            kpbiOffice.source,
            kpbiOffice.validation_status,
            kpbiOffice.validation_reason,
            kpbiOffice.raw_coordinates_text ?? null,
            now,
            (existingKpbi as any).id
          );
          updated++;
        } else {
          this.db.prepare(`
            INSERT INTO bi_offices (
              id, office_id, office_name, short_name, office_type, regional, island_group,
              latitude, longitude, address, postal_code, phone, fax, administrative_code,
              source, validation_status, validation_reason, raw_coordinates_text, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            kpbiOffice.id,
            kpbiOffice.office_id,
            kpbiOffice.office_name,
            kpbiOffice.short_name,
            kpbiOffice.office_type,
            kpbiOffice.regional,
            kpbiOffice.island_group,
            kpbiOffice.latitude,
            kpbiOffice.longitude,
            kpbiOffice.address,
            kpbiOffice.postal_code ?? null,
            kpbiOffice.phone ?? null,
            kpbiOffice.fax ?? null,
            kpbiOffice.administrative_code ?? null,
            kpbiOffice.source,
            kpbiOffice.validation_status,
            kpbiOffice.validation_reason,
            kpbiOffice.raw_coordinates_text ?? null,
            kpbiOffice.created_at,
            kpbiOffice.updated_at
          );
          imported++;
        }
      } catch (dbErr) {
        // Fallback to memory
      }
    }
    // Prevent duplicate keys in memory store
    this.memoryOffices.delete("KPBI");
    this.memoryOffices.delete("KPBI-PUSAT");
    this.memoryOffices.delete("bi-off-kpbi-pusat");
    this.memoryOffices.set(kpbiOffice.id, kpbiOffice);

    return { imported, updated };
  }

  public async getAllOffices(filter?: { regional?: string; office_type?: string; validation_status?: string }): Promise<BIOffice[]> {
    this.init();
    if (this.db) {
      try {
        let query = "SELECT * FROM bi_offices WHERE 1=1";
        const params: any[] = [];
        if (filter?.regional && filter.regional !== "all") {
          query += " AND regional = ?";
          params.push(filter.regional);
        }
        if (filter?.office_type && filter.office_type !== "all") {
          query += " AND office_type = ?";
          params.push(filter.office_type);
        }
        if (filter?.validation_status && filter.validation_status !== "all") {
          query += " AND validation_status = ?";
          params.push(filter.validation_status);
        }
        query += " ORDER BY office_type DESC, short_name ASC";

        const rows = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>;
        return rows.map((r) => this.mapRowToOffice(r));
      } catch (dbErr) {
        // Fallback to memory
      }
    }

    let list = Array.from(this.memoryOffices.values());
    if (filter?.regional && filter.regional !== "all") {
      list = list.filter((o) => o.regional === filter.regional);
    }
    if (filter?.office_type && filter.office_type !== "all") {
      list = list.filter((o) => o.office_type === filter.office_type);
    }
    if (filter?.validation_status && filter.validation_status !== "all") {
      list = list.filter((o) => o.validation_status === filter.validation_status);
    }
    return list.sort((a, b) => a.short_name.localeCompare(b.short_name));
  }

  public async getOfficeById(idOrOfficeId: string): Promise<BIOffice | null> {
    this.init();
    if (this.db) {
      try {
        const row = this.db.prepare("SELECT * FROM bi_offices WHERE id = ? OR office_id = ?").get(idOrOfficeId, idOrOfficeId) as Record<string, unknown> | undefined;
        return row ? this.mapRowToOffice(row) : null;
      } catch (dbErr) {
        // Fallback to memory
      }
    }
    return this.memoryOffices.get(idOrOfficeId) || Array.from(this.memoryOffices.values()).find((o) => o.office_id === idOrOfficeId) || null;
  }

  public async getNearbyOfficesForCoordinates(lat: number, lng: number, limit = 5): Promise<Array<BIOffice & { distance_meters: number }>> {
    const all = await this.getAllOffices();
    const withDist = all
      .filter((o) => o.latitude !== null && o.longitude !== null)
      .map((o) => {
        const d = calculateDistanceMeters(lat, lng, o.latitude!, o.longitude!);
        return {
          ...o,
          distance_meters: Math.round(d)
        };
      })
      .sort((a, b) => a.distance_meters - b.distance_meters);

    return withDist.slice(0, limit);
  }

  public async getNearestOfficeForCoordinates(lat: number, lng: number): Promise<(BIOffice & { distance_meters: number }) | null> {
    const list = await this.getNearbyOfficesForCoordinates(lat, lng, 1);
    return list.length > 0 ? list[0] : null;
  }

  public async getAuditReport(): Promise<BIOfficeAuditReport> {
    const all = await this.getAllOffices();
    const items: BIOfficeValidationAuditItem[] = all.map((o, idx) => ({
      index: idx + 1,
      office_name: o.office_name,
      office_type: o.office_type,
      raw_coordinates_text: o.raw_coordinates_text || "N/A",
      raw_longitude_column: o.raw_coordinates_text ? o.raw_coordinates_text.split(",")[0]?.trim() || "N/A" : "N/A",
      raw_latitude_column: o.raw_coordinates_text ? o.raw_coordinates_text.split(",")[1]?.trim() || "N/A" : "N/A",
      swapped_column_headers: true,
      normalized_latitude: o.latitude,
      normalized_longitude: o.longitude,
      validation_status: o.validation_status,
      validation_reason: o.validation_reason,
      address: o.address,
      administrative_code: o.administrative_code
    }));

    const verified = items.filter((i) => i.validation_status === "verified").length;
    const missing = items.filter((i) => i.validation_status === "missing_coordinates").length;
    const invalid = items.filter((i) => i.validation_status === "invalid_coordinates").length;

    const kpbiOffice = all.find((o) => o.office_type === "Kantor Pusat" || o.office_id === "KPBI" || o.office_id === "KPBI-PUSAT");
    const kpbiStatus: "available" | "missing_unverified" =
      kpbiOffice && kpbiOffice.latitude !== null && kpbiOffice.longitude !== null
        ? "available"
        : "missing_unverified";

    return {
      total_records: items.length,
      verified_count: verified,
      missing_count: missing,
      invalid_count: invalid,
      kpbi_status: kpbiStatus,
      items
    };
  }

  private mapRowToOffice(r: Record<string, unknown>): BIOffice {
    return {
      id: String(r.id),
      office_id: String(r.office_id),
      office_name: String(r.office_name),
      short_name: String(r.short_name),
      office_type: r.office_type as BIOfficeType,
      regional: String(r.regional),
      island_group: String(r.island_group),
      latitude: r.latitude != null ? Number(r.latitude) : null,
      longitude: r.longitude != null ? Number(r.longitude) : null,
      address: String(r.address),
      postal_code: r.postal_code ? String(r.postal_code) : null,
      phone: r.phone ? String(r.phone) : null,
      fax: r.fax ? String(r.fax) : null,
      administrative_code: r.administrative_code ? String(r.administrative_code) : null,
      source: String(r.source),
      validation_status: r.validation_status as BIOfficeValidationStatus,
      validation_reason: String(r.validation_reason || ""),
      raw_coordinates_text: r.raw_coordinates_text ? String(r.raw_coordinates_text) : null,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at)
    };
  }
}

// Global Singleton
let globalBIOfficeStore: BIOfficeDataStore | null = null;

export function getBIOfficeStore(): BIOfficeDataStore {
  if (!globalBIOfficeStore) {
    globalBIOfficeStore = new BIOfficeDataStore();
  }
  return globalBIOfficeStore;
}

export const biOfficeStore = getBIOfficeStore();
