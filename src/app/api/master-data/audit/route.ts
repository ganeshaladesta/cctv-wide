import { NextRequest, NextResponse } from "next/server";
import { masterDataService } from "@/lib/master-data-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 100;

    const data = await masterDataService.getAuditReviews(limit);
    return NextResponse.json({
      success: true,
      total: data.length,
      data
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Gagal memuat audit master data" },
      { status: 500 }
    );
  }
}

