import { NextRequest, NextResponse } from 'next/server';
import { protestStore } from '@/lib/protest-store';
import { resolveCurrentUser, canCreateProtest } from '@/lib/auth-roles';
import { ProtestFilterParams, ProtestStatus, ProtestUrgency } from '@/lib/types/protests';
import { masterDataService } from '@/lib/master-data-service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
      location_validation_status: (searchParams.get('location_validation_status') as any) || undefined,
      geocoding_confidence: (searchParams.get('geocoding_confidence') as any) || undefined,
      is_archived: searchParams.get('is_archived') !== null ? searchParams.get('is_archived') === 'true' : undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 20,
      sort_by: (searchParams.get('sort_by') as any) || 'tanggal',
      sort_order: (searchParams.get('sort_order') as any) || 'desc'
    };

    const result = await protestStore.queryProtests(filters);

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

    // Validation of numeric crowd size >= 0
    let massaNum: number | null = null;
    if (body.estimasi_massa_source !== undefined && body.estimasi_massa_source !== null && body.estimasi_massa_source !== '') {
      massaNum = Number(body.estimasi_massa_source);
      if (isNaN(massaNum) || massaNum < 0) {
        return NextResponse.json(
          { success: false, error: 'Jumlah massa harus berupa angka bernilai 0 atau lebih.' },
          { status: 400 }
        );
      }
    }

    // Validation of Master Data Cascading Hierarchy
    if (body.kp_kpw && body.regional && body.provinsi) {
      const hierarchyCheck = await masterDataService.validateHierarchy(
        body.kp_kpw,
        body.regional,
        body.provinsi,
        body.kota_kabupaten
      );
      if (!hierarchyCheck.valid) {
        return NextResponse.json(
          { success: false, error: hierarchyCheck.reason || 'Kombinasi hierarki wilayah tidak valid.' },
          { status: 400 }
        );
      }
    }

    const created = await protestStore.createProtest({
      id_kejadian: body.id_kejadian,
      kode_unras: body.kode_unras,
      tanggal: body.tanggal,
      waktu_mulai: body.waktu_mulai || '09:00 WIB',
      waktu_selesai: body.waktu_selesai || null,
      lokasi: body.lokasi,
      titik_kumpul: body.titik_kumpul || null,
      sasaran_aksi: body.sasaran_aksi || null,
      isu_tuntutan: body.isu_tuntutan,
      estimasi_massa_source: massaNum,
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
      situation_summary: body.situation_summary || null,
      editorial_draft: body.editorial_draft || body.redaksi || null,
      editorial_final: body.editorial_final || null,
      source_type: "manual",

      // Excel C:AC Source Attributes
      urutan_bulan: body.urutan_bulan !== undefined && body.urutan_bulan !== null ? Number(body.urutan_bulan) : null,
      kategori_kejadian: body.kategori_kejadian || 'Unjuk Rasa',
      kp_kpw: body.kp_kpw || (body.provinsi === 'DKI Jakarta' ? 'KPBI' : 'KPwDN'),
      regional: body.regional || (body.provinsi === 'DKI Jakarta' ? 'Kantor Pusat' : 'Jawa'),
      kategori_isu: body.kategori_isu || null,
      dampak: body.dampak || 'Tidak Ada',
      keterangan_dampak: body.keterangan_dampak || null,
      nama_pelapor: body.nama_pelapor || user.name || null,
      info_awal: body.info_awal || null,
      tindak_lanjut: body.tindak_lanjut || null,
      progres_asistensi: body.progres_asistensi || null,
      realisasi: body.realisasi || null
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
