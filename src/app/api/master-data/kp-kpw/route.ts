import { NextRequest, NextResponse } from "next/server";
import { masterDataService } from "@/lib/master-data-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await masterDataService.getKpKpwList();
    return NextResponse.json({
      success: true,
      data
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Gagal memuat master KP/KPw" },
      { status: 500 }
    );
  }
}

