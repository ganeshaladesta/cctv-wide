import { NextRequest, NextResponse } from 'next/server';
import { protestStore } from '@/lib/protest-store';
import { resolveCurrentUser, canEditProtest } from '@/lib/auth-roles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Generates structured Indonesian editorial text based on real-time event parameters
 */
function buildEditorialContent(
  protest: any,
  reports: any[],
  cameraLinks: any[],
  customNotes?: string
): string {
  const now = new Date();
  const timestampStr = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) + ` pukul ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;

  const statusMap: Record<string, string> = {
    scheduled: 'TERENCANA (PERSIAPAN)',
    ongoing: 'SEDANG BERLANGSUNG',
    monitoring: 'DALAM PEMANTAUAN INTENSIF',
    completed: 'SELESAI (KONDUSIF)',
    cancelled: 'DIBATALKAN'
  };

  const crowdStr = protest.actual_crowd_size
    ? `${protest.actual_crowd_size.toLocaleString('id-ID')} orang (Verifikasi Lapangan)`
    : protest.estimasi_massa_source
    ? `± ${protest.estimasi_massa_source.toLocaleString('id-ID')} orang (Estimasi Intelkam)`
    : 'Dalam konfirmasi petugas';

  let text = `======================================================================\n`;
  text += `LAPORAN RESMI SITUASI MONITORING UNJUK RASA\n`;
  text += `KOMANDO SISTEM SCC - EAGLE EYES\n`;
  text += `======================================================================\n\n`;

  text += `WAKTU PEMBARUAN : ${timestampStr}\n`;
  text += `KODE LAPORAN    : ${protest.kode_unras} (${protest.id_kejadian})\n`;
  text += `STATUS AKSI     : ${statusMap[protest.status] || protest.status.toUpperCase()}\n`;
  text += `TINGKAT URGENSI : ${protest.urgency.toUpperCase()}\n\n`;

  text += `I. IDENTITAS & LOKASI KEJADIAN\n`;
  text += `----------------------------------------------------------------------\n`;
  text += `* Tanggal Pelaksanaan : ${protest.tanggal} | ${protest.waktu_mulai || '09:00 WIB'}\n`;
  text += `* Lokasi Utama        : ${protest.lokasi}\n`;
  if (protest.titik_kumpul) text += `* Titik Kumpul (Tikum): ${protest.titik_kumpul}\n`;
  if (protest.sasaran_aksi) text += `* Sasaran Aksi        : ${protest.sasaran_aksi}\n`;
  text += `* Wilayah Hukum       : ${protest.wilayah_hukum || 'Polda Setempat'}\n`;
  text += `* Provinsi/Kota       : ${protest.kota_kabupaten ? `${protest.kota_kabupaten}, ` : ''}${protest.provinsi}\n`;
  if (protest.validated_lat && protest.validated_lng) {
    text += `* Koordinat Geospasial: ${protest.validated_lat}, ${protest.validated_lng}\n`;
  }
  text += `\n`;

  text += `II. MASSA & TUNTUTAN UTAMA\n`;
  text += `----------------------------------------------------------------------\n`;
  text += `* Elemen / Organisasi : ${protest.organisasi_kelompok || 'Gabungan Elemen Masyarakat'}\n`;
  if (protest.korlap_pimpinan) text += `* Korlap / PJ Aksi    : ${protest.korlap_pimpinan}\n`;
  text += `* Kekuatan Massa      : ${crowdStr}\n`;
  text += `* Isu & Tuntutan      : ${protest.isu_tuntutan}\n\n`;

  text += `III. CATATAN PERKEMBANGAN LAPANGAN\n`;
  text += `----------------------------------------------------------------------\n`;
  if (protest.situation_summary) {
    text += `Ringkasan Operator: ${protest.situation_summary}\n\n`;
  }

  if (reports && reports.length > 0) {
    text += `Kronologi Laporan Petugas:\n`;
    reports.slice(-5).reverse().forEach((rep, idx) => {
      const timeStr = new Date(rep.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      text += ` [${timeStr} WIB] (${rep.report_type.toUpperCase()} - ${rep.author_name}): ${rep.content}\n`;
    });
    text += `\n`;
  } else {
    text += `Belum ada laporan eskalasi lapangan tambahan. Situasi dipantau melalui sensor CCTV.\n\n`;
  }

  text += `IV. INTEGRASI PENGAWASAN CCTV LIVE\n`;
  text += `----------------------------------------------------------------------\n`;
  if (cameraLinks && cameraLinks.length > 0) {
    text += `Sebanyak ${cameraLinks.length} kamera CCTV tertaut aktif mengawasi perimeter titik unras:\n`;
    cameraLinks.forEach((link, idx) => {
      text += ` ${idx + 1}. [${link.distance_meters}m] ${link.camera_name} (Status: ${link.camera_status || 'Online'})\n`;
    });
  } else {
    text += `Tidak ada kamera CCTV spesifik yang tertaut manual. Pengawasan diarahkan pada kamera publik terdekat.\n`;
  }
  text += `\n`;

  if (customNotes && customNotes.trim()) {
    text += `V. PETUNJUK KHUSUS OPERATOR\n`;
    text += `----------------------------------------------------------------------\n`;
    text += `${customNotes.trim()}\n\n`;
  }

  text += `Pusat Kendali Operasi SCC - EAGLE EYES\n`;
  text += `Dokumen ini digenerate secara otomatis untuk bahan koordinasi pengamanan terpadu.`;

  return text;
}

/**
 * POST /api/protests/[id]/editorial
 * Generate or re-generate editorial situation brief text
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = resolveCurrentUser(request);
    if (!canEditProtest(user)) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: Hanya Admin atau Operator yang dapat membuat teks editorial.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const protest = await protestStore.getProtestById(id);
    if (!protest) {
      return NextResponse.json(
        { success: false, error: 'Aksi unjuk rasa tidak ditemukan' },
        { status: 404 }
      );
    }

    let customNotes: string | undefined;
    try {
      const body = await request.json();
      if (body?.custom_notes) customNotes = body.custom_notes;
    } catch {}

    const reports = await protestStore.getOperatorReports(protest.id);
    const cameraLinks = await protestStore.getCameraLinks(protest.id);

    const generatedDraft = buildEditorialContent(protest, reports, cameraLinks, customNotes);

    // Save as editorial_draft
    const updated = await protestStore.updateProtest(protest.id, {
      editorial_draft: generatedDraft
    }, user);

    return NextResponse.json({
      success: true,
      message: 'Draft teks editorial berhasil digenerate.',
      draft: generatedDraft,
      data: updated
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal generate editorial' },
      { status: 500 }
    );
  }
}
