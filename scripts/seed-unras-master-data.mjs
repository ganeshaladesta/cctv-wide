import { createClient } from "@supabase/supabase-js";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  GROUNDED_KP_KPW,
  GROUNDED_REGIONAL,
  GROUNDED_PROVINSI,
  GROUNDED_LOKASI
} from "../src/lib/master-data-hierarchy.ts";

if (fs.existsSync(".env.local")) {
  try { process.loadEnvFile(".env.local"); } catch {}
} else if (fs.existsSync(".env")) {
  try { process.loadEnvFile(".env"); } catch {}
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Read JSON clean master data
const cleanJsonPath = path.resolve("scripts/master-hierarchy-clean.json");
let rawAuditLog = [];
if (fs.existsSync(cleanJsonPath)) {
  const cleanData = JSON.parse(fs.readFileSync(cleanJsonPath, "utf8"));
  rawAuditLog = cleanData.auditLog || [];
}

const auditLog = rawAuditLog.map((a, idx) => ({
  id: `audit-${String(idx + 1).padStart(5, "0")}`,
  row_number: a.rowNumber || null,
  id_kejadian: a.idKejadian || null,
  field_name: "Wilayah",
  raw_value: JSON.stringify({ kp: a.rawKpKpw, reg: a.rawRegional, prov: a.rawProvinsi, lok: a.rawLokasi }),
  normalized_value: JSON.stringify({ kp: a.normalizedKpKpw, reg: a.normalizedRegional, prov: a.normalizedProvinsi, lok: a.normalizedLokasi }),
  resolution_strategy: a.issues?.includes("Typo") ? "TYPO_CORRECTION" : a.issues?.includes("Singkatan") ? "EXPAND_ABBREVIATION" : "FLAG_FOR_OPERATOR_REVIEW",
  notes: a.issues || ""
}));

console.log(`[Seed Master Data] Loading dataset:`);
console.log(`- KP/KPw: ${GROUNDED_KP_KPW.length}`);
console.log(`- Regional: ${GROUNDED_REGIONAL.length}`);
console.log(`- Provinsi: ${GROUNDED_PROVINSI.length}`);
console.log(`- Lokasi: ${GROUNDED_LOKASI.length}`);
console.log(`- Audit Log Entries: ${auditLog.length}`);

// 1. Seed into SQLite if database file exists
const sqlitePath = path.resolve("data/pantau-nusantara.sqlite");
if (fs.existsSync(sqlitePath)) {
  console.log(`\n[SQLite] Seeding to ${sqlitePath}...`);
  try {
    const db = new DatabaseSync(sqlitePath);

    // Ensure tables exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS master_kp_kpw (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS master_regional (
        id TEXT PRIMARY KEY,
        kp_kpw_id TEXT NOT NULL,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (kp_kpw_id) REFERENCES master_kp_kpw(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS master_provinsi (
        id TEXT PRIMARY KEY,
        regional_id TEXT NOT NULL,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (regional_id) REFERENCES master_regional(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS master_lokasi (
        id TEXT PRIMARY KEY,
        provinsi_id TEXT NOT NULL,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (provinsi_id) REFERENCES master_provinsi(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS master_data_audit_review (
        id TEXT PRIMARY KEY,
        row_number INTEGER,
        id_kejadian TEXT,
        field_name TEXT NOT NULL,
        raw_value TEXT,
        normalized_value TEXT NOT NULL,
        resolution_strategy TEXT NOT NULL,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Insert master_kp_kpw
    const insertKp = db.prepare(`
      INSERT OR REPLACE INTO master_kp_kpw (id, code, name, normalized_name, is_active)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const r of GROUNDED_KP_KPW) {
      insertKp.run(r.id, r.code, r.name, r.normalized_name, r.is_active ? 1 : 0);
    }
    console.log(`[SQLite] Seeded master_kp_kpw: ${GROUNDED_KP_KPW.length} records`);

    // Insert master_regional
    const insertReg = db.prepare(`
      INSERT OR REPLACE INTO master_regional (id, kp_kpw_id, name, normalized_name, is_active)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const r of GROUNDED_REGIONAL) {
      insertReg.run(r.id, r.kp_kpw_id, r.name, r.normalized_name, r.is_active ? 1 : 0);
    }
    console.log(`[SQLite] Seeded master_regional: ${GROUNDED_REGIONAL.length} records`);

    // Insert master_provinsi
    const insertProv = db.prepare(`
      INSERT OR REPLACE INTO master_provinsi (id, regional_id, name, normalized_name, is_active)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const r of GROUNDED_PROVINSI) {
      insertProv.run(r.id, r.regional_id, r.name, r.normalized_name, r.is_active ? 1 : 0);
    }
    console.log(`[SQLite] Seeded master_provinsi: ${GROUNDED_PROVINSI.length} records`);

    // Insert master_lokasi
    const insertLok = db.prepare(`
      INSERT OR REPLACE INTO master_lokasi (id, provinsi_id, name, normalized_name, is_active)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const r of GROUNDED_LOKASI) {
      insertLok.run(r.id, r.provinsi_id, r.name, r.normalized_name, r.is_active ? 1 : 0);
    }
    console.log(`[SQLite] Seeded master_lokasi: ${GROUNDED_LOKASI.length} records`);

    // Insert master_data_audit_review
    const insertAudit = db.prepare(`
      INSERT OR IGNORE INTO master_data_audit_review (id, row_number, id_kejadian, field_name, raw_value, normalized_value, resolution_strategy, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of auditLog) {
      insertAudit.run(r.id, r.row_number, r.id_kejadian, r.field_name, r.raw_value, r.normalized_value, r.resolution_strategy, r.notes);
    }
    console.log(`[SQLite] Seeded master_data_audit_review: ${auditLog.length} records`);
  } catch (err) {
    console.error("[SQLite] Error seeding SQLite:", err.message);
  }
}

// 2. Seed into Supabase if configured
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  console.log(`\n[Supabase] Seeding to ${SUPABASE_URL}...`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  async function seedSupabase() {
    try {
      const { error: kpErr } = await supabase.from("master_kp_kpw").upsert(GROUNDED_KP_KPW, { onConflict: "id" });
      if (kpErr) throw kpErr;
      console.log(`[Supabase] Upserted master_kp_kpw: ${GROUNDED_KP_KPW.length} records`);

      const { error: regErr } = await supabase.from("master_regional").upsert(GROUNDED_REGIONAL, { onConflict: "id" });
      if (regErr) throw regErr;
      console.log(`[Supabase] Upserted master_regional: ${GROUNDED_REGIONAL.length} records`);

      const { error: provErr } = await supabase.from("master_provinsi").upsert(GROUNDED_PROVINSI, { onConflict: "id" });
      if (provErr) throw provErr;
      console.log(`[Supabase] Upserted master_provinsi: ${GROUNDED_PROVINSI.length} records`);

      const { error: lokErr } = await supabase.from("master_lokasi").upsert(GROUNDED_LOKASI, { onConflict: "id" });
      if (lokErr) throw lokErr;
      console.log(`[Supabase] Upserted master_lokasi: ${GROUNDED_LOKASI.length} records`);

      // Upsert in batches of 50 for audit log
      for (let i = 0; i < auditLog.length; i += 50) {
        const batch = auditLog.slice(i, i + 50);
        await supabase.from("master_data_audit_review").upsert(batch, { onConflict: "id" });
      }
      console.log(`[Supabase] Upserted master_data_audit_review: ${auditLog.length} records`);
    } catch (err) {
      console.warn("[Supabase] Note on Supabase seed:", err.message);
      console.log("Migration 007_create_unras_master_data_hierarchy.sql can be executed in Supabase SQL editor if table does not exist.");
    }
  }

  await seedSupabase();
}

console.log("\nMaster data seed complete.");

// 2. Seed into Supabase if configured
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  console.log(`\n[Supabase] Seeding to ${SUPABASE_URL}...`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  async function seedSupabase() {
    try {
      const { error: kpErr } = await supabase.from("master_kp_kpw").upsert(kpKpw, { onConflict: "id" });
      if (kpErr) throw kpErr;
      console.log(`[Supabase] Upserted master_kp_kpw: ${kpKpw.length} records`);

      const { error: regErr } = await supabase.from("master_regional").upsert(regional, { onConflict: "id" });
      if (regErr) throw regErr;
      console.log(`[Supabase] Upserted master_regional: ${regional.length} records`);

      const { error: provErr } = await supabase.from("master_provinsi").upsert(provinsi, { onConflict: "id" });
      if (provErr) throw provErr;
      console.log(`[Supabase] Upserted master_provinsi: ${provinsi.length} records`);

      const { error: lokErr } = await supabase.from("master_lokasi").upsert(lokasi, { onConflict: "id" });
      if (lokErr) throw lokErr;
      console.log(`[Supabase] Upserted master_lokasi: ${lokasi.length} records`);

      // Upsert in batches of 50 for audit log
      for (let i = 0; i < auditLog.length; i += 50) {
        const batch = auditLog.slice(i, i + 50);
        await supabase.from("master_data_audit_review").upsert(batch, { onConflict: "id" });
      }
      console.log(`[Supabase] Upserted master_data_audit_review: ${auditLog.length} records`);
    } catch (err) {
      console.warn("[Supabase] Note on Supabase seed:", err.message);
      console.log("Migration 007_create_unras_master_data_hierarchy.sql can be executed in Supabase SQL editor if table does not exist.");
    }
  }

  await seedSupabase();
}

console.log("\nMaster data seed complete.");
