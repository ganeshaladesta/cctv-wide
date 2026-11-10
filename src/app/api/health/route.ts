import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { probeStreamUrl } from "@/lib/providers";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  const urlParam = sp.get("url");
  const store = getDataStore();

  const healthCacheHeaders = {
    "Cache-Control": "public, max-age=30, stale-while-revalidate=30"
  };

  let targetUrl = urlParam || "";
  if (id) {
    const cam = store.getCameraById(id);
    if (!cam) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 });
    }
    targetUrl = cam.stream_url;
  }

  if (!targetUrl) {
    return NextResponse.json(
      {
        status: "ok",
        service: "SCC - EAGLE EYES Health Engine",
        stats: store.getStats()
      },
      { headers: healthCacheHeaders }
    );
  }

  const probe = await probeStreamUrl(targetUrl);
  if (id) {
    store.updateCameraStatus(id, probe.status);
  }

  return NextResponse.json(
    {
      id: id || null,
      stream_url: targetUrl,
      ...probe,
      checked_at: new Date().toISOString()
    },
    { headers: healthCacheHeaders }
  );
}
