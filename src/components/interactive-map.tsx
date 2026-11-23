"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import {
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  Navigation,
  Building2,
  Radar,
  ShieldAlert,
  Crosshair,
  Check,
  ChevronDown,
  Video,
  Flame,
  Eye,
  EyeOff
} from "lucide-react";
import { Camera, CompactMarker, Province } from "@/lib/types";
import { ProtestEvent } from "@/lib/types/protests";
import { BIOffice, BIOfficeType } from "@/lib/types/bi-offices";
import { CameraMapPreview } from "@/components/camera-interfaces";
import {
  TacticalGeoIntHud,
  calculateHaversineDistanceMeters
} from "@/components/tactical-geoint-hud";

export interface MapLayerVisibility {
  cctv: boolean;
  biOffice: boolean;
  unras: boolean;
}

export const STORAGE_LAYER_VISIBILITY_KEY = "scc_map_layer_visibility";

export const DEFAULT_LAYER_VISIBILITY: MapLayerVisibility = {
  cctv: true,
  biOffice: true,
  unras: true
};

export function getStoredLayerVisibility(): MapLayerVisibility {
  if (typeof window === "undefined") return { ...DEFAULT_LAYER_VISIBILITY };
  try {
    const raw = window.localStorage?.getItem(STORAGE_LAYER_VISIBILITY_KEY);
    if (!raw) return { ...DEFAULT_LAYER_VISIBILITY };
    const parsed = JSON.parse(raw);
    return {
      cctv: typeof parsed.cctv === "boolean" ? parsed.cctv : true,
      biOffice: typeof parsed.biOffice === "boolean" ? parsed.biOffice : true,
      unras: typeof parsed.unras === "boolean" ? parsed.unras : true
    };
  } catch {
    return { ...DEFAULT_LAYER_VISIBILITY };
  }
}

export function persistLayerVisibility(state: MapLayerVisibility): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(STORAGE_LAYER_VISIBILITY_KEY, JSON.stringify(state));
  } catch {}
}

interface InteractiveMapProps {
  markers: CompactMarker[];
  provinces: Province[];
  selectedProvince?: string;
  selectedCity?: string;
  previewCamera: Camera | null;
  loadingMarkers?: boolean;
  onMarkerClick: (cameraId: string, camera: Camera) => void;
  onClosePreview: () => void;
  onOpenFullDetail: (cameraId: string, camera: Camera) => void;
  onAddToMultiView: (camera: Camera) => void;
  protestEvents?: ProtestEvent[];
  focusProtestEvent?: ProtestEvent | null;
  onProtestMarkerClick?: (protest: ProtestEvent) => void;
  biOffices?: BIOffice[];
  onSelectBIOffice?: (office: BIOffice) => void;
  showCctvMarkers?: boolean;
  showBiOfficeMarkers?: boolean;
  showUnrasMarkers?: boolean;
  onLayerVisibilityChange?: (layers: MapLayerVisibility) => void;
}

const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return false;
  }
  if (typeof lat !== "number" || typeof lng !== "number") {
    return false;
  }
  if (
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return false;
  }
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// Pre-create reusable lightweight DivIcons for ONLINE and OFFLINE cameras
const ONLINE_MARKER_ICON = L.divIcon({
  className: "cctv-marker-pin",
  html: `<div class="w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#07090D] shadow-[0_0_6px_rgba(16,185,129,0.65)]"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const OFFLINE_MARKER_ICON = L.divIcon({
  className: "cctv-marker-pin",
  html: `<div class="w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-[#07090D] shadow-[0_0_6px_rgba(239,68,68,0.55)]"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

function markerTupleToCamera(m: CompactMarker): Camera {
  return {
    id: m[0],
    latitude: m[1],
    longitude: m[2],
    status: m[3] === 1 ? "ONLINE" : "OFFLINE",
    protocol: "HLS",
    name: m[0],
    city_name: "Memuat lokasi...",
    province_id: "",
    source_name: "Memuat sumber...",
    stream_url: "",
    province_name: "Indonesia",
    city_id: "",
    source_id: "",
    location: "",
    source_url: "https://dishub.go.id",
    last_checked_at: "",
    created_at: "",
    updated_at: ""
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getProtestStatusMeta(status: string) {
  switch (status) {
    case "ongoing":
      return { label: "Berlangsung", bg: "bg-red-500/20 text-red-400 border border-red-500/40" };
    case "scheduled":
      return { label: "Terjadwal", bg: "bg-amber-500/20 text-amber-400 border border-amber-500/40" };
    case "monitoring":
      return { label: "Pemantauan", bg: "bg-purple-500/20 text-purple-400 border border-purple-500/40" };
    case "completed":
      return { label: "Selesai", bg: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" };
    case "cancelled":
      return { label: "Dibatalkan", bg: "bg-slate-500/20 text-slate-400 border border-slate-500/40" };
    default:
      return { label: status, bg: "bg-slate-500/20 text-slate-400 border border-slate-500/40" };
  }
}

function getProtestUrgencyMeta(urgency: string) {
  switch (urgency) {
    case "critical":
      return { label: "Kritis", bg: "bg-red-600/30 text-red-300 border border-red-500/50" };
    case "high":
      return { label: "Tinggi", bg: "bg-orange-600/30 text-orange-300 border border-orange-500/50" };
    case "medium":
      return { label: "Sedang", bg: "bg-blue-600/30 text-blue-300 border border-blue-500/50" };
    case "low":
    default:
      return { label: "Rendah", bg: "bg-slate-600/30 text-slate-300 border border-slate-500/50" };
  }
}

function createProtestMarkerIcon(status: string): L.DivIcon {
  const isOngoing = status === "ongoing";
  const isScheduled = status === "scheduled";
  const isMonitoring = status === "monitoring";

  let inner = "";
  let size = 36;
  let anchor = 18;

  if (isOngoing) {
    size = 40;
    anchor = 20;
    inner = `
      <div class="relative flex items-center justify-center cursor-pointer" style="width:40px;height:40px;">
        <div class="absolute w-10 h-10 rounded-full bg-red-500/45 animate-ping"></div>
        <div class="w-8 h-8 rounded-full bg-red-600 border-2 border-white shadow-[0_0_12px_rgba(239,68,68,0.85)] flex items-center justify-center text-white font-bold text-sm">
          📢
        </div>
      </div>
    `;
  } else if (isScheduled) {
    size = 34;
    anchor = 17;
    inner = `
      <div class="relative flex items-center justify-center cursor-pointer" style="width:34px;height:34px;">
        <div class="w-7 h-7 rounded-full bg-amber-500 border-2 border-[#0B0F17] shadow-[0_0_8px_rgba(245,158,11,0.65)] flex items-center justify-center text-black font-bold text-xs">
          ⏱️
        </div>
      </div>
    `;
  } else if (isMonitoring) {
    size = 34;
    anchor = 17;
    inner = `
      <div class="relative flex items-center justify-center cursor-pointer" style="width:34px;height:34px;">
        <div class="w-7 h-7 rounded-full bg-purple-600 border-2 border-white shadow-[0_0_8px_rgba(147,51,234,0.65)] flex items-center justify-center text-white font-bold text-xs">
          👁️
        </div>
      </div>
    `;
  } else {
    size = 28;
    anchor = 14;
    inner = `
      <div class="relative flex items-center justify-center cursor-pointer" style="width:28px;height:28px;">
        <div class="w-6 h-6 rounded-full bg-slate-700 border border-white/60 shadow flex items-center justify-center text-white font-bold text-[10px]">
          ✓
        </div>
      </div>
    `;
  }

  return L.divIcon({
    className: "scc-protest-pin-marker",
    html: inner,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor]
  });
}

function createBIOfficeMarkerIcon(officeType: BIOfficeType, isSelected = false): L.DivIcon {
  let html = "";
  let size = 36;
  let anchor = 18;

  if (officeType === "Kantor Pusat") {
    size = 42;
    anchor = 21;
    html = `
      <div class="relative flex items-center justify-center cursor-pointer group" style="width:42px;height:42px;">
        <div class="absolute w-10 h-10 rounded-full bg-amber-400/30 animate-ping"></div>
        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-[#0F172A] to-[#1E3A8A] border-2 ${
          isSelected ? "border-amber-300 ring-4 ring-amber-400/50" : "border-amber-400"
        } shadow-[0_0_14px_rgba(245,158,11,0.85)] flex items-center justify-center text-amber-300 font-bold text-xs">
          🏛️
        </div>
      </div>
    `;
  } else if (officeType === "KOPERBI IKN") {
    size = 40;
    anchor = 20;
    html = `
      <div class="relative flex items-center justify-center cursor-pointer group" style="width:40px;height:40px;">
        <div class="absolute w-9 h-9 rounded-full bg-emerald-400/35 animate-pulse"></div>
        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-[#064E3B] to-[#059669] border-2 ${
          isSelected ? "border-emerald-300 ring-4 ring-emerald-400/50" : "border-emerald-400"
        } shadow-[0_0_12px_rgba(52,211,153,0.8)] flex items-center justify-center text-white font-bold text-xs">
          🏛️
        </div>
      </div>
    `;
  } else {
    // KPwDN
    size = 34;
    anchor = 17;
    html = `
      <div class="relative flex items-center justify-center cursor-pointer group" style="width:34px;height:34px;">
        <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-[#0B1528] to-[#0284C7] border-2 ${
          isSelected ? "border-cyan-300 ring-4 ring-cyan-400/50" : "border-cyan-400"
        } shadow-[0_0_10px_rgba(56,189,248,0.7)] flex items-center justify-center text-white font-bold text-[11px]">
          🏢
        </div>
      </div>
    `;
  }

  return L.divIcon({
    className: "scc-bi-office-pin-marker",
    html,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor]
  });
}

function createBIOfficePopupHtml(
  office: BIOffice,
  nearestProtest: { event: ProtestEvent; distanceMeters: number } | null
): string {
  const safeName = escapeHtml(office.office_name);
  const safeAddress = escapeHtml(office.address);
  const coordsFormatted =
    office.latitude !== null && office.longitude !== null
      ? `${office.latitude.toFixed(5)}, ${office.longitude.toFixed(5)}`
      : "-";

  const typeBadgeClass =
    office.office_type === "Kantor Pusat"
      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
      : office.office_type === "KOPERBI IKN"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";

  let unrasAlertHtml = "";
  if (nearestProtest) {
    const isCritical = nearestProtest.distanceMeters <= 1000;
    const isWarning = nearestProtest.distanceMeters <= 3000;
    const alertBg = isCritical
      ? "bg-red-950/50 border-red-500/50 text-red-300"
      : isWarning
      ? "bg-amber-950/50 border-amber-500/50 text-amber-300"
      : "bg-blue-950/40 border-blue-500/40 text-blue-300";

    const distText =
      nearestProtest.distanceMeters >= 1000
        ? `${(nearestProtest.distanceMeters / 1000).toFixed(2)} km`
        : `${nearestProtest.distanceMeters} m`;

    unrasAlertHtml = `
      <div class="p-2 rounded-lg border ${alertBg} text-[10px] space-y-1 mb-2">
        <div class="flex items-center justify-between font-bold">
          <span>⚠️ PROKSIMITAS UNRAS TERDEKAT</span>
          <span class="font-mono">${distText}</span>
        </div>
        <p class="truncate text-white font-medium">${escapeHtml(nearestProtest.event.isu_tuntutan)}</p>
      </div>
    `;
  } else {
    unrasAlertHtml = `
      <div class="p-2 rounded-lg border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-[10px] flex items-center gap-1.5 mb-2">
        <span>✓</span>
        <span>Perimeter Aman (Tidak ada unras aktif &lt; 5km)</span>
      </div>
    `;
  }

  return `
    <div class="p-3 text-left font-sans text-white" style="min-width: 280px; max-width: 320px;">
      <div class="flex items-center justify-between gap-1.5 pb-2 mb-2 border-b border-[#1E293B]">
        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${typeBadgeClass}">
          ${office.office_type}
        </span>
        <span class="font-mono text-[10px] text-blue-400 font-bold">
          ${office.office_id || office.id}
        </span>
      </div>

      <h4 class="text-xs font-bold text-white leading-snug mb-1">
        ${safeName}
      </h4>
      <p class="text-[10px] text-slate-400 mb-2 leading-relaxed">
        ${safeAddress}
      </p>

      <div class="space-y-1 text-[11px] text-slate-300 mb-2.5 pb-2 border-b border-[#1E293B]/60">
        <div class="flex items-center justify-between text-[10px]">
          <span class="text-slate-400">Regional / Wilayah:</span>
          <span class="text-white font-medium">${office.regional} (${office.island_group})</span>
        </div>
        <div class="flex items-center justify-between text-[10px]">
          <span class="text-slate-400">Koordinat Valid:</span>
          <span class="font-mono text-emerald-400">${coordsFormatted}</span>
        </div>
      </div>

      ${unrasAlertHtml}

      <button
        type="button"
        id="btn-bi-office-hud-${office.id}"
        class="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
      >
        <span>Analisis GeoINT & Perimeter</span>
        <span>→</span>
      </button>
    </div>
  `;
}

function createProtestPopupHtml(
  p: ProtestEvent,
  nearestOffice?: { office: BIOffice; distanceMeters: number } | null
): string {
  const sBadge = getProtestStatusMeta(p.status);
  const uBadge = getProtestUrgencyMeta(p.urgency);
  const safeIsu = escapeHtml(p.isu_tuntutan || "Aksi Unjuk Rasa");
  const safeLokasi = escapeHtml(p.lokasi || "Lokasi Aksi");
  const safeKota = p.kota_kabupaten ? escapeHtml(p.kota_kabupaten) : "";
  const safeProvinsi = p.provinsi ? escapeHtml(p.provinsi) : "";
  const crowdCount = p.actual_crowd_size || p.estimasi_massa_source;
  const crowdFormatted = crowdCount ? `${crowdCount.toLocaleString("id-ID")} orang` : "Belum diestimasi";
  const waktuFormatted = p.waktu_mulai ? p.waktu_mulai.slice(0, 5) + " WIB" : "09:00 WIB";
  const coordsFormatted = p.validated_lat !== null && p.validated_lng !== null
    ? `${p.validated_lat.toFixed(5)}, ${p.validated_lng.toFixed(5)}`
    : "-";

  const rawElements = p.organisasi_kelompok
    ? p.organisasi_kelompok
        .split(/[,;\/\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1)
        .slice(0, 3)
    : [];

  const elementsHtml = rawElements.length > 0
    ? `
      <div class="pt-1.5 border-t border-[#1E293B]/60">
        <span class="text-[10px] text-[#98A4B8] font-bold block mb-1">ELEMEN MASSA TERIDENTIFIKASI:</span>
        <div class="flex flex-wrap gap-1">
          ${rawElements.map((el) => `<span class="px-1.5 py-0.5 rounded bg-white/5 text-[9px] text-[#CAD4E0] border border-white/5 truncate max-w-[130px]">${escapeHtml(el)}</span>`).join("")}
        </div>
      </div>
    `
    : "";

  let biOfficeProximityHtml = "";
  if (nearestOffice) {
    const distText =
      nearestOffice.distanceMeters >= 1000
        ? `${(nearestOffice.distanceMeters / 1000).toFixed(2)} km`
        : `${nearestOffice.distanceMeters} m`;

    const isClose = nearestOffice.distanceMeters <= 3000;

    biOfficeProximityHtml = `
      <div class="flex items-center justify-between text-[10px] ${
        isClose
          ? "bg-amber-950/50 border border-amber-500/40 text-amber-300"
          : "bg-blue-950/40 border border-blue-500/30 text-blue-300"
      } px-2 py-1 rounded-lg">
        <span class="flex items-center gap-1 font-semibold truncate max-w-[190px]">
          🏢 BI: ${escapeHtml(nearestOffice.office.short_name || nearestOffice.office.office_name)}
        </span>
        <span class="font-mono font-bold text-white shrink-0">
          ${distText}
        </span>
      </div>
    `;
  }

  return `
    <div class="p-3 text-left font-sans text-white" style="min-width: 270px; max-width: 320px;">
      <div class="flex items-center justify-between gap-1.5 pb-2 mb-2 border-b border-[#1E293B]">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${sBadge.bg}">
            ${sBadge.label}
          </span>
          <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${uBadge.bg}">
            ${uBadge.label}
          </span>
        </div>
        <span class="font-mono text-[10px] text-[#98A4B8] font-bold truncate max-w-[110px]" title="${escapeHtml(p.kode_unras || p.id_kejadian)}">
          ${escapeHtml(p.kode_unras || p.id_kejadian)}
        </span>
      </div>

      <h4 class="text-xs font-bold text-white line-clamp-2 leading-snug mb-2.5">
        ${safeIsu}
      </h4>

      <div class="space-y-1.5 text-[11px] text-[#98A4B8] mb-3">
        <div class="flex items-center gap-2">
          <span class="text-xs">📅</span>
          <span class="text-[#F3F6FB]">${p.tanggal} • ${waktuFormatted}</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="text-xs shrink-0 mt-0.5">📍</span>
          <span class="text-[#F3F6FB] leading-tight line-clamp-2">
            ${safeLokasi}${safeKota ? ` (${safeKota})` : ""}${safeProvinsi ? `, ${safeProvinsi}` : ""}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs">👥</span>
          <span>Estimasi Massa: <strong class="text-white font-mono">${crowdFormatted}</strong></span>
        </div>
        <div class="flex items-center gap-1.5 pt-1 text-[10px] text-emerald-400 font-semibold border-t border-[#1E293B]/60">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
          <span class="truncate">Koordinat Valid: ${coordsFormatted}</span>
        </div>
        ${biOfficeProximityHtml}
        ${elementsHtml}
      </div>

      <div class="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          id="btn-protest-geoint-${p.id}"
          class="py-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-300 text-[11px] font-semibold flex items-center justify-center gap-1 border border-blue-500/25 transition-all cursor-pointer"
        >
          <Radar class="w-3 h-3 text-blue-400" />
          <span>GeoINT HUD</span>
        </button>
        <button
          type="button"
          id="btn-protest-popup-${p.id}"
          class="py-1.5 px-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold flex items-center justify-center gap-1 shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
        >
          <span>Pantau Situasi</span>
          <span>→</span>
        </button>
      </div>
    </div>
  `;
}

export default function InteractiveMap({
  markers,
  provinces,
  selectedProvince,
  selectedCity,
  previewCamera,
  loadingMarkers = false,
  onMarkerClick,
  onClosePreview,
  onOpenFullDetail,
  onAddToMultiView,
  protestEvents,
  focusProtestEvent,
  onProtestMarkerClick,
  biOffices: externalBIOffices,
  onSelectBIOffice,
  showCctvMarkers: propShowCctvMarkers,
  showBiOfficeMarkers: propShowBiOfficeMarkers,
  showUnrasMarkers: propShowUnrasMarkers,
  onLayerVisibilityChange
}: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const plainLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const protestLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const biOfficeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const biRadiusLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const unrasRadiusLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const protestMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const biOfficeMarkersRef = useRef<Map<string, L.Marker>>(new Map());

  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;
  const onProtestMarkerClickRef = useRef(onProtestMarkerClick);
  onProtestMarkerClickRef.current = onProtestMarkerClick;
  const onSelectBIOfficeRef = useRef(onSelectBIOffice);
  onSelectBIOfficeRef.current = onSelectBIOffice;

  const [initialVisibility] = useState<MapLayerVisibility>(() => getStoredLayerVisibility());
  const [showCctvMarkers, setShowCctvMarkers] = useState<boolean>(
    propShowCctvMarkers !== undefined ? propShowCctvMarkers : initialVisibility.cctv
  );
  const [showBIOfficeLayer, setShowBIOfficeLayer] = useState<boolean>(
    propShowBiOfficeMarkers !== undefined ? propShowBiOfficeMarkers : initialVisibility.biOffice
  );
  const [showProtestLayer, setShowProtestLayer] = useState<boolean>(
    propShowUnrasMarkers !== undefined ? propShowUnrasMarkers : initialVisibility.unras
  );

  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);
  const layerMenuRef = useRef<HTMLDivElement>(null);

  // Sync props when controlled from parent
  useEffect(() => {
    if (propShowCctvMarkers !== undefined) setShowCctvMarkers(propShowCctvMarkers);
  }, [propShowCctvMarkers]);

  useEffect(() => {
    if (propShowBiOfficeMarkers !== undefined) setShowBIOfficeLayer(propShowBiOfficeMarkers);
  }, [propShowBiOfficeMarkers]);

  useEffect(() => {
    if (propShowUnrasMarkers !== undefined) setShowProtestLayer(propShowUnrasMarkers);
  }, [propShowUnrasMarkers]);

  const handleUpdateVisibility = useCallback(
    (nextCctv: boolean, nextBiOffice: boolean, nextUnras: boolean) => {
      setShowCctvMarkers(nextCctv);
      setShowBIOfficeLayer(nextBiOffice);
      setShowProtestLayer(nextUnras);
      const nextState: MapLayerVisibility = {
        cctv: nextCctv,
        biOffice: nextBiOffice,
        unras: nextUnras
      };
      persistLayerVisibility(nextState);
      onLayerVisibilityChange?.(nextState);
    },
    [onLayerVisibilityChange]
  );

  const toggleLayer = useCallback(
    (layer: "cctv" | "biOffice" | "unras") => {
      if (layer === "cctv") {
        handleUpdateVisibility(!showCctvMarkers, showBIOfficeLayer, showProtestLayer);
      } else if (layer === "biOffice") {
        handleUpdateVisibility(showCctvMarkers, !showBIOfficeLayer, showProtestLayer);
      } else {
        handleUpdateVisibility(showCctvMarkers, showBIOfficeLayer, !showProtestLayer);
      }
    },
    [showCctvMarkers, showBIOfficeLayer, showProtestLayer, handleUpdateVisibility]
  );

  const handleShowAllLayers = useCallback(() => {
    handleUpdateVisibility(true, true, true);
  }, [handleUpdateVisibility]);

  const handleHideAllLayers = useCallback(() => {
    handleUpdateVisibility(false, false, false);
  }, [handleUpdateVisibility]);

  // Click outside and Escape handler for layer visibility dropdown menu
  useEffect(() => {
    if (!isLayerMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (layerMenuRef.current && !layerMenuRef.current.contains(e.target as Node)) {
        setIsLayerMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsLayerMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLayerMenuOpen]);

  const [darkFilter, setDarkFilter] = useState(true);
  const [clustering, setClustering] = useState(true);
  const [officeRadiusDistance, setOfficeRadiusDistance] = useState<number>(3000); // 0, 1000, 3000, 5000, 10000, -1
  const [unrasRadiusDistance, setUnrasRadiusDistance] = useState<number>(1000); // 0, 250, 500, 1000, 1500
  const [fetchedBIOffices, setFetchedBIOffices] = useState<BIOffice[]>([]);
  const [selectedGeoIntAsset, setSelectedGeoIntAsset] = useState<
    { type: "office"; office: BIOffice } | { type: "protest"; protest: ProtestEvent } | null
  >(null);
  const [isGeoIntHudOpen, setIsGeoIntHudOpen] = useState(false);
  const [mapZoom, setMapZoom] = useState(5);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Load BI offices from API if not provided via props
  useEffect(() => {
    if (externalBIOffices && externalBIOffices.length > 0) return;
    let isMounted = true;
    fetch("/api/bi-offices")
      .then((res) => res.json())
      .then((json) => {
        if (isMounted && json.success && Array.isArray(json.data)) {
          setFetchedBIOffices(json.data);
        }
      })
      .catch((err) => console.warn("Could not fetch BI offices:", err));
    return () => {
      isMounted = false;
    };
  }, [externalBIOffices]);

  const allBIOffices = useMemo(() => {
    return externalBIOffices && externalBIOffices.length > 0 ? externalBIOffices : fetchedBIOffices;
  }, [externalBIOffices, fetchedBIOffices]);

  // Strict coordinate validation:
  // latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  const validMarkers = useMemo(() => {
    const out: CompactMarker[] = [];
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      if (m && isValidLatLng(m[1], m[2])) {
        out.push(m);
      }
    }
    return out;
  }, [markers]);

  const onlineValidCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < validMarkers.length; i++) {
      if (validMarkers[i][3] === 1) count++;
    }
    return count;
  }, [validMarkers]);

  // Initialize Leaflet map once with OpenStreetMap tileLayer (no API keys, no CARTO)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [-2.5489, 118.0149], // Center of Indonesia
      zoom: 5,
      minZoom: 4,
      maxZoom: 19,
      preferCanvas: true,
      zoomControl: false
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Official OpenStreetMap tile layer without any API key or CARTO dependency
    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19
    }).addTo(map);

    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: false,
      maxClusterRadius: 55,
      disableClusteringAtZoom: 16,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      removeOutsideVisibleBounds: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        const size = count >= 1000 ? 44 : count >= 100 ? 38 : 32;
        const label =
          count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
        return L.divIcon({
          html: `<div style="width:${size}px;height:${size}px;" class="rounded-full border-2 bg-[#0B0F17]/95 border-[#3B82F6] text-[#F3F6FB] font-mono font-bold text-[11px] flex items-center justify-center shadow-lg transition-transform hover:scale-110 tabular-nums">${label}</div>`,
          className: "cctv-cluster-icon",
          iconSize: L.point(size, size)
        });
      }
    });

    const plainGroup = L.layerGroup();
    const protestGroup = L.layerGroup();
    const biOfficeGroup = L.layerGroup();
    const biRadiusGroup = L.layerGroup();
    const unrasRadiusGroup = L.layerGroup();

    if (initialVisibility.cctv) map.addLayer(clusterGroup);
    if (initialVisibility.biOffice) {
      map.addLayer(biRadiusGroup);
      map.addLayer(biOfficeGroup);
    }
    if (initialVisibility.unras) {
      map.addLayer(unrasRadiusGroup);
      map.addLayer(protestGroup);
    }

    mapRef.current = map;
    clusterGroupRef.current = clusterGroup;
    plainLayerGroupRef.current = plainGroup;
    protestLayerGroupRef.current = protestGroup;
    biOfficeLayerGroupRef.current = biOfficeGroup;
    biRadiusLayerGroupRef.current = biRadiusGroup;
    unrasRadiusLayerGroupRef.current = unrasRadiusGroup;

    map.on("zoomend", () => {
      setMapZoom(map.getZoom());
    });

    // Automatically invalidate map size when container or navigation resizes
    const containerEl = mapContainerRef.current;
    let resizeObs: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerEl) {
      resizeObs = new ResizeObserver(() => {
        map.invalidateSize({ animate: false });
      });
      resizeObs.observe(containerEl);
    }

    const handleWinResize = () => {
      map.invalidateSize({ animate: false });
    };
    window.addEventListener("resize", handleWinResize);

    return () => {
      window.removeEventListener("resize", handleWinResize);
      resizeObs?.disconnect();
      clusterGroup.clearLayers();
      plainGroup.clearLayers();
      protestGroup.clearLayers();
      biOfficeGroup.clearLayers();
      biRadiusGroup.clearLayers();
      unrasRadiusGroup.clearLayers();

      if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
      if (map.hasLayer(plainGroup)) map.removeLayer(plainGroup);
      if (map.hasLayer(protestGroup)) map.removeLayer(protestGroup);
      if (map.hasLayer(biOfficeGroup)) map.removeLayer(biOfficeGroup);
      if (map.hasLayer(biRadiusGroup)) map.removeLayer(biRadiusGroup);
      if (map.hasLayer(unrasRadiusGroup)) map.removeLayer(unrasRadiusGroup);

      map.remove();
      mapRef.current = null;
      clusterGroupRef.current = null;
      plainLayerGroupRef.current = null;
      protestLayerGroupRef.current = null;
      biOfficeLayerGroupRef.current = null;
      biRadiusLayerGroupRef.current = null;
      unrasRadiusLayerGroupRef.current = null;
    };
  }, []);

  // Synchronize markers into Leaflet MarkerClusterGroup with React-controlled cancellable batches
  useEffect(() => {
    const map = mapRef.current;
    const clusterGroup = clusterGroupRef.current;
    const plainGroup = plainLayerGroupRef.current;
    if (!map || !clusterGroup || !plainGroup) return;

    let cancelled = false;
    let batchTimer: number | null = null;

    clusterGroup.clearLayers();
    plainGroup.clearLayers();

    if (validMarkers.length === 0) {
      return;
    }

    if (clustering) {
      if (map.hasLayer(plainGroup)) map.removeLayer(plainGroup);
      if (showCctvMarkers && !map.hasLayer(clusterGroup)) map.addLayer(clusterGroup);

      const BATCH_SIZE = 4000;
      let offset = 0;

      const enqueueBatch = () => {
        if (cancelled || mapRef.current !== map) {
          return;
        }
        const end = Math.min(offset + BATCH_SIZE, validMarkers.length);
        const batch: L.Marker[] = new Array(end - offset);
        for (let i = offset; i < end; i++) {
          const m = validMarkers[i];
          const isOnline = m[3] === 1;
          const marker = L.marker([m[1], m[2]], {
            icon: isOnline ? ONLINE_MARKER_ICON : OFFLINE_MARKER_ICON
          });
          marker.bindTooltip(
            `${m[0]} • ${isOnline ? "ONLINE" : "OFFLINE"}`,
            { direction: "top", offset: [0, -6] }
          );
          marker.on("click", () => {
            const cam = markerTupleToCamera(m);
            onMarkerClickRef.current(cam.id, cam);
          });
          batch[i - offset] = marker;
        }

        clusterGroup.addLayers(batch);
        offset = end;
        if (offset < validMarkers.length && !cancelled) {
          batchTimer = window.setTimeout(enqueueBatch, 16);
        }
      };

      enqueueBatch();
    } else {
      if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
      if (showCctvMarkers && !map.hasLayer(plainGroup)) map.addLayer(plainGroup);

      // When unclustered, render circleMarkers on canvas for high performance
      const limit = Math.min(validMarkers.length, 3000);
      for (let i = 0; i < limit; i++) {
        const m = validMarkers[i];
        const isOnline = m[3] === 1;
        const circle = L.circleMarker([m[1], m[2]], {
          radius: 5.5,
          fillColor: isOnline ? "#10b981" : "#ef4444",
          color: "#07090D",
          weight: 1.5,
          fillOpacity: 0.92
        });
        circle.bindTooltip(
          `${m[0]} • ${isOnline ? "ONLINE" : "OFFLINE"}`,
          { direction: "top", offset: [0, -6] }
        );
        circle.on("click", () => {
          const cam = markerTupleToCamera(m);
          onMarkerClickRef.current(cam.id, cam);
        });
        circle.addTo(plainGroup);
      }
    }

    return () => {
      cancelled = true;
      if (batchTimer !== null) {
        window.clearTimeout(batchTimer);
      }
    };
  }, [validMarkers, clustering]);

  // Detach or attach CCTV marker layer groups dynamically without rebuilding markers
  useEffect(() => {
    const map = mapRef.current;
    const clusterGroup = clusterGroupRef.current;
    const plainGroup = plainLayerGroupRef.current;
    if (!map || !clusterGroup || !plainGroup) return;

    if (!showCctvMarkers) {
      if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
      if (map.hasLayer(plainGroup)) map.removeLayer(plainGroup);
    } else {
      if (clustering) {
        if (map.hasLayer(plainGroup)) map.removeLayer(plainGroup);
        if (!map.hasLayer(clusterGroup)) map.addLayer(clusterGroup);
      } else {
        if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
        if (!map.hasLayer(plainGroup)) map.addLayer(plainGroup);
      }
    }
  }, [showCctvMarkers, clustering]);

  // Fly to selected province or city when filter changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedCity && validMarkers.length > 0) {
      const first = validMarkers[0];
      if (first && isValidLatLng(first[1], first[2])) {
        map.flyTo([first[1], first[2]], 12, { duration: 1.0 });
        return;
      }
    }

    if (!selectedProvince) return;
    const prov = provinces.find(
      (p) =>
        p.id === selectedProvince ||
        p.slug === selectedProvince ||
        p.name === selectedProvince
    );
    if (prov && isValidLatLng(prov.lat, prov.lng)) {
      map.flyTo([prov.lat, prov.lng], 8, { duration: 1.1 });
    }
  }, [selectedProvince, selectedCity, provinces, validMarkers]);

  // Fly to previewCamera when a map marker is clicked
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !previewCamera) return;
    if (!isValidLatLng(previewCamera.latitude, previewCamera.longitude)) return;
    map.flyTo([previewCamera.latitude, previewCamera.longitude], 15, {
      duration: 0.85
    });
  }, [previewCamera]);

  // Fly to focusProtestEvent when selected from dashboard or URL
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusProtestEvent) return;
    if (
      focusProtestEvent.validated_lat === null ||
      focusProtestEvent.validated_lng === null ||
      !isValidLatLng(focusProtestEvent.validated_lat, focusProtestEvent.validated_lng)
    ) {
      return;
    }

    if (!showProtestLayer) {
      handleUpdateVisibility(showCctvMarkers, showBIOfficeLayer, true);
    } else {
      setShowProtestLayer(true);
    }
    map.flyTo([focusProtestEvent.validated_lat, focusProtestEvent.validated_lng], 16, {
      duration: 1.0
    });

    const timer = setTimeout(() => {
      const marker = protestMarkersRef.current.get(focusProtestEvent.id);
      if (marker) {
        marker.openPopup();
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [focusProtestEvent]);

  // Render Protest Markers with strict coordinate validation & interactive popups
  useEffect(() => {
    const group = protestLayerGroupRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();
    protestMarkersRef.current.clear();

    if (!showProtestLayer) {
      if (map.hasLayer(group)) map.removeLayer(group);
      return;
    }

    if (!map.hasLayer(group)) {
      map.addLayer(group);
    }

    if (!protestEvents || protestEvents.length === 0) return;

    for (const p of protestEvents) {
      if (
        p.validated_lat === null ||
        p.validated_lng === null ||
        !isValidLatLng(p.validated_lat, p.validated_lng)
      ) {
        continue; // Unmapped protests MUST NOT be plotted on the live map
      }

      // Calculate nearest verified BI Office
      let nearestOffice: { office: BIOffice; distanceMeters: number } | null = null;
      let minOfficeDist = Infinity;
      for (const off of allBIOffices) {
        if (off.latitude !== null && off.longitude !== null && off.validation_status === "verified") {
          const d = calculateHaversineDistanceMeters(p.validated_lat, p.validated_lng, off.latitude, off.longitude);
          if (d < minOfficeDist) {
            minOfficeDist = d;
            nearestOffice = { office: off, distanceMeters: d };
          }
        }
      }

      const statusMeta = getProtestStatusMeta(p.status);
      const crowdCount = p.actual_crowd_size || p.estimasi_massa_source;
      const crowdText = crowdCount
        ? `${crowdCount.toLocaleString("id-ID")} org`
        : "Massa belum terdata";

      const icon = createProtestMarkerIcon(p.status);

      const marker = L.marker([p.validated_lat, p.validated_lng], {
        icon,
        zIndexOffset: p.status === "ongoing" ? 3500 : 3000
      });

      marker.bindTooltip(
        `[${statusMeta.label.toUpperCase()}] ${p.isu_tuntutan} • ${crowdText}`,
        { direction: "top", offset: [0, -18] }
      );

      marker.bindPopup(createProtestPopupHtml(p, nearestOffice), {
        className: "scc-leaflet-protest-popup",
        maxWidth: 320,
        autoPanPadding: [24, 24]
      });

      marker.on("popupopen", () => {
        const btnDetail = document.getElementById(`btn-protest-popup-${p.id}`);
        if (btnDetail) {
          btnDetail.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            marker.closePopup();
            onProtestMarkerClickRef.current?.(p);
          };
        }
        const btnGeoInt = document.getElementById(`btn-protest-geoint-${p.id}`);
        if (btnGeoInt) {
          btnGeoInt.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            marker.closePopup();
            setSelectedGeoIntAsset({ type: "protest", protest: p });
            setIsGeoIntHudOpen(true);
          };
        }
      });

      protestMarkersRef.current.set(p.id, marker);
      group.addLayer(marker);
    }
  }, [protestEvents, showProtestLayer, allBIOffices]);

  // Render Bank Indonesia Office Markers
  useEffect(() => {
    const group = biOfficeLayerGroupRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();
    biOfficeMarkersRef.current.clear();

    if (!showBIOfficeLayer) {
      if (map.hasLayer(group)) map.removeLayer(group);
      return;
    }

    if (!map.hasLayer(group)) {
      map.addLayer(group);
    }

    for (const off of allBIOffices) {
      if (
        off.latitude === null ||
        off.longitude === null ||
        off.validation_status !== "verified" ||
        !isValidLatLng(off.latitude, off.longitude)
      ) {
        continue;
      }

      // Find nearest active UNRAS event within 15 km
      let nearestProtest: { event: ProtestEvent; distanceMeters: number } | null = null;
      let minProtestDist = Infinity;
      if (protestEvents) {
        for (const pr of protestEvents) {
          if (pr.validated_lat !== null && pr.validated_lng !== null) {
            const d = calculateHaversineDistanceMeters(off.latitude, off.longitude, pr.validated_lat, pr.validated_lng);
            if (d < minProtestDist && d <= 15000) {
              minProtestDist = d;
              nearestProtest = { event: pr, distanceMeters: d };
            }
          }
        }
      }

      const isSelected = selectedGeoIntAsset?.type === "office" && selectedGeoIntAsset.office.id === off.id;
      const icon = createBIOfficeMarkerIcon(off.office_type, isSelected);

      const marker = L.marker([off.latitude, off.longitude], {
        icon,
        zIndexOffset: off.office_type === "Kantor Pusat" ? 4000 : off.office_type === "KOPERBI IKN" ? 3800 : 3600
      });

      marker.bindTooltip(
        `[${off.office_type.toUpperCase()}] ${off.office_name}`,
        { direction: "top", offset: [0, -18] }
      );

      marker.bindPopup(createBIOfficePopupHtml(off, nearestProtest), {
        className: "scc-leaflet-bi-popup",
        maxWidth: 320,
        autoPanPadding: [24, 24]
      });

      marker.on("click", () => {
        onSelectBIOfficeRef.current?.(off);
      });

      marker.on("popupopen", () => {
        const btn = document.getElementById(`btn-bi-office-hud-${off.id}`);
        if (btn) {
          btn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            marker.closePopup();
            setSelectedGeoIntAsset({ type: "office", office: off });
            setIsGeoIntHudOpen(true);
          };
        }
      });

      biOfficeMarkersRef.current.set(off.id, marker);
      group.addLayer(marker);
    }
  }, [allBIOffices, showBIOfficeLayer, protestEvents, selectedGeoIntAsset]);

  // Render Bank Indonesia Office Radius Rings
  useEffect(() => {
    const group = biRadiusLayerGroupRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();

    if (!showBIOfficeLayer || officeRadiusDistance === 0) {
      if (map.hasLayer(group)) map.removeLayer(group);
      return;
    }

    if (!map.hasLayer(group)) {
      map.addLayer(group);
    }

    // Zoom threshold: only render all circles if zoom >= 7 OR render selected office circle
    const selectedOfficeId = selectedGeoIntAsset?.type === "office" ? selectedGeoIntAsset.office.id : null;

    for (const off of allBIOffices) {
      if (
        off.latitude === null ||
        off.longitude === null ||
        off.validation_status !== "verified" ||
        !isValidLatLng(off.latitude, off.longitude)
      ) {
        continue;
      }

      const isSelected = selectedOfficeId === off.id;
      // Skip if zoom < 7 unless this office is selected
      if (mapZoom < 7 && !isSelected) {
        continue;
      }

      const isHeadquarters = off.office_type === "Kantor Pusat";
      if (officeRadiusDistance === -1) {
        // Concentric rings: 1km, 3km, 5km, 10km
        const concentric = [
          { r: 1000, color: isHeadquarters ? "#F59E0B" : isSelected ? "#38BDF8" : "#38BDF8", weight: 2, dash: "3, 3", opacity: isHeadquarters ? 0.16 : 0.12, fill: isHeadquarters ? "#D97706" : "#0284C7" },
          { r: 3000, color: isHeadquarters ? "#D97706" : isSelected ? "#38BDF8" : "#0284C7", weight: 1.5, dash: "4, 4", opacity: isHeadquarters ? 0.11 : 0.08, fill: isHeadquarters ? "#B45309" : "#0369A1" },
          { r: 5000, color: isHeadquarters ? "#B45309" : isSelected ? "#38BDF8" : "#0369A1", weight: 1, dash: "5, 5", opacity: isHeadquarters ? 0.06 : 0.04, fill: isHeadquarters ? "#92400E" : "#1E3A8A" },
          { r: 10000, color: isHeadquarters ? "#92400E" : isSelected ? "#38BDF8" : "#1E3A8A", weight: 1, dash: "6, 6", opacity: isHeadquarters ? 0.03 : 0.02, fill: isHeadquarters ? "#78350F" : "#0F172A" }
        ];

        for (const ring of concentric) {
          const circle = L.circle([off.latitude, off.longitude], {
            radius: ring.r,
            color: isSelected ? "#38BDF8" : ring.color,
            weight: isSelected ? ring.weight + 0.5 : ring.weight,
            dashArray: ring.dash,
            fillColor: ring.fill,
            fillOpacity: isSelected ? ring.opacity * 1.5 : ring.opacity,
            interactive: false
          });
          group.addLayer(circle);
        }
      } else {
        // Single radius
        const circle = L.circle([off.latitude, off.longitude], {
          radius: officeRadiusDistance,
          color: isHeadquarters ? "#F59E0B" : isSelected ? "#38BDF8" : "#0284C7",
          weight: isSelected || isHeadquarters ? 2.5 : 1.5,
          dashArray: "4, 4",
          fillColor: isHeadquarters ? "#D97706" : "#0284C7",
          fillOpacity: isSelected ? 0.18 : isHeadquarters ? 0.12 : 0.08,
          interactive: false
        });
        group.addLayer(circle);
      }
    }
  }, [allBIOffices, showBIOfficeLayer, officeRadiusDistance, mapZoom, selectedGeoIntAsset]);

  // Render UNRAS Radius Rings
  useEffect(() => {
    const group = unrasRadiusLayerGroupRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();

    if (!showProtestLayer || unrasRadiusDistance === 0 || !protestEvents) {
      if (map.hasLayer(group)) map.removeLayer(group);
      return;
    }

    if (!map.hasLayer(group)) {
      map.addLayer(group);
    }

    const selectedProtestId = selectedGeoIntAsset?.type === "protest" ? selectedGeoIntAsset.protest.id : null;

    for (const p of protestEvents) {
      if (
        p.validated_lat === null ||
        p.validated_lng === null ||
        !isValidLatLng(p.validated_lat, p.validated_lng)
      ) {
        continue;
      }

      const isSelected = selectedProtestId === p.id;
      // Skip if zoom < 7 unless this event is selected
      if (mapZoom < 7 && !isSelected) {
        continue;
      }

      const circle = L.circle([p.validated_lat, p.validated_lng], {
        radius: unrasRadiusDistance,
        color: isSelected ? "#F87171" : "#EF4444",
        weight: isSelected ? 2.5 : 1.5,
        dashArray: "4, 4",
        fillColor: "#DC2626",
        fillOpacity: isSelected ? 0.15 : 0.08,
        interactive: false
      });
      group.addLayer(circle);
    }
  }, [protestEvents, showProtestLayer, unrasRadiusDistance, mapZoom, selectedGeoIntAsset]);

  const handleResetView = () => {
    mapRef.current?.flyTo([-2.5489, 118.0149], 5, { duration: 1.0 });
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (isValidLatLng(pos.coords.latitude, pos.coords.longitude)) {
          mapRef.current?.flyTo(
            [pos.coords.latitude, pos.coords.longitude],
            13,
            { duration: 1.2 }
          );
        }
      },
      () => {}
    );
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={wrapRef}
      data-testid="map-container"
      style={{ position: "relative", isolation: "isolate", zIndex: 0 }}
      className={`map-container relative z-0 w-full h-full min-h-[420px] sm:min-h-[540px] bg-[#07090D] rounded-2xl overflow-hidden border border-[var(--border-default)] shadow-[var(--shadow-card)] ${
        darkFilter ? "osm-dark-tiles" : ""
      }`}
    >
      {/* Map Canvas (z-index: 0) */}
      <div
        ref={mapContainerRef}
        style={{ zIndex: 0 }}
        className="w-full h-full min-h-[420px] sm:min-h-[540px] z-0"
      />

      {/* Responsive Top Overlay Controls (z-index: 20 inside isolated map container) */}
      <div
        data-testid="map-controls-bar"
        style={{ zIndex: 20 }}
        className="absolute top-2.5 inset-x-2.5 z-[20] flex flex-wrap items-center justify-between gap-1.5 pointer-events-none"
      >
        {/* Left: Tactical Map Layers & Radius Controls */}
        <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto max-w-full">
          <div
            data-testid="map-camera-counter"
            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#090C12]/92 backdrop-blur-md border border-[var(--border-default)] text-[11px] sm:text-xs flex items-center gap-1.5 sm:gap-2 shadow-lg"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                !showCctvMarkers
                  ? "bg-slate-500"
                  : loadingMarkers
                  ? "bg-[#F59E0B] animate-ping"
                  : "bg-[#10B981] animate-pulse"
              }`}
            />
            <span
              className={`font-semibold font-mono tabular-nums ${
                showCctvMarkers ? "text-[#F3F6FB]" : "text-[#98A4B8] line-through decoration-slate-500"
              }`}
            >
              {validMarkers.length.toLocaleString("id-ID")}
            </span>
            <span className="text-[#98A4B8]">
              {showCctvMarkers ? "kamera" : "kamera (sembunyi)"}
            </span>
            <span className="hidden sm:inline text-[11px] text-[#10B981] font-mono tabular-nums border-l border-[var(--border-subtle)] pl-2">
              {onlineValidCount.toLocaleString("id-ID")} Online
            </span>
          </div>

          {/* Dedicated Independent Layer Visibility Controls */}
          <div className="relative" ref={layerMenuRef}>
            <button
              type="button"
              data-testid="layer-visibility-dropdown-btn"
              onClick={() => setIsLayerMenuOpen((o) => !o)}
              title="Filter Visibilitas Layer Peta (CCTV, Kantor BI, UNRAS)"
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold border backdrop-blur-md transition-all shadow-lg flex items-center gap-1.5 cursor-pointer ${
                (showCctvMarkers ? 1 : 0) + (showBIOfficeLayer ? 1 : 0) + (showProtestLayer ? 1 : 0) === 3
                  ? "bg-[#090C12]/92 border-[var(--border-default)] text-[#F3F6FB] hover:border-[#3B82F6]/50"
                  : (showCctvMarkers ? 1 : 0) + (showBIOfficeLayer ? 1 : 0) + (showProtestLayer ? 1 : 0) > 0
                  ? "bg-[#3B82F6]/20 border-[#3B82F6]/45 text-blue-300"
                  : "bg-red-500/15 border-red-500/35 text-red-300"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>Visibilitas Layer</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white tabular-nums border border-white/10">
                {(showCctvMarkers ? 1 : 0) + (showBIOfficeLayer ? 1 : 0) + (showProtestLayer ? 1 : 0)}/3
              </span>
              <ChevronDown
                className={`w-3 h-3 text-[#98A4B8] transition-transform duration-200 ${
                  isLayerMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isLayerMenuOpen && (
              <div
                data-testid="layer-visibility-menu"
                className="absolute top-full left-0 mt-1.5 w-64 bg-[#090C12]/98 backdrop-blur-xl border border-[var(--border-default)] rounded-xl shadow-2xl p-2.5 z-[60] space-y-2 text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)]">
                  <span className="font-semibold text-white text-[11px] uppercase tracking-wider">
                    Visibilitas Layer
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid="layer-show-all-btn"
                      onClick={handleShowAllLayers}
                      className="text-[10px] text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Tampilkan Semua
                    </button>
                    <span className="text-[10px] text-slate-600">•</span>
                    <button
                      type="button"
                      data-testid="layer-hide-all-btn"
                      onClick={handleHideAllLayers}
                      className="text-[10px] text-slate-400 hover:text-slate-300 px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Sembunyikan Semua
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  {/* CCTV Marker Toggle */}
                  <button
                    type="button"
                    data-testid="toggle-cctv-layer"
                    onClick={() => toggleLayer("cctv")}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                      showCctvMarkers
                        ? "bg-[#3B82F6]/15 text-white"
                        : "text-slate-400 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] shadow-[0_0_6px_rgba(59,130,246,0.8)]" />
                      <div className="flex flex-col">
                        <span className="font-medium text-white text-[11px]">
                          Titik Kamera CCTV
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {validMarkers.length.toLocaleString("id-ID")} kamera ({onlineValidCount} online)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {showCctvMarkers ? (
                        <span className="w-4 h-4 rounded bg-[#3B82F6]/30 text-blue-400 flex items-center justify-center text-[10px] font-bold">
                          ✓
                        </span>
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </div>
                  </button>

                  {/* BI Office Marker Toggle */}
                  <button
                    type="button"
                    data-testid="toggle-bioffice-layer"
                    onClick={() => toggleLayer("biOffice")}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                      showBIOfficeLayer
                        ? "bg-emerald-500/15 text-white"
                        : "text-slate-400 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                      <div className="flex flex-col">
                        <span className="font-medium text-white text-[11px]">
                          Kantor BI KP/KPw
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {allBIOffices.filter((o) => o.validation_status === "verified").length} kantor terverifikasi
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {showBIOfficeLayer ? (
                        <span className="w-4 h-4 rounded bg-emerald-500/30 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                          ✓
                        </span>
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </div>
                  </button>

                  {/* UNRAS Marker Toggle */}
                  <button
                    type="button"
                    data-testid="toggle-unras-layer"
                    onClick={() => toggleLayer("unras")}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                      showProtestLayer
                        ? "bg-red-500/15 text-white"
                        : "text-slate-400 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                      <div className="flex flex-col">
                        <span className="font-medium text-white text-[11px]">
                          Titik UNRAS
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {protestEvents
                            ? protestEvents.filter(
                                (p) =>
                                  p.validated_lat !== null &&
                                  p.validated_lng !== null &&
                                  isValidLatLng(p.validated_lat, p.validated_lng)
                              ).length
                            : 0}{" "}
                          titik terpeta
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {showProtestLayer ? (
                        <span className="w-4 h-4 rounded bg-red-500/30 text-red-400 flex items-center justify-center text-[10px] font-bold">
                          ✓
                        </span>
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setClustering((c) => !c)}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-medium border backdrop-blur-md transition-colors shadow-lg cursor-pointer ${
              clustering
                ? "bg-[#3B82F6]/20 border-[#3B82F6]/45 text-white"
                : "bg-[#090C12]/92 border-[var(--border-default)] text-[#98A4B8] hover:text-white"
            }`}
          >
            Cluster: {clustering ? "ON" : "OFF"}
          </button>

          {/* UNRAS Layer & Radius */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggleLayer("unras")}
              title="Aktifkan / Nonaktifkan Layer Peta Aksi Unjuk Rasa"
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold border backdrop-blur-md transition-all shadow-lg flex items-center gap-1.5 cursor-pointer ${
                showProtestLayer
                  ? "bg-red-500/20 border-red-500/40 text-red-400 shadow-red-500/10"
                  : "bg-[#090C12]/92 border-[var(--border-default)] text-[#98A4B8] hover:text-white"
              }`}
            >
              <span className="relative flex h-2 w-2">
                {showProtestLayer && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${showProtestLayer ? "bg-red-500" : "bg-slate-500"}`}></span>
              </span>
              <span>Unras</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-white tabular-nums border border-red-500/30">
                {protestEvents ? protestEvents.filter((p) => p.validated_lat !== null && p.validated_lng !== null && isValidLatLng(p.validated_lat, p.validated_lng)).length : 0}
              </span>
            </button>

            {showProtestLayer && (
              <button
                type="button"
                onClick={() => {
                  const nextMap: Record<number, number> = {
                    1000: 1500,
                    1500: 0,
                    0: 250,
                    250: 500,
                    500: 1000
                  };
                  setUnrasRadiusDistance(nextMap[unrasRadiusDistance] ?? 1000);
                }}
                title="Siklus Radius Perimeter Unjuk Rasa: 250m, 500m, 1km, 1.5km, Nonaktif"
                className="px-2 py-1.5 rounded-xl text-[10px] sm:text-[11px] font-mono font-medium border bg-[#090C12]/92 border-red-500/30 text-red-300 hover:text-white backdrop-blur-md transition-colors shadow-lg cursor-pointer"
              >
                Rad: {unrasRadiusDistance === 0 ? "OFF" : unrasRadiusDistance >= 1000 ? `${unrasRadiusDistance / 1000}km` : `${unrasRadiusDistance}m`}
              </button>
            )}
          </div>

          {/* Bank Indonesia Layer & Radius */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggleLayer("biOffice")}
              title="Aktifkan / Nonaktifkan Layer Kantor Bank Indonesia (47 Kantor)"
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold border backdrop-blur-md transition-all shadow-lg flex items-center gap-1.5 cursor-pointer ${
                showBIOfficeLayer
                  ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300 shadow-cyan-500/10"
                  : "bg-[#090C12]/92 border-[var(--border-default)] text-[#98A4B8] hover:text-white"
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Kantor BI</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 tabular-nums border border-cyan-500/30">
                {allBIOffices.filter((o) => o.validation_status === "verified").length}
              </span>
            </button>

            {showBIOfficeLayer && (
              <button
                type="button"
                onClick={() => {
                  const nextMap: Record<number, number> = {
                    3000: 5000,
                    5000: 10000,
                    10000: -1,
                    [-1]: 0,
                    0: 1000,
                    1000: 3000
                  };
                  setOfficeRadiusDistance(nextMap[officeRadiusDistance] ?? 3000);
                }}
                title="Siklus Radius Perimeter Kantor BI: 1km, 3km, 5km, 10km, Konsentris, Nonaktif"
                className="px-2 py-1.5 rounded-xl text-[10px] sm:text-[11px] font-mono font-medium border bg-[#090C12]/92 border-cyan-500/30 text-cyan-300 hover:text-white backdrop-blur-md transition-colors shadow-lg cursor-pointer"
              >
                Rad: {officeRadiusDistance === -1 ? "Konsentris" : officeRadiusDistance === 0 ? "OFF" : `${officeRadiusDistance / 1000}km`}
              </button>
            )}
          </div>

          {/* Tactical GeoINT HUD Trigger */}
          <button
            type="button"
            onClick={() => {
              if (!selectedGeoIntAsset) {
                // If no asset selected, pick first verified BI Office or first protest
                if (allBIOffices.length > 0) {
                  const firstVerified = allBIOffices.find((o) => o.validation_status === "verified");
                  if (firstVerified) {
                    setSelectedGeoIntAsset({ type: "office", office: firstVerified });
                  }
                }
              }
              setIsGeoIntHudOpen((o) => !o);
            }}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold border backdrop-blur-md transition-all shadow-lg flex items-center gap-1.5 cursor-pointer ${
              isGeoIntHudOpen
                ? "bg-blue-600 border-blue-400 text-white shadow-blue-500/25"
                : "bg-[#090C12]/92 border-blue-500/30 text-blue-400 hover:text-white"
            }`}
          >
            <Radar className={`w-3.5 h-3.5 ${isGeoIntHudOpen ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Tactical</span> HUD
          </button>
        </div>

        {/* Right: OSM Basemap Switcher & Navigation Controls (z-index: 20) */}
        <div
          data-testid="osm-basemap-switcher"
          style={{ zIndex: 20 }}
          className="flex flex-wrap items-center gap-1 sm:gap-1.5 pointer-events-auto"
        >
          <div className="flex items-center bg-[#090C12]/92 backdrop-blur-md border border-[var(--border-default)] rounded-xl p-1 shadow-lg">
            <Layers className="w-3.5 h-3.5 text-[#60A5FA] ml-1 mr-1 hidden xs:inline" />
            <button
              type="button"
              data-testid="osm-dark-btn"
              onClick={() => setDarkFilter(true)}
              className={`px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-medium transition-colors ${
                darkFilter
                  ? "bg-[#3B82F6] text-white"
                  : "text-[#98A4B8] hover:text-[#F3F6FB]"
              }`}
            >
              OSM Gelap
            </button>
            <button
              type="button"
              data-testid="osm-standard-btn"
              onClick={() => setDarkFilter(false)}
              className={`px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-medium transition-colors ${
                !darkFilter
                  ? "bg-[#3B82F6] text-white"
                  : "text-[#98A4B8] hover:text-[#F3F6FB]"
              }`}
            >
              OSM Standar
            </button>
          </div>

          <button
            type="button"
            onClick={handleLocateMe}
            title="Lokasi Saya"
            aria-label="Lokasi Saya"
            className="p-1.5 sm:p-2 rounded-xl bg-[#090C12]/92 backdrop-blur-md border border-[var(--border-default)] text-[#E2E8F0] hover:bg-[#161C2B] hover:text-white shadow-lg transition-colors cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <button
            type="button"
            onClick={handleResetView}
            title="Reset Peta Indonesia"
            aria-label="Reset Peta Indonesia"
            className="p-1.5 sm:p-2 rounded-xl bg-[#090C12]/92 backdrop-blur-md border border-[var(--border-default)] text-[#E2E8F0] hover:bg-[#161C2B] hover:text-white shadow-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            title="Peta Layar Penuh"
            aria-label="Peta Layar Penuh"
            className="p-1.5 sm:p-2 rounded-xl bg-[#090C12]/92 backdrop-blur-md border border-[var(--border-default)] text-[#E2E8F0] hover:bg-[#161C2B] hover:text-white shadow-lg transition-colors cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Floating Tactical GeoINT Intelligence HUD Panel */}
      <TacticalGeoIntHud
        isOpen={isGeoIntHudOpen}
        onClose={() => setIsGeoIntHudOpen(false)}
        asset={selectedGeoIntAsset}
        biOffices={allBIOffices}
        protestEvents={protestEvents || []}
        markers={validMarkers}
        officeRadius={officeRadiusDistance}
        unrasRadius={unrasRadiusDistance}
        onChangeOfficeRadius={setOfficeRadiusDistance}
        onChangeUnrasRadius={setUnrasRadiusDistance}
        onPlayCamera={(cam) => onMarkerClickRef.current(cam.id, cam)}
        onFocusMap={(lat, lng, zoom = 15) => {
          mapRef.current?.flyTo([lat, lng], zoom, { duration: 1.0 });
        }}
      />

      {/* Compact Floating Map Preview — Rendered ONLY when interaction.type === "map-preview" */}
      <CameraMapPreview
        camera={previewCamera}
        provinces={provinces}
        onClose={onClosePreview}
        onOpenFullDetail={onOpenFullDetail}
        onAddToMultiView={onAddToMultiView}
      />
    </div>
  );
}
