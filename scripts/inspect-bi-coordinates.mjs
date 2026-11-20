import fs from "node:fs";
import path from "node:path";

function parseCsvFull(text) {
  const rows = [];
  let currentRow = [];
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

  const header = rows[0].map((h) => h.replace(/[\u200B-\u200D\uFEFF]/g, "").trim());
  const data = [];
  for (let r = 1; r < rows.length; r++) {
    const rowObj = {};
    for (let c = 0; c < header.length; c++) {
      rowObj[header[c]] = (rows[r][c] || "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    }
    data.push(rowObj);
  }
  return { header, data };
}

const csvPath = path.join(process.cwd(), "data", "koordinat (1).csv");
const raw = fs.readFileSync(csvPath, "utf8");
const { header, data } = parseCsvFull(raw);

console.log(`Successfully parsed: ${data.length} records! Header:`, header);

const report = [];

for (let i = 0; i < data.length; i++) {
  const r = data[i];
  const name = r["Nama KPw"] || "";
  const rawCoord = r["Titik Kordinat"] || "";
  const rawLong = r["Longtitude"] || "";
  const rawLat = r["Latitude"] || "";

  const parts = rawCoord.split(",").map((s) => s.trim());
  let lat = null;
  let lng = null;
  let status = "valid";
  let reason = "Valid Indonesian coordinate pair";

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
        reason = "Normalized from reversed pair";
      } else {
        status = "invalid";
        reason = `Coordinates (${p0}, ${p1}) out of expected Indonesian bounds`;
      }
    } else {
      status = "invalid";
      reason = "Could not parse numbers from Titik Kordinat";
    }
  } else {
    status = "missing";
    reason = "Titik Kordinat is empty or malformed";
  }

  const numLong = parseFloat(rawLong);
  const numLat = parseFloat(rawLat);
  const swappedCols = numLong >= -11.5 && numLong <= 6.5 && numLat >= 94.0 && numLat <= 142.0;

  report.push({
    index: i + 1,
    name,
    rawCoord,
    rawLong,
    rawLat,
    swappedCols,
    normalizedLat: lat,
    normalizedLng: lng,
    status,
    reason,
    address: r["Alamat"] || "",
    postal: r["Kodepos"] || "",
    adm: r["ADM"] || ""
  });
}

console.log("=== Coordinate Parsing & Validation Report ===");
console.table(
  report.map((item) => ({
    Index: item.index,
    Name: item.name,
    Lat: item.normalizedLat ? item.normalizedLat.toFixed(6) : "N/A",
    Lng: item.normalizedLng ? item.normalizedLng.toFixed(6) : "N/A",
    SwappedHeaders: item.swappedCols ? "YES" : "NO",
    Status: item.status,
    Reason: item.reason
  }))
);

const validCount = report.filter((r) => r.status === "valid").length;
const invalidCount = report.filter((r) => r.status !== "valid").length;
console.log(`\nSummary: Exactly ${validCount} valid, ${invalidCount} invalid/missing out of ${report.length} total records.`);
