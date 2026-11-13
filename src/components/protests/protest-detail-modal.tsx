"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  MapPin,
  Calendar,
  Clock,
  Users,
  Shield,
  Video,
  FileText,
  AlertTriangle,
  History,
  CheckCircle2,
  Copy,
  Check,
  Send,
  Link as LinkIcon,
  Trash2,
  RefreshCw,
  Edit3
} from "lucide-react";
import {
  ProtestEvent,
  ProtestOperatorReport,
  ProtestStatusHistory,
  ProtestCameraLink,
  ProtestStatus,
  ProtestUrgency,
  ReportType
} from "@/lib/types/protests";
import { Camera } from "@/lib/types";

interface ProtestDetailModalProps {
  protestId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  onSelectCameraToPlay?: (camera: Camera) => void;
}

type TabType = "ringkasan" | "laporan" | "status" | "cctv" | "editorial";

export function ProtestDetailModal({
  protestId,
  isOpen,
  onClose,
  onUpdated,
  onSelectCameraToPlay
}: ProtestDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("ringkasan");
  const [loading, setLoading] = useState(true);
  const [eventData, setEventData] = useState<ProtestEvent | null>(null);
  const [reports, setReports] = useState<ProtestOperatorReport[]>([]);
  const [statusHistory, setStatusHistory] = useState<ProtestStatusHistory[]>([]);
  const [cameraLinks, setCameraLinks] = useState<ProtestCameraLink[]>([]);
  const [nearbyCameras, setNearbyCameras] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Form states for reports
  const [reportContent, setReportContent] = useState("");
  const [reportType, setReportType] = useState<ReportType>("progress");
  const [reportCrowd, setReportCrowd] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  // Form states for status transition
  const [statusReason, setStatusReason] = useState("");
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // Form states for editorial
  const [editorialText, setEditorialText] = useState("");
  const [generatingEditorial, setGeneratingEditorial] = useState(false);
  const [savingEditorial, setSavingEditorial] = useState(false);

  // Form states for edit summary
  const [summaryText, setSummaryText] = useState("");
  const [actualCrowd, setActualCrowd] = useState("");
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);

  const fetchDetail = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/protests/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Gagal memuat detail aksi unjuk rasa.");
      }

      const p: ProtestEvent = json.data;
      setEventData(p);
      setReports(json.data.reports || []);
      setStatusHistory(json.data.status_history || []);
      setCameraLinks(json.data.camera_links || []);
      setNearbyCameras(json.data.nearby_recommendations || []);

      setEditorialText(p.editorial_final || p.editorial_draft || "");
      setSummaryText(p.situation_summary || "");
      setActualCrowd(p.actual_crowd_size !== null && p.actual_crowd_size !== undefined ? String(p.actual_crowd_size) : "");
      setLatInput(p.validated_lat !== null && p.validated_lat !== undefined ? String(p.validated_lat) : "");
      setLngInput(p.validated_lng !== null && p.validated_lng !== undefined ? String(p.validated_lng) : "");
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat memuat data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && protestId) {
      setActiveTab("ringkasan");
      fetchDetail(protestId);
    }
  }, [isOpen, protestId]);

  if (!isOpen || !protestId) return null;

  // Add Situational Report
  const handleAddReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportContent.trim()) return;
    setSubmittingReport(true);
    try {
      const res = await fetch(`/api/protests/${protestId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-scc-user-role": "operator" },
        body: JSON.stringify({
          content: reportContent.trim(),
          report_type: reportType,
          crowd_estimate: reportCrowd ? parseInt(reportCrowd, 10) : null
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengirim laporan.");

      setReportContent("");
      setReportCrowd("");
      await fetchDetail(protestId);
      onUpdated?.();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingReport(false);
    }
  };

  // Status Change
  const handleTransitionStatus = async (toStatus: ProtestStatus) => {
    if (!statusReason.trim()) {
      alert("Harap berikan alasan ringkas untuk perubahan status operasional.");
      return;
    }
    setSubmittingStatus(true);
    try {
      const res = await fetch(`/api/protests/${protestId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-scc-user-role": "operator" },
        body: JSON.stringify({
          to_status: toStatus,
          reason: statusReason.trim()
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengubah status.");

      setStatusReason("");
      await fetchDetail(protestId);
      onUpdated?.();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingStatus(false);
    }
  };

  // Link Camera
  const handleLinkCamera = async (cameraId: string) => {
    try {
      const res = await fetch(`/api/protests/${protestId}/cameras`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-scc-user-role": "operator" },
        body: JSON.stringify({ camera_id: cameraId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menautkan CCTV.");

      await fetchDetail(protestId);
      onUpdated?.();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Unlink Camera
  const handleUnlinkCamera = async (cameraId: string) => {
    try {
      const res = await fetch(`/api/protests/${protestId}/cameras?camera_id=${encodeURIComponent(cameraId)}`, {
        method: "DELETE",
        headers: { "x-scc-user-role": "operator" }
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mencabut tautan.");

      await fetchDetail(protestId);
      onUpdated?.();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Generate Editorial Text
  const handleGenerateEditorial = async () => {
    setGeneratingEditorial(true);
    try {
      const res = await fetch(`/api/protests/${protestId}/editorial`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-scc-user-role": "operator" }
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal generate editorial.");

      setEditorialText(json.draft);
      await fetchDetail(protestId);
      onUpdated?.();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGeneratingEditorial(false);
    }
  };

  // Save Editorial Text
  const handleSaveEditorial = async (isFinal: boolean = false) => {
    setSavingEditorial(true);
    try {
      const payload: Record<string, string> = isFinal
        ? { editorial_final: editorialText }
        : { editorial_draft: editorialText };

      const res = await fetch(`/api/protests/${protestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-scc-user-role": "operator" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan teks editorial.");

      alert(isFinal ? "Teks editorial berhasil difinalisasi!" : "Draft editorial berhasil disimpan.");
      await fetchDetail(protestId);
      onUpdated?.();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingEditorial(false);
    }
  };

  // Save Summary & Coordinates
  const handleSaveSummary = async () => {
    setSavingSummary(true);
    try {
      const res = await fetch(`/api/protests/${protestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-scc-user-role": "operator" },
        body: JSON.stringify({
          situation_summary: summaryText,
          actual_crowd_size: actualCrowd ? parseInt(actualCrowd, 10) : null,
          validated_lat: latInput ? parseFloat(latInput) : null,
          validated_lng: lngInput ? parseFloat(lngInput) : null
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memperbarui ringkasan.");

      alert("Pembaruan situasi operator berhasil disimpan.");
      await fetchDetail(protestId);
      onUpdated?.();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingSummary(false);
    }
  };

  const copyToClipboard = () => {
    if (!editorialText) return;
    navigator.clipboard.writeText(editorialText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#0D121B] border border-[var(--border-default)] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-6 max-h-[90vh]">
        {/* Modal Top Bar */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] bg-[#111622] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                eventData?.status === "ongoing"
                  ? "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse"
                  : eventData?.status === "scheduled"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  : eventData?.status === "monitoring"
                  ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                  : "bg-slate-500/20 text-slate-300 border border-slate-500/40"
              }`}
            >
              {eventData?.status || "Loading..."}
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white line-clamp-1">
                {eventData?.isu_tuntutan || "Memuat Aksi Unjuk Rasa..."}
              </h2>
              <p className="text-[11px] text-[#98A4B8]">
                {eventData?.kode_unras} • {eventData?.tanggal} • {eventData?.lokasi}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#98A4B8] hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-5 border-b border-[var(--border-subtle)] bg-[#0E131F] overflow-x-auto shrink-0 py-1.5">
          <button
            onClick={() => setActiveTab("ringkasan")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === "ringkasan"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-[#98A4B8] hover:text-white"
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> Ringkasan & Sumber
          </button>

          <button
            onClick={() => setActiveTab("laporan")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === "laporan"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-[#98A4B8] hover:text-white"
            }`}
          >
            <Send className="w-3.5 h-3.5" /> Laporan Petugas ({reports.length})
          </button>

          <button
            onClick={() => setActiveTab("status")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === "status"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-[#98A4B8] hover:text-white"
            }`}
          >
            <History className="w-3.5 h-3.5" /> Siklus & Riwayat Status
          </button>

          <button
            onClick={() => setActiveTab("cctv")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === "cctv"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-[#98A4B8] hover:text-white"
            }`}
          >
            <Video className="w-3.5 h-3.5" /> Kamera CCTV ({cameraLinks.length})
          </button>

          <button
            onClick={() => setActiveTab("editorial")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === "editorial"
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "text-[#98A4B8] hover:text-white"
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" /> Teks Editorial
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-white rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-[#98A4B8]">Memuat informasi unjuk rasa...</p>
            </div>
          ) : error || !eventData ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              {error || "Data tidak ditemukan"}
            </div>
          ) : (
            <>
              {/* TAB 1: RINGKASAN */}
              {activeTab === "ringkasan" && (
                <div className="space-y-4">
                  {/* Quick Cards Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-[#111622] border border-[var(--border-subtle)] rounded-xl">
                      <span className="text-[10px] text-[#98A4B8] uppercase block">Tingkat Urgensi</span>
                      <span className="text-xs font-bold text-white capitalize mt-0.5 block">
                        {eventData.urgency}
                      </span>
                    </div>

                    <div className="p-3 bg-[#111622] border border-[var(--border-subtle)] rounded-xl">
                      <span className="text-[10px] text-[#98A4B8] uppercase block">Estimasi Intelkam</span>
                      <span className="text-xs font-bold text-amber-400 mt-0.5 block">
                        {eventData.estimasi_massa_source ? `${eventData.estimasi_massa_source.toLocaleString("id-ID")} org` : "Belum ada"}
                      </span>
                    </div>

                    <div className="p-3 bg-[#111622] border border-[var(--border-subtle)] rounded-xl">
                      <span className="text-[10px] text-[#98A4B8] uppercase block">Massa Riil Lapangan</span>
                      <span className="text-xs font-bold text-emerald-400 mt-0.5 block">
                        {eventData.actual_crowd_size ? `${eventData.actual_crowd_size.toLocaleString("id-ID")} org` : "Belum diverifikasi"}
                      </span>
                    </div>

                    <div className="p-3 bg-[#111622] border border-[var(--border-subtle)] rounded-xl">
                      <span className="text-[10px] text-[#98A4B8] uppercase block">Status Peta (GPS)</span>
                      <span className={`text-xs font-bold mt-0.5 block ${eventData.has_coordinates ? "text-blue-400" : "text-amber-400"}`}>
                        {eventData.has_coordinates ? "Terpetakan" : "Belum Terpetakan"}
                      </span>
                    </div>
                  </div>

                  {/* Primary Details Table */}
                  <div className="p-4 bg-[#111622] border border-[var(--border-subtle)] rounded-xl space-y-2.5 text-xs">
                    <h3 className="font-bold text-white uppercase text-[11px] tracking-wider mb-2 text-blue-400">
                      Parameter Unjuk Rasa (Sumber OneDrive / Excel)
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
                      <div>
                        <span className="text-[#98A4B8] block">ID Kejadian / Kode:</span>
                        <span className="text-white font-medium">{eventData.id_kejadian} / {eventData.kode_unras}</span>
                      </div>
                      <div>
                        <span className="text-[#98A4B8] block">Waktu Pelaksanaan:</span>
                        <span className="text-white font-medium">{eventData.tanggal} ({eventData.waktu_mulai || "09:00 WIB"})</span>
                      </div>
                      <div>
                        <span className="text-[#98A4B8] block">Lokasi Utama:</span>
                        <span className="text-white font-medium">{eventData.lokasi}</span>
                      </div>
                      <div>
                        <span className="text-[#98A4B8] block">Titik Kumpul / Sasaran:</span>
                        <span className="text-white font-medium">{eventData.titik_kumpul || "-"} / {eventData.sasaran_aksi || "-"}</span>
                      </div>
                      <div>
                        <span className="text-[#98A4B8] block">Elemen / Organisasi:</span>
                        <span className="text-white font-medium">{eventData.organisasi_kelompok || "Massa Gabungan"}</span>
                      </div>
                      <div>
                        <span className="text-[#98A4B8] block">Korlap / Penanggung Jawab:</span>
                        <span className="text-white font-medium">{eventData.korlap_pimpinan || "-"}</span>
                      </div>
                      <div>
                        <span className="text-[#98A4B8] block">Wilayah Hukum:</span>
                        <span className="text-white font-medium">{eventData.wilayah_hukum || "-"} ({eventData.provinsi})</span>
                      </div>
                      <div>
                        <span className="text-[#98A4B8] block">Keterangan Sumber:</span>
                        <span className="text-white font-medium">{eventData.keterangan_source || "-"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Operator Situation & Coordinates Edit Section */}
                  <div className="p-4 bg-[#141A28] border border-[var(--border-default)] rounded-xl space-y-3">
                    <h3 className="font-bold text-white text-xs flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-blue-400" /> Ringkasan Situasi & Validasi Koordinat Operator
                    </h3>

                    <div>
                      <label className="block text-[11px] text-[#98A4B8] mb-1 font-semibold">
                        Catatan Situasi Terkini Operator
                      </label>
                      <textarea
                        rows={2}
                        value={summaryText}
                        onChange={(e) => setSummaryText(e.target.value)}
                        placeholder="Masukkan catatan situasi lapangan terkini..."
                        className="w-full bg-[#0D121B] border border-[var(--border-default)] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#98A4B8] mb-1 font-semibold">
                          Jumlah Massa Terverifikasi
                        </label>
                        <input
                          type="number"
                          placeholder="Cth: 1200"
                          value={actualCrowd}
                          onChange={(e) => setActualCrowd(e.target.value)}
                          className="w-full bg-[#0D121B] border border-[var(--border-default)] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#98A4B8] mb-1 font-semibold">
                          Latitude Geospasial
                        </label>
                        <input
                          type="text"
                          placeholder="Cth: -6.2115"
                          value={latInput}
                          onChange={(e) => setLatInput(e.target.value)}
                          className="w-full bg-[#0D121B] border border-[var(--border-default)] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#98A4B8] mb-1 font-semibold">
                          Longitude Geospasial
                        </label>
                        <input
                          type="text"
                          placeholder="Cth: 106.8016"
                          value={lngInput}
                          onChange={(e) => setLngInput(e.target.value)}
                          className="w-full bg-[#0D121B] border border-[var(--border-default)] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={handleSaveSummary}
                        disabled={savingSummary}
                        className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-1.5"
                      >
                        {savingSummary ? "Menyimpan..." : "Simpan Pembaruan Situasi"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: LAPORAN SITUASI */}
              {activeTab === "laporan" && (
                <div className="space-y-4">
                  {/* Add Report Form */}
                  <form onSubmit={handleAddReport} className="p-4 bg-[#141A28] border border-[var(--border-default)] rounded-xl space-y-3">
                    <h3 className="font-bold text-white text-xs flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 text-blue-400" /> Kirim Laporan Lapangan Petugas
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#98A4B8] mb-1 font-semibold">Tipe Laporan</label>
                        <select
                          value={reportType}
                          onChange={(e) => setReportType(e.target.value as ReportType)}
                          className="w-full bg-[#0D121B] border border-[var(--border-default)] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="progress">Laporan Progres / Situasi Berjalan</option>
                          <option value="initial">Laporan Awal (Persiapan / Tikum)</option>
                          <option value="summary">Laporan Ringkasan / Audiensi</option>
                          <option value="security_escalation">Eskalasi Keamanan Lapangan</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-[#98A4B8] mb-1 font-semibold">Estimasi Massa Terkini (Opsional)</label>
                        <input
                          type="number"
                          placeholder="Jumlah massa terpantau"
                          value={reportCrowd}
                          onChange={(e) => setReportCrowd(e.target.value)}
                          className="w-full bg-[#0D121B] border border-[var(--border-default)] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#98A4B8] mb-1 font-semibold">Isi Laporan Situasi</label>
                      <textarea
                        required
                        rows={2}
                        value={reportContent}
                        onChange={(e) => setReportContent(e.target.value)}
                        placeholder="Tuliskan perkembangan situasi lapangan, titik konsentrasi massa, atau arahan intelijen..."
                        className="w-full bg-[#0D121B] border border-[var(--border-default)] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={submittingReport}
                        className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-1.5"
                      >
                        {submittingReport ? "Mengirim..." : "Kirim Laporan"}
                      </button>
                    </div>
                  </form>

                  {/* Reports Timeline */}
                  <div className="space-y-2.5">
                    <h3 className="font-bold text-white uppercase text-[11px] tracking-wider text-blue-400">
                      Kronologi Laporan Situasi ({reports.length})
                    </h3>

                    {reports.length === 0 ? (
                      <div className="p-4 text-center text-xs text-[#64748B] bg-[#111622] rounded-xl border border-[var(--border-subtle)]">
                        Belum ada laporan situasi dari petugas lapangan.
                      </div>
                    ) : (
                      reports.map((rep) => (
                        <div
                          key={rep.id}
                          className="p-3 bg-[#111622] border border-[var(--border-subtle)] rounded-xl space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-bold uppercase">
                                {rep.report_type}
                              </span>
                              <span className="text-white font-semibold">{rep.author_name}</span>
                              <span className="text-[10px] text-[#64748B]">({rep.author_role})</span>
                            </div>
                            <span className="text-[11px] text-[#64748B]">
                              {new Date(rep.created_at).toLocaleString("id-ID")}
                            </span>
                          </div>
                          <p className="text-[#C5D0E3] leading-relaxed whitespace-pre-wrap">{rep.content}</p>
                          {rep.crowd_estimate && (
                            <span className="inline-block text-[10px] text-amber-400 font-semibold">
                              Estimasi Massa: {rep.crowd_estimate.toLocaleString("id-ID")} orang
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: SIKLUS & STATUS */}
              {activeTab === "status" && (
                <div className="space-y-4">
                  {/* Status Transition Control */}
                  <div className="p-4 bg-[#141A28] border border-[var(--border-default)] rounded-xl space-y-3">
                    <h3 className="font-bold text-white text-xs flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-blue-400" /> Transisi Status Siklus Aksi
                    </h3>
                    <p className="text-[11px] text-[#98A4B8]">
                      Status saat ini: <strong className="text-white uppercase">{eventData.status}</strong>
                    </p>

                    <div>
                      <label className="block text-[11px] text-[#98A4B8] mb-1 font-semibold">
                        Alasan / Keterangan Transisi Status <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Massa telah membubarkan diri dengan tertib"
                        value={statusReason}
                        onChange={(e) => setStatusReason(e.target.value)}
                        className="w-full bg-[#0D121B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={submittingStatus || eventData.status === "ongoing"}
                        onClick={() => handleTransitionStatus("ongoing")}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 transition-colors"
                      >
                        Set Sedang Berlangsung (Ongoing)
                      </button>

                      <button
                        type="button"
                        disabled={submittingStatus || eventData.status === "monitoring"}
                        onClick={() => handleTransitionStatus("monitoring")}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 transition-colors"
                      >
                        Set Pemantauan Intensif (Monitoring)
                      </button>

                      <button
                        type="button"
                        disabled={submittingStatus || eventData.status === "completed"}
                        onClick={() => handleTransitionStatus("completed")}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-colors"
                      >
                        Set Selesai & Arsipkan (Completed)
                      </button>

                      <button
                        type="button"
                        disabled={submittingStatus || eventData.status === "cancelled"}
                        onClick={() => handleTransitionStatus("cancelled")}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-40 transition-colors"
                      >
                        Set Dibatalkan (Cancelled)
                      </button>
                    </div>
                  </div>

                  {/* Audit History */}
                  <div className="space-y-2">
                    <h3 className="font-bold text-white uppercase text-[11px] tracking-wider text-blue-400">
                      Audit Trail Riwayat Status
                    </h3>

                    <div className="space-y-2">
                      {statusHistory.map((hist) => (
                        <div
                          key={hist.id}
                          className="p-3 bg-[#111622] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2 font-semibold">
                              <span className="text-[#98A4B8]">{hist.from_status || "Awal"}</span>
                              <span>&rarr;</span>
                              <span className="text-white uppercase">{hist.to_status}</span>
                            </div>
                            <p className="text-[11px] text-[#98A4B8] mt-0.5">{hist.reason}</p>
                          </div>
                          <div className="text-right text-[11px] text-[#64748B]">
                            <div>{hist.changed_by_name}</div>
                            <div>{new Date(hist.created_at).toLocaleString("id-ID")}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: KAMERA CCTV TERTAUT & REKOMENDASI SPASIAL */}
              {activeTab === "cctv" && (
                <div className="space-y-4">
                  {/* Linked Cameras */}
                  <div>
                    <h3 className="font-bold text-white uppercase text-[11px] tracking-wider mb-2 text-blue-400">
                      Kamera CCTV Tertaut ({cameraLinks.length})
                    </h3>

                    {cameraLinks.length === 0 ? (
                      <div className="p-4 text-center text-xs text-[#64748B] bg-[#111622] rounded-xl border border-[var(--border-subtle)]">
                        Belum ada kamera CCTV yang ditautkan ke perimeter unjuk rasa ini.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {cameraLinks.map((link) => (
                          <div
                            key={link.id}
                            className="p-3 bg-[#111622] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Video className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span className="text-white font-semibold truncate">{link.camera_name}</span>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-[#98A4B8] mt-0.5">
                                <span>Jarak: <strong className="text-white">{link.distance_meters}m</strong></span>
                                <span>•</span>
                                <span className="text-emerald-400">{link.camera_status || "ONLINE"}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {link.camera && onSelectCameraToPlay && (
                                <button
                                  type="button"
                                  onClick={() => onSelectCameraToPlay(link.camera!)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
                                >
                                  Putar
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleUnlinkCamera(link.camera_id)}
                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Cabut Tautan"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Nearby CCTV Recommendations (Radius 1.5km) */}
                  <div className="pt-3 border-t border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-white uppercase text-[11px] tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" /> Rekomendasi Kamera Terdekat (Radius 1.500m)
                      </h3>
                      <span className="text-[11px] text-[#64748B]">
                        {nearbyCameras.length} kamera terdeteksi
                      </span>
                    </div>

                    {!eventData.has_coordinates ? (
                      <div className="p-4 text-center text-xs text-amber-400 bg-amber-500/10 rounded-xl border border-amber-500/30">
                        Aksi ini belum memiliki koordinat GPS tervalidasi. Silakan isi koordinat di tab Ringkasan untuk mengaktifkan rekomendasi spasial otomatis.
                      </div>
                    ) : nearbyCameras.length === 0 ? (
                      <div className="p-4 text-center text-xs text-[#64748B] bg-[#111622] rounded-xl border border-[var(--border-subtle)]">
                        Tidak ada CCTV publik dalam radius 1.500 meter dari koordinat ini.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
                        {nearbyCameras.map((cam) => {
                          const isAlreadyLinked = cameraLinks.some((l) => l.camera_id === cam.id);
                          return (
                            <div
                              key={cam.id}
                              className="p-3 bg-[#111622] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <span className="text-white font-semibold truncate block">{cam.name}</span>
                                <div className="flex items-center gap-2 text-[11px] text-[#98A4B8] mt-0.5">
                                  <span>Jarak: <strong className="text-emerald-400">{cam.distance_meters}m</strong></span>
                                  <span>•</span>
                                  <span>{cam.source_name || cam.city_name}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {isAlreadyLinked ? (
                                  <span className="text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30">
                                    Tertaut
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleLinkCamera(cam.id)}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1"
                                  >
                                    <LinkIcon className="w-3 h-3" /> Tautkan
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: TEKS EDITORIAL */}
              {activeTab === "editorial" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-white text-xs">Generator Teks Editorial Situasi</h3>
                      <p className="text-[11px] text-[#98A4B8]">
                        Format laporan resmi terpadu untuk rilis intelijen, briefing komando, atau koordinasi antarinstansi.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateEditorial}
                        disabled={generatingEditorial}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-1.5 shadow-md shadow-blue-500/20"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${generatingEditorial ? "animate-spin" : ""}`} />
                        <span>{generatingEditorial ? "Mengenerate..." : "Generate Otomatis"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={copyToClipboard}
                        disabled={!editorialText}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#161C2B] border border-[var(--border-default)] text-[#98A4B8] hover:text-white transition-colors flex items-center gap-1.5"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? "Disalin!" : "Salin Teks"}</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={12}
                    value={editorialText}
                    onChange={(e) => setEditorialText(e.target.value)}
                    placeholder="Klik 'Generate Otomatis' untuk menyusun draft laporan dari data kejadian, laporan situasi, dan tautan CCTV..."
                    className="w-full bg-[#0D121B] border border-[var(--border-default)] rounded-xl p-3 font-mono text-xs text-[#E2E8F0] focus:outline-none focus:border-blue-500 leading-relaxed"
                  />

                  <div className="flex items-center justify-end gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSaveEditorial(false)}
                      disabled={savingEditorial || !editorialText}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#161C2B] hover:bg-[#1E2638] text-[#98A4B8] hover:text-white border border-[var(--border-default)] transition-colors"
                    >
                      Simpan Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEditorial(true)}
                      disabled={savingEditorial || !editorialText}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-md shadow-emerald-500/20"
                    >
                      Finalisasi Teks Editorial
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[#111622] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-[#64748B]">
            SCC - EAGLE EYES Sistem Monitoring Terpadu
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold text-[#98A4B8] hover:text-white hover:bg-white/5 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
