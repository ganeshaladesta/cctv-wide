-- ==============================================================================
-- SCC - EAGLE EYES: Event-Driven Outbound Queue Trigger Setup (pg_net + Vault)
-- File: supabase/setup_unras_outbound_webhook.sql
--
-- Purpose:
--   Replaces Vercel per-minute Cron (* * * * *) with an event-driven PostgreSQL
--   AFTER INSERT trigger on public.unras_outbound_jobs using pg_net (net.http_post)
--   and Supabase Vault (vault.decrypted_secrets).
--
-- Security & Reliability Guarantees:
--   1. Idempotent: Safe to run multiple times without creating duplicate triggers.
--   2. Transactionally safe: net.http_post queues the HTTP request inside the
--      transaction and dispatches ONLY AFTER the INSERT transaction commits.
--   3. Non-destructive failure isolation: Any pg_net or Vault runtime error is
--      caught inside an EXCEPTION block so it NEVER aborts the INSERT or loses
--      a pending job in public.unras_outbound_jobs.
--   4. Vault-only secret storage: Retrieves CRON_SECRET and the production worker
--      URL exclusively from Supabase Vault (vault.decrypted_secrets). Never
--      hardcodes secrets in SQL/Git and never stores secrets in plaintext tables.
--   5. Triggers ONLY on AFTER INSERT FOR EACH ROW (never on UPDATE or DELETE).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- STEP 1: Verify and enable pg_net and supabase_vault extensions if supported
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

  IF EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'supabase_vault'
  ) THEN
    CREATE EXTENSION IF NOT EXISTS supabase_vault;
    RAISE NOTICE '[UNRAS Setup] Extension supabase_vault is available and enabled.';
  ELSE
    RAISE WARNING '[UNRAS Setup] Extension supabase_vault is not available on this instance.';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- STEP 2: Create / Replace Trigger Function for AFTER INSERT on unras_outbound_jobs
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_unras_outbound_worker_pg_net()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, net, vault, extensions
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

  -- 2. Wrap Vault lookup and net.http_post in an exception block so any
  --    webhook/configuration error NEVER aborts the INSERT or loses the pending job.
  BEGIN
    -- 2A. Retrieve worker URL and CRON_SECRET exclusively from Supabase Vault
    IF to_regclass('vault.decrypted_secrets') IS NULL THEN
      RAISE WARNING '[UNRAS Outbound Webhook] vault.decrypted_secrets tidak tersedia. Job % tetap tersimpan sebagai pending di antrean.', NEW.id;
      RETURN NEW;
    END IF;

    EXECUTE $vault_q$
      SELECT
        MAX(CASE WHEN name = 'unras_outbound_worker_url' THEN decrypted_secret END),
        MAX(CASE WHEN name = 'unras_outbound_cron_secret' THEN decrypted_secret END)
      FROM vault.decrypted_secrets
      WHERE name IN ('unras_outbound_worker_url', 'unras_outbound_cron_secret')
    $vault_q$
    INTO v_worker_url, v_cron_secret;

    -- 2B. Validate Vault secrets presence before calling pg_net
    IF v_worker_url IS NULL OR btrim(v_worker_url) = '' THEN
      RAISE WARNING '[UNRAS Outbound Webhook] Secret unras_outbound_worker_url belum dikonfigurasi di Supabase Vault. Job % tetap tersimpan sebagai pending.', NEW.id;
      RETURN NEW;
    END IF;

    IF v_cron_secret IS NULL OR btrim(v_cron_secret) = '' THEN
      RAISE WARNING '[UNRAS Outbound Webhook] Secret unras_outbound_cron_secret belum dikonfigurasi di Supabase Vault. Job % tetap tersimpan sebagai pending.', NEW.id;
      RETURN NEW;
    END IF;

    -- 2C. Verify net.http_post is available
    IF to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
      RAISE WARNING '[UNRAS Outbound Webhook] Fungsi net.http_post tidak tersedia (pastikan ekstensi pg_net aktif). Job % tetap tersimpan sebagai pending.', NEW.id;
      RETURN NEW;
    END IF;

    -- 2D. Construct Supabase Database Webhook-compatible payload expected by worker
    v_payload := jsonb_build_object(
      'type', 'INSERT',
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', NULL
    );

    -- 2E. Construct authenticated headers (never logged)
    v_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || btrim(v_cron_secret),
      'X-Webhook-Source', 'supabase-pg-net',
      'X-Job-Id', NEW.id::text
    );

    -- 2F. Enqueue asynchronous HTTP POST via pg_net (transmitted only AFTER transaction COMMIT)
    SELECT net.http_post(
      url := btrim(v_worker_url),
      body := v_payload,
      params := '{}'::jsonb,
      headers := v_headers,
      timeout_milliseconds := 55000
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
  'Trigger function AFTER INSERT pada public.unras_outbound_jobs yang memicu outbound worker secara asinkron melalui pg_net (net.http_post) menggunakan secret terenkripsi dari Supabase Vault.';

-- ------------------------------------------------------------------------------
-- STEP 3: Deduplicate & Create Canonical AFTER INSERT Trigger on unras_outbound_jobs
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

  -- Create single canonical AFTER INSERT trigger (never triggers on UPDATE or DELETE)
  CREATE TRIGGER trg_unras_outbound_jobs_after_insert_webhook
    AFTER INSERT ON public.unras_outbound_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_unras_outbound_worker_pg_net();

  RAISE NOTICE '[UNRAS Setup] Trigger trg_unras_outbound_jobs_after_insert_webhook berhasil dipasang pada public.unras_outbound_jobs (AFTER INSERT FOR EACH ROW).';
END $$;
