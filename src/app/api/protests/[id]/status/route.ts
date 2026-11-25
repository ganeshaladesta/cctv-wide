import { NextRequest, NextResponse } from 'next/server';
import { protestStore } from '@/lib/protest-store';
import { resolveCurrentUser, canUpdateStatus } from '@/lib/auth-roles';
import { ProtestStatus } from '@/lib/types/protests';
import { enqueueOutboundSync } from '@/lib/unras-outbound-queue';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/protests/[id]/status
 * Advance event lifecycle status with audit reason
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = resolveCurrentUser(request);
    if (!canUpdateStatus(user)) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: Hanya Admin atau Operator yang dapat mengubah status unjuk rasa.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const existing = await protestStore.getProtestById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Aksi unjuk rasa tidak ditemukan' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const toStatus = body.to_status as ProtestStatus;
    const reason = body.reason || 'Perubahan status operasional di Command Center';

    const validStatuses: ProtestStatus[] = ['scheduled', 'ongoing', 'monitoring', 'completed', 'cancelled'];
    if (!toStatus || !validStatuses.includes(toStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `Status '${toStatus}' tidak valid. Pilihan: ${validStatuses.join(', ')}`
        },
        { status: 400 }
      );
    }

    const updated = await protestStore.updateProtestStatus(
      existing.id,
      toStatus,
      reason,
      user
    );

    let outboundJob = null;
    if (updated) {
      try {
        const queueRes = await enqueueOutboundSync(updated, { origin: "scc", route: "POST /api/protests/[id]/status" });
        outboundJob = queueRes.job || null;
      } catch (err: any) {
        console.warn("[Outbound Queue Warning]:", err?.message || err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Status berhasil diubah menjadi '${toStatus}'.`,
      data: updated,
      outbound_sync: outboundJob ? {
        status: outboundJob.status,
        job_id: outboundJob.id,
        attempts: outboundJob.attempts,
        queued: true
      } : null
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal mengubah status unjuk rasa' },
      { status: 500 }
    );
  }
}
