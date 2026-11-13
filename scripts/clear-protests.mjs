/**
 * SCC - EAGLE EYES: Reset & Clear All Protest Records
 * Wipes out dummy seed data from the database.
 */

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const dbPath = path.join(process.cwd(), "data", "pantau-nusantara.sqlite");

if (!fs.existsSync(dbPath)) {
  console.log("ℹ Database SQLite lokal tidak ditemukan.");
  process.exit(0);
}

const db = new DatabaseSync(dbPath);

try {
  const countRow = db.prepare("SELECT COUNT(*) as count FROM protests").get();
  console.log(`🧹 Membersihkan database protest... (Saat ini: ${countRow.count} data unras)`);

  db.exec("DELETE FROM protest_operator_reports;");
  db.exec("DELETE FROM protest_status_history;");
  db.exec("DELETE FROM protest_camera_links;");
  db.exec("DELETE FROM protest_attachments;");
  db.exec("DELETE FROM protest_sync_logs;");
  db.exec("DELETE FROM protests;");

  const verifyRow = db.prepare("SELECT COUNT(*) as count FROM protests").get();
  console.log(`✔ Berhasil! Seluruh data dummy unras telah dibersihkan.`);
  console.log(`   Sisa data unras di database: ${verifyRow.count}`);
} catch (err) {
  console.error("❌ Gagal membersihkan database:", err.message);
  process.exit(1);
}
