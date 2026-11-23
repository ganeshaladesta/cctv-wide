import { NextRequest, NextResponse } from "next/server";
import { executeManualSyncTrigger } from "@/lib/unras-manual-trigger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/integrations/unras/manual-trigger
 * Initiates manual synchronization between SCC Eagle Eyes and Power Automate flow
 * UNRAS_EXCEL_TO_SCC_MANUAL.
 *
 * Requirements:
 * - Restricted to Administrator role
 * - Dispatches request_id, requested_by, source, trigger_secret to Power Automate HTTP trigger
 * - Returns HTTP 202 with status: 'accepted'
 */
export async function POST(request: NextRequest) {
  return executeManualSyncTrigger(request);
}

/**
 * GET /api/integrations/unras/manual-trigger
 * Informative endpoint explaining the manual trigger usage
 */
export async function GET() {
  return NextResponse.json(
    {
      success: true,
      endpoint: "/api/integrations/unras/manual-trigger",
      method: "POST",
      description: "Pemicu manual sinkronisasi unjuk rasa Power Automate (Admin Only)",
      isConfigured: Boolean(process.env.POWER_AUTOMATE_TRIGGER_URL && process.env.POWER_AUTOMATE_TRIGGER_SECRET)
    },
    { status: 200 }
  );
}

