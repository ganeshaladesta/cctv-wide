import { NextRequest, NextResponse } from "next/server";
import { geocodingService } from "@/lib/geocoding/geocoding-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/geocoding/search
 * Query parameters:
 *  - q: search query string (required, min 2 chars)
 *  - city: optional city / regency name
 *  - province: optional province name
 *  - limit: max results (default: 5, max: 10)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";
    const city = searchParams.get("city") || undefined;
    const province = searchParams.get("province") || undefined;
    const limit = Math.min(10, Math.max(1, parseInt(searchParams.get("limit") || "5", 10)));

    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        success: true,
        data: []
      });
    }

    const results = await geocodingService.search({
      query: query.trim(),
      city,
      province,
      limit
    });

    return NextResponse.json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (err: any) {
    console.error("[Geocoding Search API Error]", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Gagal melakukan pencarian geocoding."
      },
      { status: 500 }
    );
  }
}

