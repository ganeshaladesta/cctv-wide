import { NextRequest, NextResponse, after } from 'next/server';
import { resolveCurrentUser } from '@/lib/auth-roles';
import { protestStore } from '@/lib/protest-store';
import { executeManualSyncTrigger } from '@/lib/unras-manual-trigger';
import { recoverPendingOutboundJobs } from '@/lib/unras-outbound-queue';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

/**
 * GET /api/protests/sync
 * 1. If ?execution_id=... is provided, returns specific execution status for polling
 * 2. Otherwise returns latest sync logs, stats, and configuration status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const executionId = searchParams.get('execution_id');

    if (executionId) {
      const execution = await protestStore.getSyncLogById(executionId);
      return NextResponse.json({
        success: true,
        execution: execution || null
      });
    }

    const user = resolveCurrentUser(request);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 10;
    const logs = await protestStore.getSyncLogs(limit);
    const stats = await protestStore.getStats();

    // Non-blocking background sweep for any orphaned pending outbound jobs or due retries
    try {
      after(async () => {
        try {
          await recoverPendingOutboundJobs({
            graceWindowMs: 8000,
            maxJobs: 1,
            trigger: "scheduled_sync_sweep"
          });
        } catch {}
      });
    } catch {}

    return NextResponse.json({
      success: true,
      user: { role: user.role, id: user.id },
      isPowerAutomateConfigured: Boolean(process.env.POWER_AUTOMATE_TRIGGER_URL),
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
 * Secure Manual Trigger for Power Automate Synchronization Flow
 * Reuses executeManualSyncTrigger to preserve unified contract & behavior
 */
export async function POST(request: NextRequest) {
  return executeManualSyncTrigger(request);
}

