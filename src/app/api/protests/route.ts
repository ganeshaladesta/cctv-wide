import { NextRequest, NextResponse } from 'next/server';
import { protestStore } from '@/lib/protest-store';
import { resolveCurrentUser, canCreateProtest } from '@/lib/auth-roles';
import { ProtestFilterParams, ProtestStatus, ProtestUrgency } from '@/lib/types/protests';

/**
 * GET /api/protests
 * Query protest events with rich filtering, search, pagination, and sorting
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const filters: ProtestFilterParams = {
      q: searchParams.get('q') || undefined,
      status: (searchParams.get('status') as ProtestFilterParams['status']) || undefined,
      urgency: (searchParams.get('urgency') as ProtestUrgency) || undefined,
      category: searchParams.get('category') || undefined,
      province: searchParams.get('province') || undefined,
      city: searchParams.get('city') || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      has_coords: searchParams.get('has_coords') !== null ? searchParams.get('has_coords') === 'true' : undefined,
      is_archived: searchParams.get('is_archived') !== null ? searchParams.get('is_archived') === 'true' : undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 20,
      sort_by: (searchParams.get('sort_by') as any) || 'tanggal',
      sort_order: (searchParams.get('sort_order') as any) || 'desc'
    };

    const result = protestStore.queryProtests(filters);

    return NextResponse.json({
      success: true,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: Math.ceil(result.total / result.limit),
      data: result.data
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal memuat data unjuk rasa' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/protests
 * Manually register a new protest event (Admin & Operator only)
 */
export async function POST(request: NextRequest) {
  try {
    const user = resolveCurrentUser(request);
    if (!canCreateProtest(user)) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: Hanya Admin atau Operator yang dapat mendaftarkan aksi unjuk rasa baru.' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validation of mandatory fields
    if (!body.tanggal || !body.lokasi || !body.isu_tuntutan) {
      return NextResponse.json(
        {
          success: false,
          error: 'Field mandatory tidak lengkap. Harap isi tanggal, lokasi, dan isu_tuntutan.'
        },
        { status: 400 }
      );
    }

    const created = protestStore.createProtest({
      id_kejadian: body.id_kejadian,
      kode_unras: body.kode_unras,
      tanggal: body.tanggal,
      waktu_mulai: body.waktu_mulai || '09:00 WIB',
      waktu_selesai: body.waktu_selesai || null,
      lokasi: body.lokasi,
      titik_kumpul: body.titik_kumpul || null,
      sasaran_aksi: body.sasaran_aksi || null,
      isu_tuntutan: body.isu_tuntutan,
      estimasi_massa_source: body.estimasi_massa_source ? Number(body.estimasi_massa_source) : null,
      organisasi_kelompok: body.organisasi_kelompok || null,
      korlap_pimpinan: body.korlap_pimpinan || null,
      wilayah_hukum: body.wilayah_hukum || null,
      provinsi: body.provinsi || 'DKI Jakarta',
      kota_kabupaten: body.kota_kabupaten || null,
      keterangan_source: body.keterangan_source || null,
      status: (body.status as ProtestStatus) || 'scheduled',
      urgency: (body.urgency as ProtestUrgency) || 'medium',
      category_id: body.category_id || null,
      validated_lat: body.validated_lat !== undefined && body.validated_lat !== null ? Number(body.validated_lat) : null,
      validated_lng: body.validated_lng !== undefined && body.validated_lng !== null ? Number(body.validated_lng) : null,
      situation_summary: body.situation_summary || null
    }, user);

    return NextResponse.json(
      {
        success: true,
        message: 'Aksi unjuk rasa berhasil didaftarkan.',
        data: created
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal membuat unjuk rasa' },
      { status: 500 }
    );
  }
}
