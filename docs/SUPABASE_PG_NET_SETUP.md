# Panduan Setup Event-Driven Outbound Queue (`pg_net` + Supabase Vault)

Dokumen ini menjelaskan cara mengaktifkan dan mengonfigurasi pemicu event-driven berbasis **PostgreSQL Trigger + `pg_net` + Supabase Vault** pada tabel `public.unras_outbound_jobs` untuk proyek **SCC Eagle Eyes**.

Arsitektur ini menggantikan Vercel Cron per menit (`* * * * *`) sehingga **100% kompatibel dengan Vercel Hobby**, memiliki latensi pemicu instan begitu transaksi `INSERT` di-commit, serta tidak pernah menyimpan `CRON_SECRET` secara hardcoded di kode sumber, Git, maupun tabel plaintext.

---

## 1. Kapabilitas Supabase & `pg_net`

- **`pg_net` Extension**: Didukung secara native pada Supabase PostgreSQL (`pg_available_extensions WHERE name = 'pg_net'`). Menyediakan fungsi `net.http_post(...)` yang bekerja secara **asinkron dan transaksional** melalui tabel antrean internal `net.http_request_queue`.
- **Jaminan Transaksional (`AFTER INSERT`)**: Request HTTP ke `/api/integrations/unras/outbound-worker` hanya dikirim oleh background worker `pg_net` **setelah** transaksi `INSERT` pada `public.unras_outbound_jobs` berhasil di-commit (`COMMIT`). Jika transaksi dibatalkan (`ROLLBACK`), request HTTP otomatis ikut dibatalkan.
- **Isolasi Kegagalan (`EXCEPTION WHEN OTHERS`)**: Fungsi trigger `public.trigger_unras_outbound_worker_pg_net()` membungkus pembacaan Vault dan pemanggilan `net.http_post` di dalam blok `EXCEPTION`. Apabila terjadi gangguan pada `pg_net` atau secret belum tersedia, transaksi `INSERT` **tidak akan pernah gagal** — job tetap tersimpan dengan aman sebagai `status = 'pending'` di `public.unras_outbound_jobs`.
- **Penyimpanan Rahasia Eksklusif di Supabase Vault (`supabase_vault`)**: `CRON_SECRET` dan URL worker produksi disimpan secara terenkripsi di **Supabase Vault** (`vault.secrets`) dan hanya didekripsi saat runtime melalui `vault.decrypted_secrets` oleh fungsi trigger `SECURITY DEFINER` dengan `search_path` yang terkunci. Tidak ada tabel fallback plaintext yang digunakan.

---

## 2. Urutan Eksekusi SQL di Supabase (Step-by-Step)

> **Prasyarat**: Migration [013_create_unras_outbound_jobs.sql](file:///d:/MORNINGSTAR/cctv/src/lib/db/migrations/013_create_unras_outbound_jobs.sql) sudah dijalankan sebelumnya di Supabase. **Jangan** menjalankan ulang migration 013 atau mereset tabel `public.unras_outbound_jobs`.

Buka **Supabase Dashboard** $\rightarrow$ **SQL Editor**, lalu jalankan langkah-langkah berikut secara berurutan:

### Langkah 1 — Aktifkan Ekstensi `pg_net` dan `supabase_vault`

```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
```

---

### Langkah 2 — Simpan `CRON_SECRET` dan URL Worker Produksi di Supabase Vault

Ganti `<VERCEL_PRODUCTION_DOMAIN>` dengan domain produksi Vercel Anda (tanpa trailing slash, misalnya `scc-eagle-eyes.vercel.app`) dan `<CRON_SECRET_ANDA>` dengan nilai environment variable `CRON_SECRET` yang terdaftar di Vercel Project Settings.

Jalankan blok SQL idempoten berikut di **Supabase SQL Editor**:

```sql
DO $$
DECLARE
  v_worker_url TEXT := 'https://<VERCEL_PRODUCTION_DOMAIN>/api/integrations/unras/outbound-worker';
  v_cron_secret TEXT := '<CRON_SECRET_ANDA>';
  v_existing_url_id UUID;
  v_existing_secret_id UUID;
BEGIN
  -- 1. Simpan atau perbarui unras_outbound_worker_url di Supabase Vault
  SELECT id INTO v_existing_url_id
  FROM vault.secrets
  WHERE name = 'unras_outbound_worker_url'
  LIMIT 1;

  IF v_existing_url_id IS NOT NULL THEN
    PERFORM vault.update_secret(
      v_existing_url_id,
      v_worker_url,
      'unras_outbound_worker_url',
      'Production Vercel URL for SCC UNRAS Outbound Worker'
    );
  ELSE
    PERFORM vault.create_secret(
      v_worker_url,
      'unras_outbound_worker_url',
      'Production Vercel URL for SCC UNRAS Outbound Worker'
    );
  END IF;

  -- 2. Simpan atau perbarui unras_outbound_cron_secret di Supabase Vault
  SELECT id INTO v_existing_secret_id
  FROM vault.secrets
  WHERE name = 'unras_outbound_cron_secret'
  LIMIT 1;

  IF v_existing_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(
      v_existing_secret_id,
      v_cron_secret,
      'unras_outbound_cron_secret',
      'Bearer CRON_SECRET for SCC UNRAS Outbound Worker authentication'
    );
  ELSE
    PERFORM vault.create_secret(
      v_cron_secret,
      'unras_outbound_cron_secret',
      'Bearer CRON_SECRET for SCC UNRAS Outbound Worker authentication'
    );
  END IF;
END $$;
```

---

### Langkah 3 — Jalankan Script Setup Trigger [`supabase/setup_unras_outbound_webhook.sql`](file:///d:/MORNINGSTAR/cctv/supabase/setup_unras_outbound_webhook.sql)

Salin dan jalankan seluruh isi file [supabase/setup_unras_outbound_webhook.sql](file:///d:/MORNINGSTAR/cctv/supabase/setup_unras_outbound_webhook.sql) di **Supabase SQL Editor**.

Script tersebut secara idempoten akan:
1. Memastikan ekstensi `pg_net` dan `supabase_vault` aktif.
2. Membuat fungsi trigger `public.trigger_unras_outbound_worker_pg_net()` (`SECURITY DEFINER`, `SET search_path = pg_catalog, public, net, vault, extensions`).
3. Menghapus duplikat trigger webhook lama (jika ada) dan memasang trigger tunggal `trg_unras_outbound_jobs_after_insert_webhook` (**hanya** `AFTER INSERT FOR EACH ROW`).

---

## 3. Verifikasi Instalasi Trigger & Secret

Jalankan query verifikasi berikut di **Supabase SQL Editor** (query ini aman dan **tidak** menampilkan nilai plaintext `CRON_SECRET`):

```sql
-- 1. Verifikasi ekstensi pg_net dan supabase_vault aktif
SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('pg_net', 'supabase_vault');

-- 2. Verifikasi secret terdaftar di Vault (tanpa mencetak nilai decrypted_secret)
SELECT name, description, created_at, updated_at
FROM vault.secrets
WHERE name IN ('unras_outbound_worker_url', 'unras_outbound_cron_secret');

-- 3. Verifikasi hanya ada 1 trigger AFTER INSERT pada public.unras_outbound_jobs
SELECT
  tgname AS trigger_name,
  tgenabled AS enabled_mode,
  pg_get_triggerdef(oid) AS trigger_definition
FROM pg_trigger
WHERE tgrelid = 'public.unras_outbound_jobs'::regclass
  AND NOT tgisinternal;
```

Hasil yang diharapkan pada query #3:
- Hanya terdapat satu baris trigger: `trg_unras_outbound_jobs_after_insert_webhook`
- Definisi: `AFTER INSERT ON public.unras_outbound_jobs FOR EACH ROW EXECUTE FUNCTION trigger_unras_outbound_worker_pg_net()`

---

## 4. Cara Menguji Trigger dengan Rekor Antrean Terkontrol

1. **Melalui Aplikasi SCC**:
   - Buka salah satu data UNRAS di SCC Eagle Eyes, ubah catatan atau status, lalu klik **Simpan**. Modal akan langsung tertutup setelah database SCC menerima perubahan, menampilkan toast **"Perubahan berhasil disimpan"** dan status **"Menunggu sinkronisasi Excel"**.
2. **Verifikasi Pengiriman `pg_net` di SQL Editor**:

```sql
-- Pantau log pengiriman HTTP terbaru dari pg_net
SELECT
  id,
  status_code,
  error_msg,
  timed_out,
  created
FROM net._http_response
ORDER BY created DESC
LIMIT 10;

-- Pantau status job terbaru di antrean
SELECT
  id,
  kode_unras,
  status,
  attempts,
  last_error,
  created_at,
  started_at,
  processed_at
FROM public.unras_outbound_jobs
ORDER BY created_at DESC
LIMIT 5;
```

---

## 5. Batasan Recovery Tanpa Per-Minute External Cron

Karena paket Vercel Hobby tidak mendukung Cron per menit (`* * * * *`):
- **Pemicu Utama**: Setiap `INSERT` job baru memicu worker secara langsung melalui PostgreSQL `AFTER INSERT` + `pg_net`.
- **Pemicu Recovery untuk Job yang Gagal Sementara (5xx Backoff) atau Webhook Gagal**:
  - Karena trigger `pg_net` hanya berjalan pada `AFTER INSERT` (bukan timer berkala setiap menit), job yang gagal akibat error HTTP 5xx atau terlewat karena gangguan jaringan `pg_net` dipulihkan ketika salah satu dari event berikut terjadi:
    1. **INSERT Job Berikutnya (FIFO Drain)**: Setiap kali ada perubahan UNRAS baru yang di-save, worker yang terpicu akan memproses job tertua yang sudah jatuh tempo terlebih dahulu (`ORDER BY created_at ASC FOR UPDATE SKIP LOCKED`).
    2. **Polling Status / Aktivitas Dashboard Operator**: Saat UI memantau `GET /api/protests/[id]/sync-status` untuk job aktif atau saat halaman dashboard dimuat.
    3. **Tombol Manual Retry Operator**: Operator menekan tombol **"Coba Sinkronkan Ulang"** (`POST /api/protests/[id]/sync-status`) pada kartu/baris yang gagal.
    4. **Cron Harian Vercel (`0 22 * * *`)**: Rute `/api/protests/sync` melakukan *background sweep* atas job pending yang sudah jatuh tempo.
  - **Catatan Kejujuran Teknis**: Tanpa scheduler eksternal per menit, apabila sebuah job mengalami error 5xx dan *tidak ada* aktivitas operator di dashboard serta *tidak ada* `INSERT` job baru sama sekali, job retry tersebut baru akan tersapu otomatis pada jadwal cron berikutnya atau saat operator membuka dashboard / menekan tombol Retry.

---

## 6. Prosedur Rollback / Menghapus Trigger Secara Aman

Apabila Anda perlu menonaktifkan atau menghapus trigger `pg_net` tanpa menghapus tabel `public.unras_outbound_jobs` maupun data antrean:

```sql
DROP TRIGGER IF EXISTS trg_unras_outbound_jobs_after_insert_webhook ON public.unras_outbound_jobs;
DROP FUNCTION IF EXISTS public.trigger_unras_outbound_worker_pg_net();
```
