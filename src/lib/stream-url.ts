const LEGACY_ATCS_ORIGIN = "https://atcsindonesia.com";

export function normalizeLegacyStreamUrl(
  rawUrl: string,
  sourceUrl?: string
): string {
  let current = (rawUrl || "").trim();
  if (!current) return "";

  // Unwrap legacy single or nested /api/proxy?upstream=... / ?url=... wrappers
  for (let i = 0; i < 2; i++) {
    if (!current.startsWith("/api/proxy")) break;
    try {
      const parsed = new URL(current, "https://local.invalid");
      const upstream = parsed.searchParams.get("upstream");
      const innerUrl = parsed.searchParams.get("url");
      if (upstream && upstream.startsWith("/api/proxy/cctv")) {
        current = `${LEGACY_ATCS_ORIGIN}${upstream}`;
      } else if (innerUrl) {
        current = innerUrl.trim();
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  // Resolve relative ATCS frame paths such as /api/cctv/sits-frame/...jpg
  if (current.startsWith("/api/")) {
    let baseOrigin = LEGACY_ATCS_ORIGIN;
    if (sourceUrl) {
      try {
        const s = new URL(sourceUrl);
        if (s.protocol === "https:") {
          baseOrigin = s.origin;
        }
      } catch {}
    }
    current = `${baseOrigin}${current}`;
  }

  return current;
}

export function isTokenExchangeWrapperUrl(url: string): boolean {
  return (
    url.includes("atcsindonesia.com/api/proxy/cctv/balitower-m/") ||
    url.includes("atcsindonesia.com/api/proxy/cctv/wonosobo/")
  );
}

const BINARY_VIDEO_EXT_RE =
  /\.(ts|m4s|mp4|m4v|m4a|aac|flv|webm|mkv|avi|mov|3gp|f4v|vob|ogv|ogg)$/i;

export function isBinaryVideoUrl(rawUrl: string): boolean {
  try {
    const pathname = new URL(rawUrl, "https://local.invalid").pathname;
    return BINARY_VIDEO_EXT_RE.test(pathname);
  } catch {
    return BINARY_VIDEO_EXT_RE.test(rawUrl.split("?")[0]);
  }
}

export function isMjpegUrl(rawUrl: string): boolean {
  const lower = rawUrl.toLowerCase();
  if (lower.includes(".m3u8")) return false;
  return (
    lower.includes("nph-zms") ||
    lower.includes("mjpg") ||
    lower.includes("mjpeg") ||
    lower.includes("mode=jpeg")
  );
}
