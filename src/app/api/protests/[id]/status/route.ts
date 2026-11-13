import { NextRequest, NextResponse } from 'next/server';
import { protestStore } from '@/lib/protest-store';
import { resolveCurrentUser, canUpdateStatus } from '@/lib/auth-roles';
import { ProtestStatus } from '@/lib/types/protests';

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

    return NextResponse.json({
      success: true,
      message: `Status berhasil diubah menjadi '${toStatus}'.`,
      data: updated
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal mengubah status unjuk rasa' },
      { status: 500 }
    );
  }
}
