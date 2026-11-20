"use client";

import React from "react";
import {
  Globe2,
  Video,
  ShieldAlert,
  Flame,
  CheckCircle2,
  TrendingUp,
  MapPin
} from "lucide-react";
import { DashboardStats, Province } from "@/lib/types";
import { ProtestEvent } from "@/lib/types/protests";
import { REGIONAL_PROVINCE_MAP } from "@/lib/geo-reference";

export interface RegionalDistributionMatrixProps {
  cctvStats: DashboardStats;
  provinces: Province[];
  protestEvents: ProtestEvent[];
  onSelectProvinceFilter?: (provinceId: string) => void;
}

interface RegionStat {
  name: string;
  totalCctv: number;
  onlineCctv: number;
  offlineCctv: number;
  uptimePct: string;
  totalProtests: number;
  ongoingProtests: number;
  provincesCount: number;
}

export function RegionalDistributionMatrix({
  cctvStats,
  provinces,
  protestEvents,
  onSelectProvinceFilter
}: RegionalDistributionMatrixProps) {
  // Aggregate stats per island / major region
  const regions: RegionStat[] = React.useMemo(() => {
    const REGION_DEFINITIONS = [
      {
        name: "Sumatera",
        matchProvs: [
          "aceh", "sumatera utara", "sumatera barat", "riau", "kepulauan riau",
          "jambi", "sumatera selatan", "kepulauan bangka belitung", "bengkulu", "lampung"
        ]
      },
      {
        name: "Jawa & DKI Jakarta",
        matchProvs: [
          "dki jakarta", "jawa barat", "jawa tengah", "di yogyakarta", "jawa timur", "banten"
        ]
      },
      {
        name: "Bali & Nusa Tenggara",
        matchProvs: [
          "bali", "nusa tenggara barat", "nusa tenggara timur"
        ]
      },
      {
        name: "Kalimantan",
        matchProvs: [
          "kalimantan barat", "kalimantan tengah", "kalimantan selatan", "kalimantan timur", "kalimantan utara"
        ]
      },
      {
        name: "Sulawesi",
        matchProvs: [
          "sulawesi utara", "gorontalo", "sulawesi tengah", "sulawesi barat", "sulawesi selatan", "sulawesi tenggara"
        ]
      },
      {
        name: "Maluku & Papua",
        matchProvs: [
          "maluku", "maluku utara", "papua", "papua barat", "papua selatan", "papua tengah", "papua pegunungan", "papua barat daya"
        ]
      }
    ];

    return REGION_DEFINITIONS.map((def) => {
      // Find matching provinces in CCTV dataset
      const matchedProvs = provinces.filter((p) =>
        def.matchProvs.some((m) => p.name.toLowerCase().includes(m) || m.includes(p.name.toLowerCase()))
      );

      const totalCctv = matchedProvs.reduce((sum, p) => sum + p.total_cameras, 0);
      const onlineCctv = matchedProvs.reduce((sum, p) => sum + p.online_cameras, 0);
      const offlineCctv = matchedProvs.reduce((sum, p) => sum + p.offline_cameras, 0);
      const uptimePct = totalCctv > 0 ? ((onlineCctv / totalCctv) * 100).toFixed(1) : "0.0";

      // Match UNRAS events
      const matchedProtests = protestEvents.filter((ev) => {
        if (!ev.provinsi) return false;
        const provLower = ev.provinsi.toLowerCase();
        return def.matchProvs.some((m) => provLower.includes(m) || m.includes(provLower));
      });

      const ongoingProtests = matchedProtests.filter((ev) => ev.status === "ongoing").length;

      return {
        name: def.name,
        totalCctv,
        onlineCctv,
        offlineCctv,
        uptimePct,
        totalProtests: matchedProtests.length,
        ongoingProtests,
        provincesCount: matchedProvs.length
      };
    });
  }, [provinces, protestEvents]);

  return (
    <div className="rounded-2xl ee-surface border border-[var(--border-default)] p-4 space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
        <div className="flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
            DISTRIBUSI KEAMANAN REGIONAL NASIONAL • CAKUPAN PER WILAYAH
          </h3>
        </div>
        <span className="text-[10px] text-[#98A4B8] font-mono">
          Korelasi Spasial Telemetri CCTV & Insiden UNRAS
        </span>
      </div>

      {/* Grid of 6 Regions */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {regions.map((reg) => {
          const hasOngoing = reg.ongoingProtests > 0;

          return (
            <div
              key={reg.name}
              className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                hasOngoing
                  ? "bg-red-950/20 border-red-500/35 hover:border-red-400"
                  : "bg-[#0A0E17] border-[var(--border-subtle)] hover:border-blue-500/30"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <h4 className="text-xs font-bold text-white truncate">{reg.name}</h4>
                  {hasOngoing && (
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
                  )}
                </div>
                <p className="text-[10px] text-[#98A4B8] font-mono mt-0.5">
                  {reg.provincesCount} Provinsi
                </p>

                {/* CCTV metrics */}
                <div className="mt-2.5 pt-2 border-t border-white/[0.06] space-y-1 text-[11px] font-mono">
                  <div className="flex items-center justify-between text-[#98A4B8]">
                    <span>CCTV:</span>
                    <strong className="text-white">{reg.totalCctv.toLocaleString("id-ID")}</strong>
                  </div>
                  <div className="flex items-center justify-between text-[#98A4B8]">
                    <span>Online:</span>
                    <span className="text-emerald-400 font-semibold">{reg.uptimePct}%</span>
                  </div>
                </div>

                {/* UNRAS metrics */}
                <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-1 text-[11px] font-mono">
                  <div className="flex items-center justify-between text-[#98A4B8]">
                    <span>Aksi UNRAS:</span>
                    <span className="text-amber-300 font-bold">{reg.totalProtests}</span>
                  </div>
                  <div className="flex items-center justify-between text-[#98A4B8]">
                    <span>Ongoing:</span>
                    <span className={hasOngoing ? "text-red-400 font-extrabold" : "text-[#64748B]"}>
                      {reg.ongoingProtests}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-2.5 pt-1.5 border-t border-white/[0.04]">
                <span className={`text-[9px] font-bold block text-center uppercase tracking-wider py-0.5 rounded ${
                  hasOngoing
                    ? "bg-red-500/15 text-red-300 border border-red-500/25"
                    : reg.totalProtests > 0
                    ? "bg-amber-500/10 text-amber-300/80 border border-amber-500/20"
                    : "bg-white/5 text-[#98A4B8]"
                }`}>
                  {hasOngoing ? "Waspada Eskalasi" : reg.totalProtests > 0 ? "Termonitor" : "Kondusif"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

