import { NextRequest, NextResponse } from "next/server";
import { protestStore } from "@/lib/protest-store";
import { resolveCurrentUser, canEditProtest } from "@/lib/auth-roles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Params {
  params: Promise<{ pointId: string }>;
}

/**
 * POST /api/protests/points/[pointId]/elements
 * Add a new mass element/organization to a specific protest point.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = resolveCurrentUser(request);
    if (!canEditProtest(user)) {
      return NextResponse.json(
        { success: false, error: "Akses ditolak: Hanya Admin atau Operator yang dapat menambah elemen massa." },
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
    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { success: false, error: "Nama elemen ormas/aliansi wajib diisi" },
        { status: 400 }
      );
    }

    const element = await protestStore.createElement({
      point_id: point.id,
      protest_id: point.protest_id,
      name: body.name.trim(),
      leader_name: body.leader_name || null,
      demand_summary: body.demand_summary || null
    });

    if (body.initial_crowd !== undefined && body.initial_crowd !== null && Number(body.initial_crowd) >= 0) {
      await protestStore.addCrowdObservation({
        point_id: point.id,
        element_id: element.id,
        element_name: element.name,
        crowd_estimate: Number(body.initial_crowd),
        observer_source: body.observer_source || user.name,
        verification_status: body.verification_status || "verified",
        notes: body.notes || "Observasi awal elemen massa"
      });
    }

    const updatedPoint = await protestStore.getPointById(point.id);

    return NextResponse.json({
      success: true,
      data: {
        element,
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

