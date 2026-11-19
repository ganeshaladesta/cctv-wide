/**
 * SCC - EAGLE EYES: Geocoding Service & Orchestrator
 * Multi-provider geocoding pipeline with caching, request deduplication,
 * Indonesian contextual query generation, and confidence scoring.
 */

import {
  IGeocodingProvider,
  GeocodeSearchOptions,
  GeocodingCandidate,
  GeocodingConfidence
} from "./types";
import { searchGazetteer, normalizeIndonesianQuery } from "./indonesian-gazetteer";
import { PhotonGeocodingProvider } from "./photon-provider";
import { GoogleGeocodingProvider } from "./google-provider";
import { MapboxGeocodingProvider } from "./mapbox-provider";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 1500;

export class GeocodingService {
  private providers: IGeocodingProvider[] = [];
  private searchCache = new Map<string, CacheEntry<GeocodingCandidate[]>>();
  private reverseCache = new Map<string, CacheEntry<string>>();
  private inFlightSearches = new Map<string, Promise<GeocodingCandidate[]>>();

  constructor() {
    // 1. Google if available
    const google = new GoogleGeocodingProvider();
    if (google.isAvailable()) this.providers.push(google);

    // 2. Mapbox if available
    const mapbox = new MapboxGeocodingProvider();
    if (mapbox.isAvailable()) this.providers.push(mapbox);

    // 3. Photon (OSM) as standard open proxy
    this.providers.push(new PhotonGeocodingProvider());
  }

  /**
   * Remove common Indonesian preposition prefixes to extract core entity
   * e.g. "Depan Gedung DPR/MPR RI" -> "Gedung DPR/MPR RI"
   */
  public cleanLocationName(rawText: string): string {
    if (!rawText) return "";
    let cleaned = rawText.trim();

    // Strip common Indonesian location prefixes
    const prefixes = [
      /^(depan|seberang|halaman|gerbang|pintu|lobby|kawasan|sekitar|wilayah|area|arah)\s+/i,
      /^(kantor|gedung)\s+/i
    ];

    for (const rx of prefixes) {
      if (rx.test(cleaned)) {
        // Only strip if not making it too short
        const testStrip = cleaned.replace(rx, "").trim();
        if (testStrip.length >= 3) {
          cleaned = testStrip;
        }
      }
    }

    return cleaned;
  }

  /**
   * Generate prioritized contextual search permutations for an Unras event
   */
  public generateQueryVariations(params: {
    lokasi: string;
    titik_kumpul?: string | null;
    sasaran_aksi?: string | null;
    kota_kabupaten?: string | null;
    provinsi?: string | null;
  }): string[] {
    const variations: string[] = [];
    const seen = new Set<string>();

    const addQuery = (q: string) => {
      const trimmed = q.replace(/\s+/g, " ").trim();
      if (trimmed.length > 2 && !seen.has(trimmed.toLowerCase())) {
        seen.add(trimmed.toLowerCase());
        variations.push(trimmed);
      }
    };

    const cleanLok = this.cleanLocationName(params.lokasi || "");
    const city = params.kota_kabupaten?.replace(/^(kota|kabupaten|kab\.)\s+/i, "").trim();
    const prov = params.provinsi?.replace(/^(provinsi|prov\.)\s+/i, "").trim();

    // Permutation 1: Specific core POI + Kota + Provinsi + Indonesia
    if (cleanLok) {
      const parts = [cleanLok, city, prov, "Indonesia"].filter(Boolean);
      addQuery(parts.join(", "));
    }

    // Permutation 2: Target / Sasaran Aksi + Kota + Indonesia
    if (params.sasaran_aksi && params.sasaran_aksi.trim()) {
      const cleanSasaran = this.cleanLocationName(params.sasaran_aksi);
      const parts = [cleanSasaran, city, "Indonesia"].filter(Boolean);
      addQuery(parts.join(", "));
    }

    // Permutation 3: Assembly point / Tikum + Kota + Indonesia
    if (params.titik_kumpul && params.titik_kumpul.trim()) {
      const cleanTikum = this.cleanLocationName(params.titik_kumpul);
      const parts = [cleanTikum, city, "Indonesia"].filter(Boolean);
      addQuery(parts.join(", "));
    }

    // Permutation 4: Raw original lokasi + Kota
    if (params.lokasi && params.lokasi.trim() !== cleanLok) {
      const parts = [params.lokasi.trim(), city, "Indonesia"].filter(Boolean);
      addQuery(parts.join(", "));
    }

    // Permutation 5: Clean POI standalone
    if (cleanLok) {
      addQuery(cleanLok);
    }

    return variations;
  }

  /**
   * Primary Search Pipeline with Multi-tier Providers & In-Memory LRU Cache
   */
  public async search(options: GeocodeSearchOptions): Promise<GeocodingCandidate[]> {
    const query = (options.query || "").trim();
    if (!query || query.length < 2) return [];

    const cacheKey = `${normalizeIndonesianQuery(query)}|${options.city || ""}|${options.province || ""}`;

    // 1. Check in-memory cache
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    // 2. Request deduplication
    if (this.inFlightSearches.has(cacheKey)) {
      return this.inFlightSearches.get(cacheKey)!;
    }

    const searchPromise = this.executeSearch(options, cacheKey);
    this.inFlightSearches.set(cacheKey, searchPromise);

    try {
      const result = await searchPromise;
      return result;
    } finally {
      this.inFlightSearches.delete(cacheKey);
    }
  }

  private async executeSearch(options: GeocodeSearchOptions, cacheKey: string): Promise<GeocodingCandidate[]> {
    const results: GeocodingCandidate[] = [];
    const seenCoords = new Set<string>();

    const addCandidate = (c: GeocodingCandidate) => {
      const coordKey = `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;
      if (!seenCoords.has(coordKey)) {
        seenCoords.add(coordKey);
        results.push(c);
      }
    };

    // Tier 1: Indonesian Spatial Gazetteer (0ms instant match for key government offices & landmarks)
    const gazetteerMatches = searchGazetteer(options.query, options.city);
    for (const m of gazetteerMatches) {
      addCandidate(m);
    }

    // If we have a HIGH confidence match from gazetteer (score >= 0.90), we can return immediately!
    if (results.some((r) => r.confidence === "high" && r.score >= 0.90)) {
      this.setCache(this.searchCache, cacheKey, results);
      return results;
    }

    // Tier 2: Query Online Providers (Google, Mapbox, Photon)
    for (const provider of this.providers) {
      try {
        const providerCandidates = await provider.search(options);
        for (const cand of providerCandidates) {
          addCandidate(cand);
        }
        if (results.length >= (options.limit || 5)) break;
      } catch {
        // Fallback to next provider
      }
    }

    // Sort by confidence & score descending
    results.sort((a, b) => {
      const confWeight = { high: 3, medium: 2, low: 1 };
      const diff = confWeight[b.confidence] - confWeight[a.confidence];
      if (diff !== 0) return diff;
      return b.score - a.score;
    });

    const finalResults = results.slice(0, options.limit || 6);
    this.setCache(this.searchCache, cacheKey, finalResults);
    return finalResults;
  }

  /**
   * Reverse Geocoding with Cache
   */
  public async reverse(lat: number, lng: number): Promise<string | null> {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const cached = this.reverseCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    for (const provider of this.providers) {
      try {
        const address = await provider.reverse(lat, lng);
        if (address) {
          this.setCache(this.reverseCache, key, address);
          return address;
        }
      } catch {
        // Fallback to next provider
      }
    }

    return null;
  }

  /**
   * Auto-geocode a protest event from Excel or form data.
   * Generates query permutations and returns the best candidate with alternatives.
   * CRITICAL: Never automatically verifies; assigns 'pending_validation' or 'unmapped'.
   */
  public async geocodeProtestEvent(event: {
    lokasi: string;
    titik_kumpul?: string | null;
    sasaran_aksi?: string | null;
    kota_kabupaten?: string | null;
    provinsi?: string | null;
  }): Promise<{
    suggested_lat: number | null;
    suggested_lng: number | null;
    suggested_address: string | null;
    geocoding_provider: string | null;
    geocoding_confidence: GeocodingConfidence | null;
    geocoding_alternatives: Array<{ lat: number; lng: number; address: string; score: number; provider: string }>;
    location_validation_status: "pending_validation" | "unmapped";
  }> {
    const variations = this.generateQueryVariations(event);

    let bestCandidate: GeocodingCandidate | null = null;
    const allAlternatives: GeocodingCandidate[] = [];

    for (const q of variations) {
      const candidates = await this.search({
        query: q,
        city: event.kota_kabupaten || undefined,
        province: event.provinsi || undefined,
        limit: 4
      });

      if (candidates.length > 0) {
        if (!bestCandidate || candidates[0].score > bestCandidate.score) {
          bestCandidate = candidates[0];
        }
        allAlternatives.push(...candidates);
      }

      // If high confidence found, no need to execute further variations
      if (bestCandidate && bestCandidate.confidence === "high") {
        break;
      }
    }

    if (!bestCandidate || bestCandidate.confidence === "low") {
      return {
        suggested_lat: null,
        suggested_lng: null,
        suggested_address: null,
        geocoding_provider: null,
        geocoding_confidence: null,
        geocoding_alternatives: [],
        location_validation_status: "unmapped"
      };
    }

    const filteredAlternatives = allAlternatives
      .filter((c) => c.lat !== bestCandidate!.lat || c.lng !== bestCandidate!.lng)
      .slice(0, 3)
      .map((c) => ({
        lat: c.lat,
        lng: c.lng,
        address: c.address,
        score: c.score,
        provider: c.provider
      }));

    return {
      suggested_lat: bestCandidate.lat,
      suggested_lng: bestCandidate.lng,
      suggested_address: bestCandidate.address,
      geocoding_provider: bestCandidate.provider,
      geocoding_confidence: bestCandidate.confidence,
      geocoding_alternatives: filteredAlternatives,
      location_validation_status: "pending_validation"
    };
  }

  private setCache<K, V>(map: Map<K, CacheEntry<V>>, key: K, data: V) {
    if (map.size >= MAX_CACHE_SIZE) {
      const oldestKey = map.keys().next().value;
      if (oldestKey) map.delete(oldestKey);
    }
    map.set(key, { data, timestamp: Date.now() });
  }
}

// Global Singleton Instance
export const geocodingService = new GeocodingService();

