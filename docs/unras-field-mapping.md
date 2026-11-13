# Spesifikasi Pemetaan Kolom Data Unjuk Rasa
## Excel Worksheet 'NEW UNRAS 2022-2026' ke Basis Data SCC - EAGLE EYES

Dokumen ini menyajikan pemetaan komprehensif antara kolom berkas Excel sumber pada OneDrive for Business dengan skema tabel operasional pada platform **SCC - EAGLE EYES**.

---

## 1. Tabel Pemetaan Kolom Excel ke Atribut Basis Data (`protests`)

| Kolom Excel Sumber | Atribut Basis Data (`protests`) | Tipe Data DB | Keterangan & Aturan Transformasi |
|---------------------|---------------------------------|--------------|-----------------------------------|
| `ID KEJADIAN` | `id_kejadian` | `TEXT UNIQUE` | **Identitas Kunci Sumber (Immutable).** Baris tanpa ID KEJADIAN wajib dilewati (*skipped*). |
| `KODE_UNRAS` | `kode_unras` | `TEXT` | Kode register aksi unjuk rasa. Jika kosong, gunakan `id_kejadian`. |
| `WAKTU DAN TGL KEJADIAN ISO` | `event_datetime` | `TIMESTAMPTZ` / `TEXT` | **Cap waktu utama untuk penyaringan jendela rolling 7 hari.** Format standar ISO 8601. |
| `TANGGAL` | `tanggal` | `DATE` / `TEXT` | Tanggal kejadian terformat `YYYY-MM-DD`. Dihasilkan dari parsing tanggal Indonesia/Excel serial number. |
| `WAKTU` | `waktu_mulai` | `TEXT` | Waktu mulai unjuk rasa (misal: `"09:00 WIB"`). |
| `LOKASI` | `lokasi` | `TEXT` | Lokasi spesifik aksi (gedung, jalan, bundaran). Default: `"Lokasi Belum Ditentukan"`. |
| `TITIK KUMPUL` | `titik_kumpul` | `TEXT` | Titik kumpul massa awal sebelum bergerak. |
| `SASARAN` | `sasaran_aksi` | `TEXT` | Sasaran target aksi unras (kantor gubernur, kementerian, dsb). |
| `ISU` | `isu_tuntutan` | `TEXT` | Tuntutan, aspirasi, atau isu yang diusung dalam aksi unjuk rasa. |
| `JUMLAH MASSA` | `estimasi_massa_source` | `INTEGER` | Estimasi jumlah massa intelijen. Teks non-angka dinormalisasi (misal: `"± 1.200 orang"` $\rightarrow$ `1200`). |
| `ORGANISASI` | `organisasi_kelompok` | `TEXT` | Nama aliansi, serikat pekerja, ormas, atau BEM penyelenggara aksi. |
| `KORLAP` | `korlap_pimpinan` | `TEXT` | Nama koordinator lapangan, penanggung jawab, atau nomor kontak. |
| `WILAYAH HUKUM` | `wilayah_hukum` | `TEXT` | Yurisdiksi kepolisian pengamanan (Polda / Polres Metro). |
| `PROVINSI` | `provinsi` | `TEXT` | Nama provinsi. Default: `"DKI Jakarta"`. |
| `KOTA/KABUPATEN` | `kota_kabupaten` | `TEXT` | Nama kota atau kabupaten tempat kejadian perkara. |
| `LATITUDE` | `validated_lat` *(hanya saat insert awal)* | `NUMERIC(10,6)` | Koordinat lintang jika valid di batas wilayah Indonesia. |
| `LONGITUDE` | `validated_lng` *(hanya saat insert awal)* | `NUMERIC(10,6)` | Koordinat bujur jika valid di batas wilayah Indonesia. |
| `KETERANGAN` | `keterangan_source` | `TEXT` | Catatan intelijen atau informasi pendukung dari berkas sumber. |
| *(Seluruh Baris JSON)* | `raw_source_payload` | `JSONB` / `TEXT` | Arsip lengkap baris Excel asli dalam format JSON terenkapsulasi. |

---

## 2. Spesifikasi Format Cap Waktu ISO (`WAKTU DAN TGL KEJADIAN ISO`)

Kolom ini merupakan **acuan tunggal** untuk penentuan inklusi jendela rolling 7 hari:
- **Format yang Diterima:**
  - `2026-11-13T09:00:00+07:00` (ISO 8601 dengan offset zona waktu WIB)
  - `2026-11-13T02:00:00.000Z` (ISO 8601 UTC)
  - `2026-11-13 09:00:00` (Parsed dengan asumsi WIB)
- **Larangan Keras:**
  - DILARANG menggunakan waktu perubahan file (*file modification time*) atau waktu update rekaman (*record update time*) sebagai pengganti waktu kejadian.
  - DILARANG mereka-reka timestamp jika kolom kosong dan tidak dapat diuraikan secara bersih dari kolom `TANGGAL`.
  - Jika timestamp tidak valid, baris **wajib dilewati** (*skipped*) dan dicatat dalam rincian error log audit.

---

## 3. Bidang yang Dilindungi Secara Absolut (*Operator-Preserved Fields*)

Untuk menjamin kelancaran operasional pusat komando, sinkronisasi ulang (*re-sync*) dari Excel **TIDAK AKAN PERNAH MENIMPA (OVERWRITE)** data berikut pada rekaman yang sudah ada:

| Bidang Terproteksi | Kolom Basis Data | Alasan Proteksi |
|--------------------|-------------------|-----------------|
| **Catatan Lapangan & Ringkasan Situasi** | `situation_summary` | Diinput oleh operator lapangan / petugas monitor SCC berdasarkan pantauan live CCTV. |
| **Status Operasional** | `status` | Diatur oleh operator (`scheduled`, `ongoing`, `monitoring`, `completed`, `cancelled`). |
| **Estimasi Riil Massa Lapangan** | `actual_crowd_size` | Dihitung secara objektif oleh operator komando melalui kamera CCTV, bukan estimasi klaim awal selebaran. |
| **Draf Editorial Berita** | `editorial_draft` | Draf narasi siaran pers / laporan komando yang ditulis analis SCC. |
| **Editorial Berita Final** | `editorial_final` | Rilis resmi yang telah disetujui pimpinan komando. |
| **Titik Koordinat GPS Tervalidasi** | `validated_lat`, `validated_lng` | Titik pasti yang telah digeser atau dipasangkan tepat di peta oleh operator. |
| **Penautan Kamera CCTV Spasial** | `protest_camera_links` | Relasi kamera CCTV yang ditautkan ke perimeter unjuk rasa beserta jarak meter. |
| **Berkas Lampiran Foto/Video** | `protest_attachments` | Dokumentasi tangkapan layar CCTV atau bukti foto lapangan yang diunggah. |
| **Riwayat Perubahan Status** | `protest_status_history` | Jejak audit kepatuhan waktu penanganan dan nama petugas. |

