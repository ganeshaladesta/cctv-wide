import { NextRequest, NextResponse } from "next/server";

function isDisallowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h.startsWith("10.") ||
    h.startsWith("192.168.") ||
    h.startsWith("169.254.") ||
    h.endsWith(".local")
  ) {
    return true;
  }
  return false;
}

function rewriteM3u8Manifest(text: string, baseUrl: URL): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      // Also rewrite URI="..." inside #EXT-X-KEY or #EXT-X-MAP tags
      if (trimmed.startsWith("#")) {
        if (trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_match, uriVal) => {
            try {
              const abs = new URL(uriVal, baseUrl).toString();
              return `URI="/api/proxy?url=${encodeURIComponent(abs)}"`;
            } catch {
              return _match;
            }
          });
        }
        return line;
      }

      try {
        if (trimmed.startsWith("/api/proxy/cctv")) {
          return `/api/proxy?upstream=${encodeURIComponent(trimmed)}`;
        }
        const abs = new URL(trimmed, baseUrl).toString();
        if (abs.includes("atcsindonesia.com/api/proxy/cctv")) {
          const uObj = new URL(abs);
          return `/api/proxy?upstream=${encodeURIComponent(
            uObj.pathname + uObj.search
          )}`;
        }
        return `/api/proxy?url=${encodeURIComponent(abs)}`;
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
    targetUrl = directUrl;
  } else {
    return NextResponse.json(
      { error: "Missing url or upstream parameter" },
      { status: 400 }
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "Invalid protocol" }, { status: 400 });
    }
    if (isDisallowedHost(parsed.hostname)) {
      return NextResponse.json({ error: "Forbidden host" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Malformed target URL" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "*/*"
    };

    if (customReferer) {
      headers["Referer"] = customReferer;
    } else if (targetUrl.includes("atcsindonesia.com")) {
      headers["Referer"] = "https://atcsindonesia.com/";
      headers["Origin"] = "https://atcsindonesia.com";
    } else {
      headers["Referer"] = `${parsed.protocol}//${parsed.host}/`;
    }

    const res = await fetch(targetUrl, {
      headers,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return new NextResponse(`Upstream error: ${res.status}`, {
        status: res.status
      });
    }

    const contentType =
      res.headers.get("content-type") || "application/octet-stream";
    const isTextOrM3u8 =
      contentType.includes("mpegurl") ||
      contentType.includes("json") ||
      contentType.includes("text") ||
      targetUrl.includes(".m3u8") ||
      (upstreamPath &&
        !upstreamPath.endsWith(".ts") &&
        !upstreamPath.endsWith(".m4s") &&
        !upstreamPath.endsWith(".jpg"));

    if (isTextOrM3u8) {
      const buf = await res.arrayBuffer();
      const firstBytes = new Uint8Array(buf.slice(0, 16));
      // Check if MPEG-TS sync byte 0x47 or JPEG 0xFF 0xD8
      const isBinarySegment =
        firstBytes[0] === 0x47 ||
        (firstBytes[0] === 0xff && firstBytes[1] === 0xd8);

      if (!isBinarySegment) {
        const text = new TextDecoder().decode(buf);
        if (text.trim().startsWith("#EXTM3U")) {
          const baseUrl = new URL(res.url || targetUrl);
          const rewritten = rewriteM3u8Manifest(text, baseUrl);
          return new NextResponse(rewritten, {
            status: 200,
            headers: {
              "Content-Type": "application/vnd.apple.mpegurl",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "no-store, no-cache, must-revalidate"
            }
          });
        }

        // Handle JSON { streamUrl } wrapper returned by some token-warming proxies
        if (text.trim().startsWith("{")) {
          try {
            const json = JSON.parse(text);
            if (json.streamUrl && typeof json.streamUrl === "string") {
              const resolvedStreamUrl = json.streamUrl.startsWith("/")
                ? `https://atcsindonesia.com${json.streamUrl}`
                : json.streamUrl;
              const innerRes = await fetch(resolvedStreamUrl, { headers });
              if (innerRes.ok) {
                const innerText = await innerRes.text();
                if (innerText.trim().startsWith("#EXTM3U")) {
                  const rewritten = rewriteM3u8Manifest(
                    innerText,
                    new URL(innerRes.url || resolvedStreamUrl)
                  );
                  return new NextResponse(rewritten, {
                    status: 200,
                    headers: {
                      "Content-Type": "application/vnd.apple.mpegurl",
                      "Access-Control-Allow-Origin": "*",
                      "Cache-Control": "no-store"
                    }
                  });
                }
              }
            }
          } catch {}
        }
      }

      return new NextResponse(buf, {
        status: res.status,
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      });
    }

    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: res.status,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      }
    });
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
