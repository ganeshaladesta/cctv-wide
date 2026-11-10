import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { CameraStatus } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const decodedId = decodeURIComponent(id);
  const store = getDataStore();
  const camera = store.getCameraById(decodedId);

  if (!camera) {
    return NextResponse.json(
      { error: "Camera not found", id: decodedId },
      { status: 404 }
    );
  }

  const nearby = store.getNearbyCameras(camera, 8);
  return NextResponse.json({
    data: camera,
    nearby
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const decodedId = decodeURIComponent(id);
  try {
    const body = await req.json();
    const rawStatus = String(body?.status || "").toUpperCase();
    const status: CameraStatus =
      rawStatus === "OFFLINE" ? "OFFLINE" : "ONLINE";
    const store = getDataStore();
    const updated = store.updateCameraStatus(decodedId, status);
    if (!updated) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 });
    }
    return NextResponse.json({ status: "ok", data: updated });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

