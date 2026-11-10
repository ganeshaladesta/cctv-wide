import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const province = sp.get("province_id") || sp.get("province") || undefined;
  const q = sp.get("q") || undefined;
  const store = getDataStore();
  const cities = store.getCities(province, q);
  return NextResponse.json(
    {
      total: cities.length,
      data: cities
    },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600"
      }
    }
  );
}
