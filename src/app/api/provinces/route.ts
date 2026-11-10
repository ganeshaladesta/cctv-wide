import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

export async function GET(req: NextRequest) {
  const island = req.nextUrl.searchParams.get("island") || undefined;
  const store = getDataStore();
  const provinces = store.getProvinces(island);
  return NextResponse.json(
    {
      total: provinces.length,
      data: provinces
    },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600"
      }
    }
  );
}
