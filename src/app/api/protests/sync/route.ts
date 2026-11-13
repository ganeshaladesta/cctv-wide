import { NextRequest, NextResponse } from 'next/server';
import { resolveCurrentUser, canTriggerSync } from '@/lib/auth-roles';
import { msGraphSyncService } from '@/lib/ms-graph-sync';
import { protestStore } from '@/lib/protest-store';

/**
 * GET /api/protests/sync
 * Allows Vercel Cron or authenticated polling to check status or trigger scheduled sync
 */
export async function GET(request: NextRequest) {
  try {
    const isCron = request.headers.get('x-vercel-cron') !== null;
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isSecretValid = cronSecret && authHeader === `Bearer ${cronSecret}`;

    // If it's a cron invocation, execute scheduled sync
    if (isCron || isSecretValid) {
      const result = await msGraphSyncService.executeSync({
        syncType: 'scheduled',
        triggeredBy: 'system-cron'
      });
      return NextResponse.json(result, { status: result.success ? 200 : 500 });
    }

    // Otherwise, regular users can query sync logs
    const user = resolveCurrentUser(request);
    const logs = await protestStore.getSyncLogs(10);
    return NextResponse.json({
      success: true,
      user: { role: user.role, id: user.id },
      isGraphConfigured: msGraphSyncService.isConfigured(),
      latestSyncLogs: logs
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/protests/sync
 * Triggers manual synchronization with Microsoft Graph / OneDrive
 * Requires Admin or Operator role
 */
export async function POST(request: NextRequest) {
  try {
    const isCron = request.headers.get('x-vercel-cron') !== null;
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isSecretValid = cronSecret && authHeader === `Bearer ${cronSecret}`;

    const user = resolveCurrentUser(request);

    // If not a valid cron trigger, verify user permissions (Admin or Operator)
    if (!isCron && !isSecretValid && !canTriggerSync(user)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Akses ditolak: Hanya Admin atau Operator yang berhak menjalankan sinkronisasi data unjuk rasa.'
        },
        { status: 403 }
      );
    }

    // Optional options from request body
    let forceFixture = false;
    try {
      const body = await request.json();
      if (body?.forceFixture === true) forceFixture = true;
    } catch {
      // Empty body is acceptable
    }

    // Check query params
    const { searchParams } = new URL(request.url);
    if (searchParams.get('fixture') === 'true') {
      forceFixture = true;
    }

    const result = await msGraphSyncService.executeSync({
      syncType: isCron || isSecretValid ? 'scheduled' : 'manual',
      triggeredBy: isCron || isSecretValid ? 'system-cron' : `${user.role}:${user.name || user.id}`,
      forceFixture
    });

    const statusCode = result.status === 'skipped' ? 409 : (result.success ? 200 : 500);

    return NextResponse.json(result, { status: statusCode });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Gagal menjalankan sinkronisasi'
      },
      { status: 500 }
    );
  }
}
