import { NextRequest, NextResponse } from "next/server";
import { biOfficeStore } from "@/lib/bi-office-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/bi-offices
 * Returns all normalized Bank Indonesia offices with optional filters and spatial proximity sorting.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const regional = searchParams.get("regional") || undefined;
    const officeType = searchParams.get("office_type") || undefined;
    const validationStatus = searchParams.get("validation_status") || undefined;
    const nearLat = searchParams.get("near_lat") ? parseFloat(searchParams.get("near_lat")!) : null;
    const nearLng = searchParams.get("near_lng") ? parseFloat(searchParams.get("near_lng")!) : null;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 100;

    if (nearLat !== null && nearLng !== null && !isNaN(nearLat) && !isNaN(nearLng)) {
      const nearby = await biOfficeStore.getNearbyOfficesForCoordinates(nearLat, nearLng, limit);
      return NextResponse.json({
        success: true,
        data: nearby
      });
    }

    const offices = await biOfficeStore.getAllOffices({
      regional,
      office_type: officeType,
      validation_status: validationStatus
    });

    return NextResponse.json({
      success: true,
      total: offices.length,
      data: offices
    });
  } catch (error: any) {
    console.error("[BIOfficesAPI] Error retrieving offices:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Gagal memuat master data kantor Bank Indonesia"
      },
      { status: 500 }
    );
  }
}

