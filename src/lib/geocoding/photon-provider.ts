/**
 * SCC - EAGLE EYES: Photon Geocoding Provider
 * Open-source geocoding proxy powered by Komoot Photon (OpenStreetMap data)
 * Specifically optimized for search, autocomplete, and spatial filtering.
 */

import { IGeocodingProvider, GeocodeSearchOptions, GeocodingCandidate, GeocodingCategory } from "./types";

function mapOsmTypeToCategory(osmKey?: string, osmValue?: string, type?: string): GeocodingCategory {
  if (osmKey === "amenity" && (osmValue === "townhall" || osmValue === "courthouse" || osmValue === "police")) {
    return osmValue === "police" ? "police_military" : "government";
  }
  if (osmKey === "historic" || osmValue === "monument" || osmValue === "memorial") {
    return "landmark";
  }
  if (osmKey === "highway" || type === "street") {
    return "road";
  }
  if (type === "city" || type === "administrative") {
    return "city";
  }
  if (type === "state") {
    return "province";
  }
  return "area";
}

export class PhotonGeocodingProvider implements IGeocodingProvider {
  name = "photon";

  async search(options: GeocodeSearchOptions): Promise<GeocodingCandidate[]> {
    const { query, limit = 5 } = options;
    if (!query || query.trim().length < 2) return [];

    try {
      const proximityLat = options.proximity?.lat ?? -6.2088; // Jakarta default
      const proximityLng = options.proximity?.lng ?? 106.8456;

      const url = new URL("https://photon.komoot.io/api/");
      url.searchParams.set("q", query.trim());
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("lang", "id");
      url.searchParams.set("lat", String(proximityLat));
      url.searchParams.set("lon", String(proximityLng));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": "SCC-EagleEyes-Geocoding/1.0"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) return [];

      const data = await res.json();
      if (!data || !Array.isArray(data.features)) return [];

      const candidates: GeocodingCandidate[] = [];

      for (const feat of data.features) {
        const coords = feat.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;
        const [lng, lat] = coords;
        const props = feat.properties || {};

        // Only include Indonesian results if country is reported
        if (props.countrycode && props.countrycode.toUpperCase() !== "ID") {
          continue;
        }

        const name = props.name || "";
        const street = props.street ? `${props.street}${props.housenumber ? ` No. ${props.housenumber}` : ""}` : "";
        const city = props.city || props.county || props.district || "";
        const state = props.state || "";

        const parts = [name, street, city, state, "Indonesia"].filter(Boolean);
        const address = Array.from(new Set(parts)).join(", ");
        const displayName = name ? `${name}, ${city || state}` : address;

        const category = mapOsmTypeToCategory(props.osm_key, props.osm_value, props.type);

        // Confidence heuristic
        let confidence: "high" | "medium" | "low" = "medium";
        let score = 0.7;
        if (props.osm_key === "amenity" || props.osm_key === "historic" || props.osm_key === "building") {
          confidence = "high";
          score = 0.85;
        } else if (category === "road") {
          confidence = "medium";
          score = 0.65;
        } else if (category === "city" || category === "province") {
          confidence = "low";
          score = 0.45;
        }

        candidates.push({
          lat,
          lng,
          address,
          displayName,
          provider: "photon",
          confidence,
          score,
          category,
          city,
          province: state,
          raw: props
        });
      }

      return candidates;
    } catch {
      return [];
    }
  }

  async reverse(lat: number, lng: number): Promise<string | null> {
    try {
      const url = new URL("https://photon.komoot.io/reverse");
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lng));
      url.searchParams.set("lang", "id");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": "SCC-EagleEyes-Geocoding/1.0"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !Array.isArray(data.features) || data.features.length === 0) return null;

      const props = data.features[0].properties || {};
      const parts = [
        props.name,
        props.street ? `${props.street}${props.housenumber ? ` No. ${props.housenumber}` : ""}` : null,
        props.district || props.city,
        props.state,
        "Indonesia"
      ].filter(Boolean);

      return Array.from(new Set(parts)).join(", ");
    } catch {
      return null;
    }
  }
}

