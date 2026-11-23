/**
 * SCC - EAGLE EYES: Unras Domain Helpers & Reference Data
 * Grounded in Excel source 'NEW UNRAS 2022-2026' (Columns C through AC)
 */

import {
  ProtestStatus,
  SourceStatusCategory,
  ProtestEvent,
  ProtestPoint,
  ProtestElement
} from "@/lib/types/protests";

export const BULAN_INDONESIA = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember"
] as const;

export const LIST_KP_KPW = ["KPBI", "KPwDN"] as const;

export const LIST_REGIONAL = [
  "Kantor Pusat",
  "Jawa",
  "Sumatera",
  "KTI",
  "Papua"
] as const;

export const LIST_KATEGORI_ISU = [
  "Ekonomi & Kesejahteraan",
  "Hukum dan Penegakan Hukum",
  "Isu Lokal",
  "Keagamaan",
  "Ketenagakerjaan",
  "Lingkungan & Sumber Daya Alam",
  "Pendidikan",
  "Politik & Pemerintah",
  "Regulasi & Kebijakan",
  "Sosial & Kemanusiaan",
  "BUMN & Energi",
  "Energi & BBM",
  "Hukum & Korupsi",
  "Isu Nasional",
  "Kebijakan Pemerintah",
  "Lingkungan & Pertambangan",
  "Politik & HAM",
  "Politik Luar Negeri",
  "Transportasi dan Pelayanan Publik"
] as const;

export const LIST_DAMPAK = ["Tidak Ada", "Ada"] as const;

export const LIST_REALISASI = [
  "Terealisasi",
  "Audiensi",
  "Dibatalkan",
  "Tidak Terealisasi",
  "Mediasi",
  "Dialihkan"
] as const;

export const SUGGESTED_ALIANSI = [
  "Koalisi Nasional Perempuan Indonesia (KNPRI)",
  "Gabungan Elemen Masyarakat",
  "Aliansi Mahasiswa",
  "Aksi Kamisan Jaringan Solidaritas Korban untuk Keadilan (JSKK)",
  "Aqsa Working Group",
  "BEM Seluruh Indonesia (BEM SI)",
  "Aliansi Buruh",
  "Himpunan Mahasiswa Islam (HMI)",
  "Serikat Mahasiswa Bergerak",
  "FSPMI",
  "Konfederasi Serikat Pekerja Indonesia (KSPI)",
  "Koalisi Rakyat",
  "Aliansi Mahasiswa Anti Korupsi",
  "Pusat Pergerakan Mahasiswa Jakarta",
  "Gerakan Aktivis Mahasiswa",
  "Front Persaudaraan Islam (FPI)",
  "Masyarakat Adat Dayak Nasional"
] as const;

/**
 * Automatically derives Tahun (number) and Bulan (Indonesian string) from Tanggal Kejadian (YYYY-MM-DD).
 */
export function deriveTahunBulan(tanggalStr?: string | null): { tahun: number; bulan: string } {
  if (tanggalStr && typeof tanggalStr === "string") {
    const parts = tanggalStr.trim().split("-");
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
      return {
        tahun: y,
        bulan: BULAN_INDONESIA[m - 1]
      };
    }
  }

  const now = new Date();
  return {
    tahun: now.getFullYear(),
    bulan: BULAN_INDONESIA[now.getMonth()]
  };
}

/**
 * Automatically derives full ISO and normalized time strings in Asia/Jakarta timezone.
 */
export function deriveEventTimestamps(
  tanggalStr: string,
  waktuStr?: string | null
): {
  event_datetime: string;
  isoFix: string;
  waktuNormal: string;
  normalizedTime: string;
  eventDatetimeIso: string;
} {
  const tgl = tanggalStr && /^\d{4}-\d{2}-\d{2}$/.test(tanggalStr)
    ? tanggalStr
    : new Date().toISOString().split("T")[0];

  let rawTime = (waktuStr || "09:00:00").trim().toUpperCase();
  rawTime = rawTime.replace(/\b(WIB|WITA|WIT|UTC|GMT)\b/g, "").trim();

  // Normalize HH:mm or HH.mm to HH:mm:ss
  rawTime = rawTime.replace(".", ":");
  const timeParts = rawTime.split(":");
  let h = parseInt(timeParts[0] || "9", 10);
  let m = parseInt(timeParts[1] || "0", 10);
  let s = parseInt(timeParts[2] || "0", 10);

  if (isNaN(h) || h < 0 || h > 23) h = 9;
  if (isNaN(m) || m < 0 || m > 59) m = 0;
  if (isNaN(s) || s < 0 || s > 59) s = 0;

  const waktuNormal = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const isoFix = `${tgl}T${waktuNormal}`;
  const event_datetime = `${isoFix}+07:00`;

  return {
    event_datetime,
    isoFix,
    waktuNormal,
    normalizedTime: waktuNormal,
    eventDatetimeIso: event_datetime
  };
}

/**
 * Generates unique stable ID KEJADIAN matching Bank Indonesia convention:
 * Either UNRAS-YYYY-PROV-XXXX or KEJ-YYYYMMDD-XXXX
 */
export function generateIdKejadian(arg1?: string | null, arg2?: string | null): string {
  let tanggalStr = "";
  let prov = "";

  if (arg1 && /^\d{4}-\d{2}-\d{2}$/.test(arg1)) {
    tanggalStr = arg1;
    prov = arg2 || "";
  } else if (arg2 && /^\d{4}-\d{2}-\d{2}$/.test(arg2)) {
    tanggalStr = arg2;
    prov = arg1 || "";
  } else {
    tanggalStr = new Date().toISOString().split("T")[0];
    prov = arg1 || "";
  }

  const cleanDate = tanggalStr.replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);

  if (prov && prov.trim()) {
    let provCode = "NAS";
    const p = prov.toLowerCase();
    if (p.includes("jakarta")) provCode = "JKT";
    else if (p.includes("barat") && p.includes("jawa")) provCode = "JBR";
    else if (p.includes("tengah") && p.includes("jawa")) provCode = "JTG";
    else if (p.includes("timur") && p.includes("jawa")) provCode = "JTM";
    else if (p.includes("bali")) provCode = "BLI";
    else if (p.includes("sumatera")) provCode = "SUM";
    else if (p.includes("papua")) provCode = "PAP";
    else {
      provCode = prov.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "REG";
    }
    return `UNRAS-${tanggalStr.slice(0, 4)}-${provCode}-${randomSuffix}`;
  }

  return `KEJ-${cleanDate}-${randomSuffix}`;
}

/**
 * Generates reference kode unras: KODE-YYYY-XXX
 */
export function generateKodeUnras(arg1?: string | null, arg2?: string | null): string {
  const randomNum = Math.floor(100 + Math.random() * 900);
  const year = (arg1 && arg1.length >= 4 && !isNaN(Number(arg1.slice(0, 4))))
    ? arg1.slice(0, 4)
    : (arg2 && arg2.length >= 4 && !isNaN(Number(arg2.slice(0, 4))))
    ? arg2.slice(0, 4)
    : new Date().getFullYear();
  return `KODE-${year}-${randomNum}`;
}

/**
 * Synthesizes official multi-section Redaksi text based on form components A through F
 */
export function synthesizeRedaksiText(params: {
  kategori_kejadian?: string;
  tanggal?: string;
  waktu?: string;
  waktu_mulai?: string;
  lokasiUnras?: string;
  lokasi?: string;
  kota_kabupaten?: string;
  provinsi?: string;
  aliansi?: string;
  organisasi_kelompok?: string;
  jumlahMassa?: number | string | null;
  estimasi_massa_source?: number | string | null;
  tuntutan?: string;
  isu_tuntutan?: string;
  namaPelapor?: string;
  nama_pelapor?: string;
  infoAwal?: string;
  info_awal?: string;
  tindakLanjut?: string;
  tindak_lanjut?: string;
  ringkasanSituasi?: string;
  situation_summary?: string;
  dampak?: string;
  keterangan_dampak?: string;
  progres_asistensi?: string;
  realisasi?: string;
}): string {
  const parts: string[] = [];

  const tanggal = params.tanggal || new Date().toISOString().split("T")[0];
  const aliansi = params.organisasi_kelompok || params.aliansi || "Elemen Masyarakat";
  const lokasi = params.lokasi || params.lokasiUnras || "Lokasi Aksi";
  const wilayah = params.kota_kabupaten ? `${params.kota_kabupaten}, ${params.provinsi || ""}` : params.provinsi || "";
  const massa = params.estimasi_massa_source || params.jumlahMassa;
  const massaStr = massa ? `± ${massa} orang` : "Massa dalam konfirmasi";
  const tuntutan = params.isu_tuntutan || params.tuntutan || "";
  const infoAwal = params.info_awal || params.infoAwal;
  const tindakLanjut = params.tindak_lanjut || params.tindakLanjut;
  const situasi = params.situation_summary || params.ringkasanSituasi;

  parts.push(`LAPORAN AKSI UNJUK RASA (${tanggal})`);
  if (wilayah) parts.push(`Wilayah: ${wilayah}`);

  // A. INFO POTENSI GANGGUAN / INFO AWAL
  parts.push("\nA. INFO POTENSI GANGGUAN");
  parts.push(`* Rencana/Aksi Unjuk Rasa dari: *${aliansi}*`);
  parts.push(`* Lokasi Aksi: *${lokasi}*`);
  parts.push(`* Estimasi Massa: *${massaStr}*`);
  if (tuntutan) parts.push(`* Tuntutan: ${tuntutan}`);
  if (infoAwal && infoAwal.trim()) {
    parts.push(`* Keterangan Info Awal: ${infoAwal.trim()}`);
  }

  // B. MITIGASI RISIKO/TINDAK LANJUT UNRAS
  parts.push("\nB. MITIGASI RISIKO/TINDAK LANJUT UNRAS");
  if (tindakLanjut && tindakLanjut.trim()) {
    parts.push(tindakLanjut.trim());
  } else {
    parts.push("(1). Meningkatkan kewaspadaan serta memperketat seleksi masuk orang dan barang.");
    parts.push("(2). Berkoordinasi dengan seluruh personel pengamanan Pospam untuk tetap siap siaga.");
    parts.push("(3). Melakukan pemantauan aktif melalui jaringan CCTV spasial Command Center.");
  }

  // C. RINGKASAN SITUASI
  parts.push("\nC. RINGKASAN SITUASI");
  if (situasi && situasi.trim()) {
    parts.push(situasi.trim());
  } else {
    const pelapor = params.nama_pelapor || params.namaPelapor ? `dari ${params.nama_pelapor || params.namaPelapor}` : "dari Petugas Operator Lapangan";
    const waktuStr = params.waktu_mulai || params.waktu ? `pukul ${params.waktu_mulai || params.waktu}` : "";
    parts.push(`Berdasarkan informasi yang diperoleh ${pelapor} pada ${tanggal} ${waktuStr}, situasi saat ini dimonitoring secara terpadu.`);
  }

  if (params.dampak) {
    parts.push(`* Dampak Operasional: ${params.dampak}${params.keterangan_dampak ? ` (${params.keterangan_dampak})` : ""}`);
  }
  if (params.realisasi) {
    parts.push(`* Realisasi: ${params.realisasi}`);
  }

  return parts.join("\n");
}

/**
 * Maps raw source status values (e.g. from Excel 'Status Kejadian' or 'status_sumber')
 * to the 3 canonical SCC status categories:
 * - Belum Berlangsung
 * - Sedang Berlangsung
 * - Selesai
 * Returns null if the value is null, undefined, empty, or unrecognized.
 */
export function mapSourceStatus(raw?: unknown): SourceStatusCategory | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;

  // Belum Berlangsung
  if (
    s === "belum berlangsung" ||
    s === "belum" ||
    s === "scheduled" ||
    s === "terjadwal" ||
    s === "rencana" ||
    s === "persiapan" ||
    s.startsWith("belum")
  ) {
    return "Belum Berlangsung";
  }

  // Sedang Berlangsung
  if (
    s === "sedang berlangsung" ||
    s === "sedang" ||
    s === "berlangsung" ||
    s === "ongoing" ||
    s === "aktif" ||
    s === "active" ||
    s.startsWith("sedang")
  ) {
    return "Sedang Berlangsung";
  }

  // Selesai
  if (
    s === "selesai" ||
    s === "completed" ||
    s === "rampung" ||
    s === "bubar" ||
    s === "terkendali" ||
    s === "monitoring" ||
    s.startsWith("selesai")
  ) {
    return "Selesai";
  }

  return null;
}

/**
 * Maps SourceStatusCategory to internal operational ProtestStatus for initial insertion.
 */
export function mapSourceStatusToProtestStatus(category?: SourceStatusCategory | null): ProtestStatus {
  if (category === "Sedang Berlangsung") return "ongoing";
  if (category === "Selesai") return "completed";
  return "scheduled";
}

/**
 * Normalizes operational statuses consistently across casing and legacy aliases.
 * Strictly preserves operational statuses: scheduled, ongoing, monitoring, completed, cancelled.
 * Unknown statuses are preserved as lowercased string without silent coercion.
 */
export function normalizeProtestStatus(rawStatus?: string | null): ProtestStatus {
  if (!rawStatus) return "scheduled";
  const s = String(rawStatus).trim().toLowerCase();
  if (s === "ongoing" || s === "berlangsung" || s === "aktif" || s === "active") return "ongoing";
  if (s === "monitoring" || s === "pemantauan" || s === "pantau" || s === "siaga") return "monitoring";
  if (s === "scheduled" || s === "terjadwal" || s === "rencana" || s === "persiapan") return "scheduled";
  if (s === "completed" || s === "selesai" || s === "rampung" || s === "bubar") return "completed";
  if (s === "cancelled" || s === "batal" || s === "dibatalkan") return "cancelled";
  return s as ProtestStatus;
}

/**
 * Synthesizes a virtual ProtestPoint with mass elements from a legacy/Excel event.
 */
export function synthesizePointsForLegacyEvent(event: ProtestEvent): ProtestPoint[] {
  const rawElements = event.organisasi_kelompok
    ? event.organisasi_kelompok
        .split(/[,;\/\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1)
    : [];

  const pointId = `point-${event.id}-primary`;
  const totalCrowd = event.actual_crowd_size ?? event.estimasi_massa_source ?? 0;
  const normalizedStatus = normalizeProtestStatus(event.status);

  const elements: ProtestElement[] = [];
  if (rawElements.length > 0) {
    const crowdPerElem = Math.round(totalCrowd / rawElements.length);
    for (let i = 0; i < rawElements.length; i++) {
      const elemName = rawElements[i];
      elements.push({
        id: `elem-${event.id}-${i}`,
        point_id: pointId,
        protest_id: event.id,
        name: elemName,
        leader_name: i === 0 ? event.korlap_pimpinan : null,
        status: "active",
        latest_crowd: i === 0 ? (totalCrowd - crowdPerElem * (rawElements.length - 1)) : crowdPerElem,
        previous_crowd: undefined,
        crowd_delta: 0,
        verification_status: event.actual_crowd_size != null ? "verified" : "unverified",
        last_observed_at: event.updated_at || event.created_at,
        created_at: event.created_at,
        updated_at: event.updated_at
      });
    }
  } else {
    elements.push({
      id: `elem-${event.id}-0`,
      point_id: pointId,
      protest_id: event.id,
      name: "Elemen Massa Teridentifikasi",
      leader_name: event.korlap_pimpinan,
      status: "active",
      latest_crowd: totalCrowd,
      previous_crowd: undefined,
      crowd_delta: 0,
      verification_status: event.actual_crowd_size != null ? "verified" : "unverified",
      last_observed_at: event.updated_at || event.created_at,
      created_at: event.created_at,
      updated_at: event.updated_at
    });
  }

  return [
    {
      id: pointId,
      protest_id: event.id,
      point_name: event.lokasi || "Titik Utama",
      location_address: event.lokasi,
      provinsi: event.provinsi,
      kota_kabupaten: event.kota_kabupaten,
      regional: event.regional,
      latitude: event.validated_lat,
      longitude: event.validated_lng,
      status: normalizedStatus,
      urgency: event.urgency || "medium",
      notes: event.situation_summary,
      created_at: event.created_at,
      updated_at: event.updated_at,
      elements,
      current_crowd_total: totalCrowd,
      crowd_trend: "none",
      crowd_change_delta: 0,
      last_observation_at: event.updated_at || event.created_at,
      parent_title: event.isu_tuntutan,
      parent_kode_unras: event.kode_unras,
      parent_id_kejadian: event.id_kejadian,
      parent_tanggal: event.tanggal
    }
  ];
}
