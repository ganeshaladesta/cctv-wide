import { NextRequest, NextResponse } from 'next/server';
import { protestStore } from '@/lib/protest-store';

/**
 * GET /api/protests/stats
 * Dashboard KPI Summary Counters
 */
export async function GET(_request: NextRequest) {
  try {
    const stats = protestStore.getStats();
    return NextResponse.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal memuat statistik unjuk rasa' },
      { status: 500 }
    );
  }
}
