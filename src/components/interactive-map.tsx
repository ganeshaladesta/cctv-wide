"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
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
  Navigation
} from "lucide-react";
import { Camera, CompactMarker, Province } from "@/lib/types";
import { CameraMapPreview } from "@/components/camera-interfaces";

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
  previewCamera,
  loadingMarkers = false,
  onMarkerClick,
  onClosePreview,
  onOpenFullDetail,
  onAddToMultiView
}: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const plainLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const provincesRef = useRef<Province[]>(provinces);
  provincesRef.current = provinces;
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;

  const [darkFilter, setDarkFilter] = useState(true);
  const [clustering, setClustering] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
          onMarkerClickRef.current(cam.id, cam);
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
          onMarkerClickRef.current(cam.id, cam);
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

  // Fly to previewCamera when a map marker is clicked
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !previewCamera) return;
    if (!isValidLatLng(previewCamera.latitude, previewCamera.longitude)) return;
    map.flyTo([previewCamera.latitude, previewCamera.longitude], 15, {
      duration: 0.85
    });
  }, [previewCamera]);

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
      className={`map-container relative z-0 w-full h-full min-h-[420px] sm:min-h-[540px] bg-zinc-950 rounded-xl overflow-hidden border border-[#252A35] ${
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
        {/* Left: Map Status Pill & Cluster Toggle */}
        <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto max-w-full">
          <div
            data-testid="map-camera-counter"
            className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-[11px] sm:text-xs flex items-center gap-1.5 sm:gap-2 shadow-lg"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
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
            className={`px-2 sm:px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium border backdrop-blur-md transition shadow-lg ${
              clustering
                ? "bg-sky-950/90 border-sky-500/50 text-sky-300"
                : "bg-zinc-950/90 border-zinc-800 text-zinc-300 hover:text-white"
            }`}
          >
            Cluster: {clustering ? "AKTIF" : "NONAKTIF"}
          </button>
        </div>

        {/* Right: OSM Basemap Switcher & Navigation Controls (z-index: 20) */}
        <div
          data-testid="osm-basemap-switcher"
          style={{ zIndex: 20 }}
          className="flex flex-wrap items-center gap-1 sm:gap-1.5 pointer-events-auto"
        >
          <div className="flex items-center bg-zinc-950/90 backdrop-blur-md border border-zinc-800 rounded-lg p-1 shadow-lg">
            <Layers className="w-3.5 h-3.5 text-amber-400 ml-1 mr-1 hidden xs:inline" />
            <button
              type="button"
              data-testid="osm-dark-btn"
              onClick={() => setDarkFilter(true)}
              className={`px-1.5 sm:px-2 py-1 rounded text-[10px] sm:text-[11px] font-medium transition ${
                darkFilter
                  ? "bg-sky-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              OSM Gelap
            </button>
            <button
              type="button"
              data-testid="osm-standard-btn"
              onClick={() => setDarkFilter(false)}
              className={`px-1.5 sm:px-2 py-1 rounded text-[10px] sm:text-[11px] font-medium transition ${
                !darkFilter
                  ? "bg-sky-600 text-white"
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
            className="p-1.5 sm:p-2 rounded-lg bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-zinc-300 hover:text-white shadow-lg transition"
          >
            <Navigation className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <button
            type="button"
            onClick={handleResetView}
            title="Reset Peta Indonesia"
            className="p-1.5 sm:p-2 rounded-lg bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-zinc-300 hover:text-white shadow-lg transition"
          >
            <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            title="Peta Layar Penuh"
            className="p-1.5 sm:p-2 rounded-lg bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-zinc-300 hover:text-white shadow-lg transition"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            )}
          </button>
        </div>
      </div>

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
