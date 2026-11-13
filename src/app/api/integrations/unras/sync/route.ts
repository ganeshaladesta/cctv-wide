import { NextRequest, NextResponse } from "next/server";
import {
  verifyIntegrationToken,
  validateRollingSyncRequest,
  processRolling7DaySync
} from "@/lib/unras-rolling-sync";
import { RollingSyncPayload } from "@/lib/types/protests";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/unras/sync
 * Secure webhook integration for Power Automate Scheduled Cloud Flow (SCC_UNRAS_ROLLING_7D_SYNC)
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

    let body: RollingSyncPayload;
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

    const result = await processRolling7DaySync(
      body,
      "power_automate",
      "Power Automate (SCC_UNRAS_ROLLING_7D_SYNC)"
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
        error: error.message || "Internal server error during rolling sync"
      },
      { status: 500 }
    );
  }
}

