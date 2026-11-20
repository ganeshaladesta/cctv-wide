import assert from "node:assert";
import {
  GROUNDED_KP_KPW,
  GROUNDED_REGIONAL,
  GROUNDED_PROVINSI,
  GROUNDED_LOKASI,
  getHierarchyRegionals,
  getHierarchyProvinces,
  getHierarchyLocations
} from "../src/lib/master-data-hierarchy.ts";
import { masterDataService } from "../src/lib/master-data-service.ts";

console.log("=== TEST SUITE: CASCADING HIERARCHY MASTER DATA ===");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

// 1. Level 1: KP / KPw dropdown
test("1.1 Grounded KP/KPw contains KPBI and KPwDN", () => {
  const codes = GROUNDED_KP_KPW.map((k) => k.code);
  assert(codes.includes("KPBI"), "Must include KPBI");
  assert(codes.includes("KPwDN"), "Must include KPwDN");
  assert.strictEqual(codes.length, 2, "Only KPBI and KPwDN");
});

// 2. Level 2: Regional cascading by KP/KPw
test("2.1 KPBI Regional dropdown ONLY contains Kantor Pusat", () => {
  const regs = getHierarchyRegionals("KPBI");
  assert.deepStrictEqual(regs, ["Kantor Pusat"], "KPBI must only return Kantor Pusat");
});

test("2.2 KPwDN Regional dropdown contains Sumatera, Jawa, KTI", () => {
  const regs = getHierarchyRegionals("KPwDN");
  assert(regs.includes("Sumatera"), "Must include Sumatera");
  assert(regs.includes("Jawa"), "Must include Jawa");
  assert(regs.includes("KTI"), "Must include KTI");
  // Cannot be empty
  assert(regs.length >= 3, "At least 3 operational regional divisions");
});

test("2.3 Empty or invalid KP/KPw returns empty Regional array", () => {
  assert.deepStrictEqual(getHierarchyRegionals(""), []);
  assert.deepStrictEqual(getHierarchyRegionals("INVALID_CODE"), []);
});

// 3. Level 3: Provinsi cascading by Regional
test("3.1 KPBI -> Kantor Pusat ONLY contains DKI Jakarta and Jawa Barat", () => {
  const provs = getHierarchyProvinces("Kantor Pusat", "KPBI");
  assert.deepStrictEqual(provs.sort(), ["DKI Jakarta", "Jawa Barat"].sort());
});

test("3.2 KPwDN -> Jawa contains Jawa Barat, Jawa Tengah, DI Yogyakarta, Jawa Timur, DKI Jakarta", () => {
  const provs = getHierarchyProvinces("Jawa", "KPwDN");
  assert(provs.includes("Jawa Barat"));
  assert(provs.includes("Jawa Tengah"));
  assert(provs.includes("DI Yogyakarta"));
  assert(provs.includes("Jawa Timur"));
  assert(provs.includes("DKI Jakarta"));
  assert(!provs.includes("Sumatera Utara"), "Sumatera Utara must not be in Jawa");
  assert(!provs.includes("Bali"), "Bali must not be in Jawa");
});

test("3.3 KPwDN -> Sumatera contains Sumatera provinces and NOT Java or Bali", () => {
  const provs = getHierarchyProvinces("Sumatera", "KPwDN");
  assert(provs.includes("Sumatera Utara"));
  assert(provs.includes("Aceh"));
  assert(provs.includes("Riau"));
  assert(provs.includes("Sumatera Selatan"));
  assert(!provs.includes("Jawa Barat"));
  assert(!provs.includes("Kalimantan Timur"));
});

test("3.4 KPwDN -> KTI contains Eastern Indonesia provinces", () => {
  const provs = getHierarchyProvinces("KTI", "KPwDN");
  assert(provs.includes("Bali"));
  assert(provs.includes("Kalimantan Timur"));
  assert(provs.includes("Sulawesi Selatan"));
  assert(provs.includes("Papua"));
  assert(!provs.includes("Jawa Tengah"));
  assert(!provs.includes("Aceh"));
});

// 4. Level 4: Lokasi cascading by Provinsi
test("4.1 KPBI -> Kantor Pusat -> DKI Jakarta ONLY contains Koperbi Thamrin & LUAR KOPERBI", () => {
  const loks = getHierarchyLocations("DKI Jakarta", "Kantor Pusat", "KPBI");
  assert.deepStrictEqual(loks.sort(), ["Koperbi Thamrin", "LUAR KOPERBI"].sort());
});

test("4.2 KPBI -> Kantor Pusat -> Jawa Barat ONLY contains Koperbi Sinergi", () => {
  const loks = getHierarchyLocations("Jawa Barat", "Kantor Pusat", "KPBI");
  assert.deepStrictEqual(loks, ["Koperbi Sinergi"]);
});

test("4.3 KPwDN -> Jawa -> Jawa Barat contains Bandung, Cirebon, Tasikmalaya", () => {
  const loks = getHierarchyLocations("Jawa Barat", "Jawa", "KPwDN");
  assert(loks.includes("Bandung"));
  assert(loks.includes("Cirebon"));
  assert(loks.includes("Tasikmalaya"));
  assert(!loks.includes("Medan"));
  assert(!loks.includes("Koperbi Thamrin"));
});

test("4.4 KPwDN -> Sumatera -> Sumatera Utara contains Medan, Pematangsiantar, Sibolga", () => {
  const loks = getHierarchyLocations("Sumatera Utara", "Sumatera", "KPwDN");
  assert.deepStrictEqual(loks.sort(), ["Medan", "Pematangsiantar", "Sibolga"].sort());
});

test("4.5 KPwDN -> Jawa -> DKI Jakarta contains Jakarta & LUAR KOPERBI", () => {
  const loks = getHierarchyLocations("DKI Jakarta", "Jawa", "KPwDN");
  assert(loks.includes("Jakarta"));
  assert(loks.includes("LUAR KOPERBI"));
  assert(!loks.includes("Koperbi Thamrin"));
});

// 5. Service-side validation tests
await asyncTest("5.1 Service validation passes valid KPBI hierarchy", async () => {
  const res = await masterDataService.validateHierarchy(
    "KPBI",
    "Kantor Pusat",
    "DKI Jakarta",
    "LUAR KOPERBI"
  );
  assert.strictEqual(res.valid, true);
});

await asyncTest("5.2 Service validation passes valid KPwDN hierarchy", async () => {
  const res = await masterDataService.validateHierarchy(
    "KPwDN",
    "Jawa",
    "Jawa Barat",
    "Bandung"
  );
  assert.strictEqual(res.valid, true);
});

await asyncTest("5.3 Service validation REJECTS invalid Regional under KPBI", async () => {
  const res = await masterDataService.validateHierarchy(
    "KPBI",
    "Sumatera",
    "Sumatera Utara",
    "Medan"
  );
  assert.strictEqual(res.valid, false);
  assert(res.reason?.includes("Regional 'Sumatera' tidak valid untuk KPBI"));
});

await asyncTest("5.4 Service validation REJECTS mismatched Provinsi under Regional", async () => {
  const res = await masterDataService.validateHierarchy(
    "KPwDN",
    "Jawa",
    "Bali",
    "Denpasar"
  );
  assert.strictEqual(res.valid, false);
  assert(res.reason?.includes("Provinsi 'Bali' tidak valid untuk Regional Jawa"));
});

await asyncTest("5.5 Service validation REJECTS invalid Lokasi for KPBI", async () => {
  const res = await masterDataService.validateHierarchy(
    "KPBI",
    "Kantor Pusat",
    "DKI Jakarta",
    "Medan"
  );
  assert.strictEqual(res.valid, false);
  assert(res.reason?.includes("Lokasi 'Medan' tidak valid untuk KPBI"));
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}

