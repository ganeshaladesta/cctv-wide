/**
 * SCC - EAGLE EYES: Geocoding Intelligence Types
 */

export type GeocodingConfidence = "high" | "medium" | "low";
export type LocationValidationStatus = "unmapped" | "pending_validation" | "verified" | "rejected";

export type GeocodingCategory =
  | "government" // Gedung DPR, Balai Kota, Kantor Gubernur, Kantor Bupati, Kementerian
  | "landmark" // Monas, Patung Kuda, Alun-Alun, Tugu
  | "police_military" // Polda, Polres, Mabes Polri, Mabes TNI
  | "public_facility" // Stasiun, Terminal, Pelabuhan, Rumah Sakit, Stadion
  | "commercial" // Mall, Kawasan Industri, Gedung Perkantoran
  | "road" // Jalan, Simpang, Perempatan
  | "area" // Kawasan, Kelurahan, Kecamatan
  | "city" // Kota / Kabupaten centroid
  | "province"; // Provinsi centroid

export interface GeocodingCandidate {
  lat: number;
  lng: number;
  address: string;
  displayName: string;
  provider: string; // "gazetteer", "google", "mapbox", "photon"
  confidence: GeocodingConfidence;
  score: number; // 0.0 to 1.0
  category: GeocodingCategory;
  city?: string;
  province?: string;
  raw?: Record<string, unknown>;
}

export interface GeocodeSearchOptions {
  query: string;
  city?: string;
  province?: string;
  limit?: number;
  proximity?: { lat: number; lng: number };
}

export interface IGeocodingProvider {
  name: string;
  search(options: GeocodeSearchOptions): Promise<GeocodingCandidate[]>;
  reverse(lat: number, lng: number): Promise<string | null>;
}

