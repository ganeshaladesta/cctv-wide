import { NextRequest, NextResponse } from 'next/server';
import { protestStore } from '@/lib/protest-store';
import { resolveCurrentUser, canLinkCCTV } from '@/lib/auth-roles';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/protests/[id]/cameras
 * Get linked cameras and spatial nearby recommendations
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const protest = protestStore.getProtestById(id);
    if (!protest) {
      return NextResponse.json(
        { success: false, error: 'Aksi unjuk rasa tidak ditemukan' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const radiusMeters = parseInt(searchParams.get('radius') || '1500', 10);
    const limit = parseInt(searchParams.get('limit') || '15', 10);

    const linked = protestStore.getCameraLinks(protest.id);

    let nearby: any[] = [];
    if (protest.validated_lat !== null && protest.validated_lng !== null) {
      nearby = protestStore.getNearbyCamerasForCoordinates(
        protest.validated_lat,
        protest.validated_lng,
        radiusMeters,
        limit
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        linked_cameras: linked,
        nearby_recommendations: nearby
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
 * POST /api/protests/[id]/cameras
 * Link a CCTV camera to the protest
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = resolveCurrentUser(request);
    if (!canLinkCCTV(user)) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: Hanya Admin atau Operator yang dapat menautkan kamera CCTV.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const protest = protestStore.getProtestById(id);
    if (!protest) {
      return NextResponse.json(
        { success: false, error: 'Aksi unjuk rasa tidak ditemukan' },
        { status: 404 }
      );
    }

    const body = await request.json();
    if (!body.camera_id) {
      return NextResponse.json(
        { success: false, error: 'Parameter camera_id wajib diisi.' },
        { status: 400 }
      );
    }

    const link = protestStore.linkCamera(
      {
        protest_id: protest.id,
        camera_id: body.camera_id,
        notes: body.notes || null
      },
      user
    );

    if (!link) {
      return NextResponse.json(
        { success: false, error: 'Gagal menautkan kamera. Kamera tidak ditemukan dalam katalog.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Kamera CCTV berhasil ditautkan ke pantauan unjuk rasa.',
        data: link
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal menautkan kamera CCTV' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/protests/[id]/cameras
 * Unlink a CCTV camera from the protest
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = resolveCurrentUser(request);
    if (!canLinkCCTV(user)) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: Hanya Admin atau Operator yang dapat menghapus tautan kamera CCTV.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const protest = protestStore.getProtestById(id);
    if (!protest) {
      return NextResponse.json(
        { success: false, error: 'Aksi unjuk rasa tidak ditemukan' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const cameraId = searchParams.get('camera_id');

    if (!cameraId) {
      return NextResponse.json(
        { success: false, error: 'Query parameter camera_id wajib disertakan.' },
        { status: 400 }
      );
    }

    const removed = protestStore.unlinkCamera(protest.id, cameraId);

    return NextResponse.json({
      success: true,
      message: 'Tautan kamera CCTV berhasil dicabut.',
      removed
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal menghapus tautan kamera' },
      { status: 500 }
    );
  }
}
