import { NextRequest, NextResponse } from "next/server";
import { masterDataService } from "@/lib/master-data-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provinsi = searchParams.get("provinsi") || searchParams.get("provinsi_id") || undefined;
    const regional = searchParams.get("regional") || searchParams.get("regional_id") || undefined;

    const data = await masterDataService.getLokasiList(provinsi, regional);
    return NextResponse.json({
      success: true,
      data
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Gagal memuat master Lokasi" },
      { status: 500 }
    );
  }
}
