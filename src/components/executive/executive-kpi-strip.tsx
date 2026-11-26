"use client";

import React from "react";
import {
  Video,
  CheckCircle2,
  XCircle,
  Globe2,
  ShieldAlert,
  Flame,
  Users,
  Activity,
  Layers,
  Clock,
  Eye
} from "lucide-react";
import { DashboardStats } from "@/lib/types";
import { ProtestStats, ProtestEvent, DailyUnrasSituationOverview } from "@/lib/types/protests";
import { normalizeProtestStatus } from "@/lib/unras-helpers";
import { ProgramsCard } from "@/components/motion-ui";
import { DashboardTab } from "@/components/branding";

interface ExecutiveKpiStripProps {
  cctvStats: DashboardStats;
  unrasStats: ProtestStats | null;
  activeProtests: ProtestEvent[];
  dailyOverview?: DailyUnrasSituationOverview | null;
  operationalDate?: string;
  onSelectTab: (tab: DashboardTab) => void;
  onFilterUnrasStatus?: (status: string) => void;
}

export function ExecutiveKpiStrip({
  cctvStats,
  unrasStats,
  activeProtests,
  dailyOverview,
  operationalDate,
  onSelectTab,
  onFilterUnrasStatus
}: ExecutiveKpiStripProps) {
  const todayWib = React.useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }, []);

  // Calculate fallback total crowd across currently active events
  const totalActiveCrowd = React.useMemo(() => {
    return activeProtests.reduce((acc, p) => {
      const crowd = p.actual_crowd_size || p.estimasi_massa_source || 0;
      return acc + crowd;
    }, 0);
  }, [activeProtests]);

  // Fallback count active provinces affected
  const fallbackProvincesCount = React.useMemo(() => {
    const provs = new Set(
      activeProtests
        .map((p) => p.provinsi)
        .filter((prov): prov is string => Boolean(prov))
    );
    return provs.size;
  }, [activeProtests]);

  // Fallback count active regions affected
  const fallbackRegionsCount = React.useMemo(() => {
    const regs = new Set(
      activeProtests
        .map((p) => p.regional || p.provinsi)
        .filter((r): r is string => Boolean(r))
    );
    return regs.size;
  }, [activeProtests]);

  // Strict Daily Metrics based on Asia/Jakarta operational date
  const totalPoints = dailyOverview ? dailyOverview.total_points : activeProtests.length;
  const ongoingCount = dailyOverview ? dailyOverview.ongoing_points_count : activeProtests.filter((p) => normalizeProtestStatus(p.status) === "ongoing").length;
  const monitoringCount = dailyOverview ? dailyOverview.monitoring_points_count : activeProtests.filter((p) => normalizeProtestStatus(p.status) === "monitoring").length;
  const scheduledCount = dailyOverview ? dailyOverview.scheduled_points_count : activeProtests.filter((p) => normalizeProtestStatus(p.status) === "scheduled").length;
  const totalCrowd = dailyOverview ? dailyOverview.total_estimated_crowd : totalActiveCrowd;
  const totalElements = dailyOverview ? dailyOverview.total_identified_elements : 0;
  const affectedProvincesCount = dailyOverview ? dailyOverview.affected_provinces_count : fallbackProvincesCount;
  const affectedRegionsCount = dailyOverview ? (dailyOverview.affected_regions_count || dailyOverview.affected_provinces_count) : fallbackRegionsCount;

  const uptimePct = cctvStats.total_cameras > 0
    ? ((cctvStats.online_cameras / cctvStats.total_cameras) * 100).toFixed(1)
    : "0.0";

  return (
    <section
      aria-label="Executive Security Telemetry"
      className="relative z-[1] px-2.5 sm:px-4 lg:px-6 pt-3 pb-2"
    >
      <div className="max-w-[1600px] mx-auto space-y-2">
        {/* Section Title Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#98A4B8] font-mono">
              EXECUTIVE SITUATIONAL TELEMETRY • PUSAT KOMANDO KEAMANAN NASIONAL
            </h2>
          </div>
          <span className="text-[10px] text-[#64748B] font-mono">
            Hari Operasional: <strong className="text-slate-200">{operationalDate || todayWib} WIB</strong> (Asia/Jakarta) • Data Persisten Real-Time
          </span>
        </div>

        {/* Unified Command Telemetry Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-2.5">
          {/* 1. UNRAS Sedang Berlangsung (Ongoing) */}
          <ProgramsCard
            index={0}
            enableShimmer
            className={`p-3 sm:p-3.5 rounded-2xl ee-surface transition-all cursor-pointer group ${
              ongoingCount > 0
                ? "border-red-500/40 bg-red-950/20 hover:border-red-400"
                : "border-[var(--border-default)] hover:border-white/20"
            }`}
            onClick={() => onFilterUnrasStatus?.("ongoing")}
          >
            <div className="flex items-center justify-between gap-1 text-[11px] text-[#98A4B8]">
              <span className="truncate">Aksi Berlangsung Hari Ini</span>
              <Flame className={`w-3.5 h-3.5 ${ongoingCount > 0 ? "text-red-400 animate-pulse" : "text-slate-400"} shrink-0`} />
            </div>
            <p className={`text-base sm:text-lg font-extrabold mt-1 font-mono tabular-nums truncate ${ongoingCount > 0 ? "text-red-400" : "text-white"}`}>
              {ongoingCount} <span className="text-xs font-normal text-[#98A4B8]">Titik</span>
            </p>
            <div className="flex items-center justify-between text-[10px] text-[#98A4B8] mt-1 pt-1 border-t border-white/[0.06] font-mono">
              <span>Status Operasional:</span>
              <span className={ongoingCount > 0 ? "text-red-400 font-bold uppercase" : "text-emerald-400"}>
                {ongoingCount > 0 ? "KRITIS" : "KONDUSIF"}
              </span>
            </div>
          </ProgramsCard>

          {/* 2. UNRAS Pemantauan Khusus & Terjadwal */}
          <ProgramsCard
            index={1}
            enableShimmer
            className="p-3 sm:p-3.5 rounded-2xl ee-surface border-purple-500/25 hover:border-purple-400/50 transition-all cursor-pointer group"
            onClick={() => onFilterUnrasStatus?.("monitoring")}
          >
            <div className="flex items-center justify-between gap-1 text-[11px] text-[#98A4B8]">
              <span className="truncate">Pemantauan & Terjadwal</span>
              <ShieldAlert className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform shrink-0" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-base sm:text-lg font-extrabold font-mono tabular-nums text-purple-400">
                {monitoringCount}
              </span>
              <span className="text-xs text-[#98A4B8] font-mono">
                Monitoring • <strong className="text-amber-400">{scheduledCount}</strong> Terjadwal
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[#98A4B8] mt-1 pt-1 border-t border-white/[0.06] font-mono">
              <span>Total Titik Hari Ini:</span>
              <span className="text-white font-bold">{totalPoints} Titik</span>
            </div>
          </ProgramsCard>

          {/* 3. Estimasi Massa & Cakupan Pengawasan */}
          <ProgramsCard
            index={2}
            enableShimmer
            className="p-3 sm:p-3.5 rounded-2xl ee-surface border-blue-500/25 hover:border-blue-400/50 transition-all cursor-pointer group"
            onClick={() => onSelectTab("protests")}
          >
            <div className="flex items-center justify-between gap-1 text-[11px] text-[#98A4B8]">
              <span className="truncate">Estimasi Massa Hari Ini</span>
              <Users className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-extrabold mt-1 font-mono tabular-nums text-amber-300 truncate">
              {totalCrowd > 0
                ? `±${totalCrowd.toLocaleString("id-ID")}`
                : "Termonitor"} <span className="text-xs font-normal text-[#98A4B8]">org</span>
            </p>
            <div className="flex items-center justify-between text-[10px] text-[#98A4B8] mt-1 pt-1 border-t border-white/[0.06] font-mono">
              <span>{totalElements > 0 ? `${totalElements} Elemen • ` : ""}{affectedRegionsCount} Wilayah</span>
              <span className="text-blue-300 font-bold">{affectedProvincesCount} Provinsi</span>
            </div>
          </ProgramsCard>

          {/* 4. CCTV Readiness */}
          <ProgramsCard
            index={3}
            enableShimmer
            className="p-3 sm:p-3.5 rounded-2xl ee-surface border-[var(--border-default)] hover:border-[var(--border-strong)] transition-all cursor-pointer group"
            onClick={() => onSelectTab("directory")}
          >
            <div className="flex items-center justify-between gap-1 text-[11px] text-[#98A4B8]">
              <span className="truncate">Total CCTV Nasional</span>
              <Video className="w-3.5 h-3.5 text-[#60A5FA] group-hover:scale-110 transition-transform shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-extrabold mt-1 font-mono tabular-nums text-[#F3F6FB] truncate">
              {cctvStats.total_cameras.toLocaleString("id-ID")}
            </p>
            <div className="flex items-center justify-between text-[10px] text-[#98A4B8] mt-1 pt-1 border-t border-white/[0.06] font-mono">
              <span>{cctvStats.total_provinces} Provinsi</span>
              <span>{cctvStats.total_cities} Kota/Kab</span>
            </div>
          </ProgramsCard>

          {/* 5. CCTV Online & Uptime */}
          <ProgramsCard
            index={4}
            enableShimmer
            className="p-3 sm:p-3.5 rounded-2xl ee-surface border-emerald-500/25 hover:border-emerald-400/50 transition-all cursor-pointer group"
            onClick={() => onSelectTab("directory")}
          >
            <div className="flex items-center justify-between gap-1 text-[11px] text-[#98A4B8]">
              <span className="truncate">Kamera Online (Aktif)</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-extrabold mt-1 font-mono tabular-nums text-emerald-400 truncate">
              {cctvStats.online_cameras.toLocaleString("id-ID")}
            </p>
            <div className="flex items-center justify-between text-[10px] text-[#98A4B8] mt-1 pt-1 border-t border-white/[0.06] font-mono">
              <span>Uptime:</span>
              <span className="text-emerald-400 font-bold">{uptimePct}%</span>
            </div>
          </ProgramsCard>

          {/* 6. CCTV Offline */}
          <ProgramsCard
            index={5}
            enableShimmer
            className="p-3 sm:p-3.5 rounded-2xl ee-surface border-red-500/20 hover:border-red-400/40 transition-all cursor-pointer group"
            onClick={() => onSelectTab("directory")}
          >
            <div className="flex items-center justify-between gap-1 text-[11px] text-[#98A4B8]">
              <span className="truncate">Kamera Gangguan / Offline</span>
              <XCircle className="w-3.5 h-3.5 text-red-400 group-hover:scale-110 transition-transform shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-extrabold mt-1 font-mono tabular-nums text-red-400 truncate">
              {cctvStats.offline_cameras.toLocaleString("id-ID")}
            </p>
            <div className="flex items-center justify-between text-[10px] text-[#98A4B8] mt-1 pt-1 border-t border-white/[0.06] font-mono">
              <span>Rasio Offline:</span>
              <span className="text-red-400 font-semibold">
                {(100 - parseFloat(uptimePct)).toFixed(1)}%
              </span>
            </div>
          </ProgramsCard>
        </div>
      </div>
    </section>
  );
}

