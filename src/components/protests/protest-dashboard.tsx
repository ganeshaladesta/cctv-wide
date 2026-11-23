"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  Filter,
  RefreshCw,
  Plus,
  MapPin,
  Calendar,
  Users,
  Video,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Flame,
  CheckCircle2,
  Check,
  Clock,
  ExternalLink,
  Layers
} from "lucide-react";
import {
  ProtestEvent,
  ProtestFilterParams,
  ProtestStats,
  ProtestStatus,
  ProtestUrgency,
  ProtestSyncLog
} from "@/lib/types/protests";
import { ProtestDetailModal } from "./protest-detail-modal";
import { ProtestCreateModal } from "./protest-create-modal";
import { ProtestSyncModal } from "./protest-sync-modal";
import { Camera } from "@/lib/types";

interface ProtestDashboardProps {
  onViewOnMap?: (event: ProtestEvent) => void;
  onSelectCameraToPlay?: (camera: Camera) => void;
  onProtestDataChange?: () => void;
}

export function ProtestDashboard({
  onViewOnMap,
  onSelectCameraToPlay,
  onProtestDataChange
}: ProtestDashboardProps) {
  // Data states
  const [events, setEvents] = useState<ProtestEvent[]>([]);
  const [stats, setStats] = useState<ProtestStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [dataRefreshing, setDataRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination states
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [hasCoordsFilter, setHasCoordsFilter] = useState<string>("all");
  const [locationValidationFilter, setLocationValidationFilter] = useState<string>("all");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Modal states
  const [selectedProtestId, setSelectedProtestId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);

  // Sync state for dedicated sync panel
  const [syncLogs, setSyncLogs] = useState<ProtestSyncLog[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    type: "info" | "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const [syncButtonText, setSyncButtonText] = useState("Sinkronisasi Manual");

  // Fetch KPI Stats (never flash fake 0)
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/protests/stats", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setStats(json.data);
      }
    } catch (err) {
      console.warn("[ProtestDashboard] Gagal memuat statistik unras:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch Sync Logs
  const fetchSyncData = async () => {
    try {
      const res = await fetch("/api/protests/sync", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.success) {
        setSyncLogs(json.latestSyncLogs || []);
      }
    } catch {
      // Ignored
    }
  };

  const triggerDashboardManualSync = async () => {
    if (syncLoading) return;

    setSyncLoading(true);
    setSyncButtonText("Mengirim permintaan...");
    setSyncFeedback({
      type: "info",
      message: "Menghubungi server untuk memicu alur sinkronisasi Power Automate..."
    });

    try {
      const res = await fetch("/api/integrations/unras/manual-trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-scc-user-role": "admin"
        },
        body: JSON.stringify({})
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Gagal memulai sinkronisasi data unjuk rasa.");
      }

      const executionId = json.request_id || json.execution_id;
      setSyncButtonText("Sinkronisasi Diterima...");
      setSyncFeedback({
        type: "info",
        message: "Permintaan sinkronisasi diterima. Menunggu proses Power Automate."
      });

      // Poll execution status until backend confirms completion
      let isCompleted = false;
      const startTime = Date.now();
      const maxPollingMs = 60000; // 60 seconds failsafe timeout

      while (!isCompleted && Date.now() - startTime < maxPollingMs) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        try {
          const pollUrl = executionId
            ? `/api/protests/sync?execution_id=${encodeURIComponent(executionId)}`
            : "/api/protests/sync";
          const pollRes = await fetch(pollUrl, { cache: "no-store" });
          const pollJson = await pollRes.json();
          if (pollRes.ok && pollJson.success) {
            const currentLog: ProtestSyncLog | undefined =
              pollJson.execution || (pollJson.latestSyncLogs && pollJson.latestSyncLogs[0]);

            if (currentLog && currentLog.status !== "running") {
              isCompleted = true;
              await fetchSyncData();

              if (currentLog.status === "success") {
                setSyncFeedback({
                  type: "success",
                  message: `Sinkronisasi Berhasil (Manual): +${currentLog.records_created} baru, /${currentLog.records_skipped} dilewati, !${currentLog.records_failed ?? 0} gagal.`
                });
              } else if (currentLog.status === "partial") {
                setSyncFeedback({
                  type: "warning",
                  message: `Sinkronisasi Selesai Sebagian: +${currentLog.records_created} baru, /${currentLog.records_skipped} dilewati, !${currentLog.records_failed ?? 0} gagal. Peringatan: ${currentLog.error_details || "Terdapat baris data yang dilewati."}`
                });
              } else if (currentLog.status === "failed") {
                setSyncFeedback({
                  type: "error",
                  message: `Sinkronisasi Gagal: ${currentLog.error_details || "Eksekusi Power Automate atau penulisan data gagal."}`
                });
              }

              // Refresh UNRAS dashboard data
              await Promise.all([fetchStats(), fetchProtests()]);
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("scc-protest-updated"));
              }
              break;
            }
          }
        } catch (pollErr) {
          console.warn("[ProtestDashboard] Polling status warning:", pollErr);
        }
      }

      if (!isCompleted) {
        await fetchSyncData();
        setSyncFeedback({
          type: "info",
          message: "Proses sinkronisasi masih berjalan di background pada Power Automate. Status akan otomatis terbarui pada panel riwayat."
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        type: "error",
        message: err.message || "Terjadi kesalahan saat memicu sinkronisasi."
      });
    } finally {
      setSyncLoading(false);
      setSyncButtonText("Sinkronisasi Manual");
    }
  };

  // Fetch Protests List
  const fetchProtests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));

      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (urgencyFilter !== "all") params.set("urgency", urgencyFilter);
      if (hasCoordsFilter === "true") params.set("has_coords", "true");
      if (hasCoordsFilter === "false") params.set("has_coords", "false");
      if (locationValidationFilter !== "all") params.set("location_validation_status", locationValidationFilter);

      const res = await fetch(`/api/protests?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Gagal memuat daftar aksi unjuk rasa.");
      }

      setEvents(json.data || []);
      setTotalCount(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat memuat data.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchQuery, statusFilter, urgencyFilter, hasCoordsFilter, locationValidationFilter]);

  const handleQuickVerify = async (event: ProtestEvent) => {
    if (!event.suggested_lat || !event.suggested_lng) return;
    setVerifyingId(event.id);
    try {
      const res = await fetch(`/api/protests/${event.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-scc-user-role": "operator"
        },
        body: JSON.stringify({
          validated_lat: event.suggested_lat,
          validated_lng: event.suggested_lng,
          location_validation_status: "verified"
        })
      });
      if (res.ok) {
        fetchProtests();
        fetchStats();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("scc-protest-updated"));
        }
      }
    } catch (err) {
      console.error("[QuickVerify Error]", err);
    } finally {
      setVerifyingId(null);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchProtests();
    fetchSyncData();
  }, [fetchProtests]);

  const handleOpenDetail = (id: string) => {
    setSelectedProtestId(id);
    setIsDetailOpen(true);
  };

  const handleDataRefresh = async () => {
    setDataRefreshing(true);
    try {
      await Promise.all([
        fetchStats(),
        fetchProtests(),
        fetchSyncData()
      ]);
      onProtestDataChange?.();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("scc-protest-updated"));
      }
    } finally {
      setDataRefreshing(false);
    }
  };

  const handleRefresh = handleDataRefresh;

  return (
    <div className="w-full space-y-5">
      {/* Top Banner & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 rounded-2xl bg-[#0D121B] border border-[var(--border-default)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <h1 className="text-base sm:text-lg font-bold text-white tracking-wide uppercase">
              Monitoring Unjuk Rasa & Situasi Lapangan
            </h1>
          </div>
          <p className="text-xs text-[#98A4B8] mt-0.5">
            Pusat pemantauan terpadu aksi unjuk rasa, eskalasi massa, dan integrasi pengawasan CCTV spasial.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Data Refresh Button */}
          <button
            type="button"
            onClick={handleDataRefresh}
            disabled={dataRefreshing}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#161C2B] hover:bg-[#1E2638] text-[#98A4B8] hover:text-white border border-[var(--border-default)] transition-colors flex items-center gap-1.5"
            title="Muat ulang data terbaru dari database (tanpa mengubah data sumber)"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${dataRefreshing ? "animate-spin" : ""}`} />
            <span>{dataRefreshing ? "Memuat..." : "Segarkan Tampilan"}</span>
          </button>

          {/* OneDrive Sync Modal Button */}
          <button
            type="button"
            onClick={() => setIsSyncOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#161C2B] hover:bg-[#1E2638] text-[#98A4B8] hover:text-white border border-[var(--border-default)] transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sinkronisasi OneDrive</span>
          </button>

          {/* Add Manual Protest Button */}
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Aksi Manual</span>
          </button>
        </div>
      </div>

      {/* Exactly Four Primary KPI Cards (Source Excel Status) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Jumlah Total Unras */}
        <div className="p-4 rounded-2xl bg-[#0D121B] border border-[var(--border-default)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#98A4B8] font-medium">Jumlah Total Unras</span>
            <Layers className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {statsLoading && !stats ? (
              <div className="h-8 w-16 bg-white/10 rounded-lg animate-pulse my-1" />
            ) : (
              stats?.total_events ?? 0
            )}
          </div>
          <span className="text-[10px] text-[#64748B] block mt-0.5">Seluruh aksi tercatat di sistem</span>
        </div>

        {/* Card 2: Sedang Berlangsung */}
        <div className="p-4 rounded-2xl bg-[#0D121B] border border-[var(--border-default)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#98A4B8] font-medium">Sedang Berlangsung</span>
              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-red-500/10 text-red-400 font-semibold border border-red-500/20">Sumber Excel</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          </div>
          <div className="text-2xl font-black text-red-400 mt-1">
            {statsLoading && !stats ? (
              <div className="h-8 w-16 bg-red-500/10 rounded-lg animate-pulse my-1" />
            ) : (
              stats?.source_status_ongoing ?? 0
            )}
          </div>
          <span className="text-[10px] text-[#64748B] block mt-0.5">Aksi berlangsung di lapangan (Excel)</span>
        </div>

        {/* Card 3: Belum Berlangsung */}
        <div className="p-4 rounded-2xl bg-[#0D121B] border border-[var(--border-default)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#98A4B8] font-medium">Belum Berlangsung</span>
              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20">Sumber Excel</span>
            </div>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 mt-1">
            {statsLoading && !stats ? (
              <div className="h-8 w-16 bg-amber-500/10 rounded-lg animate-pulse my-1" />
            ) : (
              stats?.source_status_scheduled ?? 0
            )}
          </div>
          <span className="text-[10px] text-[#64748B] block mt-0.5">Terdaftar belum berlangsung (Excel)</span>
        </div>

        {/* Card 4: Selesai */}
        <div className="p-4 rounded-2xl bg-[#0D121B] border border-[var(--border-default)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#98A4B8] font-medium">Selesai</span>
              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">Sumber Excel</span>
            </div>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            {statsLoading && !stats ? (
              <div className="h-8 w-16 bg-emerald-500/10 rounded-lg animate-pulse my-1" />
            ) : (
              stats?.source_status_completed ?? 0
            )}
          </div>
          <span className="text-[10px] text-[#64748B] block mt-0.5">Selesai dilaporkan (Excel)</span>
        </div>
      </div>

      {/* Secondary Status Strip: Operator Dispositions & Unspecified Source Counter */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 rounded-xl bg-[#080C14] border border-[var(--border-default)]">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Disposisi Operator SCC
          </span>
          <span className="text-[#98A4B8]">
            Aktif: <strong className="text-white">{stats?.ongoing_events ?? 0}</strong>
          </span>
          <span className="text-[#64748B]">•</span>
          <span className="text-[#98A4B8]">
            Terjadwal: <strong className="text-white">{stats?.scheduled_events ?? 0}</strong>
          </span>
          <span className="text-[#64748B]">•</span>
          <span className="text-[#98A4B8]">
            Monitoring: <strong className="text-white">{stats?.monitoring_events ?? 0}</strong>
          </span>
          <span className="text-[#64748B]">•</span>
          <span className="text-[#98A4B8]">
            Selesai: <strong className="text-white">{stats?.completed_events ?? 0}</strong>
          </span>
        </div>
        {(stats?.source_status_unspecified ?? 0) > 0 && (
          <div className="text-[11px] text-[#98A4B8] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Status sumber belum ditentukan (kosong di Excel): <strong className="text-amber-400">{stats?.source_status_unspecified}</strong> aksi</span>
          </div>
        )}
      </div>

      {/* Dedicated Sync Status Panel */}
      {(() => {
        const latestLog = syncLogs[0];
        const lastSuccessLog = syncLogs.find((l) => l.status === "success");
        const formatWib = (isoStr?: string | null): string => {
          if (!isoStr) return "-";
          try {
            const d = new Date(isoStr);
            return (
              d.toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              }) + " WIB"
            );
          } catch {
            return isoStr;
          }
        };

        return (
          <div className="p-4 rounded-2xl bg-[#0D121B] border border-[var(--border-default)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <RefreshCw className={`w-4 h-4 text-emerald-400 ${syncLoading ? "animate-spin" : ""}`} />
                <div>
                  <h3 className="text-xs font-bold text-white tracking-wide uppercase">
                    Sinkronisasi Rolling 7 Hari
                  </h3>
                  <p className="text-[11px] text-[#98A4B8]">
                    Sinkronisasi Otomatis Harian (05:00 WIB) & Integrasi Workbook
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {latestLog && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                      latestLog.status === "success"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : latestLog.status === "running"
                        ? "bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse"
                        : latestLog.status === "partial"
                        ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        : "bg-red-500/15 text-red-400 border border-red-500/30"
                    }`}
                  >
                    {latestLog.status === "running" ? "Sedang Berjalan" : `Status: ${latestLog.status}`}
                  </span>
                )}
                <button
                  type="button"
                  onClick={triggerDashboardManualSync}
                  disabled={syncLoading}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  title="Manual sync terbatas untuk peran Administrator Komando"
                >
                  <RefreshCw className={`w-3 h-3 ${syncLoading ? "animate-spin" : ""}`} />
                  <span>{syncButtonText}</span>
                </button>
              </div>
            </div>

            {syncFeedback && (
              <div
                className={`p-2.5 rounded-xl text-xs border flex items-start gap-2 ${
                  syncFeedback.type === "success"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : syncFeedback.type === "warning"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    : syncFeedback.type === "error"
                    ? "bg-red-500/10 border-red-500/30 text-red-300"
                    : "bg-blue-500/10 border-blue-500/30 text-blue-300"
                }`}
              >
                <span>{syncFeedback.message}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-[#141A28] border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[#64748B] block">Sinkronisasi Terakhir</span>
                <span className="text-white font-medium mt-0.5 block truncate">
                  {formatWib(latestLog?.completed_at || lastSuccessLog?.completed_at)}
                </span>
                <span className="text-[10px] text-[#98A4B8]">
                  Waktu Mulai: {formatWib(latestLog?.started_at)}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-[#141A28] border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[#64748B] block">Mode Eksekusi</span>
                <span className="text-white font-medium mt-0.5 block truncate">
                  {latestLog?.triggered_by === "manual_admin"
                    ? `Manual (${latestLog.triggered_by_user || "Admin"})`
                    : "Otomatis (Jadwal 05:00 WIB)"}
                </span>
                <span className="text-[10px] text-[#98A4B8] truncate block">
                  Jendela Rolling 7 Hari: {formatWib(latestLog?.period_start)} s/d {formatWib(latestLog?.period_end)}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-[#141A28] border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[#64748B] block">Rekaman Sumber (Excel)</span>
                <div className="flex items-center gap-3 mt-1">
                  <div>
                    <span className="text-[#64748B] text-[10px] block">Diterima</span>
                    <span className="text-white font-bold">{latestLog?.records_received ?? 0}</span>
                  </div>
                  <div className="border-l border-[var(--border-subtle)] pl-3">
                    <span className="text-[#64748B] text-[10px] block">Diproses</span>
                    <span className="text-emerald-400 font-bold">{latestLog?.records_processed ?? 0}</span>
                  </div>
                </div>
                <span className="text-[10px] text-[#98A4B8] block mt-0.5">
                  Worksheet: {latestLog?.source_worksheet || "NEW UNRAS 2022-2026"}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-[#141A28] border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[#64748B] block">Hasil Sinkronisasi Database</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-emerald-400 font-bold" title="Baru Ditambahkan">
                    +{latestLog?.records_created ?? 0}
                  </span>
                  <span className="text-amber-400 font-bold" title="Dilewati (sudah ada / duplikat / invalid)">
                    /{latestLog?.records_skipped ?? 0}
                  </span>
                  <span className="text-red-400 font-bold" title="Gagal">
                    !{latestLog?.records_failed ?? 0}
                  </span>
                </div>
                <span className="text-[10px] text-[#64748B] block mt-0.5">
                  (+baru, /dilewati, !gagal)
                </span>
              </div>
            </div>

            {latestLog?.error_details && (latestLog.status === "failed" || latestLog.status === "partial") && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] text-red-300 flex flex-col gap-0.5">
                <span className="font-semibold text-red-400">Pesan Error / Catatan Validasi Terakhir:</span>
                <span className="break-words line-clamp-3">{latestLog.error_details}</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#0D121B] border border-[var(--border-default)] space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#98A4B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari isu tuntutan, lokasi, organisasi, atau kode unras..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-[#64748B] focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Urgency Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#98A4B8] font-medium whitespace-nowrap">Urgensi:</span>
            <select
              value={urgencyFilter}
              onChange={(e) => {
                setUrgencyFilter(e.target.value);
                setPage(1);
              }}
              className="bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">Semua Urgensi</option>
              <option value="critical">Kritis (Critical)</option>
              <option value="high">Tinggi (High)</option>
              <option value="medium">Sedang (Medium)</option>
              <option value="low">Rendah (Low)</option>
            </select>
          </div>

          {/* Coordinates Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#98A4B8] font-medium whitespace-nowrap">Peta:</span>
            <select
              value={hasCoordsFilter}
              onChange={(e) => {
                setHasCoordsFilter(e.target.value);
                setPage(1);
              }}
              className="bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">Semua Data</option>
              <option value="true">Hanya Terpetakan (GPS)</option>
              <option value="false">Belum Terpetakan</option>
            </select>
          </div>
        </div>

        {/* Status Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => {
              setStatusFilter("active");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === "active"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "bg-[#111622] text-[#98A4B8] hover:text-white"
            }`}
          >
            Aktif (Ongoing, Scheduled, Monitoring)
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter("ongoing");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              statusFilter === "ongoing"
                ? "bg-red-600 text-white shadow-md shadow-red-500/20"
                : "bg-[#111622] text-[#98A4B8] hover:text-white"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            Sedang Berlangsung
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter("scheduled");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              statusFilter === "scheduled"
                ? "bg-amber-600 text-white shadow-md shadow-amber-500/20"
                : "bg-[#111622] text-[#98A4B8] hover:text-white"
            }`}
          >
            <span>Belum Berlangsung</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter("monitoring");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === "monitoring"
                ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                : "bg-[#111622] text-[#98A4B8] hover:text-white"
            }`}
          >
            Dalam Pemantauan
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter("completed");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              statusFilter === "completed"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                : "bg-[#111622] text-[#98A4B8] hover:text-white"
            }`}
          >
            <span>Selesai (Arsip)</span>
            {statusFilter === "completed" && totalCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-400/25 text-white font-bold">
                {totalCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter("cancelled");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === "cancelled"
                ? "bg-slate-600 text-white shadow-md shadow-slate-500/20"
                : "bg-[#111622] text-[#98A4B8] hover:text-white"
            }`}
          >
            Dibatalkan
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setLocationValidationFilter("all");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === "all" && locationValidationFilter === "all"
                ? "bg-slate-700 text-white"
                : "bg-[#111622] text-[#98A4B8] hover:text-white"
            }`}
          >
            Semua Status
          </button>

          <div className="w-[1px] h-5 bg-white/10 mx-1 shrink-0" />

          {/* Location Validation Review Tab */}
          <button
            type="button"
            onClick={() => {
              setLocationValidationFilter((prev) => (prev === "pending_validation" ? "all" : "pending_validation"));
              setStatusFilter("all");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              locationValidationFilter === "pending_validation"
                ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                : "bg-[#111622] text-purple-400 hover:text-purple-300 border border-purple-500/20"
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Verifikasi Lokasi</span>
            {Boolean(stats?.pending_validation_count) && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-400/25 text-white font-bold">
                {stats?.pending_validation_count}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Events Table / Card Feed */}
      <div className="rounded-2xl bg-[#0D121B] border border-[var(--border-default)] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-white rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-[#98A4B8]">Memuat daftar aksi unjuk rasa...</p>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-red-400">
            {error}
          </div>
        ) : events.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto opacity-70" />
            <p className="text-xs font-semibold text-white">Tidak ada data unjuk rasa yang cocok</p>
            <p className="text-[11px] text-[#64748B]">
              Coba sesuaikan kata kunci pencarian atau ubah filter status di atas.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {events.map((event) => {
              const isOngoing = event.status === "ongoing";
              const isScheduled = event.status === "scheduled";
              const isMonitoring = event.status === "monitoring";
              const isCompleted = event.status === "completed";

              const crowdDisplay = event.actual_crowd_size
                ? `${event.actual_crowd_size.toLocaleString("id-ID")} org (riil)`
                : event.estimasi_massa_source
                ? `± ${event.estimasi_massa_source.toLocaleString("id-ID")} org`
                : "Belum terkonfirmasi";

              return (
                <div
                  key={event.id}
                  className="p-4 sm:p-5 hover:bg-[#111622] transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Badge Status Sumber Excel */}
                      {event.status_sumber ? (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            event.status_sumber === "Selesai"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : event.status_sumber === "Sedang Berlangsung"
                              ? "bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse"
                              : "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                          }`}
                        >
                          Sumber: {event.status_sumber}
                        </span>
                      ) : null}

                      {/* Badge Status Operator SCC */}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isOngoing
                            ? "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse"
                            : isScheduled
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                            : isMonitoring
                            ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                            : isCompleted
                            ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/50"
                            : "bg-slate-500/20 text-slate-300 border border-slate-500/40"
                        }`}
                      >
                        Operator: {event.status}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${
                          event.urgency === "critical"
                            ? "bg-red-600/30 text-red-300"
                            : event.urgency === "high"
                            ? "bg-amber-600/30 text-amber-300"
                            : "bg-slate-700/40 text-slate-300"
                        }`}
                      >
                        {event.urgency}
                      </span>

                      <span className="text-[11px] text-[#64748B]">
                        {event.kode_unras} • {event.id_kejadian}
                      </span>
                    </div>

                    <h2
                      onClick={() => handleOpenDetail(event.id)}
                      className="text-sm font-bold text-white hover:text-blue-400 cursor-pointer transition-colors line-clamp-1"
                    >
                      {event.isu_tuntutan}
                    </h2>

                    <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-[#98A4B8]">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-blue-400" />
                        {event.tanggal} ({event.waktu_mulai || "09:00 WIB"})
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                        {event.lokasi}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-amber-400" />
                        {crowdDisplay}
                      </span>
                      {event.organisasi_kelompok && (
                        <>
                          <span>•</span>
                          <span className="text-[#64748B] truncate max-w-xs">
                            {event.organisasi_kelompok}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Geocoding Pending Suggestion Card */}
                    {event.suggested_lat && !event.has_coordinates && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 flex flex-wrap items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <MapPin className="w-4 h-4 text-purple-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white truncate">
                                Saran Lokasi Otomatis: {event.suggested_address || event.lokasi}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  event.geocoding_confidence === "high"
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                }`}
                              >
                                {event.geocoding_confidence === "high" ? "Akurat (100% POI)" : "Kawasan"}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#98A4B8] font-mono block mt-0.5">
                              Koordinat: {event.suggested_lat.toFixed(4)}, {event.suggested_lng?.toFixed(4)} • Provider: {event.geocoding_provider}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={verifyingId === event.id}
                            onClick={() => handleQuickVerify(event)}
                            className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{verifyingId === event.id ? "Memproses..." : "Setujui Titik"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(event.id)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#161C2B] hover:bg-[#1E2638] text-[#98A4B8] hover:text-white border border-[var(--border-subtle)] transition-colors cursor-pointer"
                          >
                            Sesuaikan di Peta
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {event.has_coordinates && onViewOnMap && (
                      <button
                        type="button"
                        onClick={() => onViewOnMap(event)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#161C2B] hover:bg-[#1E2638] text-blue-400 border border-blue-500/30 transition-colors flex items-center gap-1"
                        title="Tampilkan di Peta Interaktif"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>Peta</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenDetail(event.id)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20 transition-all"
                    >
                      Buka Detail
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[#111622] flex items-center justify-between text-xs text-[#98A4B8]">
            <span>
              Menampilkan {events.length} dari {totalCount} pantauan unjuk rasa
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="p-1 rounded-lg border border-[var(--border-default)] text-white hover:bg-white/5 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-white font-semibold">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="p-1 rounded-lg border border-[var(--border-default)] text-white hover:bg-white/5 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <ProtestDetailModal
        protestId={selectedProtestId}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedProtestId(null);
        }}
        onUpdated={handleRefresh}
        onSelectCameraToPlay={onSelectCameraToPlay}
      />

      <ProtestCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => {
          handleRefresh();
        }}
      />

      <ProtestSyncModal
        isOpen={isSyncOpen}
        onClose={() => setIsSyncOpen(false)}
        onSyncCompleted={() => {
          handleRefresh();
        }}
      />
    </div>
  );
}

