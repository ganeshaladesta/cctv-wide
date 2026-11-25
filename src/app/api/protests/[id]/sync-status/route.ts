import { NextRequest, NextResponse } from "next/server";
import {
  getLatestOutboundJobByProtestId,
  retryOutboundJob
} from "@/lib/unras-outbound-queue";
import { protestStore } from "@/lib/protest-store";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/protests/[id]/sync-status
 * Returns the current outbound synchronization status for a protest record.
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

