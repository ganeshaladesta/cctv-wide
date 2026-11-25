-- ==============================================================================
-- SCC - EAGLE EYES: Event-Driven Outbound Queue Trigger Setup (pg_net + Vault)
-- File: supabase/setup_unras_outbound_webhook.sql
--
-- Purpose:
--   Replaces Vercel per-minute Cron (* * * * *) with an event-driven PostgreSQL
--   AFTER INSERT trigger on public.unras_outbound_jobs using pg_net (net.http_post).
--
-- Guarantees:
--   1. Idempotent: Safe to run multiple times without creating duplicate triggers.
--   2. Transactionally safe: net.http_post queues the HTTP request inside the
--      transaction and dispatches ONLY AFTER the INSERT transaction commits.
--   3. Non-destructive failure isolation: Any pg_net or Vault runtime error is
--      caught inside an EXCEPTION block so it NEVER aborts the INSERT or loses
--      a pending job in public.unras_outbound_jobs.
--   4. Zero hardcoded secrets: Retrieves CRON_SECRET and the production worker
--      URL securely from Supabase Vault (vault.decrypted_secrets), with a locked-down
--      private schema fallback (private.unras_webhook_config) if Vault is unavailable.
--   5. Triggers ONLY on AFTER INSERT FOR EACH ROW (never on UPDATE or DELETE).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- STEP 1: Enable pg_net extension if available and not yet installed
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net'
  ) THEN
    CREATE EXTENSION IF NOT EXISTS pg_net;
    RAISE NOTICE '[UNRAS Setup] Extension pg_net is available and enabled.';
  ELSE
    RAISE WARNING '[UNRAS Setup] Extension pg_net is not listed in pg_available_extensions on this instance.';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- STEP 2: Secure Fallback Configuration Table (Used ONLY if Supabase Vault is unavailable)
-- Locked down to service_role / postgres superuser; inaccessible to anon/authenticated.
-- ------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA private FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA private FROM authenticated';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS private.unras_webhook_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE private.unras_webhook_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.unras_webhook_config FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE private.unras_webhook_config FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE private.unras_webhook_config FROM authenticated';
  END IF;
END $$;

COMMENT ON TABLE private.unras_webhook_config IS
  'Fallback penyimpanan konfigurasi webhook outbound (hanya digunakan jika Supabase Vault tidak tersedia). Terkunci dari akses publik.';

-- ------------------------------------------------------------------------------
-- STEP 3: Create / Replace Trigger Function for AFTER INSERT on unras_outbound_jobs
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_unras_outbound_worker_pg_net()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, net, extensions
AS $$
DECLARE
  v_worker_url TEXT := NULL;
  v_cron_secret TEXT := NULL;
  v_payload JSONB;
  v_headers JSONB;
  v_request_id BIGINT;
BEGIN
  -- 1. Strict guard: Only act on newly inserted pending jobs
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  -- 2. Wrap secret retrieval and net.http_post in an exception block so any
  --    webhook/configuration error NEVER aborts the INSERT or loses the pending job.
  BEGIN
    -- 2A. Primary secret source: Supabase Vault (vault.decrypted_secrets)
    IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
      EXECUTE $vault_q$
        SELECT
          MAX(CASE WHEN name = 'unras_outbound_worker_url' THEN decrypted_secret END),
          MAX(CASE WHEN name = 'unras_outbound_cron_secret' THEN decrypted_secret END)
        FROM vault.decrypted_secrets
        WHERE name IN ('unras_outbound_worker_url', 'unras_outbound_cron_secret')
      $vault_q$
      INTO v_worker_url, v_cron_secret;
    END IF;

    -- 2B. Fallback secret source: private.unras_webhook_config (if Vault not populated)
    IF (v_worker_url IS NULL OR btrim(v_worker_url) = '')
       AND to_regclass('private.unras_webhook_config') IS NOT NULL THEN
      SELECT value INTO v_worker_url
      FROM private.unras_webhook_config
      WHERE key = 'unras_outbound_worker_url'
      LIMIT 1;
    END IF;

    IF (v_cron_secret IS NULL OR btrim(v_cron_secret) = '')
       AND to_regclass('private.unras_webhook_config') IS NOT NULL THEN
      SELECT value INTO v_cron_secret
      FROM private.unras_webhook_config
      WHERE key = 'unras_outbound_cron_secret'
      LIMIT 1;
    END IF;

    -- 2C. Validate configuration presence before calling pg_net
    IF v_worker_url IS NULL OR btrim(v_worker_url) = '' THEN
      RAISE WARNING '[UNRAS Outbound Webhook] unras_outbound_worker_url belum dikonfigurasi di Vault / private config. Job % tetap tersimpan sebagai pending untuk recovery.', NEW.id;
      RETURN NEW;
    END IF;

    IF v_cron_secret IS NULL OR btrim(v_cron_secret) = '' THEN
      RAISE WARNING '[UNRAS Outbound Webhook] unras_outbound_cron_secret belum dikonfigurasi di Vault / private config. Job % tetap tersimpan sebagai pending untuk recovery.', NEW.id;
      RETURN NEW;
    END IF;

    -- 2D. Verify net.http_post is available
    IF to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
      RAISE WARNING '[UNRAS Outbound Webhook] Fungsi net.http_post tidak tersedia (pastikan ekstensi pg_net aktif). Job % tetap tersimpan sebagai pending.', NEW.id;
      RETURN NEW;
    END IF;

    -- 2E. Construct Supabase Database Webhook-compatible payload
    v_payload := jsonb_build_object(
      'type', 'INSERT',
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', NULL
    );

    -- 2F. Construct authenticated headers (never logged)
    v_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || btrim(v_cron_secret),
      'X-Webhook-Source', 'supabase-pg-net',
      'X-Job-Id', NEW.id::text
    );

    -- 2G. Enqueue asynchronous HTTP POST via pg_net (transmitted only AFTER transaction COMMIT)
    SELECT net.http_post(
      url := btrim(v_worker_url),
      body := v_payload,
      params := '{}'::jsonb,
      headers := v_headers,
      timeout_milliseconds := 5000
    ) INTO v_request_id;

  EXCEPTION WHEN OTHERS THEN
    -- Never fail the INSERT transaction if webhook dispatch encounters an error
    RAISE WARNING '[UNRAS Outbound Webhook] Gagal menjadwalkan net.http_post untuk job % (job tetap aman di antrean): %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Lock down function execution permissions
REVOKE ALL ON FUNCTION public.trigger_unras_outbound_worker_pg_net() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.trigger_unras_outbound_worker_pg_net() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.trigger_unras_outbound_worker_pg_net() FROM authenticated';
  END IF;
END $$;

COMMENT ON FUNCTION public.trigger_unras_outbound_worker_pg_net() IS
  'Trigger function AFTER INSERT pada public.unras_outbound_jobs yang memicu outbound worker secara asinkron melalui pg_net (net.http_post) menggunakan secret dari Supabase Vault.';

-- ------------------------------------------------------------------------------
-- STEP 4: Deduplicate & Create Canonical AFTER INSERT Trigger on unras_outbound_jobs
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.unras_outbound_jobs') IS NULL THEN
    RAISE EXCEPTION 'Tabel public.unras_outbound_jobs tidak ditemukan. Pastikan Migration 013 telah dijalankan.';
  END IF;

  -- Drop any legacy / duplicate webhook triggers on public.unras_outbound_jobs
  DROP TRIGGER IF EXISTS tr_unras_outbound_jobs_webhook ON public.unras_outbound_jobs;
  DROP TRIGGER IF EXISTS unras_outbound_jobs_insert_trigger ON public.unras_outbound_jobs;
  DROP TRIGGER IF EXISTS trg_unras_outbound_jobs_after_insert_webhook ON public.unras_outbound_jobs;

  -- Create single canonical AFTER INSERT trigger
  CREATE TRIGGER trg_unras_outbound_jobs_after_insert_webhook
    AFTER INSERT ON public.unras_outbound_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_unras_outbound_worker_pg_net();

  RAISE NOTICE '[UNRAS Setup] Trigger trg_unras_outbound_jobs_after_insert_webhook berhasil dipasang pada public.unras_outbound_jobs (AFTER INSERT FOR EACH ROW).';
END $$;

