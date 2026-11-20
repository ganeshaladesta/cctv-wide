import { NextRequest, NextResponse } from "next/server";
import { biOfficeStore } from "@/lib/bi-office-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/bi-offices/audit
 * Returns coordinate validation report for Bank Indonesia offices.
 */
export async function GET(request: NextRequest) {
  try {
    const report = await biOfficeStore.getAuditReport();
    return NextResponse.json({
      success: true,
      data: report
    });
  } catch (error: any) {
    console.error("[BIOfficeAuditAPI] Error generating audit report:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Gagal membuat audit validasi koordinat kantor BI"
      },
      { status: 500 }
    );
  }
}

