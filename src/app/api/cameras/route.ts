import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") || undefined;
  const province = sp.get("province") || undefined;
  const city = sp.get("city") || undefined;
  const source = sp.get("source") || undefined;
  const status = sp.get("status") || undefined;
  const protocol = sp.get("protocol") || undefined;
  const bbox = sp.get("bbox") || undefined;
  const idsParam = sp.get("ids") || undefined;
  const mode = sp.get("mode") || "full";

  const store = getDataStore();
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;
  const filtered = store.queryCameras({
    q,
    province,
    city,
    source,
    status,
    protocol,
    bbox,
    ids
  });

  const cacheHeaders = {
    "Cache-Control":
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
  };

  if (mode === "markers") {
    const markers = store.getCompactMarkers(filtered);
    return NextResponse.json(
      {
        total: markers.length,
        markers
      },
      { headers: cacheHeaders }
    );
  }

  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const rawLimit = sp.get("limit");
  const limit =
    rawLimit === "all"
      ? filtered.length
      : Math.min(5000, Math.max(1, parseInt(rawLimit || "60", 10) || 60));

  const start = (page - 1) * limit;
  const paged = filtered.slice(start, start + limit);

  return NextResponse.json(
    {
      total: filtered.length,
      page,
      limit,
      total_pages: Math.ceil(filtered.length / (limit || 1)) || 1,
      data: paged
    },
    { headers: cacheHeaders }
  );
}
