import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const file = "C:\\Users\\dtiadm\\Downloads\\06. Database Kejadian Unras (2).xlsx";
const wb = xlsx.readFile(file);
const sheet = wb.Sheets["NEW UNRAS 2022-2026"];
const range = xlsx.utils.decode_range(sheet["!ref"]);

// Headers: Col 0: ID KEJADIAN, Col 5: KP/KPw, Col 6: Regional, Col 7: Provinsi, Col 8: Lokasi
const rows = [];
for (let r = 1; r <= range.e.r; r++) {
  const getCell = (c) => {
    const cell = sheet[xlsx.utils.encode_cell({ r, c })];
    return cell && cell.v !== undefined && cell.v !== null ? String(cell.v).trim() : "";
  };
  const idKejadian = getCell(0);
  const kpKpw = getCell(5);
  const regional = getCell(6);
  const provinsi = getCell(7);
  const lokasi = getCell(8);

  if (!idKejadian && !kpKpw && !regional && !provinsi && !lokasi) continue;

  rows.push({
    rowNumber: r + 1,
    idKejadian,
    rawKpKpw: kpKpw,
    rawRegional: regional,
    rawProvinsi: provinsi,
    rawLokasi: lokasi
  });
}

console.log(`Read ${rows.length} records.`);

// Canonical dictionaries
const CANONICAL_KP_KPW = {
  "KPBI": "KPBI",
  "KPwDN": "KPwDN",
  "KPWDN": "KPwDN" // normalized spelling
};

const CANONICAL_REGIONAL = {
  "Kantor Pusat": "Kantor Pusat",
  "KTI": "KTI",
  "SUMATERA": "Sumatera",
  "Sumatera": "Sumatera",
  "JAWA": "Jawa",
  "Jawa": "Jawa",
  "Papua": "Papua" // Ambiguous: In BI org, Papua is under KTI, but preserved as flagged
};

const PROVINSI_NORMALIZATION = {
  "Kalimantang Tengah": { normalized: "Kalimantan Tengah", type: "TYPO", reason: "Typo 'Kalimantang Tengah' -> Kalimantan Tengah" },
  "Sulaweri Tenggara": { normalized: "Sulawesi Tenggara", type: "TYPO", reason: "Typo 'Sulaweri Tenggara' -> Sulawesi Tenggara" },
  "Sultra": { normalized: "Sulawesi Tenggara", type: "ABBREVIATION", reason: "Singkatan 'Sultra' -> Sulawesi Tenggara" },
  "Kaltim": { normalized: "Kalimantan Timur", type: "ABBREVIATION", reason: "Singkatan 'Kaltim' -> Kalimantan Timur" },
  "NTB": { normalized: "Nusa Tenggara Barat", type: "ABBREVIATION", reason: "Singkatan 'NTB' -> Nusa Tenggara Barat" },
  "Kep. Riau": { normalized: "Kepulauan Riau", type: "ABBREVIATION", reason: "Singkatan 'Kep. Riau' -> Kepulauan Riau" },
  "Provinsi Sumatera Utara": { normalized: "Sumatera Utara", type: "PREFIX", reason: "Prefix 'Provinsi' dihapus" },
  "DKI JAKARTA": { normalized: "DKI Jakarta", type: "UPPERCASE", reason: "Standarisasi Title Case" },
  "BANGKA BELITUNG": { normalized: "Bangka Belitung", type: "UPPERCASE", reason: "Standarisasi Title Case" },
  "KALIMANTAN SELATAN": { normalized: "Kalimantan Selatan", type: "UPPERCASE", reason: "Standarisasi Title Case" },
  "Jawa TImur": { normalized: "Jawa Timur", type: "TYPO", reason: "Typo kapitalisasi huruf 'I'" },
  "Kepulauan Bangka Belitung": { normalized: "Bangka Belitung", type: "SYNONYM", reason: "Nama resmi/sinkronisasi" },
  "Purwokerto": { normalized: "Jawa Tengah", type: "CITY_AS_PROVINCE", reason: "Purwokerto adalah kota di Jawa Tengah, bukan provinsi" },
  "Pematangsiantar": { normalized: "Sumatera Utara", type: "CITY_AS_PROVINCE", reason: "Pematangsiantar adalah kota di Sumatera Utara, bukan provinsi" }
};

const LOKASI_NORMALIZATION = {
  "Mamudju": { normalized: "Mamuju", type: "TYPO", reason: "Ejaan lama/typo Mamudju -> Mamuju" },
  "NTB": { normalized: "Mataram", type: "PROVINCE_AS_CITY", reason: "Nama provinsi tertulis di kolom kota" },
  "DI Yogyakarta": { normalized: "Yogyakarta", type: "PROVINCE_AS_CITY", reason: "Nama provinsi tertulis di kolom kota" }
};

// Process rows into Master Hierarchy and Audit Trail
const auditLog = [];
const verifiedHierarchy = {};

for (const row of rows) {
  let kp = row.rawKpKpw;
  let reg = row.rawRegional;
  let prov = row.rawProvinsi;
  let lok = row.rawLokasi;

  let isAudited = false;
  const issues = [];

  // Check KP
  if (CANONICAL_KP_KPW[kp]) {
    if (kp !== CANONICAL_KP_KPW[kp]) {
      issues.push(`KP/KPw normalized from '${kp}' to '${CANONICAL_KP_KPW[kp]}'`);
      kp = CANONICAL_KP_KPW[kp];
      isAudited = true;
    }
  } else {
    issues.push(`Unknown KP/KPw value: '${kp}'`);
    isAudited = true;
  }

  // Check Regional
  if (CANONICAL_REGIONAL[reg]) {
    const normReg = CANONICAL_REGIONAL[reg];
    if (reg !== normReg) {
      issues.push(`Regional normalized from '${reg}' to '${normReg}'`);
      reg = normReg;
      isAudited = true;
    }
  } else {
    issues.push(`Unknown Regional value: '${reg}'`);
    isAudited = true;
  }

  // Check KPBI vs Regional consistency
  if (kp === "KPBI" && reg !== "Kantor Pusat") {
    issues.push(`Hierarchy Anomaly: KPBI paired with regional '${reg}'`);
    isAudited = true;
  }
  if (kp === "KPwDN" && reg === "Kantor Pusat") {
    issues.push(`Hierarchy Anomaly: KPwDN paired with regional 'Kantor Pusat' (Row ${row.rowNumber}, ID ${row.idKejadian})`);
    isAudited = true;
  }

  // Check Province
  if (PROVINSI_NORMALIZATION[prov]) {
    const rule = PROVINSI_NORMALIZATION[prov];
    issues.push(`Provinsi normalized from '${prov}' to '${rule.normalized}' (${rule.reason})`);
    prov = rule.normalized;
    isAudited = true;
  }

  // Check Location
  if (LOKASI_NORMALIZATION[lok]) {
    const rule = LOKASI_NORMALIZATION[lok];
    issues.push(`Lokasi normalized from '${lok}' to '${rule.normalized}' (${rule.reason})`);
    lok = rule.normalized;
    isAudited = true;
  }

  if (isAudited) {
    auditLog.push({
      rowNumber: row.rowNumber,
      idKejadian: row.idKejadian,
      rawKpKpw: row.rawKpKpw,
      rawRegional: row.rawRegional,
      rawProvinsi: row.rawProvinsi,
      rawLokasi: row.rawLokasi,
      normalizedKpKpw: kp,
      normalizedRegional: reg,
      normalizedProvinsi: prov,
      normalizedLokasi: lok,
      issues: issues.join("; ")
    });
  }

  // Build clean hierarchy
  if (!verifiedHierarchy[kp]) verifiedHierarchy[kp] = {};
  if (!verifiedHierarchy[kp][reg]) verifiedHierarchy[kp][reg] = {};
  if (!verifiedHierarchy[kp][reg][prov]) verifiedHierarchy[kp][reg][prov] = new Set();
  if (lok) verifiedHierarchy[kp][reg][prov].add(lok);
}

// Convert Set to Array
const cleanTree = {};
for (const kp in verifiedHierarchy) {
  cleanTree[kp] = {};
  for (const reg in verifiedHierarchy[kp]) {
    cleanTree[kp][reg] = {};
    for (const prov in verifiedHierarchy[kp][reg]) {
      cleanTree[kp][reg][prov] = Array.from(verifiedHierarchy[kp][reg][prov]).sort();
    }
  }
}

console.log("\n=== VERIFIED MASTER HIERARCHY STRUCTURE ===");
console.log(JSON.stringify(cleanTree, null, 2));

console.log(`\nTotal audit log entries: ${auditLog.length}`);
console.log("Sample audit entries (first 5):");
console.log(auditLog.slice(0, 5));

fs.writeFileSync(
  "scripts/master-hierarchy-clean.json",
  JSON.stringify({ cleanTree, auditLog }, null, 2)
);
console.log("Saved clean master hierarchy to scripts/master-hierarchy-clean.json");

