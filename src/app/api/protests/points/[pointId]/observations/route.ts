import { NextRequest, NextResponse } from "next/server";
import { protestStore } from "@/lib/protest-store";
import { resolveCurrentUser, canEditProtest } from "@/lib/auth-roles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Params {
  params: Promise<{ pointId: string }>;
}

/**
 * POST /api/protests/points/[pointId]/observations
 * Log a new crowd observation estimate for an element at a protest point.
 * Preserves historical observation timeline without overwriting previous estimates.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = resolveCurrentUser(request);
    if (!canEditProtest(user)) {
      return NextResponse.json(
        { success: false, error: "Akses ditolak: Hanya Admin atau Operator yang dapat mencatat estimasi massa." },
        { status: 403 }
      );
    }

    const { pointId } = await params;
    const point = await protestStore.getPointById(pointId);
    if (!point) {
      return NextResponse.json(
        { success: false, error: "Titik unras tidak ditemukan" },
        { status: 404 }
      );
    }

    const body = await request.json();
    if (!body.element_name || !body.element_name.trim()) {
      return NextResponse.json(
        { success: false, error: "Nama elemen massa wajib disertakan" },
        { status: 400 }
      );
    }

    const crowd = Number(body.crowd_estimate);
    if (isNaN(crowd) || crowd < 0) {
      return NextResponse.json(
        { success: false, error: "Jumlah estimasi massa harus berupa angka bernilai 0 atau lebih" },
        { status: 400 }
      );
    }

    const obs = await protestStore.addCrowdObservation({
      point_id: point.id,
      element_id: body.element_id || null,
      element_name: body.element_name.trim(),
      crowd_estimate: crowd,
      observation_timestamp: body.observation_timestamp || new Date().toISOString(),
      observer_source: body.observer_source || user.name,
      verification_status: body.verification_status || "verified",
      notes: body.notes || null
    });

    const updatedPoint = await protestStore.getPointById(point.id);

    return NextResponse.json({
      success: true,
      data: {
        observation: obs,
        point: updatedPoint
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

