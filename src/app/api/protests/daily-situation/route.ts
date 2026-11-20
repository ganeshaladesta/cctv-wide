import { NextRequest, NextResponse } from "next/server";
import { protestStore } from "@/lib/protest-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/protests/daily-situation?date=YYYY-MM-DD
 * Returns daily situation overview aggregated across all protest points for the specified monitoring date.
 * Default date is today in Asia/Jakarta (WIB).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let dateStr = searchParams.get("date");

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      // Default to current date in Asia/Jakarta (WIB)
      try {
        dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
      } catch {
        dateStr = new Date().toISOString().slice(0, 10);
      }
    }

    const overview = await protestStore.getDailySituationOverview(dateStr);

    return NextResponse.json({
      success: true,
      data: overview
    });
  } catch (error: any) {
    console.error("[DailySituationAPI] Error fetching daily situation overview:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Gagal memuat ringkasan situasi unras harian"
      },
      { status: 500 }
    );
  }
}

