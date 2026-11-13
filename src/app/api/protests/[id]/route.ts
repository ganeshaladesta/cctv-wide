import { NextRequest, NextResponse } from 'next/server';
import { protestStore } from '@/lib/protest-store';
import { resolveCurrentUser, canEditProtest, canDeleteProtest } from '@/lib/auth-roles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/protests/[id]
 * Fetch single protest event with reports, status history, linked cameras, and nearby recommendations
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const protest = await protestStore.getProtestById(id);

    if (!protest) {
      return NextResponse.json(
        { success: false, error: 'Aksi unjuk rasa tidak ditemukan' },
        { status: 404 }
      );
    }

    const reports = await protestStore.getOperatorReports(protest.id);
    const history = await protestStore.getStatusHistory(protest.id);
    const cameraLinks = await protestStore.getCameraLinks(protest.id);

    // If protest has validated coordinates, fetch nearby recommendations (radius 1500m)
    let nearbyCameras: any[] = [];
    if (protest.validated_lat !== null && protest.validated_lng !== null) {
      nearbyCameras = protestStore.getNearbyCamerasForCoordinates(
        protest.validated_lat,
        protest.validated_lng,
        1500,
        10
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...protest,
        reports,
        status_history: history,
        camera_links: cameraLinks,
        nearby_recommendations: nearbyCameras
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/protests/[id]
 * Update operator-managed fields of a protest event
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = resolveCurrentUser(request);
    if (!canEditProtest(user)) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: Hanya Admin atau Operator yang dapat memperbarui data.' },
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

    const updated = await protestStore.updateProtest(existing.id, {
      situation_summary: body.situation_summary,
      actual_crowd_size: body.actual_crowd_size !== undefined ? (body.actual_crowd_size === null ? null : Number(body.actual_crowd_size)) : undefined,
      validated_lat: body.validated_lat !== undefined ? (body.validated_lat === null ? null : Number(body.validated_lat)) : undefined,
      validated_lng: body.validated_lng !== undefined ? (body.validated_lng === null ? null : Number(body.validated_lng)) : undefined,
      urgency: body.urgency,
      category_id: body.category_id,
      editorial_draft: body.editorial_draft,
      editorial_final: body.editorial_final,
      is_archived: body.is_archived !== undefined ? Boolean(body.is_archived) : undefined
    }, user);

    return NextResponse.json({
      success: true,
      message: 'Data unjuk rasa berhasil diperbarui.',
      data: updated
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal memperbarui unjuk rasa' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/protests/[id]
 * Soft delete protest event (Admin only)
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = resolveCurrentUser(request);
    if (!canDeleteProtest(user)) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: Hanya Admin yang dapat menghapus unjuk rasa.' },
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

    const deleted = protestStore.softDeleteProtest(existing.id, user);

    return NextResponse.json({
      success: true,
      message: 'Aksi unjuk rasa berhasil diarsipkan/dihapus secara lunak.',
      deleted
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal menghapus unjuk rasa' },
      { status: 500 }
    );
  }
}
