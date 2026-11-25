import { NextRequest, NextResponse } from "next/server";
import { runOutboundSyncWorker } from "@/lib/unras-outbound-queue";

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60s max execution limit on Vercel Pro

/**
 * Authentication check for outbound worker.
 * Allows Vercel Cron (Authorization: Bearer <CRON_SECRET>),
 * x-cron-secret header, or authorized SCC operator/admin role.
 */
function isAuthorizedWorkerRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  
  // 1. If CRON_SECRET configured, verify bearer token or header
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token === cronSecret) return true;
    }
    const headerSecret = request.headers.get("x-cron-secret");
    if (headerSecret === cronSecret) return true;
  }

  // 2. Allow requests with verified admin / operator role header
  const userRole = request.headers.get("x-scc-user-role");
  if (userRole === "admin" || userRole === "operator") {
    return true;
  }

  // 3. In development or testing where CRON_SECRET is not configured, permit execution
  if (!cronSecret && process.env.NODE_ENV !== "production") {
    return true;
  }

  return false;
}

/**
 * GET /api/integrations/unras/outbound-worker
 * Vercel Cron invocation handler
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedWorkerRequest(request)) {
    return NextResponse.json(
      { success: false, error: "Akses ditolak: Token CRON_SECRET atau sesi tidak valid." },
      { status: 401 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const maxJobs = parseInt(searchParams.get("max_jobs") || "5", 10);
    const timeBudgetMs = parseInt(searchParams.get("time_budget_ms") || "45000", 10);

    const result = await runOutboundSyncWorker({
      maxJobs: Math.min(Math.max(1, maxJobs), 15),
      timeBudgetMs: Math.min(Math.max(5000, timeBudgetMs), 55000)
    });

    return NextResponse.json({
      success: true,
      message: `Worker selesai memproses ${result.processed} job. (Sukses: ${result.succeeded}, Gagal: ${result.failed}, Dijadwalkan Ulang: ${result.retried})`,
      ...result
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Worker gagal memproses antrean outbound." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/integrations/unras/outbound-worker
 * Manual trigger or background runner invocation handler
 */
export async function POST(request: NextRequest) {
  return GET(request);
}

