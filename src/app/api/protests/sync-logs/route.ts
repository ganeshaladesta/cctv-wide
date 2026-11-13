import { NextRequest, NextResponse } from 'next/server';
import { protestStore } from '@/lib/protest-store';
import { resolveCurrentUser, canViewSyncLogs } from '@/lib/auth-roles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/protests/sync-logs
 * Audit history of Microsoft Graph / Excel synchronizations
 */
export async function GET(request: NextRequest) {
  try {
    const user = resolveCurrentUser(request);
    if (!canViewSyncLogs(user)) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 25;

    const logs = await protestStore.getSyncLogs(limit);
    return NextResponse.json({
      success: true,
      data: logs
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal memuat log sinkronisasi' },
      { status: 500 }
    );
  }
}

