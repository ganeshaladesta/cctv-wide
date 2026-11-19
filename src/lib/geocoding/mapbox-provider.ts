/**
 * SCC - EAGLE EYES: Mapbox Geocoding Provider
 * Active only when MAPBOX_ACCESS_TOKEN is available in server environment
 */

import { IGeocodingProvider, GeocodeSearchOptions, GeocodingCandidate, GeocodingCategory } from "./types";

export class MapboxGeocodingProvider implements IGeocodingProvider {
  name = "mapbox";
  private accessToken: string;

  constructor(token?: string) {
    this.accessToken = token || process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "";
  }

  isAvailable(): boolean {
    return Boolean(this.accessToken && this.accessToken.trim().length > 0);
  }

  async search(options: GeocodeSearchOptions): Promise<GeocodingCandidate[]> {
    if (!this.isAvailable()) return [];
    const { query, limit = 5 } = options;
    if (!query) return [];

    try {
      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`;
      const url = new URL(endpoint);
      url.searchParams.set("country", "id");
      url.searchParams.set("language", "id");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("access_token", this.accessToken);

      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = await res.json();
      if (!data || !Array.isArray(data.features)) return [];

      return data.features.map((item: any) => {
        const [lng, lat] = item.center;
        const placeType = item.place_type?.[0] || "";

        let category: GeocodingCategory = "area";
        if (placeType === "poi") category = "landmark";
        else if (placeType === "address") category = "road";
        else if (placeType === "place") category = "city";
        else if (placeType === "region") category = "province";

        const isExact = placeType === "poi" || placeType === "address";
        const isStreet = placeType === "neighborhood" || placeType === "locality";

        return {
          lat,
          lng,
          address: item.place_name,
          displayName: item.text || item.place_name,
          provider: "mapbox",
          confidence: isExact ? "high" : isStreet ? "medium" : "low",
          score: isExact ? 0.90 : isStreet ? 0.70 : 0.40,
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
      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`;
      const url = new URL(endpoint);
      url.searchParams.set("country", "id");
      url.searchParams.set("language", "id");
      url.searchParams.set("access_token", this.accessToken);

      const res = await fetch(url.toString());
      if (!res.ok) return null;
      const data = await res.json();
      if (data && Array.isArray(data.features) && data.features.length > 0) {
        return data.features[0].place_name;
      }
      return null;
    } catch {
      return null;
    }
  }
}

