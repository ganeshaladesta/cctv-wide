"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import {
  X,
  Plus,
  AlertTriangle,
  MapPin,
  Calendar,
  Clock,
  Users,
  Shield,
  Building,
  FileText,
  CheckCircle2,
  Sparkles,
  Info,
  Layers,
  ChevronRight,
  Save,
  Compass
} from "lucide-react";
import { ProtestEvent, ProtestStatus, ProtestUrgency } from "@/lib/types/protests";
import {
  LIST_KP_KPW,
  LIST_REGIONAL,
  LIST_KATEGORI_ISU,
  LIST_DAMPAK,
  LIST_REALISASI,
  SUGGESTED_ALIANSI,
  deriveTahunBulan,
  synthesizeRedaksiText,
  generateIdKejadian
} from "@/lib/unras-helpers";
import {
  GROUNDED_KP_KPW,
  getHierarchyRegionals,
  getHierarchyProvinces,
  getHierarchyLocations
} from "@/lib/master-data-hierarchy";
import {
  PROVINCES,
  getProvincesByRegional,
  getCitiesByProvince,
  findRegionalByProvince
} from "@/lib/geo-reference";

const ProtestLocationPicker = dynamic(
  () => import("./protest-location-picker").then((mod) => mod.ProtestLocationPicker),
  { ssr: false }
);

export interface ProtestFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  initialData?: Partial<ProtestEvent> | null;
  onSaved: (event: ProtestEvent) => void;
  currentUser?: { id?: string; name?: string; role?: string };
}

export function ProtestFormModal({
  isOpen,
  onClose,
  mode,
  initialData,
  onSaved,
  currentUser
}: ProtestFormModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Default reporter name
  const defaultReporterName = currentUser?.name || "Petugas Operator SCC";

  // Form State
  const [formData, setFormData] = useState({
    // Section A: Identitas
    kategori_kejadian: "Unjuk Rasa",
    tanggal: new Date().toISOString().split("T")[0],
    id_kejadian: "",
    urutan_bulan: "",

    // Section B: Wilayah
    kp_kpw: "KPBI",
    regional: "Kantor Pusat",
    provinsi: "DKI Jakarta",
    kota_kabupaten: "LUAR KOPERBI",

    // Section C: Waktu & Lokasi
    waktu_mulai: "09:00 WIB",
    waktu_selesai: "",
    lokasi: "",
    titik_kumpul: "",
    sasaran_aksi: "",
    wilayah_hukum: "Polres Metro Jakarta Pusat",
    validated_lat: "",
    validated_lng: "",
    location_validation_status: "unmapped",

    // Section D: Massa & Tuntutan
    organisasi_kelompok: "",
    korlap_pimpinan: "",
    estimasi_massa_source: "",
    isu_tuntutan: "",

    // Section E: Kategori & Dampak
    kategori_isu: "Ketenagakerjaan & Perburuhan",
    dampak: "Tidak Ada",
    keterangan_dampak: "",

    // Section F: Pelaporan & Informasi
    nama_pelapor: defaultReporterName,
    info_awal: "",
    tindak_lanjut: "",
    situation_summary: "",
    redaksi: "",

    // Section G: Progres & Realisasi
    progres_asistensi: "",
    status: "scheduled" as ProtestStatus,
    urgency: "medium" as ProtestUrgency,
    realisasi: "Terealisasi"
  });

  const [showCustomLocationInput, setShowCustomLocationInput] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Initialize or reset form on open / initialData change
  useEffect(() => {
    if (!isOpen) return;
    setShowCustomLocationInput(false);

    if (mode === "edit" && initialData) {
      const p = initialData;
      setFormData({
        kategori_kejadian: p.kategori_kejadian || "Unjuk Rasa",
        tanggal: p.tanggal || new Date().toISOString().split("T")[0],
        id_kejadian: p.id_kejadian || "",
        urutan_bulan: p.urutan_bulan ? String(p.urutan_bulan) : "",
        kp_kpw: p.kp_kpw || (p.provinsi === "DKI Jakarta" ? "KPBI" : "KPwDN"),
        regional: p.regional || findRegionalByProvince(p.provinsi || ""),
        provinsi: p.provinsi || "DKI Jakarta",
        kota_kabupaten: p.kota_kabupaten || (p.kp_kpw === "KPBI" ? "LUAR KOPERBI" : ""),
        waktu_mulai: p.waktu_mulai || "09:00 WIB",
        waktu_selesai: p.waktu_selesai || "",
        lokasi: p.lokasi || "",
        titik_kumpul: p.titik_kumpul || "",
        sasaran_aksi: p.sasaran_aksi || "",
        wilayah_hukum: p.wilayah_hukum || "",
        validated_lat: p.validated_lat !== null && p.validated_lat !== undefined ? String(p.validated_lat) : "",
        validated_lng: p.validated_lng !== null && p.validated_lng !== undefined ? String(p.validated_lng) : "",
        location_validation_status: p.location_validation_status || (p.validated_lat ? "verified" : "unmapped"),
        organisasi_kelompok: p.organisasi_kelompok || "",
        korlap_pimpinan: p.korlap_pimpinan || "",
        estimasi_massa_source: p.estimasi_massa_source !== null && p.estimasi_massa_source !== undefined ? String(p.estimasi_massa_source) : "",
        isu_tuntutan: p.isu_tuntutan || "",
        kategori_isu: p.kategori_isu || "Ketenagakerjaan & Perburuhan",
        dampak: p.dampak || "Tidak Ada",
        keterangan_dampak: p.keterangan_dampak || "",
        nama_pelapor: p.nama_pelapor || defaultReporterName,
        info_awal: p.info_awal || "",
        tindak_lanjut: p.tindak_lanjut || "",
        situation_summary: p.situation_summary || "",
        redaksi: p.editorial_final || p.editorial_draft || "",
        progres_asistensi: p.progres_asistensi || "",
        status: p.status || "scheduled",
        urgency: p.urgency || "medium",
        realisasi: p.realisasi || "Terealisasi"
      });
      setIsDirty(false);
    } else if (mode === "create") {
      const today = new Date().toISOString().split("T")[0];
      setFormData({
        kategori_kejadian: "Unjuk Rasa",
        tanggal: today,
        id_kejadian: generateIdKejadian("DKI Jakarta", today),
        urutan_bulan: "",
        kp_kpw: "KPBI",
        regional: "Kantor Pusat",
        provinsi: "DKI Jakarta",
        kota_kabupaten: "LUAR KOPERBI",
        waktu_mulai: "09:00 WIB",
        waktu_selesai: "",
        lokasi: "",
        titik_kumpul: "",
        sasaran_aksi: "",
        wilayah_hukum: "Polres Metro Jakarta Pusat",
        validated_lat: "",
        validated_lng: "",
        location_validation_status: "unmapped",
        organisasi_kelompok: "",
        korlap_pimpinan: "",
        estimasi_massa_source: "",
        isu_tuntutan: "",
        kategori_isu: "Ketenagakerjaan & Perburuhan",
        dampak: "Tidak Ada",
        keterangan_dampak: "",
        nama_pelapor: defaultReporterName,
        info_awal: "",
        tindak_lanjut: "",
        situation_summary: "",
        redaksi: "",
        progres_asistensi: "",
        status: "scheduled",
        urgency: "medium",
        realisasi: "Terealisasi"
      });
      setIsDirty(false);
    }
  }, [isOpen, mode, initialData, defaultReporterName]);

  // Derived Tahun and Bulan
  const derivedTahunBulan = useMemo(() => {
    return deriveTahunBulan(formData.tanggal);
  }, [formData.tanggal]);

  // Cascading dropdown options based on grounded master data
  const availableRegionals = useMemo(() => {
    return getHierarchyRegionals(formData.kp_kpw);
  }, [formData.kp_kpw]);

  const availableProvinces = useMemo(() => {
    return getHierarchyProvinces(formData.regional, formData.kp_kpw);
  }, [formData.regional, formData.kp_kpw]);

  const availableLocations = useMemo(() => {
    return getHierarchyLocations(formData.provinsi, formData.regional, formData.kp_kpw);
  }, [formData.provinsi, formData.regional, formData.kp_kpw]);

  // Handler for form field change with cascading reset
  const handleChange = (field: string, value: any) => {
    setIsDirty(true);
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };

      // 1. When KP/KPw changes: reset Regional, Provinsi, Lokasi
      if (field === "kp_kpw") {
        if (value !== prev.kp_kpw) {
          setShowCustomLocationInput(false);
          if (value === "KPBI") {
            updated.regional = "Kantor Pusat";
            updated.provinsi = "DKI Jakarta";
            updated.kota_kabupaten = "LUAR KOPERBI";
            updated.wilayah_hukum = "Polres Metro Jakarta Pusat";
          } else if (value === "KPwDN") {
            updated.regional = "";
            updated.provinsi = "";
            updated.kota_kabupaten = "";
            updated.wilayah_hukum = "";
          } else {
            updated.regional = "";
            updated.provinsi = "";
            updated.kota_kabupaten = "";
          }
        }
      }

      // 2. When Regional changes: reset Provinsi and Lokasi
      if (field === "regional") {
        if (value !== prev.regional) {
          setShowCustomLocationInput(false);
          updated.provinsi = "";
          updated.kota_kabupaten = "";
        }
      }

      // 3. When Provinsi changes: reset Lokasi and recalculate ID Kejadian
      if (field === "provinsi") {
        if (value !== prev.provinsi) {
          setShowCustomLocationInput(false);
          updated.kota_kabupaten = "";
        }
        if (value && mode === "create") {
          updated.id_kejadian = generateIdKejadian(value, prev.tanggal);
        }
      }

      // 4. When Tanggal changes in create mode
      if (field === "tanggal" && mode === "create") {
        updated.id_kejadian = generateIdKejadian(prev.provinsi || "DKI Jakarta", value);
      }

      return updated;
    });
  };

  // Redaksi Synthesizer Button Handler
  const handleGenerateRedaksi = () => {
    if (formData.redaksi.trim() && !window.confirm("Gantikan teks redaksi yang ada dengan sintesis otomatis baru?")) {
      return;
    }
    const synthesized = synthesizeRedaksiText({
      kategori_kejadian: formData.kategori_kejadian,
      tanggal: formData.tanggal,
      waktu_mulai: formData.waktu_mulai,
      lokasi: formData.lokasi,
      kota_kabupaten: formData.kota_kabupaten,
      provinsi: formData.provinsi,
      organisasi_kelompok: formData.organisasi_kelompok,
      estimasi_massa_source: formData.estimasi_massa_source ? Number(formData.estimasi_massa_source) : null,
      isu_tuntutan: formData.isu_tuntutan,
      dampak: formData.dampak,
      keterangan_dampak: formData.keterangan_dampak,
      info_awal: formData.info_awal,
      tindak_lanjut: formData.tindak_lanjut,
      situation_summary: formData.situation_summary,
      progres_asistensi: formData.progres_asistensi,
      realisasi: formData.realisasi
    });
    handleChange("redaksi", synthesized);
  };

  // Safe Close Handler with Discard Check
  const handleAttemptClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  // Submission Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.tanggal) {
      setError("Tanggal kejadian wajib diisi.");
      return;
    }
    if (!formData.lokasi.trim()) {
      setError("Lokasi aksi unjuk rasa (Gedung/Jalan) wajib diisi.");
      return;
    }
    if (!formData.isu_tuntutan.trim()) {
      setError("Tuntutan / Isu aksi wajib diisi.");
      return;
    }

    if (formData.estimasi_massa_source) {
      const m = Number(formData.estimasi_massa_source);
      if (isNaN(m) || m < 0) {
        setError("Jumlah massa harus berupa bilangan angka 0 atau lebih.");
        return;
      }
    }

    setLoading(true);

    try {
      const payload: Record<string, any> = {
        kategori_kejadian: formData.kategori_kejadian,
        tanggal: formData.tanggal,
        urutan_bulan: formData.urutan_bulan ? Number(formData.urutan_bulan) : null,
        kp_kpw: formData.kp_kpw,
        regional: formData.regional,
        provinsi: formData.provinsi,
        kota_kabupaten: formData.kota_kabupaten,
        waktu_mulai: formData.waktu_mulai,
        waktu_selesai: formData.waktu_selesai || null,
        lokasi: formData.lokasi.trim(),
        titik_kumpul: formData.titik_kumpul.trim() || null,
        sasaran_aksi: formData.sasaran_aksi.trim() || null,
        wilayah_hukum: formData.wilayah_hukum.trim() || null,
        validated_lat: formData.validated_lat ? parseFloat(formData.validated_lat) : null,
        validated_lng: formData.validated_lng ? parseFloat(formData.validated_lng) : null,
        location_validation_status: formData.validated_lat && formData.validated_lng ? "verified" : "unmapped",
        organisasi_kelompok: formData.organisasi_kelompok.trim() || null,
        korlap_pimpinan: formData.korlap_pimpinan.trim() || null,
        estimasi_massa_source: formData.estimasi_massa_source ? parseInt(formData.estimasi_massa_source, 10) : null,
        isu_tuntutan: formData.isu_tuntutan.trim(),
        kategori_isu: formData.kategori_isu,
        dampak: formData.dampak,
        keterangan_dampak: formData.keterangan_dampak.trim() || null,
        nama_pelapor: formData.nama_pelapor.trim() || defaultReporterName,
        info_awal: formData.info_awal.trim() || null,
        tindak_lanjut: formData.tindak_lanjut.trim() || null,
        situation_summary: formData.situation_summary.trim() || null,
        editorial_draft: formData.redaksi.trim() || null,
        progres_asistensi: formData.progres_asistensi.trim() || null,
        status: formData.status,
        urgency: formData.urgency,
        realisasi: formData.realisasi
      };

      let res: Response;
      if (mode === "create") {
        payload.id_kejadian = formData.id_kejadian || generateIdKejadian(formData.provinsi, formData.tanggal);
        res = await fetch("/api/protests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-scc-user-role": currentUser?.role || "operator"
          },
          body: JSON.stringify(payload)
        });
      } else {
        if (!initialData?.id) throw new Error("ID rekaman tidak ditemukan untuk mode edit.");
        res = await fetch(`/api/protests/${initialData.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-scc-user-role": currentUser?.role || "operator"
          },
          body: JSON.stringify(payload)
        });
      }

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Gagal menyimpan data aksi unjuk rasa ke Supabase.");
      }

      setIsDirty(false);
      onSaved(json.data);

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("scc-protest-updated"));
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat memproses data.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !mounted || typeof document === "undefined") return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unras-form-title"
    >
      <div
        className="relative w-full max-w-4xl bg-[#0B0F17] border border-[var(--border-default)] rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] bg-[#101623] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              {mode === "create" ? <Plus className="w-5 h-5" /> : <Save className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="unras-form-title" className="text-base font-bold text-white tracking-wide">
                  {mode === "create" ? "Form Input Unjuk Rasa (Excel C:AC)" : "Edit Data Unjuk Rasa"}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {mode === "create" ? "ENTRI BARU" : "MODE EDIT"}
                </span>
              </div>
              <p className="text-xs text-[#98A4B8]">
                Entri resmi terstandardisasi sesuai struktur database Excel C:AC & SCC EAGLE EYES
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAttemptClose}
            className="p-2 rounded-xl text-[#98A4B8] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Tutup Form"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Body - Scrollable Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* SECTION A: IDENTITAS KEJADIAN */}
          <div className="p-4 rounded-xl bg-[#121826] border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                <FileText className="w-4 h-4" />
                <span>Bagian A: Identitas Kejadian</span>
              </div>
              <span className="text-[10px] text-[#64748B]">Kolom C s/d E</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Kategori Kejadian
                </label>
                <input
                  type="text"
                  value={formData.kategori_kejadian}
                  onChange={(e) => handleChange("kategori_kejadian", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  placeholder="Unjuk Rasa"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Tanggal Kejadian <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.tanggal}
                  onChange={(e) => handleChange("tanggal", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Tahun & Bulan (Otomatis)
                </label>
                <div className="h-[38px] px-3 bg-[#0D121B] border border-[var(--border-subtle)] rounded-xl flex items-center gap-2 text-xs text-emerald-400 font-mono">
                  <span>{derivedTahunBulan.tahun}</span>
                  <span className="text-[#64748B]">/</span>
                  <span>{derivedTahunBulan.bulan}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  ID Kejadian
                </label>
                <div className="h-[38px] px-3 bg-[#0D121B] border border-[var(--border-subtle)] rounded-xl flex items-center text-xs text-blue-300 font-mono truncate" title={formData.id_kejadian}>
                  {formData.id_kejadian || "Otomatis dihitung"}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION B: WILAYAH KEJADIAN (DROPDOWN BERTINGKAT HIERARKIS) */}
          <div className="p-4 rounded-xl bg-[#121826] border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                <Building className="w-4 h-4" />
                <span>Bagian B: Wilayah Kejadian (Hierarki Master Data)</span>
              </div>
              <span className="text-[10px] text-[#64748B]">Kolom F s/d I • 4 Tingkat Bertingkat</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* 1. KP / KPw */}
              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1 flex items-center justify-between">
                  <span>KP / KPw <span className="text-red-400">*</span></span>
                  <span className="text-[10px] text-blue-400/80 font-mono">Tingkat 1</span>
                </label>
                <select
                  value={formData.kp_kpw}
                  onChange={(e) => handleChange("kp_kpw", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="">-- Pilih KP / KPw --</option>
                  <option value="KPBI">KPBI (Kantor Pusat)</option>
                  <option value="KPwDN">KPwDN (Kantor Perwakilan Dalam Negeri)</option>
                </select>
              </div>

              {/* 2. Regional */}
              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1 flex items-center justify-between">
                  <span>Regional <span className="text-red-400">*</span></span>
                  <span className="text-[10px] text-blue-400/80 font-mono">Tingkat 2</span>
                </label>
                <select
                  disabled={!formData.kp_kpw}
                  value={formData.regional}
                  onChange={(e) => handleChange("regional", e.target.value)}
                  className={`w-full bg-[#182132] border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 ${
                    !formData.kp_kpw
                      ? "opacity-50 cursor-not-allowed border-white/5 bg-[#0e131d]"
                      : "border-[var(--border-default)] cursor-pointer"
                  }`}
                >
                  <option value="">
                    {!formData.kp_kpw ? "-- Pilih KP/KPw Dulu --" : "-- Pilih Regional --"}
                  </option>
                  {availableRegionals.map((reg) => (
                    <option key={reg} value={reg}>
                      {reg}
                    </option>
                  ))}
                  {formData.regional && !availableRegionals.includes(formData.regional) && (
                    <option value={formData.regional}>
                      {formData.regional} (Non-standar)
                    </option>
                  )}
                </select>
              </div>

              {/* 3. Provinsi */}
              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1 flex items-center justify-between">
                  <span>Provinsi <span className="text-red-400">*</span></span>
                  <span className="text-[10px] text-blue-400/80 font-mono">Tingkat 3</span>
                </label>
                <select
                  disabled={!formData.regional}
                  value={formData.provinsi}
                  onChange={(e) => handleChange("provinsi", e.target.value)}
                  className={`w-full bg-[#182132] border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 ${
                    !formData.regional
                      ? "opacity-50 cursor-not-allowed border-white/5 bg-[#0e131d]"
                      : "border-[var(--border-default)] cursor-pointer"
                  }`}
                >
                  <option value="">
                    {!formData.regional ? "-- Pilih Regional Dulu --" : "-- Pilih Provinsi --"}
                  </option>
                  {availableProvinces.map((prov) => (
                    <option key={prov} value={prov}>
                      {prov}
                    </option>
                  ))}
                  {formData.provinsi && !availableProvinces.includes(formData.provinsi) && (
                    <option value={formData.provinsi}>
                      {formData.provinsi} (Non-standar)
                    </option>
                  )}
                </select>
              </div>

              {/* 4. Lokasi */}
              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1 flex items-center justify-between">
                  <span>Lokasi (Satker/Kota) <span className="text-red-400">*</span></span>
                  <span className="text-[10px] text-blue-400/80 font-mono">Tingkat 4</span>
                </label>
                <select
                  disabled={!formData.provinsi}
                  value={showCustomLocationInput ? "__CUSTOM__" : formData.kota_kabupaten || ""}
                  onChange={(e) => {
                    if (e.target.value === "__CUSTOM__") {
                      setShowCustomLocationInput(true);
                    } else {
                      setShowCustomLocationInput(false);
                      handleChange("kota_kabupaten", e.target.value);
                    }
                  }}
                  className={`w-full bg-[#182132] border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 ${
                    !formData.provinsi
                      ? "opacity-50 cursor-not-allowed border-white/5 bg-[#0e131d]"
                      : "border-[var(--border-default)] cursor-pointer"
                  }`}
                >
                  <option value="">
                    {!formData.provinsi ? "-- Pilih Provinsi Dulu --" : "-- Pilih Lokasi --"}
                  </option>
                  {availableLocations.map((lok) => (
                    <option key={lok} value={lok}>
                      {lok}
                    </option>
                  ))}
                  {formData.kota_kabupaten && !availableLocations.includes(formData.kota_kabupaten) && !showCustomLocationInput && (
                    <option value={formData.kota_kabupaten}>
                      {formData.kota_kabupaten} (Non-standar)
                    </option>
                  )}
                  <option value="__CUSTOM__">+ Input Manual Lokasi Khusus...</option>
                </select>

                {showCustomLocationInput && (
                  <div className="mt-2">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Ketik nama lokasi..."
                      value={formData.kota_kabupaten}
                      onChange={(e) => handleChange("kota_kabupaten", e.target.value)}
                      className="w-full bg-[#0D121B] border border-blue-500/50 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION C: WAKTU DAN LOKASI AKSI */}
          <div className="p-4 rounded-xl bg-[#121826] border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                <MapPin className="w-4 h-4" />
                <span>Bagian C: Waktu & Lokasi Aksi</span>
              </div>
              <span className="text-[10px] text-[#64748B]">Kolom K s/d P + Geocoding Leaflet</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Waktu Mulai <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="09:00 WIB"
                  value={formData.waktu_mulai}
                  onChange={(e) => handleChange("waktu_mulai", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Lokasi Unras (Gedung / Jalan / Tempat) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Gedung DPR/MPR RI, Jl. Gatot Subroto"
                  value={formData.lokasi}
                  onChange={(e) => handleChange("lokasi", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Titik Kumpul (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Depan TVRI & Pintu Masuk GBK"
                  value={formData.titik_kumpul}
                  onChange={(e) => handleChange("titik_kumpul", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Sasaran Aksi (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Gedung Nusantara I DPR RI"
                  value={formData.sasaran_aksi}
                  onChange={(e) => handleChange("sasaran_aksi", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Map Location Picker Card */}
            <div className="p-3 bg-[#0D121B] rounded-xl border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  formData.validated_lat && formData.validated_lng
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                }`}>
                  <Compass className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">Koordinat Peta Geospasial</span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                      formData.validated_lat && formData.validated_lng
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    }`}>
                      {formData.validated_lat && formData.validated_lng ? "Terverifikasi" : "Belum Dipetakan"}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#98A4B8] truncate mt-0.5">
                    {formData.validated_lat && formData.validated_lng
                      ? `Lat: ${formData.validated_lat}, Lng: ${formData.validated_lng}`
                      : "Klik tombol di samping untuk menentukan pin lokasi pada peta Leaflet"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {formData.validated_lat && (
                  <button
                    type="button"
                    onClick={() => {
                      handleChange("validated_lat", "");
                      handleChange("validated_lng", "");
                      handleChange("location_validation_status", "unmapped");
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#98A4B8] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    Reset Pin
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsPickerOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600/20 text-blue-300 border border-blue-500/40 hover:bg-blue-600 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{formData.validated_lat ? "Ubah Titik di Peta" : "Pilih Titik di Peta"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* SECTION D: INFORMASI MASSA DAN TUNTUTAN */}
          <div className="p-4 rounded-xl bg-[#121826] border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                <Users className="w-4 h-4" />
                <span>Bagian D: Informasi Massa & Tuntutan</span>
              </div>
              <span className="text-[10px] text-[#64748B]">Kolom O, Q, R</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Aliansi / Elemen Massa <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  list="aliansi-suggestions"
                  required
                  placeholder="Contoh: KSPSI, BEM Seluruh Indonesia, Aliansi Buruh Menggugat"
                  value={formData.organisasi_kelompok}
                  onChange={(e) => handleChange("organisasi_kelompok", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <datalist id="aliansi-suggestions">
                  {SUGGESTED_ALIANSI.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>

                {/* Quick Selection Pills */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-[#64748B]">Saran cepat:</span>
                  {SUGGESTED_ALIANSI.slice(0, 5).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleChange("organisasi_kelompok", item)}
                      className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 hover:bg-white/10 text-[#98A4B8] hover:text-white transition-colors cursor-pointer"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Jumlah Massa (Orang)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Contoh: 500"
                  value={formData.estimasi_massa_source}
                  onChange={(e) => handleChange("estimasi_massa_source", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                Tuntutan / Isu Aksi <span className="text-red-400">*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="Rincian tuntutan yang disuarakan oleh massa aksi..."
                value={formData.isu_tuntutan}
                onChange={(e) => handleChange("isu_tuntutan", e.target.value)}
                className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* SECTION E: KATEGORI DAN DAMPAK */}
          <div className="p-4 rounded-xl bg-[#121826] border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4" />
                <span>Bagian E: Kategori & Dampak</span>
              </div>
              <span className="text-[10px] text-[#64748B]">Kolom S, T, U</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Kategori Isu
                </label>
                <select
                  value={formData.kategori_isu}
                  onChange={(e) => handleChange("kategori_isu", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {LIST_KATEGORI_ISU.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Dampak Operasional
                </label>
                <select
                  value={formData.dampak}
                  onChange={(e) => handleChange("dampak", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {LIST_DAMPAK.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                Keterangan Dampak (Bila ada penutupan jalan / kepadatan lalu lintas)
              </label>
              <textarea
                rows={2}
                placeholder="Deskripsi dampak terhadap lalu lintas, layanan publik, atau keamanan sekitar..."
                value={formData.keterangan_dampak}
                onChange={(e) => handleChange("keterangan_dampak", e.target.value)}
                className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* SECTION F: PELAPORAN DAN INFORMASI */}
          <div className="p-4 rounded-xl bg-[#121826] border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                <Shield className="w-4 h-4" />
                <span>Bagian F: Pelaporan & Informasi</span>
              </div>
              <span className="text-[10px] text-[#64748B]">Kolom V s/d Z (A + B + C = Redaksi)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Nama Pelapor
                </label>
                <input
                  type="text"
                  value={formData.nama_pelapor}
                  onChange={(e) => handleChange("nama_pelapor", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Wilayah Hukum (Polres / Polsek)
                </label>
                <input
                  type="text"
                  value={formData.wilayah_hukum}
                  onChange={(e) => handleChange("wilayah_hukum", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Info Awal Unras (Section A)
                </label>
                <textarea
                  rows={2}
                  placeholder="Informasi awal intelejen atau pantauan sosial media..."
                  value={formData.info_awal}
                  onChange={(e) => handleChange("info_awal", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Tindak Lanjut KPBI (Section B)
                </label>
                <textarea
                  rows={2}
                  placeholder="Koordinasi dengan aparat kepolisian atau pengamanan internal..."
                  value={formData.tindak_lanjut}
                  onChange={(e) => handleChange("tindak_lanjut", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                Ringkasan Situasi Terkini (Section C)
              </label>
              <textarea
                rows={2}
                placeholder="Kondisi di lapangan saat ini, eskalasi, kelancaran orasi..."
                value={formData.situation_summary}
                onChange={(e) => handleChange("situation_summary", e.target.value)}
                className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-[#98A4B8]">
                  Sintesis Redaksi Resmi (Kolom Z)
                </label>
                <button
                  type="button"
                  onClick={handleGenerateRedaksi}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>⚡ Buat Sintesis Redaksi Otomatis</span>
                </button>
              </div>
              <textarea
                rows={4}
                placeholder="Redaksi resmi sintesis laporan kejadian unjuk rasa (A + B + C)..."
                value={formData.redaksi}
                onChange={(e) => handleChange("redaksi", e.target.value)}
                className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          {/* SECTION G: PROGRES DAN REALISASI */}
          <div className="p-4 rounded-xl bg-[#121826] border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                <Layers className="w-4 h-4" />
                <span>Bagian G: Progres & Realisasi</span>
              </div>
              <span className="text-[10px] text-[#64748B]">Kolom AA s/d AC</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Status Kejadian <span className="text-red-400">*</span>
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => handleChange("status", e.target.value as ProtestStatus)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer font-bold"
                >
                  <option value="scheduled">SCHEDULED (Terjadwal)</option>
                  <option value="ongoing">ONGOING (Sedang Berlangsung)</option>
                  <option value="monitoring">MONITORING (Pemantauan Khusus)</option>
                  <option value="completed">COMPLETED (Selesai & Arsip)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Tingkat Urgensi
                </label>
                <select
                  value={formData.urgency}
                  onChange={(e) => handleChange("urgency", e.target.value as ProtestUrgency)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="low">Low (Rendah)</option>
                  <option value="medium">Medium (Sedang)</option>
                  <option value="high">High (Tinggi)</option>
                  <option value="critical">Critical (Kritis)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                  Realisasi Aksi
                </label>
                <select
                  value={formData.realisasi}
                  onChange={(e) => handleChange("realisasi", e.target.value)}
                  className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {LIST_REALISASI.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#98A4B8] mb-1">
                Progres Asistensi (Kolom AA)
              </label>
              <textarea
                rows={2}
                placeholder="Rincian progres asistensi pengamanan, eskalasi aparat, atau audiensi perwakilan..."
                value={formData.progres_asistensi}
                onChange={(e) => handleChange("progres_asistensi", e.target.value)}
                className="w-full bg-[#182132] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Form Actions Footer inside scrollable area or fixed */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 text-xs text-[#64748B]">
              <Info className="w-3.5 h-3.5" />
              <span>Data tersimpan langsung ke Supabase & direfleksikan di peta utama SCC</span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleAttemptClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#98A4B8] hover:text-white bg-[#141A28] border border-[var(--border-subtle)] hover:bg-white/5 transition-colors cursor-pointer"
              >
                Batal
              </button>

              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <span>Menyimpan...</span>
                ) : mode === "create" ? (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Simpan Aksi Unjuk Rasa</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Perbarui Data Unras</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Discard Confirmation Dialog */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[100001] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#141A28] border border-[var(--border-default)] rounded-2xl p-5 max-w-sm w-full space-y-3 shadow-2xl">
            <h3 className="text-sm font-bold text-white">Batalkan Perubahan?</h3>
            <p className="text-xs text-[#98A4B8]">
              Perubahan pada form belum disimpan. Apakah Anda yakin ingin menutup form ini?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#98A4B8] hover:text-white bg-white/5 cursor-pointer"
              >
                Lanjutkan Mengisi
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  setIsDirty(false);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white cursor-pointer"
              >
                Buang Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Map Picker Modal Portaled directly to document.body */}
      {isPickerOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[100002] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPickerOpen(false);
          }}
        >
          <div
            className="relative w-full max-w-4xl lg:max-w-5xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <ProtestLocationPicker
              initialLat={formData.validated_lat ? parseFloat(formData.validated_lat) : null}
              initialLng={formData.validated_lng ? parseFloat(formData.validated_lng) : null}
              initialLocationName={formData.lokasi}
              city={formData.kota_kabupaten}
              province={formData.provinsi}
              compact={false}
              onSelectLocation={(pickedLat, pickedLng, label) => {
                handleChange("validated_lat", pickedLat !== null ? String(pickedLat) : "");
                handleChange("validated_lng", pickedLng !== null ? String(pickedLng) : "");
                handleChange("location_validation_status", pickedLat !== null && pickedLng !== null ? "verified" : "unmapped");
                if (label && (!formData.lokasi || formData.lokasi.trim() === "")) {
                  handleChange("lokasi", label);
                }
                setIsPickerOpen(false);
              }}
              onClose={() => setIsPickerOpen(false)}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default ProtestFormModal;

