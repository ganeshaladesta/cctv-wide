import { lookup } from "dns/promises";
import { isIP } from "net";
import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import {
  isBinaryVideoUrl,
  isMjpegUrl,
  normalizeLegacyStreamUrl
} from "@/lib/stream-url";

const MAX_MANIFEST_BYTES = 512 * 1024;
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const MAX_KEY_BYTES = 4096;
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

function isPrivateIpAddress(rawIp: string): boolean {
  let ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const zoneIdx = ip.indexOf("%");
  if (zoneIdx >= 0) ip = ip.slice(0, zoneIdx);

  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  const family = isIP(ip);
  if (family === 6) {
    // Reject loopback, unspecified, link-local, unique-local, multicast IPv6
    return (
      ip === "::" ||
      ip === "::1" ||
      ip.startsWith("fc") ||
      ip.startsWith("fd") ||
      ip.startsWith("fe80") ||
      ip.startsWith("ff")
    );
  }

  if (family === 4) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b, c] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;
    return false;
  }

  return true;
}

function isApprovedHostname(
  hostname: string,
  redirectOriginHost?: string
): boolean {
  const allowed = getDataStore().getAllowedProxyHosts();
  if (allowed.has(hostname)) return true;
  if (isIP(hostname) !== 0) return false;

  if (
    redirectOriginHost &&
    (hostname === redirectOriginHost ||
      hostname.endsWith(`.${redirectOriginHost}`))
  ) {
    return true;
  }

  for (const base of allowed) {
    if (isIP(base) === 0 && hostname.endsWith(`.${base}`)) {
      return true;
    }
  }
  return false;
}

async function validateProxyTarget(
  rawUrl: string,
  redirectOriginHost?: string
): Promise<
  { ok: true; url: URL; hostname: string } | { ok: false; status: number; error: string }
> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, status: 400, error: "Malformed target URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, status: 400, error: "Invalid protocol" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, status: 400, error: "Credentials in URL are disallowed" };
  }

  const hostname = parsed.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    !hostname.includes(".")
  ) {
    return { ok: false, status: 403, error: "Forbidden host" };
  }

  if (isIP(hostname) !== 0) {
    if (isPrivateIpAddress(hostname)) {
      return { ok: false, status: 403, error: "Forbidden private IP host" };
    }
  }

  if (!isApprovedHostname(hostname, redirectOriginHost)) {
    return {
      ok: false,
      status: 403,
      error: "Host is not an approved CCTV provider"
    };
  }

  if (isBinaryVideoUrl(parsed.toString())) {
    return {
      ok: false,
      status: 403,
      error: "Binary video segments must load directly from the provider"
    };
  }

  if (isMjpegUrl(parsed.toString())) {
    return {
      ok: false,
      status: 403,
      error: "Continuous MJPEG streams cannot be proxied through Vercel"
    };
  }

  if (isIP(hostname) === 0) {
    try {
      const records = await lookup(hostname, { all: true });
      if (!records.length || records.some((r) => isPrivateIpAddress(r.address))) {
        return {
          ok: false,
          status: 403,
          error: "Resolved IP address is forbidden"
        };
      }
    } catch {
      return {
        ok: false,
        status: 502,
        error: "Unable to resolve upstream provider host"
      };
    }
  }

  return { ok: true, url: parsed, hostname };
}

function buildUpstreamHeaders(parsed: URL, customReferer?: string | null) {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "*/*"
  };

  if (customReferer) {
    headers["Referer"] = customReferer;
  } else if (parsed.hostname.includes("atcsindonesia.com")) {
    headers["Referer"] = "https://atcsindonesia.com/";
    headers["Origin"] = "https://atcsindonesia.com";
  } else {
    headers["Referer"] = `${parsed.protocol}//${parsed.host}/`;
  }
  return headers;
}

async function fetchSafeWithRedirects(
  initialUrl: string,
  customReferer: string | null,
  signal: AbortSignal
): Promise<
  | { ok: true; res: Response; finalUrl: URL }
  | { ok: false; status: number; error: string }
> {
  let currentUrl = initialUrl;
  let originHost: string | undefined;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = await validateProxyTarget(currentUrl, originHost);
    if (!check.ok) {
      return check;
    }

    const res = await fetch(check.url.toString(), {
      headers: buildUpstreamHeaders(check.url, customReferer),
      redirect: "manual",
      signal
    });

    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {});
      const location = res.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) {
        return {
          ok: false,
          status: 502,
          error: "Too many or invalid upstream redirects"
        };
      }
      try {
        currentUrl = new URL(location, check.url).toString();
        originHost = check.hostname;
        continue;
      } catch {
        return { ok: false, status: 502, error: "Invalid redirect location" };
      }
    }

    return { ok: true, res, finalUrl: check.url };
  }

  return { ok: false, status: 502, error: "Redirect limit exceeded" };
}

function isBinaryMediaChunk(bytes: Uint8Array): boolean {
  // MPEG-TS sync bytes at packet boundaries (0x47 every 188 bytes)
  if (bytes.length >= 189 && bytes[0] === 0x47 && bytes[188] === 0x47) {
    return true;
  }
  // ISO BMFF / MP4 / fMP4 boxes ("ftyp", "moof", "styp")
  if (bytes.length >= 8) {
    const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (box === "ftyp" || box === "moof" || box === "styp") {
      return true;
    }
  }
  // FLV ("FLV\x01")
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x46 &&
    bytes[1] === 0x4c &&
    bytes[2] === 0x56 &&
    bytes[3] === 0x01
  ) {
    return true;
  }
  return false;
}

async function readBoundedChunks(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  rejectBinaryVideo = true
): Promise<
  | { ok: true; data: Uint8Array }
  | { ok: false; status: number; error: string }
> {
  if (!body) {
    return { ok: true, data: new Uint8Array(0) };
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      if (chunks.length === 0 && rejectBinaryVideo && isBinaryMediaChunk(value)) {
        await reader.cancel().catch(() => {});
        return {
          ok: false,
          status: 415,
          error: "Binary video streams cannot be proxied"
        };
      }

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return {
          ok: false,
          status: 413,
          error: "Upstream response exceeds safe proxy size limit"
        };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, data: combined };
}

function createBoundedStream(
  body: ReadableStream<Uint8Array>,
  maxBytes: number
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let total = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          controller.error(new Error("Snapshot exceeds size limit"));
          return;
        }
        controller.enqueue(value);
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    }
  });
}

function isNestedPlaylistUrl(absUrl: URL, prevNonEmptyTag: string): boolean {
  if (
    prevNonEmptyTag.startsWith("#EXT-X-STREAM-INF") ||
    prevNonEmptyTag.startsWith("#EXT-X-I-FRAME-STREAM-INF")
  ) {
    return true;
  }
  const p = absUrl.pathname.toLowerCase();
  if (p.endsWith(".m3u8")) return true;
  return false;
}

function rewriteM3u8Manifest(text: string, baseUrl: URL): string {
  const lines = text.split(/\r?\n/);
  let prevTag = "";

  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        prevTag = trimmed;

        if (trimmed.includes('URI="')) {
          const isKeyTag =
            trimmed.startsWith("#EXT-X-KEY") ||
            trimmed.startsWith("#EXT-X-SESSION-KEY");
          const isPlaylistTag = trimmed.startsWith("#EXT-X-MEDIA");

          return line.replace(/URI="([^"]+)"/g, (_match, uriVal) => {
            try {
              const abs = new URL(uriVal, baseUrl);
              const absStr = abs.toString();
              // Preserve direct URL for #EXT-X-MAP (binary fMP4 init) and non-key segments
              if (
                isBinaryVideoUrl(absStr) ||
                (!isKeyTag && !(isPlaylistTag && abs.pathname.toLowerCase().endsWith(".m3u8")))
              ) {
                return `URI="${absStr}"`;
              }
              return `URI="/api/proxy?url=${encodeURIComponent(absStr)}"`;
            } catch {
              return _match;
            }
          });
        }
        return line;
      }

      const lastTag = prevTag;
      prevTag = "";

      try {
        const abs = new URL(trimmed, baseUrl);
        const absStr = abs.toString();

        // Only rewrite nested .m3u8 playlists; keep all .ts / .m4s / media segments direct!
        if (!isBinaryVideoUrl(absStr) && isNestedPlaylistUrl(abs, lastTag)) {
          return `/api/proxy?url=${encodeURIComponent(absStr)}`;
        }
        return absStr;
      } catch {
        return line;
      }
    })
    .join("\n");
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const upstreamPath = sp.get("upstream");
  const directUrl = sp.get("url");
  const customReferer = sp.get("referer");

  let targetUrl = "";
  if (upstreamPath && upstreamPath.startsWith("/api/proxy/cctv")) {
    targetUrl = `https://atcsindonesia.com${upstreamPath}`;
  } else if (directUrl) {
    targetUrl = normalizeLegacyStreamUrl(directUrl);
  } else {
    return NextResponse.json(
      { error: "Missing url or upstream parameter" },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const fetched = await fetchSafeWithRedirects(
      targetUrl,
      customReferer,
      controller.signal
    );

    if (!fetched.ok) {
      clearTimeout(timeout);
      return NextResponse.json(
        { error: fetched.error },
        { status: fetched.status }
      );
    }

    const { res, finalUrl } = fetched;
    if (!res.ok) {
      clearTimeout(timeout);
      await res.body?.cancel().catch(() => {});
      return new NextResponse(`Upstream error: ${res.status}`, {
        status: res.status
      });
    }

    const contentType = (
      res.headers.get("content-type") || "application/octet-stream"
    ).toLowerCase();

    if (
      contentType.includes("multipart/x-mixed-replace") ||
      contentType.startsWith("video/") ||
      contentType.includes("mp2t") ||
      contentType.includes("iso.segment")
    ) {
      clearTimeout(timeout);
      await res.body?.cancel().catch(() => {});
      return NextResponse.json(
        { error: "Binary or continuous video streams cannot be proxied" },
        { status: 415 }
      );
    }

    const declaredLen = Number(res.headers.get("content-length") || "0");
    const isImage = contentType.startsWith("image/");

    if (isImage) {
      if (declaredLen > MAX_SNAPSHOT_BYTES) {
        clearTimeout(timeout);
        await res.body?.cancel().catch(() => {});
        return NextResponse.json(
          { error: "Snapshot image too large" },
          { status: 413 }
        );
      }
      clearTimeout(timeout);
      const stream = res.body
        ? createBoundedStream(res.body, MAX_SNAPSHOT_BYTES)
        : null;
      return new NextResponse(stream, {
        status: res.status,
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=4, s-maxage=4, stale-while-revalidate=4"
        }
      });
    }

    if (declaredLen > MAX_MANIFEST_BYTES) {
      clearTimeout(timeout);
      await res.body?.cancel().catch(() => {});
      return NextResponse.json(
        { error: "Upstream payload exceeds manifest proxy limit" },
        { status: 413 }
      );
    }

    const bounded = await readBoundedChunks(
      res.body,
      MAX_MANIFEST_BYTES,
      true
    );
    if (!bounded.ok) {
      clearTimeout(timeout);
      return NextResponse.json(
        { error: bounded.error },
        { status: bounded.status }
      );
    }

    const bytes = bounded.data;
    const text = new TextDecoder().decode(bytes);
    const trimmedText = text.trim();

    if (trimmedText.startsWith("#EXTM3U")) {
      clearTimeout(timeout);
      const rewritten = rewriteM3u8Manifest(text, finalUrl);
      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      });
    }

    // Handle JSON { streamUrl } wrapper with full SSRF validation & bounded read
    if (trimmedText.startsWith("{")) {
      try {
        const json = JSON.parse(trimmedText);
        if (json.streamUrl && typeof json.streamUrl === "string") {
          const resolvedStreamUrl = new URL(
            normalizeLegacyStreamUrl(json.streamUrl),
            finalUrl
          ).toString();
          const innerFetch = await fetchSafeWithRedirects(
            resolvedStreamUrl,
            customReferer,
            controller.signal
          );
          if (innerFetch.ok && innerFetch.res.ok) {
            const innerBound = await readBoundedChunks(
              innerFetch.res.body,
              MAX_MANIFEST_BYTES,
              true
            );
            if (innerBound.ok) {
              const innerText = new TextDecoder().decode(innerBound.data);
              if (innerText.trim().startsWith("#EXTM3U")) {
                clearTimeout(timeout);
                const rewritten = rewriteM3u8Manifest(
                  innerText,
                  innerFetch.finalUrl
                );
                return new NextResponse(rewritten, {
                  status: 200,
                  headers: {
                    "Content-Type": "application/vnd.apple.mpegurl",
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-store, no-cache, must-revalidate"
                  }
                });
              }
            }
          } else if (innerFetch.ok) {
            await innerFetch.res.body?.cancel().catch(() => {});
          }
        }
      } catch {}
    }

    clearTimeout(timeout);

    // Allow tiny AES-128 #EXT-X-KEY files (<= 4 KB), reject arbitrary HTML/binary blobs
    if (bytes.byteLength <= MAX_KEY_BYTES && !contentType.includes("text/html")) {
      return new NextResponse(Buffer.from(bytes), {
        status: res.status,
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      });
    }

    return NextResponse.json(
      { error: "Upstream did not return a valid HLS manifest or snapshot" },
      { status: 415 }
    );
  } catch (err) {
    clearTimeout(timeout);
    return NextResponse.json(
      {
        error: "Proxy request failed",
        details: err instanceof Error ? err.message : "Unknown error"
      },
      { status: 502 }
    );
  }
}
