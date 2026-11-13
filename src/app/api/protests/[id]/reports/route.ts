import { NextRequest, NextResponse } from 'next/server';
import { protestStore } from '@/lib/protest-store';
import { resolveCurrentUser, canEditProtest } from '@/lib/auth-roles';
import { ReportType } from '@/lib/types/protests';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/protests/[id]/reports
 * Fetch operator situational reports for a protest
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const protest = protestStore.getProtestById(id);
    if (!protest) {
      return NextResponse.json(
        { success: false, error: 'Aksi unjuk rasa tidak ditemukan' },
        { status: 404 }
      );
    }

    const reports = protestStore.getOperatorReports(protest.id);
    return NextResponse.json({
      success: true,
      data: reports
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/protests/[id]/reports
 * Add new situational report from operator/field personnel
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = resolveCurrentUser(request);
    if (!canEditProtest(user)) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: Hanya Admin atau Operator yang dapat membuat laporan situasi.' },
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
    if (!body.content || !body.content.trim()) {
      return NextResponse.json(
        { success: false, error: 'Isi laporan situasi (content) tidak boleh kosong.' },
        { status: 400 }
      );
    }

    const reportType: ReportType = body.report_type || 'progress';

    const newReport = protestStore.addOperatorReport({
      protest_id: protest.id,
      report_type: reportType,
      content: body.content.trim(),
      crowd_estimate: body.crowd_estimate !== undefined ? (body.crowd_estimate === null ? null : Number(body.crowd_estimate)) : null,
      is_pinned: Boolean(body.is_pinned)
    }, user);

    return NextResponse.json(
      {
        success: true,
        message: 'Laporan situasi berhasil dicatat.',
        data: newReport
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal menambahkan laporan situasi' },
      { status: 500 }
    );
  }
}
