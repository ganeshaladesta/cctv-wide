import { NextRequest, NextResponse } from 'next/server';
import { resolveCurrentUser, canTriggerManualSync } from '@/lib/auth-roles';
import { msGraphSyncService } from '@/lib/ms-graph-sync';
import { protestStore } from '@/lib/protest-store';
import {
  calculateRolling7DayWindow,
  processRolling7DaySync
} from '@/lib/unras-rolling-sync';
import { RollingSyncPayload } from '@/lib/types/protests';

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

    // If it's a cron invocation, execute rolling 7-day scheduled sync
    if (isCron || isSecretValid) {
      const window = calculateRolling7DayWindow();
      let rows = msGraphSyncService.isConfigured()
        ? await msGraphSyncService.fetchWorkbookRows().catch(() => msGraphSyncService.loadLocalFixture())
        : msGraphSyncService.loadLocalFixture();

      const payload: RollingSyncPayload = {
        sync_type: 'rolling_7d',
        timezone: 'Asia/Jakarta',
        period_start: window.period_start,
        period_end: window.period_end,
        events: rows
      };

      const result = await processRolling7DaySync(
        payload,
        'scheduler_cron',
        'System Daily Cron (05:00 WIB)'
      );
      return NextResponse.json(result, { status: result.status === 'failed' ? 500 : 200 });
    }

    // Otherwise, query sync logs & stats
    const user = resolveCurrentUser(request);
    const logs = await protestStore.getSyncLogs(10);
    const stats = await protestStore.getStats();
    return NextResponse.json({
      success: true,
      user: { role: user.role, id: user.id },
      isGraphConfigured: msGraphSyncService.isConfigured(),
      latestSyncLogs: logs,
      stats
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
 * Triggers manual synchronization using execution-time rolling 7-day window
 * Strictly restricted to Admin users
 */
export async function POST(request: NextRequest) {
  try {
    const isCron = request.headers.get('x-vercel-cron') !== null;
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isSecretValid = cronSecret && authHeader === `Bearer ${cronSecret}`;

    const user = resolveCurrentUser(request);

    // Manual sync is strictly restricted to Admin users
    if (!isCron && !isSecretValid && !canTriggerManualSync(user)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Akses ditolak: Hanya Administrator yang berhak menjalankan sinkronisasi data unjuk rasa.'
        },
        { status: 403 }
      );
    }

    // Calculate execution-time rolling 7-day window
    const window = calculateRolling7DayWindow();

    let forceFixture = false;
    try {
      const body = await request.json();
      if (body?.forceFixture === true) forceFixture = true;
    } catch {}

    const { searchParams } = new URL(request.url);
    if (searchParams.get('fixture') === 'true') {
      forceFixture = true;
    }

    let rows = msGraphSyncService.isConfigured() && !forceFixture
      ? await msGraphSyncService.fetchWorkbookRows().catch(() => msGraphSyncService.loadLocalFixture())
      : msGraphSyncService.loadLocalFixture();

    const payload: RollingSyncPayload = {
      sync_type: 'rolling_7d',
      timezone: 'Asia/Jakarta',
      period_start: window.period_start,
      period_end: window.period_end,
      events: rows
    };

    const result = await processRolling7DaySync(
      payload,
      isCron || isSecretValid ? 'scheduler_cron' : 'manual_admin',
      isCron || isSecretValid ? 'system-cron' : `${user.role}:${user.name || user.id}`
    );

    const statusCode = result.status === 'skipped' ? 409 : (result.status === 'failed' ? 500 : 200);
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


