import fs from "fs";
import path from "path";
import {
  Camera,
  CameraStatus,
  CCTVSource,
  City,
  CompactMarker,
  DashboardStats,
  Province,
  StreamProtocol
} from "@/lib/types";

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return false;
  }
  const latitude = Number(lat);
  const longitude = Number(lng);
  return (
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude) &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

class CCTVDataStore {
  private provinces: Province[] = [];
  private cities: City[] = [];
  private sources: CCTVSource[] = [];
  private cameras: Camera[] = [];
  private cameraById = new Map<string, Camera>();
  private provinceByIdOrSlug = new Map<string, Province>();
  private cityByIdOrSlug = new Map<string, City>();
  private sourceByIdOrSlug = new Map<string, CCTVSource>();
  private initialized = false;
  private queryCache = new Map<string, { expiresAt: number; data: unknown }>();

  constructor() {
    this.init();
  }

  private getCached<T>(key: string, ttlMs: number, compute: () => T): T {
    const now = Date.now();
    const hit = this.queryCache.get(key);
    if (hit && hit.expiresAt > now) {
      return hit.data as T;
    }
    const data = compute();
    if (this.queryCache.size > 250) {
      this.queryCache.clear();
    }
    this.queryCache.set(key, { expiresAt: now + ttlMs, data });
    return data;
  }

  invalidateCache(): void {
    this.queryCache.clear();
  }

  private init() {
    if (this.initialized) return;
    const dataDir = path.join(process.cwd(), "data");
    try {
      this.provinces = JSON.parse(
        fs.readFileSync(path.join(dataDir, "provinces.json"), "utf8")
      );
      this.cities = JSON.parse(
        fs.readFileSync(path.join(dataDir, "cities.json"), "utf8")
      );
      this.sources = JSON.parse(
        fs.readFileSync(path.join(dataDir, "sources.json"), "utf8")
      );
      const rawCameras: Camera[] = JSON.parse(
        fs.readFileSync(path.join(dataDir, "cameras.json"), "utf8")
      );

      // Filter and normalize coordinates on load
      this.cameras = rawCameras.filter((cam) => {
        if (!isValidCoordinate(cam.latitude, cam.longitude)) return false;
        cam.latitude = Number(cam.latitude);
        cam.longitude = Number(cam.longitude);
        return true;
      });

      for (const p of this.provinces) {
        this.provinceByIdOrSlug.set(p.id.toLowerCase(), p);
        this.provinceByIdOrSlug.set(p.slug.toLowerCase(), p);
        this.provinceByIdOrSlug.set(p.name.toLowerCase(), p);
      }
      for (const c of this.cities) {
        this.cityByIdOrSlug.set(c.id.toLowerCase(), c);
        this.cityByIdOrSlug.set(c.slug.toLowerCase(), c);
        this.cityByIdOrSlug.set(c.name.toLowerCase(), c);
      }
      for (const s of this.sources) {
        this.sourceByIdOrSlug.set(s.id.toLowerCase(), s);
        this.sourceByIdOrSlug.set(s.slug.toLowerCase(), s);
        this.sourceByIdOrSlug.set(s.name.toLowerCase(), s);
      }
      for (const cam of this.cameras) {
        this.cameraById.set(cam.id, cam);
      }
      this.initialized = true;
    } catch (err) {
      console.error("[CCTVDataStore] Failed to load /data/*.json:", err);
    }
  }

  getProvinces(island?: string): Province[] {
    return this.getCached(
      `provinces:${island || "all"}`,
      24 * 60 * 60 * 1000,
      () => {
        if (!island) return this.provinces;
        const q = island.toLowerCase();
        return this.provinces.filter((p) => p.island.toLowerCase() === q);
      }
    );
  }

  getProvince(idOrSlug: string): Province | undefined {
    return this.provinceByIdOrSlug.get(idOrSlug.toLowerCase());
  }

  getCities(provinceFilter?: string, q?: string): City[] {
    return this.getCached(
      `cities:${provinceFilter || ""}:${q || ""}`,
      24 * 60 * 60 * 1000,
      () => {
        let list = this.cities;
        if (provinceFilter) {
          const prov = this.getProvince(provinceFilter);
          const targetId = prov ? prov.id : provinceFilter;
          list = list.filter(
            (c) =>
              c.province_id.toLowerCase() === targetId.toLowerCase() ||
              c.province_name.toLowerCase() === provinceFilter.toLowerCase()
          );
        }
        if (q) {
          const term = q.toLowerCase();
          list = list.filter((c) => c.name.toLowerCase().includes(term));
        }
        return list;
      }
    );
  }

  getSources(filters?: {
    province?: string;
    city?: string;
    protocol?: string;
    q?: string;
  }): CCTVSource[] {
    return this.getCached(
      `sources:${JSON.stringify(filters || {})}`,
      60 * 60 * 1000,
      () => {
        let list = this.sources;
        if (filters?.province) {
          const prov = this.getProvince(filters.province);
          const targetId = prov ? prov.id : filters.province;
          list = list.filter(
            (s) =>
              s.province_id.toLowerCase() === targetId.toLowerCase() ||
              s.province_name.toLowerCase() === filters.province!.toLowerCase()
          );
        }
        if (filters?.city) {
          const city = this.cityByIdOrSlug.get(filters.city.toLowerCase());
          const targetId = city ? city.id : filters.city;
          list = list.filter(
            (s) =>
              s.city_id.toLowerCase() === targetId.toLowerCase() ||
              s.city_name.toLowerCase() === filters.city!.toLowerCase()
          );
        }
        if (filters?.protocol) {
          const proto = filters.protocol.toUpperCase();
          list = list.filter((s) => s.protocol === proto);
        }
        if (filters?.q) {
          const term = filters.q.toLowerCase();
          list = list.filter(
            (s) =>
              s.name.toLowerCase().includes(term) ||
              s.city_name.toLowerCase().includes(term) ||
              s.province_name.toLowerCase().includes(term)
          );
        }
        return list;
      }
    );
  }

  getAllCameras(): Camera[] {
    return this.cameras;
  }

  getCameraById(id: string): Camera | undefined {
    return this.cameraById.get(id);
  }

  getNearbyCameras(cam: Camera, limit = 8): Camera[] {
    const candidates: Array<{ camera: Camera; distSq: number }> = [];
    for (const other of this.cameras) {
      if (other.id === cam.id) continue;
      const dLat = other.latitude - cam.latitude;
      const dLng = other.longitude - cam.longitude;
      if (Math.abs(dLat) > 0.15 || Math.abs(dLng) > 0.15) continue;
      candidates.push({ camera: other, distSq: dLat * dLat + dLng * dLng });
    }
    candidates.sort((a, b) => a.distSq - b.distSq);
    return candidates.slice(0, limit).map((c) => c.camera);
  }

  updateCameraStatus(id: string, status: CameraStatus): Camera | null {
    const cam = this.cameraById.get(id);
    if (!cam) return null;
    const prev = cam.status;
    cam.status = status;
    cam.last_checked_at = new Date().toISOString();
    cam.updated_at = cam.last_checked_at;

    if (prev !== status) {
      const prov = this.provinceByIdOrSlug.get(cam.province_id.toLowerCase());
      if (prov) {
        if (status === "ONLINE") {
          prov.online_cameras++;
          prov.offline_cameras = Math.max(0, prov.offline_cameras - 1);
        } else {
          prov.offline_cameras++;
          prov.online_cameras = Math.max(0, prov.online_cameras - 1);
        }
      }
      this.invalidateCache();
    }
    return cam;
  }

  queryCameras(params: {
    q?: string;
    province?: string;
    city?: string;
    source?: string;
    status?: string;
    protocol?: string;
    bbox?: string;
    ids?: string[];
  }): Camera[] {
    return this.getCached(
      `cameras:${JSON.stringify(params)}`,
      5 * 60 * 1000,
      () => {
        let list =
          params.ids && params.ids.length > 0
            ? params.ids
                .map((id) => this.cameraById.get(id.trim()))
                .filter((c): c is Camera => Boolean(c))
            : this.cameras;

    if (params.province) {
      const prov = this.getProvince(params.province);
      const targetId = prov ? prov.id : params.province;
      list = list.filter(
        (c) =>
          c.province_id.toLowerCase() === targetId.toLowerCase() ||
          c.province_name.toLowerCase() === params.province!.toLowerCase()
      );
    }

    if (params.city) {
      const city = this.cityByIdOrSlug.get(params.city.toLowerCase());
      const targetId = city ? city.id : params.city;
      list = list.filter(
        (c) =>
          c.city_id.toLowerCase() === targetId.toLowerCase() ||
          c.city_name.toLowerCase() === params.city!.toLowerCase()
      );
    }

    if (params.source) {
      const src = this.sourceByIdOrSlug.get(params.source.toLowerCase());
      const targetId = src ? src.id : params.source;
      list = list.filter(
        (c) =>
          c.source_id.toLowerCase() === targetId.toLowerCase() ||
          c.source_name.toLowerCase().includes(params.source!.toLowerCase())
      );
    }

    if (params.status) {
      const st = params.status.toUpperCase();
      if (st === "ONLINE" || st === "LIVE") {
        list = list.filter((c) => c.status === "ONLINE");
      } else if (st === "OFFLINE") {
        list = list.filter((c) => c.status === "OFFLINE");
      }
    }

    if (params.protocol) {
      const proto = params.protocol.toUpperCase() as StreamProtocol;
      list = list.filter((c) => c.protocol === proto);
    }

    if (params.bbox) {
      const parts = params.bbox.split(",").map(Number);
      if (parts.length === 4 && parts.every(Number.isFinite)) {
        const [minLng, minLat, maxLng, maxLat] = parts;
        list = list.filter(
          (c) =>
            c.latitude >= minLat &&
            c.latitude <= maxLat &&
            c.longitude >= minLng &&
            c.longitude <= maxLng
        );
      }
    }

    if (params.q && params.q.trim().length > 0) {
      const term = params.q.trim().toLowerCase();
      const scored: Array<{ cam: Camera; score: number }> = [];
      for (const cam of list) {
        const nameLower = cam.name.toLowerCase();
        const cityLower = cam.city_name.toLowerCase();
        const provLower = cam.province_name.toLowerCase();
        const srcLower = cam.source_name.toLowerCase();
        const locLower = cam.location.toLowerCase();

        let score = -1;
        if (nameLower === term) score = 0;
        else if (nameLower.startsWith(term)) score = 1;
        else if (nameLower.includes(term)) score = 2;
        else if (cityLower === term || provLower === term) score = 3;
        else if (cityLower.includes(term) || locLower.includes(term)) score = 4;
        else if (provLower.includes(term) || srcLower.includes(term)) score = 5;
        else if (cam.id.toLowerCase().includes(term)) score = 6;

        if (score >= 0) {
          scored.push({ cam, score });
        }
      }
      scored.sort((a, b) => a.score - b.score);
      list = scored.map((s) => s.cam);
    }

    return list;
      }
    );
  }

  getCompactMarkers(list?: Camera[]): CompactMarker[] {
    const target = list || this.cameras;
    const out: CompactMarker[] = [];
    for (const c of target) {
      if (!isValidCoordinate(c.latitude, c.longitude)) continue;
      out.push([
        c.id,
        Number(c.latitude),
        Number(c.longitude),
        c.status === "ONLINE" ? 1 : 0,
        c.protocol,
        c.name,
        c.city_name,
        c.province_id,
        c.source_name,
        c.stream_url,
        c.province_name,
        c.source_url
      ]);
    }
    return out;
  }

  getStats(): DashboardStats {
    return this.getCached("stats:global", 60 * 1000, () => {
      let online = 0;
      let offline = 0;
      const protocols: Record<string, number> = {};
      for (const c of this.cameras) {
        if (c.status === "ONLINE") online++;
        else offline++;
        protocols[c.protocol] = (protocols[c.protocol] || 0) + 1;
      }

      const islandMap = new Map<
        string,
        { provinces: number; total_cameras: number; online_cameras: number }
      >();
      for (const p of this.provinces) {
        const cur = islandMap.get(p.island) || {
          provinces: 0,
          total_cameras: 0,
          online_cameras: 0
        };
        cur.provinces++;
        cur.total_cameras += p.total_cameras;
        cur.online_cameras += p.online_cameras;
        islandMap.set(p.island, cur);
      }

      return {
        total_cameras: this.cameras.length,
        online_cameras: online,
        offline_cameras: offline,
        total_provinces: this.provinces.length,
        total_cities: this.cities.length,
        total_sources: this.sources.length,
        protocols,
        island_distribution: Array.from(islandMap.entries()).map(
          ([island, data]) => ({
            island,
            ...data
          })
        ),
        last_updated: "2026-11-10T09:30:00.000Z"
      };
    });
  }
}

let globalStore: CCTVDataStore | null = null;

export function getDataStore(): CCTVDataStore {
  if (!globalStore) {
    globalStore = new CCTVDataStore();
  }
  return globalStore;
}
