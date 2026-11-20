import { NextRequest, NextResponse } from "next/server";
import { protestStore } from "@/lib/protest-store";
import { resolveCurrentUser, canEditProtest } from "@/lib/auth-roles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/protests/[id]/points
 * Fetch all points for this protest event.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const protest = await protestStore.getProtestById(id);
    if (!protest) {
      return NextResponse.json(
        { success: false, error: "Aksi unjuk rasa tidak ditemukan" },
        { status: 404 }
      );
    }

    let points = await protestStore.getPointsByProtestId(protest.id);
    if (points.length === 0) {
      points = protestStore.synthesizePointsForLegacyEvent(protest);
    }

    return NextResponse.json({
      success: true,
      data: points
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/protests/[id]/points
 * Create a new distinct physical protest point under this event.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = resolveCurrentUser(request);
    if (!canEditProtest(user)) {
      return NextResponse.json(
        { success: false, error: "Akses ditolak: Hanya Admin atau Operator yang dapat menambah titik unras." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const protest = await protestStore.getProtestById(id);
    if (!protest) {
      return NextResponse.json(
        { success: false, error: "Aksi unjuk rasa tidak ditemukan" },
        { status: 404 }
      );
    }

    const body = await request.json();
    if (!body.point_name || !body.point_name.trim()) {
      return NextResponse.json(
        { success: false, error: "Nama titik unras wajib diisi" },
        { status: 400 }
      );
    }

    const newPoint = await protestStore.createPoint({
      protest_id: protest.id,
      point_name: body.point_name.trim(),
      location_address: body.location_address || protest.lokasi,
      provinsi: body.provinsi || protest.provinsi,
      kota_kabupaten: body.kota_kabupaten || protest.kota_kabupaten,
      regional: body.regional || protest.regional,
      latitude: body.latitude != null ? Number(body.latitude) : protest.validated_lat,
      longitude: body.longitude != null ? Number(body.longitude) : protest.validated_lng,
      status: body.status || protest.status,
      urgency: body.urgency || protest.urgency,
      notes: body.notes || null
    });

    // Optionally create initial elements if provided
    if (Array.isArray(body.elements) && body.elements.length > 0) {
      for (const el of body.elements) {
        if (el.name && el.name.trim()) {
          const createdEl = await protestStore.createElement({
            point_id: newPoint.id,
            protest_id: protest.id,
            name: el.name.trim(),
            leader_name: el.leader_name || null,
            demand_summary: el.demand_summary || null
          });

          if (el.initial_crowd !== undefined && el.initial_crowd !== null && Number(el.initial_crowd) >= 0) {
            await protestStore.addCrowdObservation({
              point_id: newPoint.id,
              element_id: createdEl.id,
              element_name: createdEl.name,
              crowd_estimate: Number(el.initial_crowd),
              observer_source: el.observer_source || user.name,
              verification_status: el.verification_status || "verified",
              notes: "Observasi awal saat penambahan titik"
            });
          }
        }
      }
    }

    const fullyLoadedPoint = await protestStore.getPointById(newPoint.id);

    return NextResponse.json({
      success: true,
      data: fullyLoadedPoint
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

