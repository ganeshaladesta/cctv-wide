import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { resolveCurrentUser, canTriggerManualSync } from "@/lib/auth-roles";
import { protestStore } from "@/lib/protest-store";

// Rate limiting cooldown tracker (in-memory, 5s between clicks)
let lastManualTriggerAttemptAt = 0;

/**
 * Reset cooldown tracker (used in unit/integration test suites)
 */
export function resetManualTriggerCooldown() {
  lastManualTriggerAttemptAt = 0;
}

export interface ManualTriggerResult {
  success: boolean;
  status: "accepted" | "conflict" | "rate_limited" | "failed";
  request_id?: string;
  execution_id?: string;
  message?: string;
  error?: string;
  code?: string;
}

/**
 * Execute Manual UNRAS Synchronization Trigger to Power Automate.
 * Strictly verifies authorization, generates UUID request_id, dispatches
 * HTTP POST with trigger_secret to Power Automate, and records audit log.
 */
export async function executeManualSyncTrigger(
  request: NextRequest | Request,
  options?: { timeoutMs?: number }
): Promise<NextResponse<ManualTriggerResult>> {
  try {
    // 1. Authenticate user: Check Authorization Bearer or internal role header
    const roleHeader = request.headers.get("x-scc-user-role");
    const authHeader = request.headers.get("authorization");

    if (!roleHeader && !authHeader) {
      return NextResponse.json(
        {
          success: false,
          status: "failed",
          error: "Otentikasi diperlukan: Header otorisasi tidak ditemukan.",
          code: "UNAUTHENTICATED"
        },
        { status: 401 }
      );
    }

    if (roleHeader === "anonymous" || roleHeader === "unauthenticated") {
      return NextResponse.json(
        {
          success: false,
          status: "failed",
          error: "Otentikasi diperlukan: Peran pengguna tidak valid.",
          code: "UNAUTHENTICATED"
        },
        { status: 401 }
      );
    }

    // 2. Enforce RBAC: Strictly restricted to Admin role
    const user = resolveCurrentUser(request);
    if (!canTriggerManualSync(user)) {
      return NextResponse.json(
        {
          success: false,
          status: "failed",
          error: "Akses ditolak: Hanya Administrator Komando yang berhak menjalankan sinkronisasi manual.",
          code: "FORBIDDEN"
        },
        { status: 403 }
      );
    }

    // 3. Read and validate environment variables exclusively on the server
    const triggerUrl = process.env.POWER_AUTOMATE_TRIGGER_URL?.trim();
    const triggerSecret = process.env.POWER_AUTOMATE_TRIGGER_SECRET?.trim();

    if (!triggerUrl) {
      return NextResponse.json(
        {
          success: false,
          status: "failed",
          error: "Variabel lingkungan 'POWER_AUTOMATE_TRIGGER_URL' belum dikonfigurasi di server.",
          code: "MISSING_TRIGGER_URL"
        },
        { status: 500 }
      );
    }

    if (!triggerSecret) {
      return NextResponse.json(
        {
          success: false,
          status: "failed",
          error: "Variabel lingkungan 'POWER_AUTOMATE_TRIGGER_SECRET' belum dikonfigurasi di server.",
          code: "MISSING_TRIGGER_SECRET"
        },
        { status: 500 }
      );
    }

    const now = Date.now();

    // 4. Rate Limiting Protection (5 seconds cooldown between clicks)
    if (now - lastManualTriggerAttemptAt < 5000) {
      const waitSeconds = Math.ceil((5000 - (now - lastManualTriggerAttemptAt)) / 1000);
      return NextResponse.json(
        {
          success: false,
          status: "rate_limited",
          error: `Permintaan sinkronisasi terlalu sering. Harap tunggu ${waitSeconds} detik sebelum mencoba lagi.`,
          code: "RATE_LIMITED"
        },
        { status: 429 }
      );
    }

    // 5. Concurrency Protection (Prevent overlapping sync executions within 3 minutes)
    const recentLogs = await protestStore.getSyncLogs(5);
    const activeSync = recentLogs.find(
      (l) => l.status === "running" && now - new Date(l.started_at).getTime() < 180000
    );
    if (activeSync) {
      return NextResponse.json(
        {
          success: false,
          status: "conflict",
          execution_id: activeSync.id,
          request_id: activeSync.id,
          error: "Proses sinkronisasi lain sedang berjalan. Mohon tunggu hingga eksekusi saat ini selesai.",
          code: "SYNC_ALREADY_RUNNING"
        },
        { status: 409 }
      );
    }

    // 6. Generate a unique RFC 4122 v4 UUID for request_id
    const requestId = crypto.randomUUID();
    lastManualTriggerAttemptAt = now;

    const triggeredByUser = `${user.name || "Administrator"} (${user.id})`;

    // 7. Create initial audit log record in 'running' state
    await protestStore.createSyncLog({
      id: requestId,
      started_at: new Date().toISOString(),
      completed_at: null,
      status: "running",
      triggered_by: "manual_admin",
      triggered_by_user: triggeredByUser,
      source_worksheet: "Table3",
      records_received: 0,
      records_processed: 0,
      records_created: 0,
      records_updated: 0,
      records_skipped: 0,
      records_failed: 0,
      error_details: null,
      duration_ms: null
    });

    // 8. Handle mock triggers for automated tests / preview environments
    if (triggerUrl.startsWith("mock://")) {
      const mockType = triggerUrl.replace("mock://", "").toLowerCase();

      if (mockType.includes("401") || mockType.includes("unauthorized")) {
        await protestStore.updateSyncLog(requestId, {
          status: "failed",
          completed_at: new Date().toISOString(),
          error_details: "Trigger Power Automate gagal (AUTHENTICATION_FAILED): HTTP 401"
        });
        return NextResponse.json(
          {
            success: false,
            status: "failed",
            request_id: requestId,
            error: "Otentikasi ke Power Automate ditolak. Pastikan trigger secret sesuai.",
            code: "AUTHENTICATION_FAILED"
          },
          { status: 502 }
        );
      }

      if (mockType.includes("403") || mockType.includes("forbidden")) {
        await protestStore.updateSyncLog(requestId, {
          status: "failed",
          completed_at: new Date().toISOString(),
          error_details: "Trigger Power Automate gagal (AUTHENTICATION_FAILED): HTTP 403"
        });
        return NextResponse.json(
          {
            success: false,
            status: "failed",
            request_id: requestId,
            error: "Otentikasi ke Power Automate ditolak. Pastikan trigger secret sesuai.",
            code: "AUTHENTICATION_FAILED"
          },
          { status: 502 }
        );
      }

      if (mockType.includes("500") || mockType.includes("error")) {
        await protestStore.updateSyncLog(requestId, {
          status: "failed",
          completed_at: new Date().toISOString(),
          error_details: "Trigger Power Automate gagal (SERVER_ERROR): HTTP 500"
        });
        return NextResponse.json(
          {
            success: false,
            status: "failed",
            request_id: requestId,
            error: "Layanan Power Automate mengalami kesalahan internal (HTTP 500).",
            code: "SERVER_ERROR"
          },
          { status: 502 }
        );
      }

      if (mockType.includes("timeout")) {
        await protestStore.updateSyncLog(requestId, {
          status: "failed",
          completed_at: new Date().toISOString(),
          error_details: "Trigger Power Automate gagal (TIMEOUT): Timeout"
        });
        return NextResponse.json(
          {
            success: false,
            status: "failed",
            request_id: requestId,
            error: "Koneksi ke Power Automate melebihi batas waktu (timeout).",
            code: "TIMEOUT"
          },
          { status: 504 }
        );
      }

      // Default mock success (HTTP 202 Accepted)
      return NextResponse.json(
        {
          success: true,
          status: "accepted",
          request_id: requestId,
          execution_id: requestId,
          message: "Permintaan sinkronisasi manual diterima Power Automate."
        },
        { status: 202 }
      );
    }

    // 9. Dispatch POST request to Power Automate with exact JSON contract
    const paPayload = {
      source: "scc-admin",
      requested_by: user.id,
      request_id: requestId,
      trigger_secret: triggerSecret
    };

    const timeoutMs = options?.timeoutMs ?? 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const paRes = await fetch(triggerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(paPayload),
        signal: controller.signal
      });
      clearTimeout(timer);

      // HTTP 200 or 202 signifies accepted trigger execution
      if (paRes.status === 200 || paRes.status === 202) {
        return NextResponse.json(
          {
            success: true,
            status: "accepted",
            request_id: requestId,
            execution_id: requestId,
            message: "Permintaan sinkronisasi manual diterima Power Automate."
          },
          { status: 202 }
        );
      }

      // Handle non-2xx responses safely without exposing secrets or raw details
      let errCategory = "UPSTREAM_ERROR";
      let userErrMsg = `Power Automate merespons dengan kesalahan (HTTP ${paRes.status}).`;

      if (paRes.status === 401 || paRes.status === 403) {
        errCategory = "AUTHENTICATION_FAILED";
        userErrMsg = "Otentikasi ke Power Automate ditolak. Pastikan trigger secret sesuai.";
      } else if (paRes.status >= 500) {
        errCategory = "SERVER_ERROR";
        userErrMsg = `Layanan Power Automate mengalami kesalahan internal (HTTP ${paRes.status}).`;
      }

      await protestStore.updateSyncLog(requestId, {
        status: "failed",
        completed_at: new Date().toISOString(),
        error_details: `Trigger Power Automate gagal (${errCategory}): HTTP ${paRes.status}`
      });

      return NextResponse.json(
        {
          success: false,
          status: "failed",
          request_id: requestId,
          error: userErrMsg,
          code: errCategory
        },
        { status: 502 }
      );
    } catch (fetchErr: any) {
      clearTimeout(timer);
      const isTimeout = fetchErr.name === "AbortError" || fetchErr.name === "TimeoutError";
      const errCategory = isTimeout ? "TIMEOUT" : "NETWORK_ERROR";
      const userErrMsg = isTimeout
        ? "Koneksi ke Power Automate melebihi batas waktu (timeout)."
        : "Gagal menghubungi endpoint Power Automate.";

      await protestStore.updateSyncLog(requestId, {
        status: "failed",
        completed_at: new Date().toISOString(),
        error_details: `Trigger Power Automate gagal (${errCategory}): ${isTimeout ? "Timeout" : "Network error"}`
      });

      return NextResponse.json(
        {
          success: false,
          status: "failed",
          request_id: requestId,
          error: userErrMsg,
          code: errCategory
        },
        { status: isTimeout ? 504 : 502 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        status: "failed",
        error: error.message || "Gagal memproses permintaan sinkronisasi manual.",
        code: "INTERNAL_ERROR"
      },
      { status: 500 }
    );
  }
}

