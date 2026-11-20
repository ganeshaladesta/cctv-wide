import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("scripts/unras-hierarchy-analysis.json", "utf8"));
const kpbi = data.hierarchy["KPBI"];
console.log("=== KPBI HIERARCHY ===");
for (const reg in kpbi) {
  console.log(`Regional: ${reg}`);
  for (const prov in kpbi[reg]) {
    const locs = kpbi[reg][prov];
    console.log(`  Provinsi: ${prov} (${Object.keys(locs).length} locations)`);
    console.log(`    Locations:`, Object.entries(locs));
  }
}

const kpwdn = data.hierarchy["KPwDN"];
console.log("\n=== KPwDN REGIONALS & PROVINCES ===");
for (const reg in kpwdn) {
  console.log(`Regional: ${reg}`);
  for (const prov in kpwdn[reg]) {
    const locs = kpwdn[reg][prov];
    console.log(`  Provinsi: ${prov} (${Object.keys(locs).length} locations) -> [${Object.keys(locs).slice(0, 5).join(", ")}]`);
  }
}

