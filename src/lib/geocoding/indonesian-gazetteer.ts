/**
 * SCC - EAGLE EYES: Indonesian Spatial Gazetteer
 * Comprehensive spatial POI database for Indonesian government buildings,
 * state institutions, parliament complexes, police headquarters, and historical protest hotspots.
 *
 * Provides: 0ms latency, zero-cost, 100% offline availability, and high confidence.
 */

import { GeocodingCandidate } from "./types";

export interface GazetteerEntry {
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
  address: string;
  category: "government" | "landmark" | "police_military" | "public_facility" | "road" | "commercial";
  city: string;
  province: string;
}

export const INDONESIAN_GAZETTEER: GazetteerEntry[] = [
  // --- DKI JAKARTA - STATE & NATIONAL INSTITUTIONS ---
  {
    name: "Gedung DPR/MPR RI",
    aliases: [
      "dpr ri", "mpr ri", "gedung dpr", "gedung mpr", "parlemen", "kompleks dpr",
      "senayan dpr", "gerbang dpr", "depan dpr", "dpr-ri", "kantor dpr", "gedung kura-kura"
    ],
    lat: -6.2115,
    lng: 106.8016,
    address: "Jl. Jend. Gatot Subroto No.1, RT.1/RW.3, Gelora, Tanah Abang, Kota Jakarta Pusat, DKI Jakarta 10270",
    category: "government",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Istana Merdeka / Istana Kepresidenan RI",
    aliases: ["istana merdeka", "istana negara", "istana kepresidenan", "depan istana", "kawasan istana"],
    lat: -6.1702,
    lng: 106.8242,
    address: "Jl. Medan Merdeka Utara, Gambir, Kota Jakarta Pusat, DKI Jakarta 10110",
    category: "government",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Monumen Nasional (Monas)",
    aliases: ["monas", "monumen nasional", "tugu monas", "silang monas", "cawan monas", "taman monas"],
    lat: -6.1754,
    lng: 106.8272,
    address: "Kawasan Medan Merdeka, Gambir, Kota Jakarta Pusat, DKI Jakarta 10110",
    category: "landmark",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Patung Kuda Arjuna Wijaya (Kawasan Monas Barat)",
    aliases: ["patung kuda", "patung kuda monas", "arjuna wijaya", "air mancur monas", "simpang patung kuda"],
    lat: -6.1783,
    lng: 106.8236,
    address: "Jl. Medan Merdeka Barat / Jl. MH Thamrin, Gambir, Kota Jakarta Pusat, DKI Jakarta",
    category: "landmark",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Balai Kota DKI Jakarta (Kantor Gubernur DKI)",
    aliases: ["balai kota dki", "balai kota jakarta", "kantor gubernur dki", "kantor gub dki", "depan balai kota"],
    lat: -6.1812,
    lng: 106.8286,
    address: "Jl. Medan Merdeka Selatan No.8-9, Gambir, Kota Jakarta Pusat, DKI Jakarta 10110",
    category: "government",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Gedung DPRD DKI Jakarta",
    aliases: ["dprd dki", "dprd dki jakarta", "gedung dprd dki"],
    lat: -6.1825,
    lng: 106.8315,
    address: "Jl. Kebon Sirih No.18, Gambir, Kota Jakarta Pusat, DKI Jakarta 10110",
    category: "government",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Mahkamah Konstitusi (MK RI)",
    aliases: ["mahkamah konstitusi", "mk ri", "gedung mk", "depan mk"],
    lat: -6.1770,
    lng: 106.8228,
    address: "Jl. Medan Merdeka Barat No.6, Gambir, Kota Jakarta Pusat, DKI Jakarta 10110",
    category: "government",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Mahkamah Agung (MA RI)",
    aliases: ["mahkamah agung", "ma ri", "gedung ma", "depan ma"],
    lat: -6.1695,
    lng: 106.8290,
    address: "Jl. Medan Merdeka Utara No.9-13, Gambir, Kota Jakarta Pusat, DKI Jakarta 10110",
    category: "government",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Komisi Pemilihan Umum (KPU RI)",
    aliases: ["kpu ri", "kpu", "gedung kpu", "komisi pemilihan umum", "kantor kpu imam bonjol"],
    lat: -6.1989,
    lng: 106.8312,
    address: "Jl. Imam Bonjol No.29, Menteng, Kota Jakarta Pusat, DKI Jakarta 10310",
    category: "government",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Badan Pengawas Pemilu (Bawaslu RI)",
    aliases: ["bawaslu ri", "bawaslu", "gedung bawaslu", "kantor bawaslu"],
    lat: -6.1917,
    lng: 106.8236,
    address: "Jl. M.H. Thamrin No.14, Menteng, Kota Jakarta Pusat, DKI Jakarta 10350",
    category: "government",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Komisi Pemberantasan Korupsi (KPK Merah Putih)",
    aliases: ["kpk", "gedung kpk", "kpk merah putih", "gedung kpk rasuna said", "kantor kpk"],
    lat: -6.2111,
    lng: 106.8331,
    address: "Jl. Kuningan Persada No.2, Setiabudi, Kota Jakarta Selatan, DKI Jakarta 12980",
    category: "government",
    city: "Jakarta Selatan",
    province: "DKI Jakarta"
  },
  {
    name: "Kejaksaan Agung RI",
    aliases: ["kejaksaan agung", "kejagung", "gedung kejagung", "kantor kejagung"],
    lat: -6.2429,
    lng: 106.7997,
    address: "Jl. Sultan Hasanuddin No.1, Kebayoran Baru, Kota Jakarta Selatan, DKI Jakarta 12160",
    category: "government",
    city: "Jakarta Selatan",
    province: "DKI Jakarta"
  },
  {
    name: "Kementerian Ketenagakerjaan (Kemnaker RI)",
    aliases: ["kemnaker", "depnaker", "kementerian ketenagakerjaan", "gedung kemnaker gatot subroto"],
    lat: -6.2396,
    lng: 106.8312,
    address: "Jl. Jend. Gatot Subroto Kav. 51, Kuningan Barat, Mampang Prapatan, Jakarta Selatan 12950",
    category: "government",
    city: "Jakarta Selatan",
    province: "DKI Jakarta"
  },
  {
    name: "Kementerian ESDM RI",
    aliases: ["kementerian esdm", "esdm", "gedung esdm", "depan esdm"],
    lat: -6.1834,
    lng: 106.8242,
    address: "Jl. Medan Merdeka Selatan No.18, Gambir, Kota Jakarta Pusat, DKI Jakarta 10110",
    category: "government",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Kementerian BUMN RI",
    aliases: ["kementerian bumn", "bumn", "gedung bumn"],
    lat: -6.1805,
    lng: 106.8268,
    address: "Jl. Medan Merdeka Selatan No.13, Gambir, Kota Jakarta Pusat, DKI Jakarta 10110",
    category: "government",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Kementerian Keuangan RI (Kemenkeu)",
    aliases: ["kemenkeu", "kementerian keuangan", "gedung daendels kemenkeu", "lapangan banteng kemenkeu"],
    lat: -6.1706,
    lng: 106.8368,
    address: "Jl. Lapangan Banteng Timur No.2-4, Pasar Baru, Sawah Besar, Jakarta Pusat 10710",
    category: "government",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi (Kemendikbudristek)",
    aliases: ["kemendikbud", "kemendikbudristek", "gedung kemendikbud senayan"],
    lat: -6.2248,
    lng: 106.8025,
    address: "Jl. Jenderal Sudirman, Senayan, Kebayoran Baru, Jakarta Selatan 10270",
    category: "government",
    city: "Jakarta Selatan",
    province: "DKI Jakarta"
  },
  {
    name: "Kementerian Koordinator Bidang Polhukam",
    aliases: ["menkopolhukam", "kemenkopolhukam", "polhukam"],
    lat: -6.1795,
    lng: 106.8219,
    address: "Jl. Medan Merdeka Barat No.15, Gambir, Kota Jakarta Pusat, DKI Jakarta 10110",
    category: "government",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },

  // --- POLICE & MILITARY HEADQUARTERS ---
  {
    name: "Polda Metro Jaya",
    aliases: ["polda metro jaya", "polda metro", "mapolda metro jaya", "kantor polda metro", "semanggi polda"],
    lat: -6.2241,
    lng: 106.8123,
    address: "Jl. Jenderal Sudirman No.55, Senayan, Kebayoran Baru, Jakarta Selatan 12190",
    category: "police_military",
    city: "Jakarta Selatan",
    province: "DKI Jakarta"
  },
  {
    name: "Mabes Polri (Markas Besar Kepolisian RI)",
    aliases: ["mabes polri", "markas besar kepolisian", "trunojoyo polri"],
    lat: -6.2407,
    lng: 106.8021,
    address: "Jl. Trunojoyo No.3, Selong, Kebayoran Baru, Jakarta Selatan 12110",
    category: "police_military",
    city: "Jakarta Selatan",
    province: "DKI Jakarta"
  },
  {
    name: "Mabes TNI Cilangkap",
    aliases: ["mabes tni", "cilangkap", "markas besar tni"],
    lat: -6.3312,
    lng: 106.9064,
    address: "Cilangkap, Cipayung, Kota Jakarta Timur, DKI Jakarta 13870",
    category: "police_military",
    city: "Jakarta Timur",
    province: "DKI Jakarta"
  },

  // --- KEY PUBLIC HUBS & PROTEST ASSEMBLY POINTS (TIKUM) ---
  {
    name: "Bundaran Hotel Indonesia (Bundaran HI)",
    aliases: ["bundaran hi", "patung selamat datang", "tugu selamat datang", "bunderan hi"],
    lat: -6.1950,
    lng: 106.8230,
    address: "Jl. M.H. Thamrin, Menteng, Kota Jakarta Pusat, DKI Jakarta 10310",
    category: "landmark",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "TVRI Senayan (Titik Kumpul Utama Aksi Senayan)",
    aliases: ["tvri", "tvri senayan", "kantor tvri pusat", "depan tvri", "gerbang pemuda tvri"],
    lat: -6.2128,
    lng: 106.8038,
    address: "Jl. Gerbang Pemuda, Gelora, Tanah Abang, Kota Jakarta Pusat, DKI Jakarta 10270",
    category: "public_facility",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Stadion Gelora Bung Karno (GBK Senayan)",
    aliases: ["gbk", "gelora bung karno", "parkir timur gbk", "plaza timur gbk"],
    lat: -6.2185,
    lng: 106.8026,
    address: "Jl. Pintu Satu Senayan, Gelora, Tanah Abang, Kota Jakarta Pusat 10270",
    category: "public_facility",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },
  {
    name: "Taman Pandang Istana (Lokasi Resmi Unjuk Rasa Kawasan Monas)",
    aliases: ["taman pandang", "taman pandang istana", "seberang istana", "titik aksi istana"],
    lat: -6.1718,
    lng: 106.8247,
    address: "Silang Monas Barat Laut, Gambir, Kota Jakarta Pusat, DKI Jakarta 10110",
    category: "landmark",
    city: "Jakarta Pusat",
    province: "DKI Jakarta"
  },

  // --- MAJOR REGIONAL CAPITALS & GOVERNMENT CENTERS ---
  // Jawa Barat (Bandung)
  {
    name: "Gedung Sate (Kantor Gubernur Jawa Barat)",
    aliases: ["gedung sate", "kantor gubernur jabar", "gubernur jawa barat", "gubernuran jabar"],
    lat: -6.9025,
    lng: 107.6186,
    address: "Jl. Diponegoro No.22, Citarum, Bandung Wetan, Kota Bandung, Jawa Barat 40115",
    category: "government",
    city: "Kota Bandung",
    province: "Jawa Barat"
  },
  {
    name: "DPRD Provinsi Jawa Barat",
    aliases: ["dprd jabar", "dprd jawa barat", "gedung dprd jabar"],
    lat: -6.9017,
    lng: 107.6192,
    address: "Jl. Diponegoro No.27, Citarum, Bandung Wetan, Kota Bandung, Jawa Barat 40115",
    category: "government",
    city: "Kota Bandung",
    province: "Jawa Barat"
  },
  {
    name: "Balai Kota Bandung",
    aliases: ["balai kota bandung", "kantor walikota bandung", "taman sejarah bandung"],
    lat: -6.9114,
    lng: 107.6097,
    address: "Jl. Wastukencana No.2, Babakan Ciamis, Sumur Bandung, Kota Bandung, Jawa Barat 40117",
    category: "government",
    city: "Kota Bandung",
    province: "Jawa Barat"
  },
  {
    name: "Polda Jawa Barat",
    aliases: ["polda jabar", "mapolda jabar", "kantor polda jawa barat"],
    lat: -6.9392,
    lng: 107.6839,
    address: "Jl. Soekarno Hatta No.748, Cimencrang, Gedebage, Kota Bandung, Jawa Barat 40292",
    category: "police_military",
    city: "Kota Bandung",
    province: "Jawa Barat"
  },

  // Jawa Tengah & DIY (Semarang, Yogyakarta)
  {
    name: "Kantor Gubernur Jawa Tengah",
    aliases: ["kantor gubernur jateng", "gubernuran jateng", "kantor gubernur jawa tengah"],
    lat: -6.9928,
    lng: 110.4208,
    address: "Jl. Pahlawan No.9, Mugassari, Semarang Selatan, Kota Semarang, Jawa Tengah 50249",
    category: "government",
    city: "Kota Semarang",
    province: "Jawa Tengah"
  },
  {
    name: "Gedung DPRD Jawa Tengah",
    aliases: ["dprd jateng", "gedung dprd jateng", "dprd jawa tengah"],
    lat: -6.9918,
    lng: 110.4205,
    address: "Jl. Pahlawan No.7, Mugassari, Semarang Selatan, Kota Semarang, Jawa Tengah 50249",
    category: "government",
    city: "Kota Semarang",
    province: "Jawa Tengah"
  },
  {
    name: "Simpang Lima Semarang",
    aliases: ["simpang lima semarang", "simpang lima", "lapangan pancasila semarang"],
    lat: -6.9904,
    lng: 110.4229,
    address: "Kawasan Simpang Lima, Pleburan, Semarang Selatan, Kota Semarang, Jawa Tengah 50241",
    category: "landmark",
    city: "Kota Semarang",
    province: "Jawa Tengah"
  },
  {
    name: "Kompleks Kepatihan (Kantor Gubernur DIY Yogyakarta)",
    aliases: ["kepatihan yogyakarta", "kantor gubernur diy", "gubernuran diy", "komplek kepatihan"],
    lat: -7.7958,
    lng: 110.3662,
    address: "Jl. Malioboro, Suryatmajan, Danurejan, Kota Yogyakarta, DI Yogyakarta 55213",
    category: "government",
    city: "Kota Yogyakarta",
    province: "DI Yogyakarta"
  },
  {
    name: "Titik Nol Kilometer Yogyakarta",
    aliases: ["titik nol yogyakarta", "titik nol km jogja", "nol km jogja", "perempatan kantor pos jogja"],
    lat: -7.8003,
    lng: 110.3664,
    address: "Jl. Pangurakan No.1, Ngupasan, Gondomanan, Kota Yogyakarta, DI Yogyakarta 55122",
    category: "landmark",
    city: "Kota Yogyakarta",
    province: "DI Yogyakarta"
  },
  {
    name: "Kantor Bupati Sleman",
    aliases: ["kantor bupati sleman", "pemkab sleman", "bupati sleman"],
    lat: -7.7161,
    lng: 110.3547,
    address: "Jl. Parasamya No.1, Beran, Tridadi, Kec. Sleman, Kabupaten Sleman, DI Yogyakarta 55511",
    category: "government",
    city: "Kabupaten Sleman",
    province: "DI Yogyakarta"
  },

  // Jawa Timur (Surabaya, Malang)
  {
    name: "Gedung Grahadi (Kediaman Resmi Gubernur Jawa Timur)",
    aliases: ["gedung grahadi", "grahadi", "grahadi surabaya", "kantor gubernur jatim"],
    lat: -7.2625,
    lng: 112.7444,
    address: "Jl. Gubernur Suryo No.7, Embong Kaliasin, Genteng, Kota Surabaya, Jawa Timur 60271",
    category: "government",
    city: "Kota Surabaya",
    province: "Jawa Timur"
  },
  {
    name: "Kantor Gubernur Jawa Timur (Pahlawan)",
    aliases: ["kantor gub jatim pahlawan", "kantor gubernur jatim pahlawan"],
    lat: -7.2475,
    lng: 112.7378,
    address: "Jl. Pahlawan No.110, Alun-alun Contong, Bubutan, Kota Surabaya, Jawa Timur 60174",
    category: "government",
    city: "Kota Surabaya",
    province: "Jawa Timur"
  },
  {
    name: "DPRD Jawa Timur (Indrapura)",
    aliases: ["dprd jatim", "gedung dprd jawa timur", "dprd jatim indrapura"],
    lat: -7.2392,
    lng: 112.7314,
    address: "Jl. Indrapura No.1, Krembangan Selatan, Krembangan, Kota Surabaya, Jawa Timur 60175",
    category: "government",
    city: "Kota Surabaya",
    province: "Jawa Timur"
  },
  {
    name: "Balai Kota Surabaya",
    aliases: ["balai kota surabaya", "kantor walikota surabaya", "taman surya"],
    lat: -7.2633,
    lng: 112.7525,
    address: "Jl. Walikota Mustajab No.59, Ketabang, Genteng, Kota Surabaya, Jawa Timur 60272",
    category: "government",
    city: "Kota Surabaya",
    province: "Jawa Timur"
  },
  {
    name: "Alun-Alun Tugu Kota Malang / Balai Kota Malang",
    aliases: ["alun-alun tugu malang", "balai kota malang", "alun-alun malang", "tugu malang"],
    lat: -7.9772,
    lng: 112.6342,
    address: "Jl. Tugu No.1, Kiduldalem, Klojen, Kota Malang, Jawa Timur 65111",
    category: "government",
    city: "Kota Malang",
    province: "Jawa Timur"
  },

  // Sumatera Utara (Medan)
  {
    name: "Kantor Gubernur Sumatera Utara",
    aliases: ["kantor gubernur sumut", "kantor gubernur sumatera utara", "gubernuran sumut"],
    lat: 3.5851,
    lng: 98.6738,
    address: "Jl. Pangeran Diponegoro No.30, Madras Hulu, Medan Polonia, Kota Medan, Sumatera Utara 20152",
    category: "government",
    city: "Kota Medan",
    province: "Sumatera Utara"
  },
  {
    name: "Gedung DPRD Sumatera Utara",
    aliases: ["dprd sumut", "gedung dprd sumatera utara"],
    lat: 3.5908,
    lng: 98.6756,
    address: "Jl. Imam Bonjol No.5, Petisah Tengah, Medan Petisah, Kota Medan, Sumatera Utara 20112",
    category: "government",
    city: "Kota Medan",
    province: "Sumatera Utara"
  },

  // Sulawesi Selatan (Makassar)
  {
    name: "Kantor Gubernur Sulawesi Selatan",
    aliases: ["kantor gubernur sulsel", "kantor gubernur sulawesi selatan", "gubernuran sulsel"],
    lat: -5.1472,
    lng: 119.4328,
    address: "Jl. Urip Sumoharjo No.269, Panaikang, Panakkukang, Kota Makassar, Sulawesi Selatan 90231",
    category: "government",
    city: "Kota Makassar",
    province: "Sulawesi Selatan"
  },
  {
    name: "Gedung DPRD Sulawesi Selatan",
    aliases: ["dprd sulsel", "gedung dprd sulawesi selatan"],
    lat: -5.1461,
    lng: 119.4344,
    address: "Jl. Urip Sumoharjo No.59, Karampuang, Panakkukang, Kota Makassar, Sulawesi Selatan 90231",
    category: "government",
    city: "Kota Makassar",
    province: "Sulawesi Selatan"
  },
  {
    name: "Flyover Pettarani Makassar (Titik Kumpul Utama Aksi Makassar)",
    aliases: ["flyover makassar", "fly over pettarani", "bawah flyover pettarani", "simpang pettarani"],
    lat: -5.1466,
    lng: 119.4442,
    address: "Jl. A. P. Pettarani / Jl. Urip Sumoharjo, Tamamaung, Panakkukang, Kota Makassar",
    category: "road",
    city: "Kota Makassar",
    province: "Sulawesi Selatan"
  }
];

/**
 * Clean & normalize search text for matching
 */
export function normalizeIndonesianQuery(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Search the Gazetteer with token overlap and alias matching
 */
export function searchGazetteer(query: string, cityFilter?: string): GeocodingCandidate[] {
  const normQuery = normalizeIndonesianQuery(query);
  if (!normQuery || normQuery.length < 2) return [];

  const queryTokens = normQuery.split(" ").filter((t) => t.length > 1);
  const normCity = cityFilter ? normalizeIndonesianQuery(cityFilter) : null;

  const matches: Array<{ entry: GazetteerEntry; score: number }> = [];

  for (const entry of INDONESIAN_GAZETTEER) {
    let bestScore = 0;

    const normName = normalizeIndonesianQuery(entry.name);
    const normEntryCity = normalizeIndonesianQuery(entry.city);
    const normEntryProv = normalizeIndonesianQuery(entry.province);

    // 1. Direct name match or containment
    if (normName === normQuery) {
      bestScore = 1.0;
    } else if (normName.includes(normQuery) || normQuery.includes(normName)) {
      bestScore = 0.95;
    } else {
      // 2. Check aliases
      for (const alias of entry.aliases) {
        const normAlias = normalizeIndonesianQuery(alias);
        if (normAlias === normQuery) {
          bestScore = Math.max(bestScore, 0.98);
          break;
        } else if (normQuery.includes(normAlias) || normAlias.includes(normQuery)) {
          bestScore = Math.max(bestScore, 0.90);
        } else {
          // Token match
          const aliasTokens = normAlias.split(" ").filter((t) => t.length > 1);
          let matched = 0;
          for (const at of aliasTokens) {
            if (queryTokens.includes(at)) matched++;
          }
          if (aliasTokens.length > 0) {
            const overlapRatio = matched / aliasTokens.length;
            if (overlapRatio >= 0.75) {
              bestScore = Math.max(bestScore, 0.75 + overlapRatio * 0.15);
            }
          }
        }
      }
    }

    // City preference bonus / penalty
    if (normCity && bestScore > 0) {
      if (normEntryCity.includes(normCity) || normCity.includes(normEntryCity)) {
        bestScore = Math.min(1.0, bestScore + 0.1);
      } else if (normEntryProv.includes(normCity) || normCity.includes(normEntryProv)) {
        bestScore = Math.min(1.0, bestScore + 0.05);
      } else if (!normQuery.includes(normEntryCity)) {
        // Penalty if looking in a specific different city and the query didn't name the entry's city
        bestScore *= 0.7;
      }
    }

    if (bestScore >= 0.6) {
      matches.push({ entry, score: bestScore });
    }
  }

  // Sort descending by score
  matches.sort((a, b) => b.score - a.score);

  return matches.slice(0, 5).map(({ entry, score }) => ({
    lat: entry.lat,
    lng: entry.lng,
    address: entry.address,
    displayName: `${entry.name}, ${entry.city}, ${entry.province}`,
    provider: "gazetteer",
    confidence: score >= 0.85 ? "high" : score >= 0.65 ? "medium" : "low",
    score: Math.round(score * 100) / 100,
    category: entry.category,
    city: entry.city,
    province: entry.province,
    raw: {
      name: entry.name,
      aliases: entry.aliases
    }
  }));
}

