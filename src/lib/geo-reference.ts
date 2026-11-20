import provincesData from "../../data/provinces.json";
import citiesData from "../../data/cities.json";

export interface ProvinceRef {
  id: string;
  name: string;
  slug: string;
  island: string;
  lat: number;
  lng: number;
}

export interface CityRef {
  id: string;
  name: string;
  slug: string;
  province_id: string;
  province_name: string;
  latitude: number;
  longitude: number;
}

export const PROVINCES: ProvinceRef[] = provincesData as ProvinceRef[];
export const CITIES: CityRef[] = citiesData as CityRef[];

export const REGIONAL_PROVINCE_MAP: Record<string, string[]> = {
  "Kantor Pusat": ["DKI Jakarta"],
  "Jawa": ["DKI Jakarta", "Jawa Barat", "Jawa Tengah", "DI Yogyakarta", "Jawa Timur", "Banten"],
  "Sumatera": [
    "Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Kepulauan Riau",
    "Jambi", "Sumatera Selatan", "Kepulauan Bangka Belitung", "Bengkulu", "Lampung"
  ],
  "KTI": [
    "Kalimantan Barat", "Kalimantan Tengah", "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara",
    "Sulawesi Utara", "Gorontalo", "Sulawesi Tengah", "Sulawesi Barat", "Sulawesi Selatan", "Sulawesi Tenggara",
    "Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur", "Maluku", "Maluku Utara"
  ],
  "Papua": [
    "Papua", "Papua Barat", "Papua Selatan", "Papua Tengah", "Papua Pegunungan", "Papua Barat Daya"
  ]
};

export function getProvincesByRegional(regional: string): ProvinceRef[] {
  const allowed = REGIONAL_PROVINCE_MAP[regional];
  if (!allowed || allowed.length === 0) return PROVINCES;
  return PROVINCES.filter((p) => allowed.some((name) => p.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.name.toLowerCase())));
}

export function getCitiesByProvince(provinceName: string): CityRef[] {
  if (!provinceName) return [];
  const normalized = provinceName.trim().toLowerCase();
  return CITIES.filter(
    (c) => c.province_name.toLowerCase().includes(normalized) || normalized.includes(c.province_name.toLowerCase())
  );
}

export function findRegionalByProvince(provinceName: string): string {
  if (!provinceName) return "Jawa";
  const normalized = provinceName.trim().toLowerCase();
  if (normalized.includes("jakarta")) return "Kantor Pusat";
  for (const [regional, provs] of Object.entries(REGIONAL_PROVINCE_MAP)) {
    if (provs.some((p) => normalized.includes(p.toLowerCase()) || p.toLowerCase().includes(normalized))) {
      return regional;
    }
  }
  return "Jawa";
}

