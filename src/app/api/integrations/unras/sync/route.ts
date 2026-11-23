import { NextRequest, NextResponse } from "next/server";
import {
  verifyIntegrationToken,
  validateSyncRequest,
  processRolling7DaySync,
  processSameDaySync
} from "@/lib/unras-rolling-sync";
import { ProtestSyncPayload } from "@/lib/types/protests";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/unras/sync
 * Secure webhook integration for Scheduled (Same-Day H-0) & Manual (Rolling 7-Day) UNRAS Sync
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

    const validation = validateSyncRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: `Bad Request: ${validation.error}`
        },
        { status: 400 }
      );
    }

    const isSameDay = body.sync_type === "same_day" || body.sync_type === "same_day_h0";
    const defaultTriggeredByUser = isSameDay
      ? "Scheduled Sync (05:00 WIB)"
      : "Manual Sync (Rolling 7-Day)";

    const result = isSameDay
      ? await processSameDaySync(body, "power_automate", defaultTriggeredByUser)
      : await processRolling7DaySync(body, "power_automate", defaultTriggeredByUser);

    if (result.status === "skipped") {
      return NextResponse.json(result, { status: 409 });
    }

    // Normal synchronization outcome (success, partial, or validation skips) returns 200 with actionable structured JSON
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error during UNRAS sync"
      },
      { status: 500 }
    );
  }
}

