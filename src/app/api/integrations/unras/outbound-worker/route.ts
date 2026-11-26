import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runOutboundSyncWorker } from "@/lib/unras-outbound-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60s max execution limit on Vercel (accommodates ~40s Power Automate Excel processing)

/**
 * Constant-time secret comparison to prevent timing side-channel leaks.
 */
function verifySecretToken(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided.trim());
  const b = Buffer.from(expected.trim());
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Authentication check for outbound worker.
 * Supports:
 * - Supabase pg_net / Server Secret via:
 *   - Authorization: Bearer <CRON_SECRET | SUPABASE_WEBHOOK_SECRET>
 *   - x-cron-secret: <CRON_SECRET | SUPABASE_WEBHOOK_SECRET>
 *   - x-webhook-secret: <CRON_SECRET | SUPABASE_WEBHOOK_SECRET>
 * - Local development fallback ONLY when neither secret is configured and NODE_ENV !== "production".
 * Never exposes CRON_SECRET or SUPABASE_WEBHOOK_SECRET to the client.
 */
function isAuthorizedWorkerRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim() || "";
  const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET?.trim() || "";

  const authHeader = request.headers.get("authorization");
  const bearerToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;
  const headerCronSecret = request.headers.get("x-cron-secret");
  const headerWebhookSecret = request.headers.get("x-webhook-secret");

  if (cronSecret) {
    if (
      verifySecretToken(bearerToken, cronSecret) ||
      verifySecretToken(headerCronSecret, cronSecret) ||
      verifySecretToken(headerWebhookSecret, cronSecret)
    ) {
      return true;
    }
  }

  if (webhookSecret) {
    if (
      verifySecretToken(bearerToken, webhookSecret) ||
      verifySecretToken(headerWebhookSecret, webhookSecret) ||
      verifySecretToken(headerCronSecret, webhookSecret)
    ) {
      return true;
    }
  }

  // Fallback for local development/testing ONLY when both secrets are unconfigured and NODE_ENV !== "production"
  if (!cronSecret && !webhookSecret && process.env.NODE_ENV !== "production") {
    return true;
  }

  return false;
}

/**
 * GET /api/integrations/unras/outbound-worker
 * Manual / Recovery worker invocation handler
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedWorkerRequest(request)) {
    return NextResponse.json(
      { success: false, error: "Akses ditolak: Token autentikasi worker tidak valid." },
      { status: 401 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const maxJobs = parseInt(searchParams.get("max_jobs") || "2", 10);
    const timeBudgetMs = parseInt(searchParams.get("time_budget_ms") || "52000", 10);

    const result = await runOutboundSyncWorker({
      maxJobs: Math.min(Math.max(1, maxJobs), 10),
      timeBudgetMs: Math.min(Math.max(5000, timeBudgetMs), 55000),
      workerId: "worker-http-get"
    });

    return NextResponse.json({
      success: true,
      trigger: "http_get",
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
 * Primary target for Supabase Database Webhook (AFTER INSERT on public.unras_outbound_jobs)
 * as well as server-side recovery triggers.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedWorkerRequest(request)) {
    return NextResponse.json(
      { success: false, error: "Akses ditolak: Token autentikasi webhook worker tidak valid." },
      { status: 401 }
    );
  }

  try {
    let webhookPayload: any = null;
    try {
      const text = await request.text();
      if (text && text.trim().startsWith("{")) {
        webhookPayload = JSON.parse(text);
      }
    } catch {}

    // Inspect Supabase Database Webhook payload if provided
    if (webhookPayload && typeof webhookPayload === "object") {
      const eventType = webhookPayload.type ? String(webhookPayload.type).toUpperCase() : null;
      const tableName = webhookPayload.table ? String(webhookPayload.table) : null;
      const recordStatus = webhookPayload.record?.status ? String(webhookPayload.record.status) : null;

      if (tableName && tableName !== "unras_outbound_jobs") {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: `Diabaikan: Webhook berasal dari tabel '${tableName}', bukan 'unras_outbound_jobs'.`
        });
      }

      if (eventType === "DELETE") {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: "Diabaikan: Event DELETE tidak memicu outbound worker."
        });
      }

      // Guard against recursive self-triggering if webhook was accidentally configured on UPDATE
      if (eventType === "UPDATE" && recordStatus && recordStatus !== "pending") {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: `Diabaikan: Event UPDATE dengan status '${recordStatus}' bukan job pending baru.`
        });
      }
    }

    const searchParams = request.nextUrl.searchParams;
    const maxJobs = parseInt(searchParams.get("max_jobs") || "2", 10);
    const timeBudgetMs = parseInt(searchParams.get("time_budget_ms") || "52000", 10);
    const triggerSource = webhookPayload?.type
      ? `supabase_webhook_${String(webhookPayload.type).toLowerCase()}`
      : "http_post";

    const result = await runOutboundSyncWorker({
      maxJobs: Math.min(Math.max(1, maxJobs), 10),
      timeBudgetMs: Math.min(Math.max(5000, timeBudgetMs), 55000),
      workerId: `worker-${triggerSource}`
    });

    return NextResponse.json({
      success: true,
      trigger: triggerSource,
      webhook_job_id: webhookPayload?.record?.id || null,
      message: `Worker (${triggerSource}) selesai memproses ${result.processed} job. (Sukses: ${result.succeeded}, Gagal: ${result.failed}, Dijadwalkan Ulang: ${result.retried})`,
      ...result
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Worker gagal memproses trigger webhook outbound." },
      { status: 500 }
    );
  }
}


