"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
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
  PlusSquare,
  Eye,
  Navigation,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Building2,
  MapPin
} from "lucide-react";
import { Camera, CompactMarker, Province } from "@/lib/types";
import CCTVPlayer from "@/components/cctv-player";

interface InteractiveMapProps {
  markers: CompactMarker[];
  provinces: Province[];
  selectedProvince?: string;
  selectedCity?: string;
  selectedCamera: Camera | null;
  loadingMarkers?: boolean;
  onSelectCamera: (camera: Camera) => void;
  onAddToMultiView: (camera: Camera) => void;
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
  if (Number.isNaN(lat) || Number.isNaN(lng) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// Pre-create reusable lightweight DivIcons for ONLINE and OFFLINE cameras
const ONLINE_MARKER_ICON = L.divIcon({
  className: "cctv-marker-pin",
  html: `<div class="w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-zinc-950 shadow-[0_0_8px_rgba(16,185,129,0.85)]"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const OFFLINE_MARKER_ICON = L.divIcon({
  className: "cctv-marker-pin",
  html: `<div class="w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-zinc-950 shadow-[0_0_8px_rgba(239,68,68,0.75)]"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

function markerTupleToCamera(m: CompactMarker, provinces: Province[]): Camera {
  const provId = m[7] || "";
  const provName =
    m[10] ||
    provinces.find((p) => p.id === provId || p.slug === provId)?.name ||
    provId.replace("prov-", "").replace(/-/g, " ").toUpperCase();

  return {
    id: m[0],
    latitude: m[1],
    longitude: m[2],
    status: m[3] === 1 ? "ONLINE" : "OFFLINE",
    protocol: m[4],
    name: m[5],
    city_name: m[6],
    province_id: provId,
    source_name: m[8],
    stream_url: m[9],
    province_name: provName,
    city_id: "",
    source_id: "",
    location: m[6],
    source_url: m[11] || "https://dishub.go.id",
    last_checked_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

export default function InteractiveMap({
  markers,
  provinces,
  selectedProvince,
  selectedCity,
  selectedCamera,
  loadingMarkers = false,
  onSelectCamera,
  onAddToMultiView
}: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const plainLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const provincesRef = useRef<Province[]>(provinces);
  provincesRef.current = provinces;

  const [darkFilter, setDarkFilter] = useState(true);
  const [clustering, setClustering] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewCam, setPreviewCam] = useState<Camera | null>(null);

  // Strict coordinate validation:
  // latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  // Excludes null, undefined, NaN, and invalid coordinates.
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
      chunkedLoading: true,
      chunkInterval: 100,
      chunkDelay: 15,
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
          html: `<div style="width:${size}px;height:${size}px;" class="rounded-full border-2 bg-emerald-500/90 border-emerald-200 text-zinc-950 font-extrabold text-xs flex items-center justify-center shadow-lg transition-transform hover:scale-110">${label}</div>`,
          className: "cctv-cluster-icon",
          iconSize: L.point(size, size)
        });
      }
    });

    const plainGroup = L.layerGroup();
    map.addLayer(clusterGroup);

    mapRef.current = map;
    clusterGroupRef.current = clusterGroup;
    plainLayerGroupRef.current = plainGroup;

    return () => {
      clusterGroup.clearLayers();
      plainGroup.clearLayers();
      map.remove();
      mapRef.current = null;
      clusterGroupRef.current = null;
      plainLayerGroupRef.current = null;
    };
  }, []);

  // Synchronize markers into Leaflet MarkerClusterGroup only when validMarkers or clustering mode changes
  useEffect(() => {
    const map = mapRef.current;
    const clusterGroup = clusterGroupRef.current;
    const plainGroup = plainLayerGroupRef.current;
    if (!map || !clusterGroup || !plainGroup) return;

    clusterGroup.clearLayers();
    plainGroup.clearLayers();

    if (validMarkers.length === 0) {
      return;
    }

    if (clustering) {
      if (map.hasLayer(plainGroup)) map.removeLayer(plainGroup);
      if (!map.hasLayer(clusterGroup)) map.addLayer(clusterGroup);

      const leafletMarkers: L.Marker[] = new Array(validMarkers.length);
      for (let i = 0; i < validMarkers.length; i++) {
        const m = validMarkers[i];
        const isOnline = m[3] === 1;
        const marker = L.marker([m[1], m[2]], {
          icon: isOnline ? ONLINE_MARKER_ICON : OFFLINE_MARKER_ICON
        });
        marker.bindTooltip(
          `${m[5]} • ${m[6]} (${isOnline ? "ONLINE" : "OFFLINE"})`,
          { direction: "top", offset: [0, -6] }
        );
        marker.on("click", () => {
          const cam = markerTupleToCamera(m, provincesRef.current);
          setPreviewCam(cam);
        });
        leafletMarkers[i] = marker;
      }
      clusterGroup.addLayers(leafletMarkers);
    } else {
      if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
      if (!map.hasLayer(plainGroup)) map.addLayer(plainGroup);

      // When unclustered, render circleMarkers on canvas for high performance
      const limit = Math.min(validMarkers.length, 3000);
      for (let i = 0; i < limit; i++) {
        const m = validMarkers[i];
        const isOnline = m[3] === 1;
        const circle = L.circleMarker([m[1], m[2]], {
          radius: 5.5,
          fillColor: isOnline ? "#10b981" : "#ef4444",
          color: "#09090b",
          weight: 1.5,
          fillOpacity: 0.92
        });
        circle.bindTooltip(
          `${m[5]} • ${m[6]} (${isOnline ? "ONLINE" : "OFFLINE"})`,
          { direction: "top", offset: [0, -6] }
        );
        circle.on("click", () => {
          const cam = markerTupleToCamera(m, provincesRef.current);
          setPreviewCam(cam);
        });
        circle.addTo(plainGroup);
      }
    }
  }, [validMarkers, clustering]);

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

  // Fly to selected camera
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedCamera) return;
    if (!isValidLatLng(selectedCamera.latitude, selectedCamera.longitude)) return;
    setPreviewCam(selectedCamera);
    map.flyTo([selectedCamera.latitude, selectedCamera.longitude], 15, {
      duration: 1.0
    });
  }, [selectedCamera]);

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

  const previewProvinceSlug = previewCam
    ? previewCam.province_id.replace(/^prov-/, "")
    : "dki-jakarta";

  return (
    <div
      ref={wrapRef}
      className={`relative w-full h-full min-h-[540px] bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800 ${
        darkFilter ? "osm-dark-tiles" : ""
      }`}
    >
      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[540px] z-0" />

      {/* Top-Left Map Status Pill (Synchronized with Valid Filtered Markers) */}
      <div className="absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-2 pointer-events-auto">
        <div
          data-testid="map-camera-counter"
          className="px-3 py-1.5 rounded-lg bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-xs flex items-center gap-2 shadow-lg"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              loadingMarkers
                ? "bg-amber-400 animate-ping"
                : "bg-emerald-400 animate-pulse"
            }`}
          />
          <span className="font-semibold text-zinc-100 font-mono">
            {validMarkers.length.toLocaleString("id-ID")}
          </span>
          <span className="text-zinc-400">kamera di peta</span>
          <span className="hidden sm:inline text-[11px] text-emerald-400 font-mono border-l border-zinc-800 pl-2">
            {onlineValidCount.toLocaleString("id-ID")} Online
          </span>
        </div>

        <button
          type="button"
          onClick={() => setClustering((c) => !c)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border backdrop-blur-md transition shadow-lg ${
            clustering
              ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-300"
              : "bg-zinc-950/90 border-zinc-800 text-zinc-300 hover:text-white"
          }`}
        >
          Cluster: {clustering ? "AKTIF" : "NONAKTIF"}
        </button>
      </div>

      {/* Top-Right OSM Theme & Fullscreen Controls */}
      <div className="absolute top-3 right-3 z-[400] flex items-center gap-1.5 pointer-events-auto">
        <div className="flex items-center bg-zinc-950/90 backdrop-blur-md border border-zinc-800 rounded-lg p-1 shadow-lg">
          <Layers className="w-3.5 h-3.5 text-zinc-400 ml-1.5 mr-1" />
          <button
            type="button"
            onClick={() => setDarkFilter(true)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition ${
              darkFilter
                ? "bg-emerald-600 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            OSM Gelap
          </button>
          <button
            type="button"
            onClick={() => setDarkFilter(false)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition ${
              !darkFilter
                ? "bg-emerald-600 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            OSM Standar
          </button>
        </div>

        <button
          type="button"
          onClick={handleLocateMe}
          title="Lokasi Saya"
          className="p-2 rounded-lg bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-zinc-300 hover:text-white shadow-lg transition"
        >
          <Navigation className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleResetView}
          title="Reset Peta Nusantara"
          className="p-2 rounded-lg bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-zinc-300 hover:text-white shadow-lg transition"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          title="Peta Layar Penuh"
          className="p-2 rounded-lg bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-zinc-300 hover:text-white shadow-lg transition"
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Floating Camera Information & Live Preview Card when Marker is Clicked */}
      {previewCam && (
        <div
          data-testid="map-camera-popup"
          className="absolute bottom-4 left-4 z-[450] w-[340px] sm:w-[390px] max-w-[calc(100vw-2rem)] rounded-xl bg-zinc-950/95 backdrop-blur-xl border border-zinc-700/80 shadow-2xl overflow-hidden pointer-events-auto"
        >
          {/* Header: Name, Status Badge, Close Button */}
          <div className="flex items-start justify-between gap-2 px-3.5 py-2.5 bg-zinc-900 border-b border-zinc-800">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                    previewCam.status === "ONLINE"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      : "bg-red-500/20 text-red-400 border border-red-500/40"
                  }`}
                >
                  {previewCam.status === "ONLINE" ? (
                    <CheckCircle2 className="w-2.5 h-2.5" />
                  ) : (
                    <XCircle className="w-2.5 h-2.5" />
                  )}
                  {previewCam.status}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {previewCam.protocol}
                </span>
              </div>
              <h4 className="text-xs font-bold text-zinc-100 truncate mt-1">
                {previewCam.name}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setPreviewCam(null)}
              className="text-xs text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-800 shrink-0"
            >
              ✕ Tutup
            </button>
          </div>

          {/* Metadata Strip: City, Province & Source Agency */}
          <div className="px-3.5 py-2 bg-zinc-900/60 border-b border-zinc-800/80 space-y-1 text-[11px]">
            <div className="flex items-center gap-1.5 text-zinc-300 truncate">
              <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">
                {previewCam.city_name}, {previewCam.province_name}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-400 truncate">
              <Building2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">{previewCam.source_name}</span>
            </div>
          </div>

          {/* Live Camera Stream / Snapshot Preview */}
          <div className="h-[200px] w-full bg-black">
            <CCTVPlayer camera={previewCam} compact />
          </div>

          {/* Action Buttons: Detail Modal, Detail Page Link, Multi-View */}
          <div className="p-2.5 bg-zinc-900/95 border-t border-zinc-800 flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() => onSelectCamera(previewCam)}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-100 transition"
            >
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>Detail</span>
            </button>

            <Link
              href={`/kamera/${encodeURIComponent(
                previewProvinceSlug
              )}/${encodeURIComponent(previewCam.id)}`}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-sky-400 hover:text-sky-300 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Halaman Kamera</span>
            </Link>

            <button
              type="button"
              onClick={() => onAddToMultiView(previewCam)}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition"
            >
              <PlusSquare className="w-3.5 h-3.5" />
              <span>+ Multi-View</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
