import { NextRequest, NextResponse } from "next/server";
import { geocodingService } from "@/lib/geocoding/geocoding-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/geocoding/reverse
 * Query parameters:
 *  - lat: latitude (-90 to 90)
 *  - lng: longitude (-180 to 180)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latStr = searchParams.get("lat");
    const lngStr = searchParams.get("lng");

    if (!latStr || !lngStr) {
      return NextResponse.json(
        { success: false, error: "Parameter 'lat' dan 'lng' wajib disertakan." },
        { status: 400 }
      );
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { success: false, error: "Nilai koordinat lat/lng tidak valid." },
        { status: 400 }
      );
    }

    const address = await geocodingService.reverse(lat, lng);

    return NextResponse.json({
      success: true,
      data: {
        lat,
        lng,
        address: address || "Lokasi terpilih di peta"
      }
    });
  } catch (err: any) {
    console.error("[Geocoding Reverse API Error]", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Gagal melakukan reverse geocoding."
      },
      { status: 500 }
    );
  }
}

