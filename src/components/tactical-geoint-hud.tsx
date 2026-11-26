"use client";

import React, { useMemo } from "react";
import {
  ShieldAlert,
  Building2,
  Crosshair,
  Radar,
  Radio,
  X,
  Navigation,
  Video,
  Play,
  Layers,
  MapPin,
  AlertTriangle,
  Info
} from "lucide-react";
import { BIOffice } from "@/lib/types/bi-offices";
import { ProtestEvent } from "@/lib/types/protests";
import { Camera, CompactMarker } from "@/lib/types";

export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export const BI_MONITORING_RADIUS_OPTIONS_METERS = [50, 100, 150, 200, 250] as const;

export interface TacticalGeoIntHudProps {
  isOpen: boolean;
  onClose: () => void;
  asset: { type: "office"; office: BIOffice } | { type: "protest"; protest: ProtestEvent } | null;
  biOffices: BIOffice[];
  protestEvents: ProtestEvent[];
  markers: CompactMarker[];
  isOfficeRadiusEnabled?: boolean;
  onToggleOfficeRadius?: () => void;
  officeRadius: number; // 50, 100, 150, 200, 250 (meters)
  unrasRadius: number; // 0, 250, 500, 1000, 1500
  onChangeOfficeRadius: (r: number) => void;
  onChangeUnrasRadius: (r: number) => void;
  onPlayCamera?: (camera: Camera) => void;
  onFocusMap?: (lat: number, lng: number, zoom?: number) => void;
}

export function TacticalGeoIntHud({
  isOpen,
  onClose,
  asset,
  biOffices,
  protestEvents,
  markers,
  isOfficeRadiusEnabled = false,
  onToggleOfficeRadius,
  officeRadius,
  unrasRadius,
  onChangeOfficeRadius,
  onChangeUnrasRadius,
  onPlayCamera,
  onFocusMap
}: TacticalGeoIntHudProps) {
  if (!isOpen || !asset) return null;

  const isOffice = asset.type === "office";
  const office = isOffice ? asset.office : null;
  const protest = !isOffice ? asset.protest : null;

  const targetLat = isOffice ? office?.latitude : protest?.validated_lat;
  const targetLng = isOffice ? office?.longitude : protest?.validated_lng;

  // 1. Cross-proximity computation
  const proximityInfo = useMemo(() => {
    if (targetLat === null || targetLat === undefined || targetLng === null || targetLng === undefined) {
      return null;
    }

    if (isOffice) {
      // Find nearest active UNRAS point
      let nearestProtest: ProtestEvent | null = null;
      let minDistance = Infinity;

      for (const p of protestEvents) {
        if (p.validated_lat !== null && p.validated_lng !== null) {
          const d = calculateHaversineDistanceMeters(targetLat, targetLng, p.validated_lat, p.validated_lng);
          if (d < minDistance) {
            minDistance = d;
            nearestProtest = p;
          }
        }
      }

      return {
        nearestAsset: nearestProtest,
        distanceMeters: minDistance < Infinity ? minDistance : null,
        threatLevel:
          minDistance <= 1000
            ? "CRITICAL"
            : minDistance <= 3000
            ? "WARNING"
            : minDistance <= 5000
            ? "MONITORING"
            : "SAFE"
      };
    } else {
      // Find nearest Bank Indonesia office
      let nearestOffice: BIOffice | null = null;
      let minDistance = Infinity;

      for (const o of biOffices) {
        if (o.latitude !== null && o.longitude !== null && o.validation_status === "verified") {
          const d = calculateHaversineDistanceMeters(targetLat, targetLng, o.latitude, o.longitude);
          if (d < minDistance) {
            minDistance = d;
            nearestOffice = o;
          }
        }
      }

      return {
        nearestAsset: nearestOffice,
        distanceMeters: minDistance < Infinity ? minDistance : null,
        threatLevel:
          minDistance <= 1000
            ? "CRITICAL"
            : minDistance <= 3000
            ? "WARNING"
            : minDistance <= 5000
            ? "MONITORING"
            : "SAFE"
      };
    }
  }, [isOffice, targetLat, targetLng, biOffices, protestEvents]);

  // 2. Nearby CCTV computation inside effective radius
  const effectiveRadius = isOffice
    ? officeRadius > 0
      ? officeRadius
      : 50
    : unrasRadius > 0
    ? unrasRadius
    : 500;

  const nearbyCameras = useMemo(() => {
    if (targetLat === null || targetLat === undefined || targetLng === null || targetLng === undefined) {
      return [];
    }

    const latDelta = effectiveRadius / 111000;
    const lngDelta = effectiveRadius / (111000 * Math.cos((targetLat * Math.PI) / 180));
    const list: Array<{ id: string; lat: number; lng: number; isOnline: boolean; distance: number }> = [];

    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      if (Math.abs(m[1] - targetLat) <= latDelta && Math.abs(m[2] - targetLng) <= lngDelta) {
        const d = calculateHaversineDistanceMeters(targetLat, targetLng, m[1], m[2]);
        if (d <= effectiveRadius) {
          list.push({
            id: m[0],
            lat: m[1],
            lng: m[2],
            isOnline: m[3] === 1,
            distance: d
          });
        }
      }
    }

    list.sort((a, b) => a.distance - b.distance);
    return list;
  }, [targetLat, targetLng, effectiveRadius, markers]);

  const handleQuickPlay = (camItem: { id: string; lat: number; lng: number; isOnline: boolean; distance: number }) => {
    if (!onPlayCamera) return;
    const cam: Camera = {
      id: camItem.id,
      name: camItem.id,
      latitude: camItem.lat,
      longitude: camItem.lng,
      status: camItem.isOnline ? "ONLINE" : "OFFLINE",
      protocol: "HLS",
      stream_url: "",
      city_name: isOffice ? office?.short_name || "Kota" : protest?.kota_kabupaten || "Kota",
      province_name: isOffice ? office?.regional || "Indonesia" : protest?.provinsi || "Indonesia",
      province_id: "",
      city_id: "",
      source_id: "",
      source_name: "CCTV Perimeter",
      location: `Perimeter Radius ${camItem.distance}m`,
      source_url: "",
      last_checked_at: new Date().toISOString(),
      created_at: "",
      updated_at: ""
    };
    onPlayCamera(cam);
  };

  return (
    <div
      data-testid="tactical-geoint-hud"
      className="absolute bottom-4 right-4 z-[30] w-[350px] sm:w-[420px] max-w-[calc(100vw-32px)] bg-[#070B12]/95 backdrop-blur-xl border border-blue-500/30 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.85)] text-white overflow-hidden transition-all duration-300 pointer-events-auto"
      style={{ isolation: "isolate" }}
    >
      {/* Header Bar with OSINT / Tactical Aesthetic */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-950/80 via-[#0C1424] to-[#080D18] border-b border-blue-500/25 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-blue-500/15 border border-blue-400/30 text-blue-400 shrink-0">
            {isOffice ? <Building2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4 text-red-400" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono tracking-widest uppercase font-bold text-blue-400">
                {isOffice ? "INTEL PERIMETER KANTOR BI" : "INTEL SITUASI UNRAS"}
              </span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-white truncate" title={isOffice ? office?.office_name : protest?.isu_tuntutan}>
              {isOffice ? office?.short_name || office?.office_name : protest?.isu_tuntutan || "Aksi Unjuk Rasa"}
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          title="Tutup Tactical HUD"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Body */}
      <div className="p-4 space-y-3.5 max-h-[460px] overflow-y-auto pr-2 custom-scrollbar text-xs">
        {/* Asset Basic Meta */}
        <div className="p-3 bg-[#0B101D] border border-slate-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              {isOffice ? office?.office_type : protest?.kode_unras || protest?.id_kejadian}
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              {targetLat?.toFixed(5)}, {targetLng?.toFixed(5)}
            </span>
          </div>

          <p className="text-[11px] text-slate-300 leading-relaxed">
            {isOffice ? office?.address : `${protest?.lokasi}${protest?.kota_kabupaten ? ` • ${protest.kota_kabupaten}` : ""}`}
          </p>

          {isOffice && office && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] pt-1 border-t border-slate-800/80">
              <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                Regional: {office.regional}
              </span>
              <span className="px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10">
                Wilayah: {office.island_group}
              </span>
            </div>
          )}

          {!isOffice && protest && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] pt-1 border-t border-slate-800/80">
              <span className={`px-2 py-0.5 rounded font-bold uppercase ${
                protest.status === "ongoing"
                  ? "bg-red-500/20 text-red-400 border border-red-500/40"
                  : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
              }`}>
                {protest.status}
              </span>
              <span className="px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10">
                Massa: <strong>{(protest.actual_crowd_size || protest.estimasi_massa_source || 0).toLocaleString("id-ID")} org</strong>
              </span>
            </div>
          )}
        </div>

        {/* Spatial Proximity Analysis Matrix */}
        {proximityInfo && proximityInfo.distanceMeters !== null ? (
          <div className={`p-3 rounded-xl border transition-all ${
            proximityInfo.threatLevel === "CRITICAL"
              ? "bg-red-950/40 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
              : proximityInfo.threatLevel === "WARNING"
              ? "bg-amber-950/40 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
              : proximityInfo.threatLevel === "MONITORING"
              ? "bg-blue-950/40 border-blue-500/40"
              : "bg-emerald-950/20 border-emerald-500/30"
          }`}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                <Radar className={`w-3.5 h-3.5 ${
                  proximityInfo.threatLevel === "CRITICAL"
                    ? "text-red-400 animate-spin"
                    : proximityInfo.threatLevel === "WARNING"
                    ? "text-amber-400"
                    : "text-blue-400"
                }`} />
                <span className="text-[11px] font-bold uppercase tracking-wider text-white">
                  {isOffice ? "PROKSIMITAS UNRAS TERDEKAT" : "JARAK KE KANTOR BI TERDEKAT"}
                </span>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                proximityInfo.threatLevel === "CRITICAL"
                  ? "bg-red-500 text-white animate-pulse"
                  : proximityInfo.threatLevel === "WARNING"
                  ? "bg-amber-500 text-black font-extrabold"
                  : proximityInfo.threatLevel === "MONITORING"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                  : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
              }`}>
                {proximityInfo.threatLevel === "CRITICAL"
                  ? "RING 1 (KRITIS)"
                  : proximityInfo.threatLevel === "WARNING"
                  ? "RING 2 (WASPADA)"
                  : proximityInfo.threatLevel === "MONITORING"
                  ? "RING 3 (PANTAU)"
                  : "PERIMETER AMAN"}
              </span>
            </div>

            <div className="flex items-baseline justify-between mt-2">
              <span className="text-white font-semibold truncate max-w-[200px]" title={
                isOffice
                  ? (proximityInfo.nearestAsset as ProtestEvent)?.isu_tuntutan
                  : (proximityInfo.nearestAsset as BIOffice)?.office_name
              }>
                {isOffice
                  ? (proximityInfo.nearestAsset as ProtestEvent)?.isu_tuntutan || "Aksi Unjuk Rasa"
                  : (proximityInfo.nearestAsset as BIOffice)?.short_name || (proximityInfo.nearestAsset as BIOffice)?.office_name}
              </span>
              <span className="font-mono text-sm font-bold text-white shrink-0">
                {proximityInfo.distanceMeters >= 1000
                  ? `${(proximityInfo.distanceMeters / 1000).toFixed(2)} km`
                  : `${proximityInfo.distanceMeters} m`}
              </span>
            </div>

            <p className="text-[10px] text-slate-300 mt-1">
              {proximityInfo.threatLevel === "CRITICAL"
                ? "⚠️ Berada di dalam radius perimeter pengamanan ketat 1.000m. Prioritaskan pemantauan CCTV secara realtime."
                : proximityInfo.threatLevel === "WARNING"
                ? "Dalam zona waspada 3.000m. Pantau potensi pergerakan massa dan pengalihan arus lalu lintas."
                : proximityInfo.threatLevel === "MONITORING"
                ? "Dalam radius buffer pengawasan 5.000m."
                : "Tidak ada ancaman atau konsentrasi massa terpantau dalam radius 5 km."}
            </p>
          </div>
        ) : (
          <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-xl text-center text-slate-400 text-[11px]">
            {isOffice
              ? "Tidak ada titik aksi unjuk rasa terdata di dekat lokasi kantor ini."
              : "Tidak ada kantor Bank Indonesia terdata dalam jangkauan terdekat."}
          </div>
        )}

        {/* Radius Configuration & CCTV Tactical Sensor Controls */}
        <div className="p-3 bg-[#0B101D] border border-slate-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              {isOffice ? "Radius Perimeter Pengamanan BI" : "Radius Perimeter Aksi Unras"}
            </span>
            {isOffice ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-blue-400 font-bold">
                  {officeRadius} meter
                </span>
                {onToggleOfficeRadius && (
                  <button
                    type="button"
                    data-testid="hud-toggle-bi-radius"
                    onClick={onToggleOfficeRadius}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border transition-colors cursor-pointer ${
                      isOfficeRadiusEnabled
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : "bg-white/5 text-slate-400 border-white/10 hover:text-white"
                    }`}
                  >
                    {isOfficeRadiusEnabled ? "ON" : "OFF"}
                  </button>
                )}
              </div>
            ) : (
              <span className="text-[10px] font-mono text-blue-400 font-bold">
                {unrasRadius === 0
                  ? "Nonaktif"
                  : unrasRadius >= 1000
                  ? `${unrasRadius / 1000} km`
                  : `${unrasRadius} m`}
              </span>
            )}
          </div>

          {/* Quick Radius Buttons */}
          {isOffice ? (
            <div className="grid grid-cols-5 gap-1.5 pt-1">
              {BI_MONITORING_RADIUS_OPTIONS_METERS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onChangeOfficeRadius(r)}
                  className={`py-1 rounded text-[10px] font-mono font-medium border transition-all cursor-pointer ${
                    officeRadius === r
                      ? "bg-blue-600 border-blue-400 text-white shadow"
                      : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {r} m
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {[250, 500, 1000, 1500].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onChangeUnrasRadius(r)}
                  className={`py-1 rounded text-[10px] font-mono font-medium border transition-all cursor-pointer ${
                    unrasRadius === r
                      ? "bg-red-600 border-red-400 text-white shadow"
                      : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {r >= 1000 ? `${r / 1000}km` : `${r}m`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Nearby CCTV Camera Catalog within effective perimeter */}
        <div className="p-3 bg-[#0B101D] border border-slate-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-emerald-400" />
              CCTV Terdeteksi ({nearbyCameras.length})
            </span>
            <span className="text-[10px] text-slate-400">
              Radius {effectiveRadius >= 1000 ? `${effectiveRadius / 1000}km` : `${effectiveRadius}m`}
            </span>
          </div>

          {nearbyCameras.length === 0 ? (
            <div className="p-3 text-center text-slate-500 text-[11px] bg-black/20 rounded-lg">
              Tidak ada kamera CCTV dalam radius perimeter ini.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {nearbyCameras.slice(0, 5).map((cam) => (
                <div
                  key={cam.id}
                  className="p-2 rounded-lg bg-black/30 border border-white/5 flex items-center justify-between gap-2 hover:border-blue-500/30 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-white truncate block text-[11px]" title={cam.id}>
                      {cam.id}
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5">
                      <span>Jarak: <strong className="text-emerald-400">{cam.distance}m</strong></span>
                      <span>•</span>
                      <span className={cam.isOnline ? "text-emerald-400" : "text-red-400"}>
                        {cam.isOnline ? "ONLINE" : "OFFLINE"}
                      </span>
                    </div>
                  </div>

                  {onPlayCamera && (
                    <button
                      type="button"
                      onClick={() => handleQuickPlay(cam)}
                      className="px-2 py-1 rounded bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600 hover:text-white transition-all text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                      title="Putar CCTV ini"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>Putar</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-2.5 bg-[#0A0E18] border-t border-slate-800 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => {
            if (targetLat !== null && targetLat !== undefined && targetLng !== null && targetLng !== undefined) {
              onFocusMap?.(targetLat, targetLng, 15);
            }
          }}
          className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 cursor-pointer"
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>Pusatkan Peta</span>
        </button>

        <span className="text-[10px] font-mono text-slate-500">
          SCC EAGLE EYES GeoINT
        </span>
      </div>
    </div>
  );
}

