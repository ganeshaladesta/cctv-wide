"use client";

import React, { useState, useMemo } from "react";
import {
  ShieldAlert,
  Flame,
  Clock,
  Video,
  MapPin,
  Users,
  ExternalLink,
  ChevronRight,
  Filter,
  Grid,
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  Calendar,
  Layers,
  ChevronLeft
} from "lucide-react";
import { ProtestEvent, ProtestStatus, ProtestUrgency } from "@/lib/types/protests";
import { Camera } from "@/lib/types";
import { FavoritesButton } from "@/components/motion-ui";

export interface UnrasPriorityPanelProps {
  protestEvents: ProtestEvent[];
  onSelectEventDetail: (event: ProtestEvent) => void;
  onFocusEventOnMap: (event: ProtestEvent) => void;
  onOpenDedicatedMultiView?: (event: ProtestEvent, cameras: Camera[]) => void;
  onViewAllProtests: () => void;

  // Preserved CCTV Camera Directory Sidebar Props
  cameras: Camera[];
  totalMatchingCameras: number;
  onSelectCamera: (cameraId: string, cam: Camera) => void;
  onToggleMultiViewCamera: (cam: Camera) => void;
  multiViewIdSet: Set<string>;
  page: number;
  totalPages: number;
  onPageChange?: (newPage: number) => void;
  loadingCameras: boolean;
}

export function UnrasPriorityPanel({
  protestEvents,
  onSelectEventDetail,
  onFocusEventOnMap,
  onOpenDedicatedMultiView,
  onViewAllProtests,
  cameras,
  totalMatchingCameras,
  onSelectCamera,
  onToggleMultiViewCamera,
  multiViewIdSet,
  page,
  totalPages,
  onPageChange,
  loadingCameras
}: UnrasPriorityPanelProps) {
  // Sidebar tab: 'unras' (default) or 'cameras'
  const [activeSidebarTab, setActiveSidebarTab] = useState<"unras" | "cameras">("unras");
  const [unrasStatusFilter, setUnrasStatusFilter] = useState<string>("all_active");
  const [unrasSearchQuery, setUnrasSearchQuery] = useState<string>("");

  // Today in Asia/Jakarta (WIB)
  const todayWib = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }, []);

  // Filter & Prioritize UNRAS events
  const prioritizedEvents = useMemo(() => {
    let list = protestEvents.filter((p) => !p.deleted_at);

    // Filter by status tab
    if (unrasStatusFilter === "all_active") {
      list = list.filter((p) => ["ongoing", "monitoring", "scheduled"].includes(p.status));
    } else if (unrasStatusFilter === "today") {
      list = list.filter((p) => p.tanggal === todayWib);
    } else if (unrasStatusFilter === "ongoing") {
      list = list.filter((p) => p.status === "ongoing");
    } else if (unrasStatusFilter === "monitoring") {
      list = list.filter((p) => p.status === "monitoring");
    } else if (unrasStatusFilter === "scheduled") {
      list = list.filter((p) => p.status === "scheduled");
    }

    // Filter by search query
    if (unrasSearchQuery.trim()) {
      const q = unrasSearchQuery.toLowerCase();
      list = list.filter((p) => {
        return (
          p.isu_tuntutan?.toLowerCase().includes(q) ||
          p.lokasi?.toLowerCase().includes(q) ||
          p.kota_kabupaten?.toLowerCase().includes(q) ||
          p.provinsi?.toLowerCase().includes(q) ||
          p.organisasi_kelompok?.toLowerCase().includes(q) ||
          p.kode_unras?.toLowerCase().includes(q)
        );
      });
    }

    // Prioritize:
    // 1. ongoing
    // 2. monitoring
    // 3. scheduled
    // 4. urgency (critical > high > medium > low)
    // 5. recency
    const statusWeight: Record<ProtestStatus, number> = {
      ongoing: 4,
      monitoring: 3,
      scheduled: 2,
      completed: 1,
      cancelled: 0
    };

    const urgencyWeight: Record<ProtestUrgency, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1
    };

    return list.sort((a, b) => {
      const sA = statusWeight[a.status] || 0;
      const sB = statusWeight[b.status] || 0;
      if (sA !== sB) return sB - sA;

      const uA = urgencyWeight[a.urgency] || 0;
      const uB = urgencyWeight[b.urgency] || 0;
      if (uA !== uB) return uB - uA;

      // Recency
      return (b.tanggal || "").localeCompare(a.tanggal || "");
    });
  }, [protestEvents, unrasStatusFilter, unrasSearchQuery, todayWib]);

  const ongoingCount = useMemo(() => protestEvents.filter((p) => p.status === "ongoing").length, [protestEvents]);
  const monitoringCount = useMemo(() => protestEvents.filter((p) => p.status === "monitoring").length, [protestEvents]);
  const scheduledCount = useMemo(() => protestEvents.filter((p) => p.status === "scheduled").length, [protestEvents]);
  const todayCount = useMemo(() => protestEvents.filter((p) => p.tanggal === todayWib).length, [protestEvents, todayWib]);

  // Helper to split elements from string
  const getMassElements = (raw: string | null | undefined): string[] => {
    if (!raw) return [];
    return raw
      .split(/[,;\/\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1)
      .slice(0, 4);
  };

  return (
    <div
      data-testid="executive-priority-sidebar"
      className="rounded-2xl ee-surface border border-[var(--border-default)] flex flex-col overflow-hidden min-w-0 h-[520px] sm:h-[600px] lg:h-[660px] shadow-xl"
    >
      {/* Top Header Mode Switcher */}
      <div className="px-3 py-2 bg-[#0C1018] border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#070A0F] border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setActiveSidebarTab("unras")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSidebarTab === "unras"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-[#98A4B8] hover:text-white hover:bg-white/5"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-300" />
            <span>Prioritas Situasi UNRAS</span>
            {ongoingCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSidebarTab("cameras")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSidebarTab === "cameras"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "text-[#98A4B8] hover:text-white hover:bg-white/5"
            }`}
          >
            <Video className="w-3.5 h-3.5 text-blue-300" />
            <span>Direktori CCTV ({totalMatchingCameras.toLocaleString("id-ID")})</span>
          </button>
        </div>

        {activeSidebarTab === "cameras" && (
          <span className="text-[11px] text-[#98A4B8] font-mono tabular-nums shrink-0 hidden sm:inline">
            Hal {page}/{totalPages}
          </span>
        )}
      </div>

      {/* VIEW 1: UNRAS EXECUTIVE SITUATION & PRIORITY PANEL */}
      {activeSidebarTab === "unras" && (
        <div className="flex-1 flex flex-col min-h-0 bg-[#070A0F]/60">
          {/* Filter Toolbar */}
          <div className="p-2.5 border-b border-[var(--border-subtle)] space-y-2 bg-[#090D14]">
            {/* Quick Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setUnrasStatusFilter("all_active")}
                className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors ${
                  unrasStatusFilter === "all_active"
                    ? "bg-blue-600 text-white"
                    : "bg-[#111622] text-[#98A4B8] hover:text-white border border-white/5"
                }`}
              >
                Semua Aktif
              </button>

              <button
                type="button"
                onClick={() => setUnrasStatusFilter("today")}
                className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors flex items-center gap-1 ${
                  unrasStatusFilter === "today"
                    ? "bg-blue-600 text-white"
                    : "bg-[#111622] text-[#98A4B8] hover:text-white border border-white/5"
                }`}
              >
                <Calendar className="w-3 h-3" />
                <span>Hari Ini ({todayCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setUnrasStatusFilter("ongoing")}
                className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors flex items-center gap-1 ${
                  unrasStatusFilter === "ongoing"
                    ? "bg-red-600 text-white"
                    : "bg-red-950/40 text-red-300 hover:text-white border border-red-500/20"
                }`}
              >
                <Flame className="w-3 h-3 text-red-400" />
                <span>Ongoing ({ongoingCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setUnrasStatusFilter("monitoring")}
                className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors flex items-center gap-1 ${
                  unrasStatusFilter === "monitoring"
                    ? "bg-purple-600 text-white"
                    : "bg-purple-950/40 text-purple-300 hover:text-white border border-purple-500/20"
                }`}
              >
                <span>Monitoring ({monitoringCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setUnrasStatusFilter("scheduled")}
                className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors flex items-center gap-1 ${
                  unrasStatusFilter === "scheduled"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-950/40 text-amber-300 hover:text-white border border-amber-500/20"
                }`}
              >
                <span>Terjadwal ({scheduledCount})</span>
              </button>
            </div>

            {/* In-Panel Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#98A4B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={unrasSearchQuery}
                onChange={(e) => setUnrasSearchQuery(e.target.value)}
                placeholder="Cari isu tuntutan, lokasi, elemen massa, kota..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg ee-input text-xs placeholder-[#657287]"
              />
            </div>
          </div>

          {/* Priority Event Cards List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] p-2 space-y-2">
            {prioritizedEvents.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#657287] p-4">
                <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-30 text-blue-400" />
                <span>Tidak ada aksi unjuk rasa yang cocok dengan kriteria filter saat ini.</span>
              </div>
            ) : (
              prioritizedEvents.map((event) => {
                const crowd = event.actual_crowd_size || event.estimasi_massa_source;
                const elements = getMassElements(event.organisasi_kelompok);
                const hasCoords = event.validated_lat !== null && event.validated_lng !== null;
                const cctvCount = event.camera_links?.length || 0;

                const isOngoing = event.status === "ongoing";
                const isMonitoring = event.status === "monitoring";
                const isScheduled = event.status === "scheduled";

                return (
                  <div
                    key={event.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isOngoing
                        ? "bg-red-950/20 border-red-500/40 hover:border-red-400"
                        : isMonitoring
                        ? "bg-purple-950/15 border-purple-500/30 hover:border-purple-400"
                        : "bg-[#0C1018] border-[var(--border-subtle)] hover:border-blue-500/30"
                    }`}
                  >
                    {/* Top Row: Status, Urgency, Code */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                            isOngoing
                              ? "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse"
                              : isMonitoring
                              ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                              : isScheduled
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                              : "bg-slate-500/20 text-slate-300 border border-slate-500/40"
                          }`}
                        >
                          {event.status}
                        </span>

                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            event.urgency === "critical"
                              ? "bg-red-600 text-white"
                              : event.urgency === "high"
                              ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                              : "bg-white/5 text-[#98A4B8]"
                          }`}
                        >
                          {event.urgency}
                        </span>
                      </div>

                      <span className="font-mono text-[10px] text-[#98A4B8]">
                        {event.kode_unras || event.id_kejadian}
                      </span>
                    </div>

                    {/* Title */}
                    <h4
                      className="text-xs font-bold text-white line-clamp-2 hover:text-blue-300 transition-colors cursor-pointer"
                      onClick={() => onSelectEventDetail(event)}
                    >
                      {event.isu_tuntutan || event.lokasi}
                    </h4>

                    {/* Location */}
                    <p className="text-[11px] text-[#98A4B8] truncate mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-red-400 shrink-0" />
                      <span>{event.lokasi} • {event.kota_kabupaten}, {event.provinsi}</span>
                    </p>

                    {/* Crowd & Involved Elements */}
                    <div className="mt-2 pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                      <div className="flex items-center gap-1 text-[#C5D0E3]">
                        <Users className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>
                          Massa: <strong className="text-white font-mono">{crowd ? `±${crowd.toLocaleString("id-ID")}` : "Belum terdata"}</strong> org
                        </span>
                      </div>

                      {/* CCTV Badge */}
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1 ${
                          cctvCount > 0
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : "bg-amber-500/10 text-amber-400/80 border border-amber-500/20"
                        }`}
                      >
                        <Video className="w-2.5 h-2.5" />
                        <span>{cctvCount > 0 ? `${cctvCount} CCTV Tertaut` : "Belum Ada CCTV"}</span>
                      </span>
                    </div>

                    {/* Involved Elements Tags */}
                    {elements.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        {elements.map((el, idx) => (
                          <span
                            key={idx}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-[#98A4B8] border border-white/5 truncate max-w-[140px]"
                            title={el}
                          >
                            {el}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Action Buttons Row */}
                    <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-white/[0.06]">
                      <span className="text-[10px] text-[#64748B] font-mono">
                        {event.tanggal} {event.waktu_mulai ? `• ${event.waktu_mulai}` : ""}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasCoords && (
                          <button
                            type="button"
                            onClick={() => onFocusEventOnMap(event)}
                            className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-[#161C2B] hover:bg-[#1C2436] text-[#60A5FA] border border-[var(--border-subtle)] transition-colors cursor-pointer"
                            title="Tampilkan titik di peta nasional"
                          >
                            Peta
                          </button>
                        )}

                        {cctvCount > 0 && onOpenDedicatedMultiView && (
                          <button
                            type="button"
                            onClick={() => {
                              const resolved = (event.camera_links || [])
                                .map((l) => l.camera)
                                .filter((c): c is Camera => Boolean(c));
                              onOpenDedicatedMultiView(event, resolved);
                            }}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-blue-600/25 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                            title="Buka Pemantauan Multi-View CCTV Aksi Ini"
                          >
                            <Grid className="w-2.5 h-2.5 text-emerald-400" />
                            <span>Multi-View ({cctvCount})</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onSelectEventDetail(event)}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                        >
                          <span>Detail</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Action: Open Full UNRAS Module */}
          <div className="p-2.5 bg-[#0C1018] border-t border-[var(--border-subtle)] shrink-0">
            <button
              type="button"
              onClick={onViewAllProtests}
              className="w-full py-2 px-3 rounded-xl bg-[#161D2B] hover:bg-blue-600 text-xs font-semibold text-white transition-all border border-[var(--border-default)] hover:border-blue-400 flex items-center justify-center gap-2 cursor-pointer group"
            >
              <span>Buka Modul Pantauan UNRAS Lengkap</span>
              <ExternalLink className="w-3.5 h-3.5 text-blue-400 group-hover:text-white transition-colors" />
            </button>
          </div>
        </div>
      )}

      {/* VIEW 2: PRESERVED CCTV CAMERA DIRECTORY SIDEBAR */}
      {activeSidebarTab === "cameras" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]">
            {loadingCameras ? (
              <div className="p-8 text-center text-xs text-[#98A4B8]">
                Memuat daftar kamera CCTV...
              </div>
            ) : cameras.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#657287]">
                Tidak ada kamera yang cocok dengan filter.
              </div>
            ) : (
              cameras.map((cam) => (
                <div
                  key={cam.id}
                  data-testid={`directory-camera-row-${cam.id}`}
                  className="p-3 hover:bg-white/[0.035] transition-colors flex items-start justify-between gap-2"
                >
                  <button
                    type="button"
                    data-testid={`directory-camera-btn-${cam.id}`}
                    onClick={() => onSelectCamera(cam.id, cam)}
                    className="text-left min-w-0 flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] rounded-md"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          cam.status === "ONLINE" ? "bg-[#10B981]" : "bg-[#EF4444]"
                        }`}
                      />
                      <p className="text-xs font-semibold text-[#F3F6FB] truncate">
                        {cam.name}
                      </p>
                    </div>
                    <p className="text-[11px] text-[#98A4B8] truncate mt-0.5">
                      {cam.city_name}, {cam.province_name}
                    </p>
                    <p className="text-[10px] text-[#657287] truncate mt-0.5 font-mono">
                      {cam.source_name} • {cam.protocol}
                    </p>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <FavoritesButton
                      cameraId={cam.id}
                      cameraName={cam.name}
                      size="sm"
                    />
                    <button
                      type="button"
                      onClick={() => onToggleMultiViewCamera(cam)}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors border ${
                        multiViewIdSet.has(cam.id)
                          ? "bg-[#3B82F6] text-white border-[#3B82F6]"
                          : "bg-[#161C2B] text-[#98A4B8] hover:text-white border-[var(--border-subtle)]"
                      }`}
                      title={
                        multiViewIdSet.has(cam.id)
                          ? "Hapus dari Multi-View"
                          : "Tambah ke Multi-View"
                      }
                    >
                      {multiViewIdSet.has(cam.id) ? "Wall ✓" : "+ Wall"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* CCTV Pagination */}
          <div className="px-3.5 py-2.5 bg-[#0C1018] border-t border-[var(--border-subtle)] flex items-center justify-between text-xs shrink-0">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
              className="px-2.5 py-1 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] disabled:opacity-40 text-[#E2E8F0] border border-[var(--border-subtle)] transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-[#98A4B8] font-mono tabular-nums">
              Halaman {page} dari {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange?.(page + 1)}
              className="px-2.5 py-1 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] disabled:opacity-40 text-[#E2E8F0] border border-[var(--border-subtle)] transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

