import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { resolveCurrentUser, canTriggerManualSync } from '@/lib/auth-roles';
import { protestStore } from '@/lib/protest-store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Rate limiting cooldown tracker (in-memory)
let lastManualTriggerAttemptAt = 0;

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
 * Strictly restricted to Admin users
 */
export async function POST(request: NextRequest) {
  try {
    const user = resolveCurrentUser(request);

    // 1. Enforce RBAC: Strictly restricted to Admin role
    if (!canTriggerManualSync(user)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Akses ditolak: Hanya Administrator Komando yang berhak menjalankan sinkronisasi data unjuk rasa.'
        },
        { status: 403 }
      );
    }

    const now = Date.now();

    // 2. Rate Limiting Protection (5 seconds cooldown between clicks)
    if (now - lastManualTriggerAttemptAt < 5000) {
      const waitSeconds = Math.ceil((5000 - (now - lastManualTriggerAttemptAt)) / 1000);
      return NextResponse.json(
        {
          success: false,
          status: 'rate_limited',
          error: `Permintaan sinkronisasi terlalu sering. Harap tunggu ${waitSeconds} detik sebelum mencoba lagi.`
        },
        { status: 429 }
      );
    }

    // 3. Concurrency Protection (Prevent overlapping sync executions)
    const recentLogs = await protestStore.getSyncLogs(5);
    const activeSync = recentLogs.find(
      (l) => l.status === 'running' && (now - new Date(l.started_at).getTime() < 180000)
    );
    if (activeSync) {
      return NextResponse.json(
        {
          success: false,
          status: 'skipped',
          execution_id: activeSync.id,
          error: 'Proses sinkronisasi lain sedang berjalan. Mohon tunggu hingga eksekusi saat ini selesai.'
        },
        { status: 409 }
      );
    }

    lastManualTriggerAttemptAt = now;

    const executionId = `sync-manual-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const triggeredByUser = user.name || user.email || 'Administrator';
    const triggerUrl = process.env.POWER_AUTOMATE_TRIGGER_URL;
    const triggerSecret = process.env.POWER_AUTOMATE_TRIGGER_SECRET;

    // 4. Handle Missing Configuration
    if (!triggerUrl) {
      // Check if mock mode is explicitly enabled for tests/preview
      if (process.env.ALLOW_MOCK_SYNC_TRIGGER === 'true') {
        await protestStore.createSyncLog({
          id: executionId,
          started_at: new Date().toISOString(),
          completed_at: null,
          status: 'running',
          triggered_by: 'manual_admin',
          triggered_by_user: triggeredByUser,
          source_worksheet: 'NEW UNRAS 2022-2026',
          records_received: 0,
          records_processed: 0,
          records_created: 0,
          records_updated: 0,
          records_skipped: 0,
          records_failed: 0,
          error_details: null,
          duration_ms: null
        });

        return NextResponse.json(
          {
            success: true,
            status: 'running',
            execution_id: executionId,
            mode: 'mock',
            message: 'Sinkronisasi manual mock dimulai. Menunggu proses backend...'
          },
          { status: 202 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "Variabel lingkungan 'POWER_AUTOMATE_TRIGGER_URL' belum dikonfigurasi di server.",
          code: 'MISSING_TRIGGER_URL',
          action_required: "Tambahkan trigger 'When an HTTP request is received' pada flow UNRAS_EXCEL_TO_SCC_DAILY dan daftarkan URL trigger ke Vercel Environment Variables: POWER_AUTOMATE_TRIGGER_URL."
        },
        { status: 503 }
      );
    }

    // 5. Create initial audit log record in 'running' state
    await protestStore.createSyncLog({
      id: executionId,
      started_at: new Date().toISOString(),
      completed_at: null,
      status: 'running',
      triggered_by: 'manual_admin',
      triggered_by_user: triggeredByUser,
      source_worksheet: 'NEW UNRAS 2022-2026',
      records_received: 0,
      records_processed: 0,
      records_created: 0,
      records_updated: 0,
      records_skipped: 0,
      records_failed: 0,
      error_details: null,
      duration_ms: null
    });

    // Handle mock trigger protocol for testing/preview
    if (triggerUrl.startsWith('mock://')) {
      return NextResponse.json(
        {
          success: true,
          status: 'running',
          execution_id: executionId,
          mode: 'mock',
          message: 'Permintaan sinkronisasi manual berhasil dikirim ke Power Automate (Mock). Menunggu eksekusi flow...',
          triggered_at: new Date().toISOString()
        },
        { status: 202 }
      );
    }

    // 6. Securely dispatch trigger request to Power Automate
    const triggerHeaders: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (triggerSecret) {
      triggerHeaders['Authorization'] = `Bearer ${triggerSecret}`;
      triggerHeaders['x-api-key'] = triggerSecret;
    }

    const triggerPayload = {
      execution_id: executionId,
      triggered_by: 'manual_admin',
      triggered_by_user: triggeredByUser,
      triggered_at: new Date().toISOString()
    };

    try {
      const triggerRes = await fetch(triggerUrl, {
        method: 'POST',
        headers: triggerHeaders,
        body: JSON.stringify(triggerPayload)
      });

      if (!triggerRes.ok && triggerRes.status !== 202 && triggerRes.status !== 200) {
        const errDetail = await triggerRes.text().catch(() => '');
        await protestStore.updateSyncLog(executionId, {
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_details: `Power Automate menolak permintaan trigger (HTTP ${triggerRes.status}): ${errDetail.slice(0, 200)}`
        });
        return NextResponse.json(
          {
            success: false,
            error: `Gagal memicu alur Power Automate (HTTP ${triggerRes.status}). Pastikan trigger aktif dan URL valid.`
          },
          { status: 502 }
        );
      }

      return NextResponse.json(
        {
          success: true,
          status: 'running',
          execution_id: executionId,
          message: 'Permintaan sinkronisasi manual berhasil dikirim ke Power Automate. Menunggu eksekusi flow...',
          triggered_at: new Date().toISOString()
        },
        { status: 202 }
      );
    } catch (fetchErr: any) {
      await protestStore.updateSyncLog(executionId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_details: `Gagal menghubungi endpoint Power Automate: ${fetchErr.message}`
      });
      return NextResponse.json(
        {
          success: false,
          error: `Gagal menghubungi endpoint Power Automate: ${fetchErr.message}`
        },
        { status: 502 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Gagal memicu sinkronisasi manual'
      },
      { status: 500 }
    );
  }
}
