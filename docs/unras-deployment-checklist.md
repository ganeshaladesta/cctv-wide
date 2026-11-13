# Daftar Periksa Penerapan & Verifikasi (Deployment Checklist)
## Modul Pemantauan Unjuk Rasa Rolling 7-Hari — SCC - EAGLE EYES

Daftar periksa ini wajib dipenuhi oleh administrator sistem dan teknisi operasional sebelum mengaktifkan sinkronisasi otomatis di lingkungan staging maupun production.

---

## 1. Variabel Lingkungan (*Environment Variables*)

Pastikan variabel-variabel berikut telah dikonfigurasi di dashboard **Vercel** (`Settings` $\rightarrow$ `Environment Variables`):

| Variabel | Lingkungan | Deskripsi & Nilai Rekomendasi |
|----------|------------|--------------------------------|
| `UNRAS_SYNC_SECRET` | Production & Preview | Token rahasia dengan entropi tinggi (minimal 32 karakter acak). Digunakan oleh Power Automate pada header `Authorization: Bearer <TOKEN>`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Production & Preview | URL instans Supabase resmi platform SCC. |
| `SUPABASE_SERVICE_ROLE_KEY` | Production & Preview | Kunci service role Supabase untuk operasi bypass RLS pada backend Vercel API. |
| `CRON_SECRET` | Production | Kunci rahasia untuk Vercel Cron jika menggunakan fallback cron trigger. |

> **PERINGATAN KEAMANAN:** Dilarang memasukkan rahasia (*secrets*) atau kunci API langsung ke dalam kode sumber, repositori Git, atau dokumen publik.

---

## 2. Instruksi Migrasi Skema Basis Data Supabase

File migrasi resmi terletak di:
`src/lib/db/migrations/002_create_protest_monitoring_schema.sql`

### Langkah Penerapan ke Supabase:
1. Buka [Supabase Dashboard](https://supabase.com/dashboard/project/_/sql).
2. Masuk ke menu **SQL Editor**.
3. Buka berkas `002_create_protest_monitoring_schema.sql` pada repositori.
4. Salin seluruh skrip DDL SQL ke dalam SQL Editor Supabase.
5. Jalankan (*Run*).
6. Konfirmasi bahwa 7 tabel berikut telah dibuat dengan Row Level Security (RLS) aktif:
   - `protest_categories`
   - `protests`
   - `protest_operator_reports`
   - `protest_status_history`
   - `protest_camera_links`
   - `protest_attachments`
   - `protest_sync_logs`

> **CATATAN KESELAMATAN PRODUKSI:**
> Jangan pernah menjalankan perintah `DROP TABLE` pada basis data production yang sedang berjalan. Skrip migrasi telah dirancang secara aman menggunakan klausa `IF NOT EXISTS` dan indeks terisolasi.

---

## 3. Langkah Verifikasi Teknis Mandiri (Quality Assurance)

Sebelum melakukan deployment, jalankan seluruh pengujian regresi dan verifikasi tipe di terminal lokal:

### 1. Verifikasi Jendela Rolling 7-Hari (14 Kasus Uji)
```bash
npm run test:rolling-sync
```
*Kriteria Lolos:* Seluruh 14 pengujian lulus 100% (inklusi batas awal, eksklusi batas akhir, perlindungan catatan operator, timing-safe token, dsb).

### 2. Verifikasi Komprehensif Arsitektur Unjuk Rasa
```bash
npm run verify:protest
```
*Kriteria Lolos:* Seluruh 7 kelompok verifikasi (skema PostgreSQL, SQLite lokal, siklus hidup data awal, perhitungan spasial Haversine, unmapped events, format header Excel, dan proteksi operator) berstatus `PASS`.

### 3. Verifikasi CCTV & Direct HLS Playback
```bash
npm test
```
*Kriteria Lolos:* Pengujian dataset 23.356 kamera CCTV, 38 provinsi, dan status koneksi live stream valid.

### 4. Pengecekan Tipe TypeScript
```bash
npx tsc --noEmit
```
*Kriteria Lolos:* Tidak ada galat tipe (*0 TypeScript errors*).

### 5. Kompilasi & Build Produksi Next.js
```bash
npm run build
```
*Kriteria Lolos:* Build Next.js sukses menghasilkan halaman statis dan serverless bundle tanpa error.

---

## 4. Pengujian Webhook End-to-End dengan Power Automate

Setelah deployment di Vercel aktif:
1. Jalankan pengujian satu kali (*Test run*) pada flow `SCC_UNRAS_ROLLING_7D_SYNC` di Power Automate.
2. Periksa HTTP response dari endpoint `/api/integrations/unras/sync`:
   - Harus mengembalikan HTTP 200 dengan status `success` atau `partial`.
   - Periksa ringkasan baris: `received`, `inserted`, `updated`, `skipped`.
3. Buka dashboard **SCC - EAGLE EYES**:
   - Periksa **Panel Status Sinkronisasi**: pastikan cap waktu terakhir (WIB) tertera sesuai waktu eksekusi.
   - Periksa 4 Kartu KPI Utama: pastikan angka unjuk rasa terbarui secara akurat.

