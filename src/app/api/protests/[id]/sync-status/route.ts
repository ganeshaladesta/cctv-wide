import { NextRequest, NextResponse, after } from "next/server";
import {
  getLatestOutboundJobByProtestId,
  recoverPendingOutboundJobs,
  retryOutboundJob,
  runOutboundSyncWorker
} from "@/lib/unras-outbound-queue";
import { protestStore } from "@/lib/protest-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Params {
  params: Promise<{ id: string }>;
}

const WEBHOOK_MISSED_GRACE_MS = 8000;
const STALE_PROCESSING_LOCK_MS = 5 * 60 * 1000;

/**
 * Safely schedules non-blocking server-side worker recovery after HTTP response is sent.
 * Never exposes CRON_SECRET to the browser and never slows down the API response.
 */
function scheduleBackgroundWorkerRecovery(task: () => Promise<any>) {
  try {
    after(async () => {
      try {
        await task();
      } catch (err: any) {
        console.warn("[SyncStatus Recovery] Background execution notice:", err?.message || err);
      }
    });
  } catch {
    // Fallback if called outside a standard Next.js request scope (e.g., direct function test)
    void Promise.resolve().then(task).catch(() => {});
  }
}

/**
 * GET /api/protests/[id]/sync-status
 * Returns the current outbound synchronization status for a protest record.
 * Also acts as a fallback recovery trigger if a pending job was missed by the Supabase Database Webhook
 * or if a scheduled retry backoff has become due.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const protest = await protestStore.getProtestById(id);

    if (!protest) {
      return NextResponse.json(
        { success: false, error: "Aksi unjuk rasa tidak ditemukan." },
        { status: 404 }
      );
    }

    const job = await getLatestOutboundJobByProtestId(id);

    // Check if this job is stuck in pending (missed webhook / due retry) or has a stale processing lock
    if (job) {
      const nowMs = Date.now();
      const createdMs = job.created_at ? new Date(job.created_at).getTime() : nowMs;
      const nextRetryMs = job.next_retry_at ? new Date(job.next_retry_at).getTime() : 0;
      const lockedMs = job.locked_at ? new Date(job.locked_at).getTime() : 0;

      const isMissedNewPending =
        job.status === "pending" &&
        job.attempts === 0 &&
        nowMs - createdMs >= WEBHOOK_MISSED_GRACE_MS;

      const isDueRetryPending =
        job.status === "pending" &&
        job.attempts > 0 &&
        (!job.next_retry_at || nextRetryMs <= nowMs);

      const isStaleProcessing =
        job.status === "processing" &&
        lockedMs > 0 &&
        nowMs - lockedMs >= STALE_PROCESSING_LOCK_MS;

      if (isMissedNewPending || isDueRetryPending || isStaleProcessing) {
        scheduleBackgroundWorkerRecovery(() =>
          recoverPendingOutboundJobs({
            graceWindowMs: WEBHOOK_MISSED_GRACE_MS,
            maxJobs: 1,
            trigger: "sync_status_poll"
          })
        );
      }
    }

    // Sanitize any potential internal URLs/signatures from last_error
    const safeError = job?.last_error
      ? job.last_error.replace(/https?:\/\/[^\s]+/g, "[URL WEBHOOK]")
      : null;

    return NextResponse.json({
      success: true,
      data: {
        protest_id: protest.id,
        kode_unras: protest.kode_unras,
        status: job ? job.status : (protest.outbound_sync_status || "none"),
        attempts: job ? job.attempts : 0,
        max_attempts: job ? job.max_attempts : 5,
        last_error: safeError,
        created_at: job?.created_at || null,
        started_at: job?.started_at || null,
        processed_at: job?.processed_at || null,
        next_retry_at: job?.next_retry_at || null,
        last_outbound_synced_at: protest.last_outbound_synced_at || null,
        job_id: job?.id || null
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Gagal mengambil status sinkronisasi." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/protests/[id]/sync-status
 * Allows operator to manually trigger retry for a failed outbound job.
 * Because manual retry performs an UPDATE (not INSERT), we also trigger background worker processing
 * via Next.js after() so the retried job is processed immediately without waiting for an INSERT webhook.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const protest = await protestStore.getProtestById(id);

    if (!protest) {
      return NextResponse.json(
        { success: false, error: "Aksi unjuk rasa tidak ditemukan." },
        { status: 404 }
      );
    }

    const job = await getLatestOutboundJobByProtestId(id);
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Tidak ada antrean sinkronisasi untuk rekor ini." },
        { status: 404 }
      );
    }

    await retryOutboundJob(job.id);

    scheduleBackgroundWorkerRecovery(() =>
      runOutboundSyncWorker({
        maxJobs: 1,
        timeBudgetMs: 52000,
        workerId: "worker-manual-retry"
      })
    );

    return NextResponse.json({
      success: true,
      message: "Sinkronisasi outbound dijadwalkan ulang untuk diproses.",
      data: {
        protest_id: protest.id,
        job_id: job.id,
        status: "pending"
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Gagal menjadwalkan ulang sinkronisasi." },
      { status: 500 }
    );
  }
}

