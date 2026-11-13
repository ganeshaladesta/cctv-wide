# Arsitektur Integrasi & Sinkronisasi Unjuk Rasa Rolling 7-Hari
## SCC - EAGLE EYES

Dokumen ini mendefinisikan arsitektur teknis sistem sinkronisasi data unjuk rasa (*protest monitoring*) terintegrasi dalam platform **SCC - EAGLE EYES**.

---

## 1. Diagram Alur Data (End-to-End Visual Flow)

```
+-------------------------------------------------------------------------+
|                  OneDrive for Business (Microsoft 365)                 |
|             Workbook Excel: Worksheet 'NEW UNRAS 2022-2026'             |
|                  Format Tabel: ID KEJADIAN, WAKTU ISO                   |
+-------------------------------------------------------------------------+
                                    |
                                    | (1) Read Table Rows
                                    v
+-------------------------------------------------------------------------+
|             Power Automate: Scheduled Cloud Flow                        |
|                     'SCC_UNRAS_ROLLING_7D_SYNC'                         |
|            - Trigger: Terjadwal setiap hari pukul 05:00 WIB             |
|            - Hitung Jendela: period_start & period_end (7 Hari)         |
|            - Filter OData / List rows & Chunk Batch (maks 1.000 baris)  |
|            - HTTP Action (POST) + Authorization: Bearer {SECRET}        |
+-------------------------------------------------------------------------+
                                    |
                                    | (2) Webhook JSON Payload
                                    v
+-------------------------------------------------------------------------+
|                       Vercel Edge / API Engine                          |
|                  Endpoint: POST /api/integrations/unras/sync             |
|            - Autentikasi: timingSafeEqual(Bearer Token, SECRET)         |
|            - Validasi: sync_type='rolling_7d', timezone='Asia/Jakarta'  |
|            - Concurrency Lock: Cegah tabrakan sinkronisasi simultan     |
|            - Boundary Filter: period_start <= event < period_end        |
|            - Normalisasi Data Spasial & Estimasi Massa                 |
+-------------------------------------------------------------------------+
                                    |
                                    | (3) Idempotent Batch Upsert
                                    v
+-------------------------------------------------------------------------+
|            Basis Data Operasional (Supabase PostgreSQL / SQLite)        |
|            - Protests Table (Identity: id_kejadian)                     |
|            - PERLINDUNGAN: Catatan Operator, Status, GPS Lapangan,      |
|              dan Tautan Kamera CCTV TIDAK AKAN PERNAH DI-OVERWRITE      |
|            - Audit Log: protest_sync_logs (Durasi, Hasil, Rekaman)      |
+-------------------------------------------------------------------------+
                                    |
                                    | (4) Real-Time Query & Subscriptions
                                    v
+-------------------------------------------------------------------------+
|                   SCC - EAGLE EYES Monitoring Dashboard                 |
|            - 4 Kartu KPI Utama: Total, Berlangsung, Belum, Selesai      |
|            - Panel Status Sinkronisasi Real-Time (WIB)                  |
|            - Penautan Kamera CCTV Spasial (Radius Haversine)            |
|            - Pemicu Manual Sync (Terbatas untuk Administrator)          |
+-------------------------------------------------------------------------+
```

---

## 2. Peran & Tanggung Jawab Komponen

### A. OneDrive for Business Excel
- **Worksheet Target:** `NEW UNRAS 2022-2026`.
- Berfungsi sebagai *source of record* data intelijen aksi unjuk rasa di lapangan yang diisi oleh analis intelkam daerah/pusat.
- Memiliki kolom identitas utama `ID KEJADIAN` dan kolom cap waktu standar `WAKTU DAN TGL KEJADIAN ISO`.

### B. Power Automate Cloud Flow (`SCC_UNRAS_ROLLING_7D_SYNC`)
- Mengambil alih seluruh proses konektivitas Microsoft 365, otentikasi OneDrive, dan penjadwalan.
- **Bebas Entra ID App Registration:** Tidak membutuhkan pendaftaran aplikasi Microsoft Azure Entra ID / Microsoft Graph pada backend SCC.
- Berjalan terjadwal setiap hari pada **05:00 WIB** (`Recurrence` trigger).
- Mengirimkan data terformat melalui panggilan HTTP POST terenkripsi ke API SCC.

### C. Vercel API Gateway & Ingestion Engine (`/api/integrations/unras/sync`)
- Mengamankan komunikasi webhook menggunakan perbandingan waktu konstan (*timing-safe comparison*) terhadap `UNRAS_SYNC_SECRET`.
- Memvalidasi kontrak muatan (*payload contract*) dan batas jendela 7 hari.
- Mengisolasi dan mengecualikan rekaman di luar jendela waktu rolling (rekaman lampau > 7 hari maupun rekaman masa depan).
- Mengelola *in-memory concurrency lock* untuk mencegah *race condition*.

### D. Basis Data Operasional (Supabase / Local Store)
- Menyimpan data unjuk rasa terstruktur dengan relasi ke 23.356 kamera CCTV.
- Menerapkan **prinsip idempotensi ketat**: memperbarui informasi intelijen Excel tanpa pernah merusak data operasional operator komando (misal: *situation_summary*, *editorial_final*, status penanganan, koordinat GPS terverifikasi).
- Mencatat riwayat sinkronisasi secara komprehensif pada tabel `protest_sync_logs`.

### E. SCC Dashboard Frontend
- Menyajikan 4 Kartu KPI Utama secara ringkas dan responsif:
  1. **Jumlah Total Unras**
  2. **Sedang Berlangsung** (`status = 'ongoing'`)
  3. **Belum Berlangsung** (`status = 'scheduled'`)
  4. **Selesai** (`status = 'completed'` atau `status = 'monitoring'`)
- Panel Status Sinkronisasi yang menampilkan waktu sinkronisasi terakhir, rentang rolling 7-hari (WIB), dan rincian kuantitatif baris (*received*, *inserted*, *updated*, *skipped*, *failed*).
- Tombol sinkronisasi manual yang terlindungi RBAC khusus untuk peran Administrator.

---

## 3. Logika Jendela Rolling 7-Hari (*Rolling 7-Day Window*)

### Definisi Rumus Matematis
Sinkronisasi dieksekusi dengan referensi waktu lokal Jakarta (`Asia/Jakarta` / WIB):

$$\text{period\_end} = \text{Waktu Eksekusi Sekarang}$$
$$\text{period\_start} = \text{period\_end} - 7 \text{ Hari (604.800.000 ms)}$$

### Aturan Inklusi & Eksklusi Batas
Untuk setiap rekaman unjuk rasa dengan cap waktu $T_{\text{event}}$ yang diuraikan dari `WAKTU DAN TGL KEJADIAN ISO`:
- **Disertakan (INCLUDED):**
  $$\text{period\_start} \le T_{\text{event}} < \text{period\_end}$$
  *Batas awal tepat ($T = \text{period\_start}$) disertakan secara inklusif.*
- **Dikecualikan (EXCLUDED):**
  $$T_{\text{event}} < \text{period\_start} \quad \text{atau} \quad T_{\text{event}} \ge \text{period\_end}$$
  *Batas akhir tepat ($T = \text{period\_end}$) dan seluruh waktu di masa depan dikecualikan secara ketat.*

---

## 4. Model Keamanan (*Security Model*)

1. **Timing-Safe Secret Verification:**
   Perbandingan Bearer token menggunakan `crypto.timingSafeEqual` untuk mencegah serangan analisis waktu (*timing attack*):
   ```ts
   const tokenBuf = Buffer.from(token);
   const secretBuf = Buffer.from(expectedSecret);
   if (tokenBuf.length !== secretBuf.length) return false;
   return crypto.timingSafeEqual(tokenBuf, secretBuf);
   ```
2. **Payload Protection:**
   Batas muatan maksimum 1.000 baris per panggilan batch dan toleransi batas jendela maksimum 7 hari (+5 menit margin skew jam server).
3. **Role-Based Access Control (RBAC):**
   Pemicu manual sinkronisasi di dashboard dibatasi secara eksklusif untuk peran `admin`.

