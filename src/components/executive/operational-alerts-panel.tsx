"use client";

import React from "react";
import {
  AlertTriangle,
  Flame,
  ShieldAlert,
  VideoOff,
  MapPinOff,
  ChevronRight,
  CheckCircle2,
  Activity,
  Layers
} from "lucide-react";
import { ProtestEvent, ProtestStats } from "@/lib/types/protests";
import { DashboardStats } from "@/lib/types";

export interface OperationalAlertsPanelProps {
  protestEvents: ProtestEvent[];
  protestStats: ProtestStats | null;
  cctvStats: DashboardStats;
  onSelectEventDetail: (event: ProtestEvent) => void;
  onFocusEventOnMap: (event: ProtestEvent) => void;
  onSelectTab: (tab: any) => void;
}

export function OperationalAlertsPanel({
  protestEvents,
  protestStats,
  cctvStats,
  onSelectEventDetail,
  onFocusEventOnMap,
  onSelectTab
}: OperationalAlertsPanelProps) {
  // 1. Ongoing events
  const ongoingEvents = React.useMemo(
    () => protestEvents.filter((p) => p.status === "ongoing" && !p.deleted_at),
    [protestEvents]
  );

  // 2. Active events without coordinates
  const unmappedActiveEvents = React.useMemo(
    () =>
      protestEvents.filter(
        (p) =>
          ["ongoing", "monitoring", "scheduled"].includes(p.status) &&
          (p.validated_lat === null || p.validated_lng === null) &&
          !p.deleted_at
      ),
    [protestEvents]
  );

  // 3. Active events without linked CCTV cameras (Operational Blind Spots)
  const blindSpotEvents = React.useMemo(
    () =>
      protestEvents.filter(
        (p) =>
          ["ongoing", "monitoring"].includes(p.status) &&
          (!p.camera_links || p.camera_links.length === 0) &&
          !p.deleted_at
      ),
    [protestEvents]
  );

  const hasAnyAlerts =
    ongoingEvents.length > 0 ||
    unmappedActiveEvents.length > 0 ||
    blindSpotEvents.length > 0;

  return (
    <div className="rounded-2xl ee-surface border border-[var(--border-default)] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
            OPERATIONAL ATTENTION & ALERT DISPATCH • PERHATIAN LAPANGAN
          </h3>
        </div>
        <span className="text-[10px] text-[#98A4B8] font-mono">
          Evaluasi Dinamis Berdasarkan Telemetri Terverifikasi
        </span>
      </div>

      {!hasAnyAlerts ? (
        <div className="p-4 rounded-xl bg-[#0C121D] border border-emerald-500/20 flex items-center gap-3 text-xs text-emerald-400">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>
            Kondisi Lapangan Terkendali: Tidak ada eskalasi darurat, seluruh perimeter aktif terpetakan dan terhubung ke instrumen pemantauan.
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Card 1: Critical Ongoing Alert */}
          <div
            className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
              ongoingEvents.length > 0
                ? "bg-red-950/25 border-red-500/40"
                : "bg-[#0B0F17] border-[var(--border-subtle)] opacity-70"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold flex items-center gap-1.5 text-red-400">
                  <Flame className="w-4 h-4" />
                  <span>Aksi Sedang Berlangsung</span>
                </span>
                <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                  {ongoingEvents.length} Titik
                </span>
              </div>
              <p className="text-[11px] text-[#C5D0E3] mt-2">
                {ongoingEvents.length > 0
                  ? "Terdapat eskalasi unjuk rasa aktif yang memerlukan pemantauan visual live tanpa henti."
                  : "Nol aksi sedang berlangsung saat ini."}
              </p>
              {ongoingEvents.length > 0 && (
                <div className="mt-2 space-y-1">
                  {ongoingEvents.slice(0, 2).map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => onSelectEventDetail(ev)}
                      className="p-1.5 rounded bg-black/40 hover:bg-black/60 text-[10px] text-white cursor-pointer truncate flex items-center justify-between"
                    >
                      <span className="truncate">{ev.lokasi} • {ev.isu_tuntutan}</span>
                      <ChevronRight className="w-3 h-3 text-red-400 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {ongoingEvents.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectEventDetail(ongoingEvents[0])}
                className="mt-3 w-full py-1.5 rounded-lg text-[10px] font-bold bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>Inspeksi Titik Terdekat</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Card 2: Blind Spot Alert (No CCTV) */}
          <div
            className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
              blindSpotEvents.length > 0
                ? "bg-purple-950/25 border-purple-500/40"
                : "bg-[#0B0F17] border-[var(--border-subtle)] opacity-70"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold flex items-center gap-1.5 text-purple-400">
                  <VideoOff className="w-4 h-4" />
                  <span>Blind Spot (Tanpa CCTV)</span>
                </span>
                <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {blindSpotEvents.length} Titik
                </span>
              </div>
              <p className="text-[11px] text-[#C5D0E3] mt-2">
                {blindSpotEvents.length > 0
                  ? "Titik aksi dalam pemantauan yang belum ditautkan ke kamera CCTV perimeter."
                  : "Seluruh aksi pemantauan telah memiliki tautan stream CCTV."}
              </p>
              {blindSpotEvents.length > 0 && (
                <div className="mt-2 space-y-1">
                  {blindSpotEvents.slice(0, 2).map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => onSelectEventDetail(ev)}
                      className="p-1.5 rounded bg-black/40 hover:bg-black/60 text-[10px] text-white cursor-pointer truncate flex items-center justify-between"
                    >
                      <span className="truncate">{ev.lokasi}</span>
                      <span className="text-[9px] text-purple-300 font-mono">Tautkan CCTV &rarr;</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {blindSpotEvents.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectEventDetail(blindSpotEvents[0])}
                className="mt-3 w-full py-1.5 rounded-lg text-[10px] font-bold bg-purple-600 hover:bg-purple-500 text-white transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>Tautkan Kamera Terdekat</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Card 3: Geocoding Unmapped Alert */}
          <div
            className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
              unmappedActiveEvents.length > 0
                ? "bg-amber-950/20 border-amber-500/40"
                : "bg-[#0B0F17] border-[var(--border-subtle)] opacity-70"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold flex items-center gap-1.5 text-amber-400">
                  <MapPinOff className="w-4 h-4" />
                  <span>Belum Terpetakan GPS</span>
                </span>
                <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {unmappedActiveEvents.length} Titik
                </span>
              </div>
              <p className="text-[11px] text-[#C5D0E3] mt-2">
                {unmappedActiveEvents.length > 0
                  ? "Data aksi aktif tanpa koordinat GPS tervalidasi. Perlu validasi agar muncul di peta nasional."
                  : "Seluruh aksi aktif telah terpetakan secara geospasial."}
              </p>
              {unmappedActiveEvents.length > 0 && (
                <div className="mt-2 space-y-1">
                  {unmappedActiveEvents.slice(0, 2).map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => onSelectEventDetail(ev)}
                      className="p-1.5 rounded bg-black/40 hover:bg-black/60 text-[10px] text-white cursor-pointer truncate flex items-center justify-between"
                    >
                      <span className="truncate">{ev.lokasi}</span>
                      <span className="text-[9px] text-amber-300 font-mono">Petakan &rarr;</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {unmappedActiveEvents.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectEventDetail(unmappedActiveEvents[0])}
                className="mt-3 w-full py-1.5 rounded-lg text-[10px] font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>Validasi Titik Peta</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

