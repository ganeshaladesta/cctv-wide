import { NextRequest, NextResponse } from "next/server";
import {
  verifyIntegrationToken,
  validateRollingSyncRequest,
  processSameDaySync
} from "@/lib/unras-rolling-sync";
import { ProtestSyncPayload } from "@/lib/types/protests";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/unras/sync
 * Secure webhook integration for Scheduled Cloud Sync (Same-Day H-0 Asia/Jakarta)
 * Authenticated via Bearer token: UNRAS_SYNC_SECRET (timing-safe constant-time comparison)
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const secret = process.env.UNRAS_SYNC_SECRET;

    if (!verifyIntegrationToken(authHeader, secret)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized: Invalid or missing integration token"
        },
        { status: 401 }
      );
    }

    let body: ProtestSyncPayload;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Bad Request: Payload must be valid JSON"
        },
        { status: 400 }
      );
    }

    const validation = validateRollingSyncRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: `Bad Request: ${validation.error}`
        },
        { status: 400 }
      );
    }

    const result = await processSameDaySync(
      body,
      "power_automate",
      "Scheduled Sync (Same-Day H-0)"
    );

    if (result.status === "skipped") {
      return NextResponse.json(result, { status: 409 });
    }

    const httpStatus = result.status === "failed" ? 500 : 200;
    return NextResponse.json(result, { status: httpStatus });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error during same-day sync"
      },
      { status: 500 }
    );
  }
}

