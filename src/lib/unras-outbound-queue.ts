/**
 * SCC - EAGLE EYES: Asynchronous Outbound Sync Queue Service
 * Persistent Job Queue for SCC -> Excel Table3 (Power Automate)
 * Copyright: Developed by Ganesha Ladesta
 *
 * Architecture:
 * - When an operator saves an SCC record, the record is persisted and an outbound job
 *   is enqueued into 'unras_outbound_jobs'.
 * - The API immediately returns HTTP 200 to the client (<100ms response time).
 * - A persistent background worker claims pending jobs safely using atomic locking / SKIP LOCKED,
 *   transmits the payload to Power Automate, and records asynchronous execution status.
 */

import crypto from "node:crypto";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase";
import { protestStore } from "./protest-store";
import { ProtestEvent, UnrasOutboundJob } from "./types/protests";
import {
  buildOutboundPayload,
  OutboundSyncPayload,
  OutboundSyncResult
} from "./unras-outbound-sync";

export interface EnqueueResult {
  queued: boolean;
  job?: UnrasOutboundJob;
  reason?: string;
  duration_ms: number;
}

export interface WorkerExecutionResult {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  duration_ms: number;
  jobs: Array<{
    id: string;
    kode_unras: string;
    status: string;
    http_status?: number;
    error?: string;
  }>;
}

/**
 * Emits safe server-side structured diagnostic logs without exposing secrets,
 * webhook URLs, or query-string tokens.
 */
function logQueueDiagnostic(info: {
  correlation_id: string;
  event: string;
  route?: string;
  job_id?: string;
  protest_id?: string;
  id_unras?: string | null;
  result: "queued" | "skipped" | "claimed" | "success" | "failed" | "retrying";
  http_status?: number | null;
  attempts?: number;
  duration_ms: number;
  error?: string | null;
}) {
  const sanitized = {
    correlation_id: info.correlation_id,
    event: info.event,
    route: info.route || "queue",
    job_id: info.job_id || null,
    protest_id: info.protest_id || null,
    id_unras: info.id_unras || null,
    result: info.result,
    http_status: info.http_status ?? null,
    attempts: info.attempts ?? null,
    duration_ms: info.duration_ms,
    error: info.error ? String(info.error).slice(0, 200) : null
  };
  console.log(`[UNRAS Outbound Queue]`, JSON.stringify(sanitized));
}

/**
 * Enqueues an outbound synchronization job for an updated protest event.
 * 
 * Safety:
 * - Loop prevention: If origin is 'excel', execution is immediately discarded.
 * - Validation: Ensures event has valid kode_unras (ID UNRAS).
 * - Atomic persistence: Saves into database queue and marks protest outbound_sync_status = 'pending'.
 */
export async function enqueueOutboundSync(
  event: ProtestEvent,
  options: {
    origin?: "scc" | "excel";
    route?: string;
    forced?: boolean;
  } = {}
): Promise<EnqueueResult> {
  const startTime = Date.now();
  const correlationId = `outbound-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Loop Prevention check (Rule 1 & Rule 2)
  if (options.origin === "excel") {
    logQueueDiagnostic({
      correlation_id: correlationId,
      event: "unras.job.enqueue",
      route: options.route,
      protest_id: event.id,
      id_unras: event.kode_unras,
      result: "skipped",
      duration_ms: Date.now() - startTime,
      error: "Loop prevention: origin is excel"
    });
    return {
      queued: false,
      reason: "Loop prevention: origin is excel",
      duration_ms: Date.now() - startTime
    };
  }

  // 2. Validate matching key (ID UNRAS)
  const idUnras = (event.kode_unras || "").trim();
  if (!idUnras) {
    logQueueDiagnostic({
      correlation_id: correlationId,
      event: "unras.job.enqueue",
      route: options.route,
      protest_id: event.id,
      id_unras: null,
      result: "skipped",
      duration_ms: Date.now() - startTime,
      error: "Event missing kode_unras (ID UNRAS) required for Excel row lookup."
    });
    return {
      queued: false,
      reason: "Event missing kode_unras (ID UNRAS) required for Excel row lookup.",
      duration_ms: Date.now() - startTime
    };
  }

  // 3. Build strictly validated canonical payload
  const payload = buildOutboundPayload(event);
  const now = new Date().toISOString();

  const newJob: UnrasOutboundJob = {
    id: crypto.randomUUID(),
    protest_id: event.id,
    kode_unras: idUnras,
    id_kejadian: event.id_kejadian || null,
    payload,
    status: "pending",
    attempts: 0,
    max_attempts: 5,
    last_error: null,
    correlation_id: correlationId,
    created_at: now,
    updated_at: now,
    started_at: null,
    processed_at: null,
    next_retry_at: null,
    locked_at: null
  };

  // 4. Persist job into queue
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient();
      if (supabase) {
        // Try atomic RPC first for complete transactional consistency
        const { data: rpcRes, error: rpcErr } = await supabase.rpc("enqueue_unras_outbound_job_atomic", {
          p_protest_id: newJob.protest_id,
          p_kode_unras: newJob.kode_unras,
          p_id_kejadian: newJob.id_kejadian,
          p_job_payload: newJob.payload,
          p_correlation_id: newJob.correlation_id
        });

        if (rpcErr) {
          // Fallback to table insert if RPC not yet created in Supabase
          const { error: insertErr } = await supabase
            .from("unras_outbound_jobs")
            .insert({
              id: newJob.id,
              protest_id: newJob.protest_id,
              kode_unras: newJob.kode_unras,
              id_kejadian: newJob.id_kejadian,
              payload: newJob.payload,
              status: newJob.status,
              attempts: newJob.attempts,
              max_attempts: newJob.max_attempts,
              correlation_id: newJob.correlation_id,
              created_at: newJob.created_at,
              updated_at: newJob.updated_at
            });

          if (insertErr) {
            console.error("[OutboundQueue] Supabase job insert warning:", insertErr.message);
          }
        }
      }
    } catch (e: any) {
      console.warn("[OutboundQueue] Supabase job enqueue exception:", e?.message || e);
    }
  }

  // Always mirror in local store / SQLite for zero-failure and test execution
  try {
    protestStore.enqueueOutboundJobLocal(newJob);
  } catch {}

  // 5. Update protest outbound sync state to 'pending'
  try {
    await protestStore.updateProtest(event.id, {
      outbound_sync_status: "pending"
    }, { id: "system-queue", name: "Outbound Job Enqueuer", email: "system@scc.go.id", role: "admin" });
  } catch {}

  const durationMs = Date.now() - startTime;
  logQueueDiagnostic({
    correlation_id: correlationId,
    event: "unras.job.enqueue",
    route: options.route,
    job_id: newJob.id,
    protest_id: event.id,
    id_unras: idUnras,
    result: "queued",
    duration_ms: durationMs
  });

  return {
    queued: true,
    job: newJob,
    duration_ms: durationMs
  };
}

/**
 * Claims a pending job atomically from the queue.
 * Recovers stale locks (>5 mins) and uses SKIP LOCKED when supported.
 */
export async function claimPendingOutboundJob(workerId = "worker-default"): Promise<UnrasOutboundJob | null> {
  const now = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      try {
        // First try calling the RPC claim_unras_outbound_job
        const { data: rpcData, error: rpcError } = await supabase.rpc("claim_unras_outbound_job");
        if (!rpcError && rpcData && rpcData.length > 0) {
          const row = rpcData[0];
          return {
            id: row.id,
            protest_id: row.protest_id,
            kode_unras: row.kode_unras,
            id_kejadian: row.id_kejadian,
            payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
            status: row.status,
            attempts: row.attempts,
            max_attempts: row.max_attempts,
            last_error: row.last_error,
            correlation_id: row.correlation_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
            started_at: row.started_at,
            processed_at: row.processed_at,
            next_retry_at: row.next_retry_at,
            locked_at: row.locked_at
          };
        }

        // Fallback: Two-step atomic query in Supabase
        const { data: pendingRows } = await supabase
          .from("unras_outbound_jobs")
          .select("*")
          .or(`status.eq.pending,and(status.eq.failed,attempts.lt.5,next_retry_at.lte.${now})`)
          .or(`locked_at.is.null,locked_at.lt.${staleThreshold}`)
          .order("created_at", { ascending: true })
          .limit(1);

        if (pendingRows && pendingRows.length > 0) {
          const target = pendingRows[0];
          const { data: claimedRows, error: claimErr } = await supabase
            .from("unras_outbound_jobs")
            .update({
              status: "processing",
              locked_at: now,
              started_at: now,
              attempts: target.attempts + 1,
              updated_at: now
            })
            .eq("id", target.id)
            .eq("status", target.status)
            .select()
            .single();

          if (!claimErr && claimedRows) {
            return {
              id: claimedRows.id,
              protest_id: claimedRows.protest_id,
              kode_unras: claimedRows.kode_unras,
              id_kejadian: claimedRows.id_kejadian,
              payload: typeof claimedRows.payload === "string" ? JSON.parse(claimedRows.payload) : claimedRows.payload,
              status: claimedRows.status,
              attempts: claimedRows.attempts,
              max_attempts: claimedRows.max_attempts,
              last_error: claimedRows.last_error,
              correlation_id: claimedRows.correlation_id,
              created_at: claimedRows.created_at,
              updated_at: claimedRows.updated_at,
              started_at: claimedRows.started_at,
              processed_at: claimedRows.processed_at,
              next_retry_at: claimedRows.next_retry_at,
              locked_at: claimedRows.locked_at
            };
          }
        }
      } catch (err: any) {
        console.warn("[OutboundQueue] Supabase claim warning:", err?.message || err);
      }
    }
  }

  // Local SQLite fallback claiming
  return protestStore.claimOutboundJobLocal(workerId);
}

/**
 * Updates status and metadata of an outbound job in both Supabase and SQLite.
 */
export async function updateOutboundJob(jobId: string, updates: Partial<UnrasOutboundJob>): Promise<void> {
  const patch: Record<string, any> = {
    ...updates,
    updated_at: new Date().toISOString()
  };

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      try {
        await supabase
          .from("unras_outbound_jobs")
          .update(patch)
          .eq("id", jobId);
      } catch (err: any) {
        console.warn("[OutboundQueue] Supabase job update warning:", err?.message || err);
      }
    }
  }

  try {
    protestStore.updateOutboundJobLocal(jobId, updates);
  } catch {}
}

/**
 * Executes transmission of a claimed outbound job to Power Automate.
 */
export async function processOutboundJob(job: UnrasOutboundJob): Promise<OutboundSyncResult> {
  const startTime = Date.now();
  const correlationId = job.correlation_id || `job-exec-${Date.now()}`;
  const outboundUrl = process.env.POWER_AUTOMATE_OUTBOUND_URL || process.env.UNRAS_OUTBOUND_WEBHOOK_URL;

  if (!outboundUrl || outboundUrl.trim() === "") {
    const errorMsg = "Power Automate outbound webhook URL is not configured (POWER_AUTOMATE_OUTBOUND_URL).";
    await updateOutboundJob(job.id, {
      status: "failed",
      last_error: errorMsg,
      processed_at: new Date().toISOString(),
      locked_at: null
    });

    try {
      await protestStore.updateProtest(job.protest_id, {
        outbound_sync_status: "failed"
      }, { id: "system-worker", name: "Outbound Worker", email: "system@scc.go.id", role: "admin" });
    } catch {}

    logQueueDiagnostic({
      correlation_id: correlationId,
      event: "unras.job.process",
      job_id: job.id,
      protest_id: job.protest_id,
      id_unras: job.kode_unras,
      result: "failed",
      duration_ms: Date.now() - startTime,
      error: errorMsg
    });

    return {
      success: false,
      status: "failed",
      error: errorMsg,
      duration_ms: Date.now() - startTime
    };
  }

  const controller = new AbortController();
  // 45s timeout: comfortably accommodates Power Automate execution (~38s) within Vercel 60s limit
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(outboundUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Origin": "scc",
        "X-Sync-Event": "unras.updated",
        "X-Sync-Key": job.kode_unras,
        "X-Job-Id": job.id,
        "X-Correlation-Id": correlationId
      },
      body: JSON.stringify(job.payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    // HTTP 200 or 204: Success
    if (response.status === 200 || response.status === 204) {
      const now = new Date().toISOString();
      await updateOutboundJob(job.id, {
        status: "success",
        last_error: null,
        processed_at: now,
        locked_at: null
      });

      // Update protest record
      try {
        await protestStore.updateProtest(job.protest_id, {
          outbound_sync_status: "success",
          last_outbound_synced_at: now
        }, { id: "system-worker", name: "Outbound Worker", email: "system@scc.go.id", role: "admin" });
      } catch {}

      logQueueDiagnostic({
        correlation_id: correlationId,
        event: "unras.job.process",
        job_id: job.id,
        protest_id: job.protest_id,
        id_unras: job.kode_unras,
        result: "success",
        http_status: response.status,
        attempts: job.attempts,
        duration_ms: durationMs
      });

      return {
        success: true,
        status: "success",
        http_status: response.status,
        duration_ms: durationMs
      };
    }

    // HTTP 404 (Not Found in Excel Table3)
    if (response.status === 404) {
      const errorMsg = `ID UNRAS '${job.kode_unras}' tidak ditemukan di tabel Excel Table3 (HTTP 404).`;
      await updateOutboundJob(job.id, {
        status: "failed",
        last_error: errorMsg,
        processed_at: new Date().toISOString(),
        locked_at: null
      });

      try {
        await protestStore.updateProtest(job.protest_id, {
          outbound_sync_status: "failed"
        }, { id: "system-worker", name: "Outbound Worker", email: "system@scc.go.id", role: "admin" });
      } catch {}

      logQueueDiagnostic({
        correlation_id: correlationId,
        event: "unras.job.process",
        job_id: job.id,
        protest_id: job.protest_id,
        id_unras: job.kode_unras,
        result: "failed",
        http_status: 404,
        attempts: job.attempts,
        duration_ms: durationMs,
        error: errorMsg
      });

      return {
        success: false,
        status: "not_found",
        http_status: 404,
        error: errorMsg,
        duration_ms: durationMs
      };
    }

    // HTTP 409 (Ambiguous duplicate row in Excel)
    if (response.status === 409) {
      const errorMsg = `ID UNRAS '${job.kode_unras}' ambigu: Ditemukan lebih dari 1 baris di tabel Excel (HTTP 409). Update ditolak untuk keamanan.`;
      await updateOutboundJob(job.id, {
        status: "failed",
        last_error: errorMsg,
        processed_at: new Date().toISOString(),
        locked_at: null
      });

      try {
        await protestStore.updateProtest(job.protest_id, {
          outbound_sync_status: "failed"
        }, { id: "system-worker", name: "Outbound Worker", email: "system@scc.go.id", role: "admin" });
      } catch {}

      logQueueDiagnostic({
        correlation_id: correlationId,
        event: "unras.job.process",
        job_id: job.id,
        protest_id: job.protest_id,
        id_unras: job.kode_unras,
        result: "failed",
        http_status: 409,
        attempts: job.attempts,
        duration_ms: durationMs,
        error: errorMsg
      });

      return {
        success: false,
        status: "conflict",
        http_status: 409,
        error: errorMsg,
        duration_ms: durationMs
      };
    }

    // HTTP 401 (DirectApiAuthorizationRequired / Missing SAS)
    if (response.status === 401) {
      const errorText = await response.text().catch(() => "");
      const errorMsg = `Power Automate 401 Unauthorized (DirectApiAuthorizationRequired): URL webhook tidak memiliki parameter Shared Access Signature (sp, sv, sig). ${errorText}`.trim();
      await updateOutboundJob(job.id, {
        status: "failed",
        last_error: errorMsg,
        processed_at: new Date().toISOString(),
        locked_at: null
      });

      try {
        await protestStore.updateProtest(job.protest_id, {
          outbound_sync_status: "failed"
        }, { id: "system-worker", name: "Outbound Worker", email: "system@scc.go.id", role: "admin" });
      } catch {}

      logQueueDiagnostic({
        correlation_id: correlationId,
        event: "unras.job.process",
        job_id: job.id,
        protest_id: job.protest_id,
        id_unras: job.kode_unras,
        result: "failed",
        http_status: 401,
        attempts: job.attempts,
        duration_ms: durationMs,
        error: errorMsg
      });

      return {
        success: false,
        status: "failed",
        http_status: 401,
        error: errorMsg,
        duration_ms: durationMs
      };
    }

    // 5xx or other server response: calculate retry
    const errorText = await response.text().catch(() => "");
    const errorMsg = `Power Automate merespons HTTP ${response.status}: ${errorText || "Server Error"}`;
    return await handleJobFailure(job, errorMsg, response.status, correlationId, startTime);

  } catch (err: any) {
    clearTimeout(timeoutId);
    const isAbort = err.name === "AbortError";
    const errorMsg = isAbort
      ? "Batas waktu koneksi ke Power Automate habis (45 detik timeout). Alur kemungkinan telah menerima request dan sedang memproses Excel Table3 (ambiguous timeout). Pengulangan otomatis ditahan untuk mencegah duplikasi eksekusi."
      : (err.message || String(err));

    return await handleJobFailure(job, errorMsg, 504, correlationId, startTime, isAbort);
  }
}

/**
 * Handles retry calculation with exponential backoff or marks permanent failure.
 */
async function handleJobFailure(
  job: UnrasOutboundJob,
  errorMsg: string,
  httpStatus: number,
  correlationId: string,
  startTime: number,
  isAmbiguousTimeout: boolean = false
): Promise<OutboundSyncResult> {
  const durationMs = Date.now() - startTime;
  const isRetryable = job.attempts < job.max_attempts;

  if (isRetryable) {
    // If ambiguous timeout, enforce a minimum 3-minute backoff window to prevent concurrent write collisions
    const backoffMs = isAmbiguousTimeout
      ? Math.max(3 * 60 * 1000, Math.pow(2, job.attempts) * 30000)
      : Math.pow(2, job.attempts) * 10000;
    const nextRetry = new Date(Date.now() + backoffMs).toISOString();

    await updateOutboundJob(job.id, {
      status: "pending",
      next_retry_at: nextRetry,
      last_error: errorMsg,
      locked_at: null
    });

    logQueueDiagnostic({
      correlation_id: correlationId,
      event: "unras.job.retry_scheduled",
      job_id: job.id,
      protest_id: job.protest_id,
      id_unras: job.kode_unras,
      result: "retrying",
      http_status: httpStatus,
      attempts: job.attempts,
      duration_ms: durationMs,
      error: errorMsg
    });

    return {
      success: false,
      status: "failed",
      http_status: httpStatus,
      error: errorMsg,
      duration_ms: durationMs
    };
  }

  // Max attempts exceeded: mark permanently failed
  await updateOutboundJob(job.id, {
    status: "failed",
    last_error: `Gagal permanen setelah ${job.attempts} percobaan. Terakhir: ${errorMsg}`,
    processed_at: new Date().toISOString(),
    locked_at: null
  });

  try {
    await protestStore.updateProtest(job.protest_id, {
      outbound_sync_status: "failed"
    }, { id: "system-worker", name: "Outbound Worker", email: "system@scc.go.id", role: "admin" });
  } catch {}

  logQueueDiagnostic({
    correlation_id: correlationId,
    event: "unras.job.failed_permanently",
    job_id: job.id,
    protest_id: job.protest_id,
    id_unras: job.kode_unras,
    result: "failed",
    http_status: httpStatus,
    attempts: job.attempts,
    duration_ms: durationMs,
    error: errorMsg
  });

  return {
    success: false,
    status: "failed",
    http_status: httpStatus,
    error: errorMsg,
    duration_ms: durationMs
  };
}

/**
 * Worker execution loop: Processes pending jobs with bounded concurrency and execution budget.
 */
export async function runOutboundSyncWorker(options: {
  maxJobs?: number;
  timeBudgetMs?: number;
  workerId?: string;
} = {}): Promise<WorkerExecutionResult> {
  // Default maxJobs = 2 with conservative time budget check to fit safely within Vercel 60s execution limit
  const maxJobs = options.maxJobs || 2;
  const timeBudgetMs = options.timeBudgetMs || 50000;
  const workerId = options.workerId || `worker-${process.pid || Math.random().toString(36).slice(2, 6)}`;
  const startTime = Date.now();

  const results: WorkerExecutionResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    retried: 0,
    duration_ms: 0,
    jobs: []
  };

  // 1. First recover any stale processing locks
  try {
    protestStore.resetStaleOutboundJobLocksLocal();
  } catch {}

  // 2. Process jobs one by one up to maxJobs within budget
  while (results.processed < maxJobs) {
    // If a job was already processed and elapsed time > 15s, stop now to prevent exceeding Vercel 60s limit
    if (results.processed > 0 && Date.now() - startTime > 15000) {
      break;
    }
    if (Date.now() - startTime > timeBudgetMs - 10000) {
      break;
    }

    const job = await claimPendingOutboundJob(workerId);
    if (!job) {
      // No more jobs to claim
      break;
    }

    results.processed++;
    const res = await processOutboundJob(job);

    results.jobs.push({
      id: job.id,
      kode_unras: job.kode_unras,
      status: res.status,
      http_status: res.http_status,
      error: res.error
    });

    if (res.success) {
      results.succeeded++;
    } else {
      // If still pending with next_retry_at, it's scheduled for retry
      const currentJob = await getOutboundJobById(job.id);
      if (currentJob?.status === "pending") {
        results.retried++;
      } else {
        results.failed++;
      }
    }
  }

  results.duration_ms = Date.now() - startTime;
  return results;
}

/**
 * Retrieves the latest outbound job associated with a given protest ID.
 */
export async function getLatestOutboundJobByProtestId(protestId: string): Promise<UnrasOutboundJob | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("unras_outbound_jobs")
          .select("*")
          .eq("protest_id", protestId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          return {
            id: data.id,
            protest_id: data.protest_id,
            kode_unras: data.kode_unras,
            id_kejadian: data.id_kejadian,
            payload: typeof data.payload === "string" ? JSON.parse(data.payload) : data.payload,
            status: data.status,
            attempts: data.attempts,
            max_attempts: data.max_attempts,
            last_error: data.last_error,
            correlation_id: data.correlation_id,
            created_at: data.created_at,
            updated_at: data.updated_at,
            started_at: data.started_at,
            processed_at: data.processed_at,
            next_retry_at: data.next_retry_at,
            locked_at: data.locked_at
          };
        }
      } catch (err: any) {
        console.warn("[OutboundQueue] Supabase getLatestJob warning:", err?.message || err);
      }
    }
  }

  return protestStore.getLatestOutboundJobByProtestIdLocal(protestId);
}

/**
 * Retrieves a single outbound job by its primary key ID.
 */
export async function getOutboundJobById(jobId: string): Promise<UnrasOutboundJob | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("unras_outbound_jobs")
          .select("*")
          .eq("id", jobId)
          .maybeSingle();

        if (!error && data) {
          return {
            id: data.id,
            protest_id: data.protest_id,
            kode_unras: data.kode_unras,
            id_kejadian: data.id_kejadian,
            payload: typeof data.payload === "string" ? JSON.parse(data.payload) : data.payload,
            status: data.status,
            attempts: data.attempts,
            max_attempts: data.max_attempts,
            last_error: data.last_error,
            correlation_id: data.correlation_id,
            created_at: data.created_at,
            updated_at: data.updated_at,
            started_at: data.started_at,
            processed_at: data.processed_at,
            next_retry_at: data.next_retry_at,
            locked_at: data.locked_at
          };
        }
      } catch {}
    }
  }

  // Local lookup
  return protestStore.getOutboundJobByIdLocal(jobId);
}

/**
 * Manually retries a failed outbound job by resetting its status to 'pending'.
 */
export async function retryOutboundJob(jobId: string): Promise<boolean> {
  const now = new Date().toISOString();
  await updateOutboundJob(jobId, {
    status: "pending",
    locked_at: null,
    next_retry_at: now,
    updated_at: now
  });

  const job = await getOutboundJobById(jobId);
  if (job?.protest_id) {
    try {
      await protestStore.updateProtest(job.protest_id, {
        outbound_sync_status: "pending"
      }, { id: "system-retry", name: "Manual Retry Trigger", email: "system@scc.go.id", role: "admin" });
    } catch {}
  }

  return true;
}
