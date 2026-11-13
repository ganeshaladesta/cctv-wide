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
}

export function ProtestDashboard({
  onViewOnMap,
  onSelectCameraToPlay
}: ProtestDashboardProps) {
  // Data states
  const [events, setEvents] = useState<ProtestEvent[]>([]);
  const [stats, setStats] = useState<ProtestStats | null>(null);
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

  // Modal states
  const [selectedProtestId, setSelectedProtestId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);

  // Sync state for dedicated sync panel
  const [syncLogs, setSyncLogs] = useState<ProtestSyncLog[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Fetch KPI Stats
  const fetchStats = async () => {
    try {
      const res = await fetch("/api/protests/stats");
      const json = await res.json();
      if (res.ok && json.success) {
        setStats(json.data);
      }
    } catch {
      // Ignored
    }
  };

  // Fetch Sync Logs
  const fetchSyncData = async () => {
    try {
      const res = await fetch("/api/protests/sync");
      const json = await res.json();
      if (res.ok && json.success) {
        setSyncLogs(json.latestSyncLogs || []);
      }
    } catch {
      // Ignored
    }
  };

  const triggerDashboardManualSync = async () => {
    setSyncLoading(true);
    setSyncFeedback(null);
    try {
      const res = await fetch("/api/protests/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-scc-user-role": "admin"
        },
        body: JSON.stringify({ forceFixture: true })
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Gagal sinkronisasi data unjuk rasa.");
      }
      setSyncFeedback(
        `Sinkronisasi Selesai: +${json.summary?.inserted ?? 0} baru, ~${json.summary?.updated ?? 0} diperbarui, /${json.summary?.skipped ?? 0} dilewati.`
      );
      await fetchStats();
      await fetchSyncData();
      fetchProtests();
    } catch (err: any) {
      setSyncFeedback(`Error: ${err.message}`);
    } finally {
      setSyncLoading(false);
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

      const res = await fetch(`/api/protests?${params.toString()}`);
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
  }, [page, limit, searchQuery, statusFilter, urgencyFilter, hasCoordsFilter]);

  useEffect(() => {
    fetchStats();
    fetchProtests();
    fetchSyncData();
  }, [fetchProtests]);

  const handleOpenDetail = (id: string) => {
    setSelectedProtestId(id);
    setIsDetailOpen(true);
  };

  const handleRefresh = () => {
    fetchStats();
    fetchProtests();
    fetchSyncData();
  };

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

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsSyncOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#161C2B] hover:bg-[#1E2638] text-[#98A4B8] hover:text-white border border-[var(--border-default)] transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sinkronisasi OneDrive</span>
          </button>

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

      {/* Exactly Four Primary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Jumlah Total Unras */}
        <div className="p-4 rounded-2xl bg-[#0D121B] border border-[var(--border-default)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#98A4B8] font-medium">Jumlah Total Unras</span>
            <Layers className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {stats?.total_events ?? 0}
          </div>
          <span className="text-[10px] text-[#64748B] block mt-0.5">Seluruh aksi tercatat</span>
        </div>

        {/* Card 2: Sedang Berlangsung */}
        <div className="p-4 rounded-2xl bg-[#0D121B] border border-[var(--border-default)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#98A4B8] font-medium">Sedang Berlangsung</span>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          </div>
          <div className="text-2xl font-black text-red-400 mt-1">
            {stats?.ongoing_events ?? 0}
          </div>
          <span className="text-[10px] text-[#64748B] block mt-0.5">Prioritas pemantauan aktif</span>
        </div>

        {/* Card 3: Belum Berlangsung */}
        <div className="p-4 rounded-2xl bg-[#0D121B] border border-[var(--border-default)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#98A4B8] font-medium">Belum Berlangsung</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 mt-1">
            {stats?.scheduled_events ?? 0}
          </div>
          <span className="text-[10px] text-[#64748B] block mt-0.5">Terjadwal & siaga pengamanan</span>
        </div>

        {/* Card 4: Selesai */}
        <div className="p-4 rounded-2xl bg-[#0D121B] border border-[var(--border-default)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#98A4B8] font-medium">Selesai</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            {(stats?.completed_events ?? 0) + (stats?.monitoring_events ?? 0)}
          </div>
          <span className="text-[10px] text-[#64748B] block mt-0.5">Kondusif & observasi terekam</span>
        </div>
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
                    Status Sinkronisasi Rolling 7-Hari
                  </h3>
                  <p className="text-[11px] text-[#98A4B8]">
                    Alur Otomatis Power Automate (05:00 WIB) & Integrasi Workbook OneDrive
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
                    Status: {latestLog.status}
                  </span>
                )}
                <button
                  type="button"
                  onClick={triggerDashboardManualSync}
                  disabled={syncLoading}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                  title="Manual sync terbatas untuk peran Administrator"
                >
                  <RefreshCw className={`w-3 h-3 ${syncLoading ? "animate-spin" : ""}`} />
                  <span>{syncLoading ? "Menyelaraskan..." : "Sync Sekarang (Admin)"}</span>
                </button>
              </div>
            </div>

            {syncFeedback && (
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300">
                {syncFeedback}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-[#141A28] border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[#64748B] block">Sinkronisasi Terakhir (Sukses)</span>
                <span className="text-white font-medium mt-0.5 block truncate">
                  {formatWib(lastSuccessLog?.completed_at || latestLog?.completed_at)}
                </span>
                <span className="text-[10px] text-[#98A4B8]">
                  Percobaan: {formatWib(latestLog?.started_at)}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-[#141A28] border border-[var(--border-subtle)] col-span-1 md:col-span-2">
                <span className="text-[10px] text-[#64748B] block">Jendela Sinkronisasi (Rolling 7 Hari)</span>
                <div className="text-white font-medium mt-0.5 flex flex-wrap items-center gap-1">
                  <span>{formatWib(latestLog?.period_start)}</span>
                  <span className="text-[#64748B]">s/d</span>
                  <span>{formatWib(latestLog?.period_end)}</span>
                </div>
                <span className="text-[10px] text-[#98A4B8]">Inklusi: start ≤ event &lt; end (Asia/Jakarta)</span>
              </div>

              <div className="p-2.5 rounded-xl bg-[#141A28] border border-[var(--border-subtle)]">
                <span className="text-[10px] text-[#64748B] block">Rangkuman Rekaman Batch</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-emerald-400 font-bold" title="Baru Dibuat">
                    +{latestLog?.records_created ?? 0}
                  </span>
                  <span className="text-blue-400 font-bold" title="Diperbarui">
                    ~{latestLog?.records_updated ?? 0}
                  </span>
                  <span className="text-amber-400 font-bold" title="Dilewati (di luar 7 hari / invalid)">
                    /{latestLog?.records_skipped ?? 0}
                  </span>
                  <span className="text-red-400 font-bold" title="Gagal">
                    !{latestLog?.records_failed ?? 0}
                  </span>
                </div>
                <span className="text-[10px] text-[#64748B] block mt-0.5">
                  Total diterima: {latestLog?.records_received ?? 0} baris
                </span>
              </div>
            </div>
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
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === "scheduled"
                ? "bg-amber-600 text-white shadow-md shadow-amber-500/20"
                : "bg-[#111622] text-[#98A4B8] hover:text-white"
            }`}
          >
            Terencana
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
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === "completed"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                : "bg-[#111622] text-[#98A4B8] hover:text-white"
            }`}
          >
            Selesai (Arsip)
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === "all"
                ? "bg-slate-700 text-white"
                : "bg-[#111622] text-[#98A4B8] hover:text-white"
            }`}
          >
            Semua Status
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
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isOngoing
                            ? "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse"
                            : isScheduled
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                            : isMonitoring
                            ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                            : "bg-slate-500/20 text-slate-300 border border-slate-500/40"
                        }`}
                      >
                        {event.status}
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

