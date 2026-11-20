import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const file = "C:\\Users\\dtiadm\\Downloads\\06. Database Kejadian Unras (2).xlsx";
if (!fs.existsSync(file)) {
  console.error("File not found:", file);
  process.exit(1);
}

const wb = xlsx.readFile(file);
console.log("Sheet names:", wb.SheetNames);
const sheetName = wb.SheetNames.includes("NEW UNRAS 2022-2026")
  ? "NEW UNRAS 2022-2026"
  : wb.SheetNames[0];

const sheet = wb.Sheets[sheetName];
const range = xlsx.utils.decode_range(sheet["!ref"]);
console.log(`Sheet: '${sheetName}', Range: ${sheet["!ref"]}, Total rows: ${range.e.r + 1}, Total cols: ${range.e.c + 1}`);

// Read header row (row index 0)
const headers = {};
for (let c = 0; c <= range.e.c; c++) {
  const cell = sheet[xlsx.utils.encode_cell({ r: 0, c })];
  const name = cell ? String(cell.v).trim() : `(empty_col_${c})`;
  headers[c] = name;
}
console.log("Headers:", JSON.stringify(headers, null, 2));

// Find column indices
let colKpKpw = -1;
let colRegional = -1;
let colProvinsi = -1;
let colLokasi = -1;
let colLokasiUnras = -1;
let colIdKejadian = -1;

for (const [idxStr, hName] of Object.entries(headers)) {
  const idx = parseInt(idxStr, 10);
  const lower = hName.toLowerCase();
  if (lower.includes("kp/kpw") || lower === "kp / kpw" || lower === "kp_kpw") colKpKpw = idx;
  else if (lower === "regional") colRegional = idx;
  else if (lower === "provinsi") colProvinsi = idx;
  else if (lower === "lokasi" || lower === "kota/kabupaten" || lower === "kota") colLokasi = idx;
  else if (lower.includes("lokasi unras")) colLokasiUnras = idx;
  else if (lower.includes("id kejadian")) colIdKejadian = idx;
}

console.log(`Matched Columns:
- ID Kejadian: Col ${colIdKejadian} (${headers[colIdKejadian]})
- KP/KPw: Col ${colKpKpw} (${headers[colKpKpw]})
- Regional: Col ${colRegional} (${headers[colRegional]})
- Provinsi: Col ${colProvinsi} (${headers[colProvinsi]})
- Lokasi (Kota/Kab): Col ${colLokasi} (${headers[colLokasi]})
- Lokasi Unras: Col ${colLokasiUnras} (${headers[colLokasiUnras]})
`);

// Collect rows
const records = [];
for (let r = 1; r <= range.e.r; r++) {
  const getVal = (col) => {
    if (col < 0) return null;
    const cell = sheet[xlsx.utils.encode_cell({ r, c: col })];
    if (!cell || cell.v === undefined || cell.v === null) return "";
    return String(cell.v).trim();
  };

  const idKejadian = getVal(colIdKejadian);
  const kpKpw = getVal(colKpKpw);
  const regional = getVal(colRegional);
  const provinsi = getVal(colProvinsi);
  const lokasi = getVal(colLokasi);
  const lokasiUnras = getVal(colLokasiUnras);

  // If entire row is blank, skip
  if (!idKejadian && !kpKpw && !regional && !provinsi && !lokasi && !lokasiUnras) {
    continue;
  }

  records.push({
    rowNumber: r + 1,
    idKejadian,
    kpKpw,
    regional,
    provinsi,
    lokasi,
    lokasiUnras
  });
}

console.log(`Total non-empty data rows: ${records.length}`);

// Analysis 1: KP/KPw breakdown
const kpKpwCounts = {};
for (const rec of records) {
  const k = rec.kpKpw || "(EMPTY)";
  kpKpwCounts[k] = (kpKpwCounts[k] || 0) + 1;
}
console.log("\n=== 1. UNIQUE KP/KPw VALUES ===");
console.table(kpKpwCounts);

// Analysis 2: Regional grouped by KP/KPw
const kpKpwRegional = {};
for (const rec of records) {
  const k = rec.kpKpw || "(EMPTY)";
  const reg = rec.regional || "(EMPTY)";
  if (!kpKpwRegional[k]) kpKpwRegional[k] = {};
  kpKpwRegional[k][reg] = (kpKpwRegional[k][reg] || 0) + 1;
}
console.log("\n=== 2. REGIONAL BY KP/KPw ===");
console.log(JSON.stringify(kpKpwRegional, null, 2));

// Analysis 3: Hierarchy Tree (KP/KPw -> Regional -> Provinsi -> Lokasi)
const hierarchy = {};
const anomalies = [];

for (const rec of records) {
  const k = rec.kpKpw || "(EMPTY)";
  const reg = rec.regional || "(EMPTY)";
  const prov = rec.provinsi || "(EMPTY)";
  const lok = rec.lokasi || "(EMPTY)";

  if (!hierarchy[k]) hierarchy[k] = {};
  if (!hierarchy[k][reg]) hierarchy[k][reg] = {};
  if (!hierarchy[k][reg][prov]) hierarchy[k][reg][prov] = {};
  hierarchy[k][reg][prov][lok] = (hierarchy[k][reg][prov][lok] || 0) + 1;

  // Detect potential anomalies
  // 1. KPBI with regional other than Kantor Pusat
  if (k.toUpperCase().includes("KPBI") && !reg.toLowerCase().includes("kantor pusat")) {
    anomalies.push({
      type: "KPBI_NON_KANTOR_PUSAT",
      row: rec.rowNumber,
      id: rec.idKejadian,
      kpKpw: k,
      regional: reg,
      provinsi: prov,
      lokasi: lok
    });
  }

  // 2. KPwDN with regional Kantor Pusat
  if (k.toUpperCase().includes("KPW") && reg.toLowerCase().includes("kantor pusat")) {
    anomalies.push({
      type: "KPwDN_KANTOR_PUSAT",
      row: rec.rowNumber,
      id: rec.idKejadian,
      kpKpw: k,
      regional: reg,
      provinsi: prov,
      lokasi: lok
    });
  }

  // 3. Province or Regional or Location containing typos
  if (
    prov.toLowerCase().includes("purwokerto") ||
    prov.toLowerCase().includes("tengah") && prov.toLowerCase().includes("kalimantang") ||
    prov.toLowerCase().includes("sulaweri") ||
    k === "(EMPTY)" || reg === "(EMPTY)" || prov === "(EMPTY)" || lok === "(EMPTY)"
  ) {
    anomalies.push({
      type: "SUSPICIOUS_TYPO_OR_EMPTY",
      row: rec.rowNumber,
      id: rec.idKejadian,
      kpKpw: k,
      regional: reg,
      provinsi: prov,
      lokasi: lok
    });
  }
}

console.log("\n=== 3. DETECTED ANOMALIES & AUDIT CASES ===");
console.log(`Total anomalies found: ${anomalies.length}`);
console.table(anomalies);

// Analysis 4: Summary of all unique Provinces and their distinct Regionals
const provToReg = {};
for (const rec of records) {
  const p = rec.provinsi || "(EMPTY)";
  const r = rec.regional || "(EMPTY)";
  if (!provToReg[p]) provToReg[p] = new Set();
  provToReg[p].add(r);
}

const provSummary = Object.entries(provToReg).map(([p, set]) => ({
  provinsi: p,
  regionals: Array.from(set).join(", ")
}));
console.log("\n=== 4. PROVINCES TO REGIONALS MAPPING IN SOURCE ===");
console.table(provSummary);

// Save full analysis JSON for detailed report
fs.writeFileSync(
  "scripts/unras-hierarchy-analysis.json",
  JSON.stringify({ recordsCount: records.length, kpKpwCounts, kpKpwRegional, hierarchy, anomalies }, null, 2)
);
console.log("\nSaved full hierarchy analysis to scripts/unras-hierarchy-analysis.json");

