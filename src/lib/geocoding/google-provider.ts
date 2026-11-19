/**
 * SCC - EAGLE EYES: Google Maps & Places Geocoding Provider
 * Active only when GOOGLE_MAPS_API_KEY is available in server environment
 */

import { IGeocodingProvider, GeocodeSearchOptions, GeocodingCandidate, GeocodingCategory } from "./types";

export class GoogleGeocodingProvider implements IGeocodingProvider {
  name = "google";
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async search(options: GeocodeSearchOptions): Promise<GeocodingCandidate[]> {
    if (!this.isAvailable()) return [];
    const { query, limit = 5 } = options;
    if (!query) return [];

    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("address", query);
      url.searchParams.set("components", "country:ID");
      url.searchParams.set("language", "id");
      url.searchParams.set("key", this.apiKey);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) return [];
      const data = await res.json();
      if (!data || data.status !== "OK" || !Array.isArray(data.results)) return [];

      return data.results.slice(0, limit).map((item: any) => {
        const lat = item.geometry.location.lat;
        const lng = item.geometry.location.lng;
        const locType = item.geometry.location_type; // ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER, APPROXIMATE
        const types: string[] = item.types || [];

        let category: GeocodingCategory = "area";
        if (types.includes("police")) category = "police_military";
        else if (types.includes("local_government_office") || types.includes("city_hall") || types.includes("courthouse")) category = "government";
        else if (types.includes("point_of_interest") || types.includes("tourist_attraction")) category = "landmark";
        else if (types.includes("route")) category = "road";
        else if (types.includes("administrative_area_level_2")) category = "city";
        else if (types.includes("administrative_area_level_1")) category = "province";

        const isExact = locType === "ROOFTOP";
        const isStreet = locType === "RANGE_INTERPOLATED" || types.includes("route");

        return {
          lat,
          lng,
          address: item.formatted_address,
          displayName: item.formatted_address,
          provider: "google",
          confidence: isExact ? "high" : isStreet ? "medium" : "low",
          score: isExact ? 0.95 : isStreet ? 0.75 : 0.45,
          category,
          raw: item
        };
      });
    } catch {
      return [];
    }
  }

  async reverse(lat: number, lng: number): Promise<string | null> {
    if (!this.isAvailable()) return null;
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("latlng", `${lat},${lng}`);
      url.searchParams.set("language", "id");
      url.searchParams.set("key", this.apiKey);

      const res = await fetch(url.toString());
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status === "OK" && data.results && data.results.length > 0) {
        return data.results[0].formatted_address;
      }
      return null;
    } catch {
      return null;
    }
  }
}

