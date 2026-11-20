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

    if (body.estimasi_massa_source !== undefined && body.estimasi_massa_source !== null && body.estimasi_massa_source !== '') {
      const massa = Number(body.estimasi_massa_source);
      if (isNaN(massa) || massa < 0) {
        return NextResponse.json(
          { success: false, error: 'Jumlah massa harus berupa angka bernilai 0 atau lebih.' },
          { status: 400 }
        );
      }
    }

    const updated = await protestStore.updateProtest(existing.id, {
      tanggal: body.tanggal,
      waktu_mulai: body.waktu_mulai,
      waktu_selesai: body.waktu_selesai,
      lokasi: body.lokasi,
      titik_kumpul: body.titik_kumpul,
      sasaran_aksi: body.sasaran_aksi,
      isu_tuntutan: body.isu_tuntutan,
      organisasi_kelompok: body.organisasi_kelompok,
      korlap_pimpinan: body.korlap_pimpinan,
      wilayah_hukum: body.wilayah_hukum,
      provinsi: body.provinsi,
      kota_kabupaten: body.kota_kabupaten,
      status: body.status,
      situation_summary: body.situation_summary,
      estimasi_massa_source: body.estimasi_massa_source !== undefined ? (body.estimasi_massa_source === null || body.estimasi_massa_source === '' ? null : Number(body.estimasi_massa_source)) : undefined,
      actual_crowd_size: body.actual_crowd_size !== undefined ? (body.actual_crowd_size === null ? null : Number(body.actual_crowd_size)) : undefined,
      validated_lat: body.validated_lat !== undefined ? (body.validated_lat === null ? null : Number(body.validated_lat)) : undefined,
      validated_lng: body.validated_lng !== undefined ? (body.validated_lng === null ? null : Number(body.validated_lng)) : undefined,
      location_validation_status: body.location_validation_status,
      suggested_lat: body.suggested_lat,
      suggested_lng: body.suggested_lng,
      suggested_address: body.suggested_address,
      validated_by_id: body.validated_lat !== undefined && body.validated_lat !== null ? user.id : body.validated_by_id,
      validated_by_name: body.validated_lat !== undefined && body.validated_lat !== null ? user.name : body.validated_by_name,
      urgency: body.urgency,
      category_id: body.category_id,
      editorial_draft: body.editorial_draft || body.redaksi,
      editorial_final: body.editorial_final,
      is_archived: body.is_archived !== undefined ? Boolean(body.is_archived) : undefined,

      // Excel C:AC Source Attributes
      urutan_bulan: body.urutan_bulan !== undefined ? (body.urutan_bulan === null ? null : Number(body.urutan_bulan)) : undefined,
      kategori_kejadian: body.kategori_kejadian,
      kp_kpw: body.kp_kpw,
      regional: body.regional,
      kategori_isu: body.kategori_isu,
      dampak: body.dampak,
      keterangan_dampak: body.keterangan_dampak,
      nama_pelapor: body.nama_pelapor,
      info_awal: body.info_awal,
      tindak_lanjut: body.tindak_lanjut,
      progres_asistensi: body.progres_asistensi,
      realisasi: body.realisasi
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
