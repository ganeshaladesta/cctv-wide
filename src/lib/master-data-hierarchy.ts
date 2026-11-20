import { MasterKpKpw, MasterRegional, MasterProvinsi, MasterLokasi } from "./master-data-types";

// Static Grounded Master Data extracted from official workbook: 06. Database Kejadian Unras (2).xlsx
// Worksheet: NEW UNRAS 2022-2026 (1,603 records)

export const GROUNDED_KP_KPW: MasterKpKpw[] = [
  {
    id: "kp-001-kpbi",
    code: "KPBI",
    name: "KPBI (Kantor Pusat Bank Indonesia)",
    normalized_name: "KPBI",
    is_active: true
  },
  {
    id: "kp-002-kpwdn",
    code: "KPwDN",
    name: "KPwDN (Kantor Perwakilan Dalam Negeri)",
    normalized_name: "KPwDN",
    is_active: true
  }
];

export const GROUNDED_REGIONAL: MasterRegional[] = [
  // For KPBI
  {
    id: "reg-kpbi-pusat",
    kp_kpw_id: "kp-001-kpbi",
    name: "Kantor Pusat",
    normalized_name: "Kantor Pusat",
    is_active: true
  },
  // For KPwDN
  {
    id: "reg-kpwdn-sumatera",
    kp_kpw_id: "kp-002-kpwdn",
    name: "Sumatera",
    normalized_name: "Sumatera",
    is_active: true
  },
  {
    id: "reg-kpwdn-jawa",
    kp_kpw_id: "kp-002-kpwdn",
    name: "Jawa",
    normalized_name: "Jawa",
    is_active: true
  },
  {
    id: "reg-kpwdn-kti",
    kp_kpw_id: "kp-002-kpwdn",
    name: "KTI",
    normalized_name: "KTI",
    is_active: true
  },
  // Suspicious/Anomalous source values preserved for audit & historical traceability
  {
    id: "reg-kpwdn-pusat-anomaly",
    kp_kpw_id: "kp-002-kpwdn",
    name: "Kantor Pusat",
    normalized_name: "Kantor Pusat",
    is_active: true // Preserved for row 1003 & 1007
  },
  {
    id: "reg-kpwdn-papua-anomaly",
    kp_kpw_id: "kp-002-kpwdn",
    name: "Papua",
    normalized_name: "Papua",
    is_active: true // Preserved for row 188
  }
];

export const GROUNDED_PROVINSI: MasterProvinsi[] = [
  // Under KPBI -> Kantor Pusat
  { id: "prv-kpbi-dki", regional_id: "reg-kpbi-pusat", name: "DKI Jakarta", normalized_name: "DKI Jakarta", is_active: true },
  { id: "prv-kpbi-jabar", regional_id: "reg-kpbi-pusat", name: "Jawa Barat", normalized_name: "Jawa Barat", is_active: true },

  // Under KPwDN -> Sumatera
  { id: "prv-kpwdn-sum-aceh", regional_id: "reg-kpwdn-sumatera", name: "Aceh", normalized_name: "Aceh", is_active: true },
  { id: "prv-kpwdn-sum-sumut", regional_id: "reg-kpwdn-sumatera", name: "Sumatera Utara", normalized_name: "Sumatera Utara", is_active: true },
  { id: "prv-kpwdn-sum-sumbar", regional_id: "reg-kpwdn-sumatera", name: "Sumatera Barat", normalized_name: "Sumatera Barat", is_active: true },
  { id: "prv-kpwdn-sum-riau", regional_id: "reg-kpwdn-sumatera", name: "Riau", normalized_name: "Riau", is_active: true },
  { id: "prv-kpwdn-sum-kepri", regional_id: "reg-kpwdn-sumatera", name: "Kepulauan Riau", normalized_name: "Kepulauan Riau", is_active: true },
  { id: "prv-kpwdn-sum-jambi", regional_id: "reg-kpwdn-sumatera", name: "Jambi", normalized_name: "Jambi", is_active: true },
  { id: "prv-kpwdn-sum-sumsel", regional_id: "reg-kpwdn-sumatera", name: "Sumatera Selatan", normalized_name: "Sumatera Selatan", is_active: true },
  { id: "prv-kpwdn-sum-babel", regional_id: "reg-kpwdn-sumatera", name: "Bangka Belitung", normalized_name: "Bangka Belitung", is_active: true },
  { id: "prv-kpwdn-sum-bengkulu", regional_id: "reg-kpwdn-sumatera", name: "Bengkulu", normalized_name: "Bengkulu", is_active: true },
  { id: "prv-kpwdn-sum-lampung", regional_id: "reg-kpwdn-sumatera", name: "Lampung", normalized_name: "Lampung", is_active: true },

  // Under KPwDN -> Jawa
  { id: "prv-kpwdn-jawa-dki", regional_id: "reg-kpwdn-jawa", name: "DKI Jakarta", normalized_name: "DKI Jakarta", is_active: true },
  { id: "prv-kpwdn-jawa-jabar", regional_id: "reg-kpwdn-jawa", name: "Jawa Barat", normalized_name: "Jawa Barat", is_active: true },
  { id: "prv-kpwdn-jawa-jateng", regional_id: "reg-kpwdn-jawa", name: "Jawa Tengah", normalized_name: "Jawa Tengah", is_active: true },
  { id: "prv-kpwdn-jawa-diy", regional_id: "reg-kpwdn-jawa", name: "DI Yogyakarta", normalized_name: "DI Yogyakarta", is_active: true },
  { id: "prv-kpwdn-jawa-jatim", regional_id: "reg-kpwdn-jawa", name: "Jawa Timur", normalized_name: "Jawa Timur", is_active: true },

  // Under KPwDN -> KTI
  { id: "prv-kpwdn-kti-bali", regional_id: "reg-kpwdn-kti", name: "Bali", normalized_name: "Bali", is_active: true },
  { id: "prv-kpwdn-kti-ntb", regional_id: "reg-kpwdn-kti", name: "Nusa Tenggara Barat", normalized_name: "Nusa Tenggara Barat", is_active: true },
  { id: "prv-kpwdn-kti-ntt", regional_id: "reg-kpwdn-kti", name: "Nusa Tenggara Timur", normalized_name: "Nusa Tenggara Timur", is_active: true },
  { id: "prv-kpwdn-kti-kaltim", regional_id: "reg-kpwdn-kti", name: "Kalimantan Timur", normalized_name: "Kalimantan Timur", is_active: true },
  { id: "prv-kpwdn-kti-kalteng", regional_id: "reg-kpwdn-kti", name: "Kalimantan Tengah", normalized_name: "Kalimantan Tengah", is_active: true },
  { id: "prv-kpwdn-kti-kalsel", regional_id: "reg-kpwdn-kti", name: "Kalimantan Selatan", normalized_name: "Kalimantan Selatan", is_active: true },
  { id: "prv-kpwdn-kti-kaltara", regional_id: "reg-kpwdn-kti", name: "Kalimantan Utara", normalized_name: "Kalimantan Utara", is_active: true },
  { id: "prv-kpwdn-kti-sulut", regional_id: "reg-kpwdn-kti", name: "Sulawesi Utara", normalized_name: "Sulawesi Utara", is_active: true },
  { id: "prv-kpwdn-kti-sulteng", regional_id: "reg-kpwdn-kti", name: "Sulawesi Tengah", normalized_name: "Sulawesi Tengah", is_active: true },
  { id: "prv-kpwdn-kti-sulsel", regional_id: "reg-kpwdn-kti", name: "Sulawesi Selatan", normalized_name: "Sulawesi Selatan", is_active: true },
  { id: "prv-kpwdn-kti-sultra", regional_id: "reg-kpwdn-kti", name: "Sulawesi Tenggara", normalized_name: "Sulawesi Tenggara", is_active: true },
  { id: "prv-kpwdn-kti-gorontalo", regional_id: "reg-kpwdn-kti", name: "Gorontalo", normalized_name: "Gorontalo", is_active: true },
  { id: "prv-kpwdn-kti-sulbar", regional_id: "reg-kpwdn-kti", name: "Sulawesi Barat", normalized_name: "Sulawesi Barat", is_active: true },
  { id: "prv-kpwdn-kti-maluku", regional_id: "reg-kpwdn-kti", name: "Maluku", normalized_name: "Maluku", is_active: true },
  { id: "prv-kpwdn-kti-malut", regional_id: "reg-kpwdn-kti", name: "Maluku Utara", normalized_name: "Maluku Utara", is_active: true },
  { id: "prv-kpwdn-kti-papua", regional_id: "reg-kpwdn-kti", name: "Papua", normalized_name: "Papua", is_active: true },
  { id: "prv-kpwdn-kti-papuabarat", regional_id: "reg-kpwdn-kti", name: "Papua Barat", normalized_name: "Papua Barat", is_active: true },

  // Anomalies in source workbook preserved
  { id: "prv-kpwdn-pusat-sumut", regional_id: "reg-kpwdn-pusat-anomaly", name: "Sumatera Utara", normalized_name: "Sumatera Utara", is_active: true },
  { id: "prv-kpwdn-papua-papua", regional_id: "reg-kpwdn-papua-anomaly", name: "Papua", normalized_name: "Papua", is_active: true }
];

export const GROUNDED_LOKASI: MasterLokasi[] = [
  // Under KPBI -> Kantor Pusat -> DKI Jakarta
  { id: "lok-kpbi-dki-thamrin", provinsi_id: "prv-kpbi-dki", name: "Koperbi Thamrin", normalized_name: "Koperbi Thamrin", is_active: true },
  { id: "lok-kpbi-dki-luar", provinsi_id: "prv-kpbi-dki", name: "LUAR KOPERBI", normalized_name: "LUAR KOPERBI", is_active: true },

  // Under KPBI -> Kantor Pusat -> Jawa Barat
  { id: "lok-kpbi-jabar-sinergi", provinsi_id: "prv-kpbi-jabar", name: "Koperbi Sinergi", normalized_name: "Koperbi Sinergi", is_active: true },

  // Under KPwDN -> Sumatera
  { id: "lok-kpwdn-aceh-banda", provinsi_id: "prv-kpwdn-sum-aceh", name: "Banda Aceh", normalized_name: "Banda Aceh", is_active: true },
  { id: "lok-kpwdn-aceh-lhok", provinsi_id: "prv-kpwdn-sum-aceh", name: "Lhokseumawe", normalized_name: "Lhokseumawe", is_active: true },
  { id: "lok-kpwdn-sumut-medan", provinsi_id: "prv-kpwdn-sum-sumut", name: "Medan", normalized_name: "Medan", is_active: true },
  { id: "lok-kpwdn-sumut-siantar", provinsi_id: "prv-kpwdn-sum-sumut", name: "Pematangsiantar", normalized_name: "Pematangsiantar", is_active: true },
  { id: "lok-kpwdn-sumut-sibolga", provinsi_id: "prv-kpwdn-sum-sumut", name: "Sibolga", normalized_name: "Sibolga", is_active: true },
  { id: "lok-kpwdn-sumbar-padang", provinsi_id: "prv-kpwdn-sum-sumbar", name: "Padang", normalized_name: "Padang", is_active: true },
  { id: "lok-kpwdn-riau-pekanbaru", provinsi_id: "prv-kpwdn-sum-riau", name: "Pekanbaru", normalized_name: "Pekanbaru", is_active: true },
  { id: "lok-kpwdn-kepri-batam", provinsi_id: "prv-kpwdn-sum-kepri", name: "Batam", normalized_name: "Batam", is_active: true },
  { id: "lok-kpwdn-jambi-jambi", provinsi_id: "prv-kpwdn-sum-jambi", name: "Jambi", normalized_name: "Jambi", is_active: true },
  { id: "lok-kpwdn-sumsel-palembang", provinsi_id: "prv-kpwdn-sum-sumsel", name: "Palembang", normalized_name: "Palembang", is_active: true },
  { id: "lok-kpwdn-babel-pangkal", provinsi_id: "prv-kpwdn-sum-babel", name: "Pangkal Pinang", normalized_name: "Pangkal Pinang", is_active: true },
  { id: "lok-kpwdn-babel-babel", provinsi_id: "prv-kpwdn-sum-babel", name: "Bangka Belitung", normalized_name: "Bangka Belitung", is_active: true },
  { id: "lok-kpwdn-bengkulu-bengkulu", provinsi_id: "prv-kpwdn-sum-bengkulu", name: "Bengkulu", normalized_name: "Bengkulu", is_active: true },
  { id: "lok-kpwdn-lampung-bandar", provinsi_id: "prv-kpwdn-sum-lampung", name: "Bandar Lampung", normalized_name: "Bandar Lampung", is_active: true },

  // Under KPwDN -> Jawa
  { id: "lok-kpwdn-dki-jakarta", provinsi_id: "prv-kpwdn-jawa-dki", name: "Jakarta", normalized_name: "Jakarta", is_active: true },
  { id: "lok-kpwdn-dki-luar", provinsi_id: "prv-kpwdn-jawa-dki", name: "LUAR KOPERBI", normalized_name: "LUAR KOPERBI", is_active: true },
  { id: "lok-kpwdn-jabar-bandung", provinsi_id: "prv-kpwdn-jawa-jabar", name: "Bandung", normalized_name: "Bandung", is_active: true },
  { id: "lok-kpwdn-jabar-cirebon", provinsi_id: "prv-kpwdn-jawa-jabar", name: "Cirebon", normalized_name: "Cirebon", is_active: true },
  { id: "lok-kpwdn-jabar-tasik", provinsi_id: "prv-kpwdn-jawa-jabar", name: "Tasikmalaya", normalized_name: "Tasikmalaya", is_active: true },
  { id: "lok-kpwdn-jateng-semarang", provinsi_id: "prv-kpwdn-jawa-jateng", name: "Semarang", normalized_name: "Semarang", is_active: true },
  { id: "lok-kpwdn-jateng-solo", provinsi_id: "prv-kpwdn-jawa-jateng", name: "Solo", normalized_name: "Solo", is_active: true },
  { id: "lok-kpwdn-jateng-purwokerto", provinsi_id: "prv-kpwdn-jawa-jateng", name: "Purwokerto", normalized_name: "Purwokerto", is_active: true },
  { id: "lok-kpwdn-diy-jogja", provinsi_id: "prv-kpwdn-jawa-diy", name: "Yogyakarta", normalized_name: "Yogyakarta", is_active: true },
  { id: "lok-kpwdn-jatim-surabaya", provinsi_id: "prv-kpwdn-jawa-jatim", name: "Surabaya", normalized_name: "Surabaya", is_active: true },
  { id: "lok-kpwdn-jatim-malang", provinsi_id: "prv-kpwdn-jawa-jatim", name: "Malang", normalized_name: "Malang", is_active: true },
  { id: "lok-kpwdn-jatim-kediri", provinsi_id: "prv-kpwdn-jawa-jatim", name: "Kediri", normalized_name: "Kediri", is_active: true },

  // Under KPwDN -> KTI
  { id: "lok-kpwdn-bali-denpasar", provinsi_id: "prv-kpwdn-kti-bali", name: "Denpasar", normalized_name: "Denpasar", is_active: true },
  { id: "lok-kpwdn-ntb-mataram", provinsi_id: "prv-kpwdn-kti-ntb", name: "Mataram", normalized_name: "Mataram", is_active: true },
  { id: "lok-kpwdn-ntt-kupang", provinsi_id: "prv-kpwdn-kti-ntt", name: "Kupang", normalized_name: "Kupang", is_active: true },
  { id: "lok-kpwdn-kaltim-samarinda", provinsi_id: "prv-kpwdn-kti-kaltim", name: "Samarinda", normalized_name: "Samarinda", is_active: true },
  { id: "lok-kpwdn-kaltim-balikpapan", provinsi_id: "prv-kpwdn-kti-kaltim", name: "Balikpapan", normalized_name: "Balikpapan", is_active: true },
  { id: "lok-kpwdn-kalteng-palangka", provinsi_id: "prv-kpwdn-kti-kalteng", name: "Palangkaraya", normalized_name: "Palangkaraya", is_active: true },
  { id: "lok-kpwdn-kalsel-banjar", provinsi_id: "prv-kpwdn-kti-kalsel", name: "Banjarmasin", normalized_name: "Banjarmasin", is_active: true },
  { id: "lok-kpwdn-kaltara-tarakan", provinsi_id: "prv-kpwdn-kti-kaltara", name: "Tarakan", normalized_name: "Tarakan", is_active: true },
  { id: "lok-kpwdn-sulut-manado", provinsi_id: "prv-kpwdn-kti-sulut", name: "Manado", normalized_name: "Manado", is_active: true },
  { id: "lok-kpwdn-sulteng-palu", provinsi_id: "prv-kpwdn-kti-sulteng", name: "Palu", normalized_name: "Palu", is_active: true },
  { id: "lok-kpwdn-sulsel-makassar", provinsi_id: "prv-kpwdn-kti-sulsel", name: "Makassar", normalized_name: "Makassar", is_active: true },
  { id: "lok-kpwdn-sultra-kendari", provinsi_id: "prv-kpwdn-kti-sultra", name: "Kendari", normalized_name: "Kendari", is_active: true },
  { id: "lok-kpwdn-gorontalo-gorontalo", provinsi_id: "prv-kpwdn-kti-gorontalo", name: "Gorontalo", normalized_name: "Gorontalo", is_active: true },
  { id: "lok-kpwdn-sulbar-mamuju", provinsi_id: "prv-kpwdn-kti-sulbar", name: "Mamuju", normalized_name: "Mamuju", is_active: true },
  { id: "lok-kpwdn-maluku-ambon", provinsi_id: "prv-kpwdn-kti-maluku", name: "Ambon", normalized_name: "Ambon", is_active: true },
  { id: "lok-kpwdn-malut-ternate", provinsi_id: "prv-kpwdn-kti-malut", name: "Ternate", normalized_name: "Ternate", is_active: true },
  { id: "lok-kpwdn-papua-jayapura", provinsi_id: "prv-kpwdn-kti-papua", name: "Jayapura", normalized_name: "Jayapura", is_active: true },
  { id: "lok-kpwdn-papuabarat-manokwari", provinsi_id: "prv-kpwdn-kti-papuabarat", name: "Manokwari", normalized_name: "Manokwari", is_active: true },

  // Anomalous locations
  { id: "lok-kpwdn-pusat-medan", provinsi_id: "prv-kpwdn-pusat-sumut", name: "Medan", normalized_name: "Medan", is_active: true },
  { id: "lok-kpwdn-papua-jayapura-anom", provinsi_id: "prv-kpwdn-papua-papua", name: "Jayapura", normalized_name: "Jayapura", is_active: true }
];

/**
 * Synchronous grounded helpers for client & server cascading dropdowns
 */

export function getHierarchyRegionals(kpKpw?: string): string[] {
  if (!kpKpw || !kpKpw.trim()) return [];
  const kp = GROUNDED_KP_KPW.find(
    (k) => k.code.toLowerCase() === kpKpw.trim().toLowerCase() || k.name.toLowerCase().includes(kpKpw.trim().toLowerCase())
  );
  if (!kp) return [];
  const regs = GROUNDED_REGIONAL.filter((r) => r.kp_kpw_id === kp.id && r.is_active);
  // Deduplicate and filter out anomalies unless explicitly present
  const names = Array.from(new Set(regs.map((r) => r.name)));
  if (kp.code === "KPBI") {
    return ["Kantor Pusat"];
  }
  // For KPwDN, ensure primary order Sumatera, Jawa, KTI
  const priority = ["Sumatera", "Jawa", "KTI"];
  const others = names.filter((n) => !priority.includes(n));
  return [...priority.filter((p) => names.includes(p)), ...others];
}

export function getHierarchyProvinces(regional?: string, kpKpw?: string): string[] {
  if (!regional || !regional.trim()) return [];
  let matchedRegs = GROUNDED_REGIONAL.filter(
    (r) => r.name.toLowerCase() === regional.trim().toLowerCase() && r.is_active
  );
  if (kpKpw) {
    const kp = GROUNDED_KP_KPW.find(
      (k) => k.code.toLowerCase() === kpKpw.trim().toLowerCase()
    );
    if (kp) {
      const filtered = matchedRegs.filter((r) => r.kp_kpw_id === kp.id);
      if (filtered.length > 0) matchedRegs = filtered;
    }
  }
  const regIds = new Set(matchedRegs.map((r) => r.id));
  const provs = GROUNDED_PROVINSI.filter((p) => regIds.has(p.regional_id) && p.is_active);
  return Array.from(new Set(provs.map((p) => p.name)));
}

export function getHierarchyLocations(provinsi?: string, regional?: string, kpKpw?: string): string[] {
  if (!provinsi || !provinsi.trim()) return [];
  let matchedProvs = GROUNDED_PROVINSI.filter(
    (p) => p.name.toLowerCase() === provinsi.trim().toLowerCase() && p.is_active
  );
  if (regional) {
    let matchedRegs = GROUNDED_REGIONAL.filter(
      (r) => r.name.toLowerCase() === regional.trim().toLowerCase() && r.is_active
    );
    if (kpKpw) {
      const kp = GROUNDED_KP_KPW.find((k) => k.code.toLowerCase() === kpKpw.trim().toLowerCase());
      if (kp) {
        matchedRegs = matchedRegs.filter((r) => r.kp_kpw_id === kp.id);
      }
    }
    const regIds = new Set(matchedRegs.map((r) => r.id));
    const filteredProvs = matchedProvs.filter((p) => regIds.has(p.regional_id));
    if (filteredProvs.length > 0) matchedProvs = filteredProvs;
  }
  const provIds = new Set(matchedProvs.map((p) => p.id));
  const loks = GROUNDED_LOKASI.filter((l) => provIds.has(l.provinsi_id) && l.is_active);
  return Array.from(new Set(loks.map((l) => l.name)));
}

