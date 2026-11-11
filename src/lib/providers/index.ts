import {
  Camera,
  CCTVProviderAdapter,
  StreamProtocol,
  StreamValidationResult
} from "@/lib/types";
import { getDataStore } from "@/lib/data-store";
import { normalizeLegacyStreamUrl } from "@/lib/stream-url";

export function detectStreamProtocol(url: string): StreamProtocol {
  const u = (url || "").toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "EMBED";
  if (u.startsWith("ws://") || u.startsWith("wss://")) return "WEBSOCKET";
  if (
    u.includes("nph-zms") ||
    u.includes("mjpg") ||
    u.includes("mjpeg") ||
    u.includes("mode=jpeg")
  )
    return "MJPEG";
  if (u.endsWith(".jpg") || u.endsWith(".jpeg") || u.includes("snapshot"))
    return "SNAPSHOT";
  if (u.endsWith(".mp4") || u.endsWith(".ts") || u.includes(".flv"))
    return "MP4";
  if (u.includes("play.html") || u.endsWith(".html")) return "EMBED";
  return "HLS";
}

export function extractAmgChannelId(url: string): string | null {
  if (!url || !url.includes("stream.amg.id")) return null;
  const match = url.match(
    /(?:playersite_)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return match ? match[1] : null;
}

export async function probeStreamUrl(
  streamUrl: string,
  timeoutMs = 8000
): Promise<StreamValidationResult> {
  const start = Date.now();
  const protocol = detectStreamProtocol(streamUrl);
  const amgChannelId = extractAmgChannelId(streamUrl);
  const targetUrl = amgChannelId
    ? `https://stream.amg.id/memfs/${amgChannelId}.m3u8`
    : normalizeLegacyStreamUrl(streamUrl);

  if (targetUrl.startsWith("ws://") || targetUrl.startsWith("wss://")) {
    return {
      valid: true,
      status: "ONLINE",
      httpStatus: 101,
      contentType: "application/octet-stream",
      protocol: "WEBSOCKET",
      corsAllowed: true,
      latencyMs: Date.now() - start
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Range: "bytes=0-4095"
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    const contentType = res.headers.get("content-type");
    const acao = res.headers.get("access-control-allow-origin");
    const ok = res.status >= 200 && res.status < 400;

    return {
      valid: ok,
      status: ok ? "ONLINE" : "OFFLINE",
      httpStatus: res.status,
      contentType,
      protocol,
      corsAllowed: Boolean(acao && (acao === "*" || acao.length > 0)),
      latencyMs
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      valid: false,
      status: "OFFLINE",
      httpStatus: 0,
      contentType: null,
      protocol,
      corsAllowed: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Stream probe failed"
    };
  }
}

abstract class BaseCCTVProvider implements CCTVProviderAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly institution: string;
  abstract readonly officialUrl: string;
  protected abstract readonly provinceFilter?: string;
  protected abstract readonly sourceKeyword?: string;
  protected lastUpdated: string = "2026-11-10T09:30:00.000Z";

  async getRegions(): Promise<Array<{ province: string; city: string }>> {
    const cams = await this.getCameras();
    const seen = new Set<string>();
    const regions: Array<{ province: string; city: string }> = [];
    for (const c of cams) {
      const key = `${c.province_name}::${c.city_name}`;
      if (!seen.has(key)) {
        seen.add(key);
        regions.push({ province: c.province_name, city: c.city_name });
      }
    }
    return regions;
  }

  async getCameras(): Promise<Camera[]> {
    const store = getDataStore();
    return store.getAllCameras().filter((c) => {
      if (this.provinceFilter && c.province_id !== this.provinceFilter)
        return false;
      if (
        this.sourceKeyword &&
        !c.source_name.toLowerCase().includes(this.sourceKeyword.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }

  async getCameraDetails(id: string): Promise<Camera | null> {
    return getDataStore().getCameraById(id) || null;
  }

  normalizeCameraData(raw: unknown): Camera | null {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const id = String(item.id || item.cctv_id || "").trim();
    const name = String(item.name || item.title || item.cctv_title || id).trim();
    const streamUrl = String(
      item.stream_url || item.streamingUrl || item.cctv_link || ""
    ).trim();
    const lat = Number(item.latitude ?? item.lat ?? item.cctv_latitude);
    const lng = Number(item.longitude ?? item.lng ?? item.cctv_longitude);
    if (!id || !streamUrl || !Number.isFinite(lat) || !Number.isFinite(lng))
      return null;

    const now = new Date().toISOString();
    return {
      id,
      name,
      province_id: String(item.province_id || "prov-diy"),
      province_name: String(item.province_name || item.province || "Indonesia"),
      city_id: String(item.city_id || "city-default"),
      city_name: String(item.city_name || item.city || "Kota"),
      source_id: this.id,
      source_name: this.name,
      location: String(item.location || name),
      latitude: lat,
      longitude: lng,
      stream_url: streamUrl,
      source_url: this.officialUrl,
      protocol: detectStreamProtocol(streamUrl),
      status:
        item.status === "OFFLINE" || item.status === "offline"
          ? "OFFLINE"
          : "ONLINE",
      last_checked_at: now,
      created_at: now,
      updated_at: now
    };
  }

  async validateStream(streamUrl: string): Promise<StreamValidationResult> {
    return probeStreamUrl(streamUrl);
  }

  getLastUpdated(): string {
    return this.lastUpdated;
  }
}

export class JogjaATCSProvider extends BaseCCTVProvider {
  readonly id = "jogja-atcs-provider";
  readonly name = "Pemkot & Pemprov DI Yogyakarta (Jogja ATCS & MAM)";
  readonly institution = "Diskominfo & Dishub Kota Yogyakarta / Pemprov DIY";
  readonly officialUrl = "https://cctv.jogjakota.go.id/";
  protected readonly provinceFilter = "prov-diy";
  protected readonly sourceKeyword = undefined;
}

export class BandungATCSProvider extends BaseCCTVProvider {
  readonly id = "bandung-atcs-provider";
  readonly name = "ATCS Dishub & PELINDUNG Diskominfo Kota Bandung";
  readonly institution = "Dinas Perhubungan & Diskominfo Kota Bandung";
  readonly officialUrl = "https://atcs-dishub.bandung.go.id/";
  protected readonly provinceFilter = "prov-jabar";
  protected readonly sourceKeyword = "bandung";
}

export class JakartaCCTVProvider extends BaseCCTVProvider {
  readonly id = "jakarta-cctv-provider";
  readonly name = "DKI Jakarta Smart City & BaliTower";
  readonly institution = "Pemprov DKI Jakarta / Jakarta Smart City";
  readonly officialUrl = "https://smartcity.jakarta.go.id/";
  protected readonly provinceFilter = "prov-jakarta";
  protected readonly sourceKeyword = undefined;
}

export class SemarangCCTVProvider extends BaseCCTVProvider {
  readonly id = "semarang-cctv-provider";
  readonly name = "Pantau Semar & ATCS Jawa Tengah";
  readonly institution = "Pemerintah Kota Semarang & Dishub Jawa Tengah";
  readonly officialUrl = "https://pantausemar.semarangkota.go.id/";
  protected readonly provinceFilter = "prov-jateng";
  protected readonly sourceKeyword = "semar";
}

export class NationalTollProvider extends BaseCCTVProvider {
  readonly id = "national-toll-provider";
  readonly name = "Ditjen Bina Marga, Jasa Marga & Hutama Karya (Tol Nasional)";
  readonly institution = "Kementerian PU / PT Jasa Marga / PT Hutama Karya";
  readonly officialUrl = "https://binamarga.pu.go.id/";
  protected readonly provinceFilter = undefined;
  protected readonly sourceKeyword = "binamarga";
}

export class OpenCCTVProvider extends BaseCCTVProvider {
  readonly id = "opencctv-nusantara-provider";
  readonly name = "Nusantara 38-Province Public CCTV Registry";
  readonly institution = "Dishub / Diskominfo / Badilag ACO Seluruh Indonesia";
  readonly officialUrl = "https://opencctv.org/";
  protected readonly provinceFilter = undefined;
  protected readonly sourceKeyword = undefined;
}

export class AMGLiveProvider extends BaseCCTVProvider {
  readonly id = "amg-live-provider";
  readonly name = "AMG Live CCTV (Sarinah Jakarta Pusat)";
  readonly institution = "AMG (Alternative Media Group)";
  readonly officialUrl = "https://stream.amg.id/index.html";
  protected readonly provinceFilter = "prov-jakarta";
  protected readonly sourceKeyword = "amg";
}

export const PROVIDER_REGISTRY: CCTVProviderAdapter[] = [
  new JogjaATCSProvider(),
  new BandungATCSProvider(),
  new JakartaCCTVProvider(),
  new SemarangCCTVProvider(),
  new NationalTollProvider(),
  new OpenCCTVProvider(),
  new AMGLiveProvider()
];

