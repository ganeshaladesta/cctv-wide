import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { PROVIDER_REGISTRY } from "@/lib/providers";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const province = sp.get("province_id") || sp.get("province") || undefined;
  const city = sp.get("city_id") || sp.get("city") || undefined;
  const protocol = sp.get("protocol") || undefined;
  const q = sp.get("q") || undefined;

  const store = getDataStore();
  const sources = store.getSources({ province, city, protocol, q });

  return NextResponse.json(
    {
      total: sources.length,
      adapters: PROVIDER_REGISTRY.map((p) => ({
        id: p.id,
        name: p.name,
        institution: p.institution,
        officialUrl: p.officialUrl,
        lastUpdated: p.getLastUpdated()
      })),
      data: sources
    },
    {
      headers: {
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600"
      }
    }
  );
}
