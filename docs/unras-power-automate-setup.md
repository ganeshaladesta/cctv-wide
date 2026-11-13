# Panduan Konfigurasi Power Automate Cloud Flow
## SCC_UNRAS_ROLLING_7D_SYNC

Panduan langkah demi langkah untuk mengonfigurasi alur kerja terjadwal (*Scheduled Cloud Flow*) pada **Microsoft Power Automate** guna menyelaraskan data unjuk rasa dari OneDrive for Business ke API SCC - EAGLE EYES.

---

## 1. Ikhtisar Alur Kerja

- **Nama Flow:** `SCC_UNRAS_ROLLING_7D_SYNC`
- **Tipe Flow:** Scheduled Cloud Flow (Terjadwal)
- **Frekuensi:** Harian setiap pukul **05:00 WIB** (`UTC+07:00`)
- **Tujuan Endpoint:** `POST https://<DOMAIN_VERCEL>/api/integrations/unras/sync`
- **Metode Autentikasi:** HTTP Header `Authorization: Bearer <UNRAS_SYNC_SECRET>`

---

## 2. Prasyarat Dokumen Excel (OneDrive for Business)

1. **Lokasi Berkas:** OneDrive for Business pengguna atau SharePoint Document Library komando.
2. **Nama Lembar Kerja (Worksheet):** `NEW UNRAS 2022-2026`.
3. **Format Data Excel:**
   - Seluruh baris data harus berada di dalam **Excel Table** resmi (misal: bernama `Table_Unras`).
   - Jika belum berupa Tabel, blok rentang data lalu tekan `Ctrl + T` (beri centang *"My table has headers"*).
4. **Kolom Wajib:**
   - `ID KEJADIAN` (Identitas unik alfanumerik)
   - `KODE_UNRAS` (Kode register aksi)
   - `WAKTU DAN TGL KEJADIAN ISO` (Format standar ISO 8601: `YYYY-MM-DDTHH:mm:ss+07:00` atau `YYYY-MM-DDTHH:mm:ssZ`)
   - `TANGGAL` (Tanggal aksi unras)
   - `LOKASI` (Nama lokasi atau gedung sasaran)
   - `ISU` (Isu atau tuntutan aksi)

---

## 3. Langkah Demi Langkah Pembuatan Flow di Power Automate

### Langkah 1: Buat Scheduled Cloud Flow Baru
1. Buka [Power Automate Portal](https://make.powerautomate.com/).
2. Klik **Create** $\rightarrow$ **Scheduled cloud flow**.
3. Beri nama Flow: `SCC_UNRAS_ROLLING_7D_SYNC`.
4. Atur jadwal pemicu (*Recurrence*):
   - **Starting:** Tanggal hari ini pukul 05:00.
   - **Repeat every:** 1 Day.
   - **Time zone:** `(UTC+07:00) Bangkok, Hanoi, Jakarta`.
   - **At these hours:** `5`.
   - **At these minutes:** `0`.

### Langkah 2: Hitung Jendela Rolling 7-Hari dengan Expression
Tambahkan aksi **Initialize variable** untuk menghitung `period_end` dan `period_start`:

1. **Variabel `period_end`:**
   - Name: `period_end`
   - Type: `String`
   - Value (Expression):
     ```
     utcNow()
     ```
2. **Variabel `period_start`:**
   - Name: `period_start`
   - Type: `String`
   - Value (Expression):
     ```
     addDays(utcNow(), -7)
     ```

### Langkah 3: Ambil Baris dari Excel Table (*List rows present in a table*)
Tambahkan aksi dari konektor **Excel Online (Business)**:
- **Action:** *List rows present in a table*.
- **Location:** `OneDrive for Business`.
- **Document Library:** `OneDrive`.
- **File:** Pilih berkas workbook unras target.
- **Table:** Pilih `Table_Unras`.
- **Pengaturan Tambahan (Advanced options & Settings):**
  - **Pagination:** Aktifkan (*Toggle ON*), atur Threshold menjadi `5000`.
  - **DateTime Format:** `ISO 8601`.

### Langkah 4: Format Muatan JSON (*Select / Compose Action*)
Tambahkan aksi **Compose** bernama `Payload_Rolling_Sync` dengan isi JSON:
```json
{
  "sync_type": "rolling_7d",
  "timezone": "Asia/Jakarta",
  "period_start": "@{variables('period_start')}",
  "period_end": "@{variables('period_end')}",
  "events": @{outputs('List_rows_present_in_a_table')?['body/value']}
}
```

### Langkah 5: Kirim ke Endpoint SCC via HTTP Action
Tambahkan aksi **HTTP**:
- **Method:** `POST`
- **URI:** `https://<YOUR-VERCEL-DEPLOYMENT>.vercel.app/api/integrations/unras/sync`
- **Headers:**
  - `Content-Type`: `application/json`
  - `Authorization`: `Bearer @{parameters('UNRAS_SYNC_SECRET')}`
- **Body:** `@{outputs('Payload_Rolling_Sync')}`
- **Retry Policy (Pengaturan Aksi HTTP):**
  - Type: `Exponential`
  - Count: `3`
  - Interval: `PT10S` (10 detik)
  - Minimum Interval: `PT5S`
  - Maximum Interval: `PT1M`

### Langkah 6: Notifikasi Hasil Eksekusi (Opsional)
Tambahkan kondisi jika *Status code* HTTP tidak sama dengan 200:
- Kirim pesan peringatan via email/Teams ke tim operasional SCC.

---

## 4. Format Payload Contoh

Berikut contoh muatan JSON yang dikirimkan oleh Power Automate:

```json
{
  "sync_type": "rolling_7d",
  "timezone": "Asia/Jakarta",
  "period_start": "2026-11-06T05:00:00.000Z",
  "period_end": "2026-11-13T05:00:00.000Z",
  "events": [
    {
      "ID KEJADIAN": "UNRAS-2026-JKT-001",
      "KODE_UNRAS": "UR-JKT-01",
      "WAKTU DAN TGL KEJADIAN ISO": "2026-11-12T09:00:00+07:00",
      "TANGGAL": "2026-11-12",
      "WAKTU": "09:00 WIB",
      "LOKASI": "Depan Gedung DPR/MPR RI, Jl. Gatot Subroto",
      "TITIK KUMPUL": "TVRI Senayan & Flyover Ladokgi",
      "SASARAN": "Gedung DPR/MPR RI Pintu Utama",
      "ISU": "Penolakan Revisi RUU Ketenagakerjaan",
      "JUMLAH MASSA": "± 1.200 orang",
      "ORGANISASI": "Koalisi Buruh Bersatu (KBB)",
      "KORLAP": "Bpk. Mulyadi",
      "WILAYAH HUKUM": "Polres Metro Jakarta Pusat",
      "PROVINSI": "DKI Jakarta",
      "KOTA/KABUPATEN": "Jakarta Pusat",
      "LATITUDE": -6.2115,
      "LONGITUDE": 106.8016,
      "STATUS": "ongoing"
    }
  ]
}
```

---

## 5. Ringkasan Respons Endpoint SCC

| HTTP Status | Keterangan | Tindakan Power Automate |
|-------------|------------|-------------------------|
| **200 OK** | Sinkronisasi sukses atau parsial. Log audit tersimpan. | Flow selesai (*Success*). |
| **400 Bad Request** | Format payload tidak sesuai atau jendela > 7 hari. | Periksa konfigurasi expression. |
| **401 Unauthorized** | Token `UNRAS_SYNC_SECRET` salah atau tidak ada. | Cocokkan token dengan environment variable Vercel. |
| **409 Conflict** | Sesi sinkronisasi lain sedang berjalan. | Retry otomatis setelah 30 detik. |
| **500 Internal Error** | Kendala pada database atau koneksi internal server. | Peringatan kegagalan dikirim ke admin. |

