export type StreamProtocol =
  | "HLS"
  | "MJPEG"
  | "SNAPSHOT"
  | "WEBSOCKET"
  | "MP4"
  | "EMBED";

export type CameraStatus = "ONLINE" | "OFFLINE";

export interface Province {
  id: string;
  name: string;
  slug: string;
  island: string;
  lat: number;
  lng: number;
  total_cameras: number;
  online_cameras: number;
  offline_cameras: number;
  city_count: number;
  source_count: number;
}

export interface City {
  id: string;
  name: string;
  slug: string;
  province_id: string;
  province_name: string;
  latitude: number;
  longitude: number;
  total_cameras: number;
  online_cameras: number;
  offline_cameras: number;
}

export interface CCTVSource {
  id: string;
  name: string;
  slug: string;
  province_id: string;
  province_name: string;
  city_id: string;
  city_name: string;
  official_url: string;
  protocol: StreamProtocol;
  requires_proxy: boolean;
  total_cameras: number;
  online_cameras: number;
  offline_cameras: number;
  last_verified_at: string;
}

export interface Camera {
  id: string;
  name: string;
  province_id: string;
  province_name: string;
  city_id: string;
  city_name: string;
  source_id: string;
  source_name: string;
  location: string;
  latitude: number;
  longitude: number;
  stream_url: string;
  source_url: string;
  protocol: StreamProtocol;
  status: CameraStatus;
  last_checked_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Minimal compact tuple for map markers (~1.26 MB raw / ~218 KB gzip for 23k+ cameras):
 * [0:id, 1:lat, 2:lng, 3:status(1=ONLINE,0=OFFLINE)]
 */
export type CompactMarker = [string, number, number, number];

export interface DashboardStats {
  total_cameras: number;
  online_cameras: number;
  offline_cameras: number;
  total_provinces: number;
  total_cities: number;
  total_sources: number;
  protocols: Record<string, number>;
  island_distribution: Array<{
    island: string;
    provinces: number;
    total_cameras: number;
    online_cameras: number;
  }>;
  last_updated: string;
}

export interface StreamValidationResult {
  valid: boolean;
  status: CameraStatus;
  httpStatus: number;
  contentType: string | null;
  protocol: StreamProtocol;
  corsAllowed: boolean;
  latencyMs: number;
  error?: string;
}

export interface CCTVProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly institution: string;
  readonly officialUrl: string;
  getRegions(): Promise<Array<{ province: string; city: string }>>;
  getCameras(): Promise<Camera[]>;
  getCameraDetails(id: string): Promise<Camera | null>;
  normalizeCameraData(raw: unknown): Camera | null;
  validateStream(streamUrl: string): Promise<StreamValidationResult>;
  getLastUpdated(): string;
}
