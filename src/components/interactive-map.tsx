"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  PlusSquare,
  Eye,
  Navigation
} from "lucide-react";
import { Camera, CompactMarker, Province } from "@/lib/types";
import CCTVPlayer from "@/components/cctv-player";

interface InteractiveMapProps {
  markers: CompactMarker[];
  provinces: Province[];
  selectedProvince?: string;
  selectedCamera: Camera | null;
  onSelectCamera: (camera: Camera) => void;
  onAddToMultiView: (camera: Camera) => void;
}

const TILE_LAYERS = {
  dark: {
    name: "Command Dark (OSM)",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
  },
  street: {
    name: "OpenStreetMap Standar",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  topo: {
    name: "Topografi (OpenTopoMap)",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
  },
  satellite: {
    name: "Satelit (Esri World)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri, Maxar, Earthstar Geographics"
  }
};

function markerTupleToCamera(m: CompactMarker): Camera {
  return {
    id: m[0],
    latitude: m[1],
    longitude: m[2],
    status: m[3] === 1 ? "ONLINE" : "OFFLINE",
    protocol: m[4],
    name: m[5],
    city_name: m[6],
    province_id: m[7],
    source_name: m[8],
    stream_url: m[9],
    province_name: "",
    city_id: "",
    source_id: "",
    location: m[6],
    source_url: "https://atcsindonesia.com",
    last_checked_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

export default function InteractiveMap({
  markers,
  provinces,
  selectedProvince,
  selectedCamera,
  onSelectCamera,
  onAddToMultiView
}: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [activeTile, setActiveTile] = useState<keyof typeof TILE_LAYERS>("dark");
  const [clustering, setClustering] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const [previewCam, setPreviewCam] = useState<Camera | null>(null);

  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const bounds = map.getBounds();
    const zoom = map.getZoom();

    // Filter markers within current viewport bounds
    const inView: CompactMarker[] = [];
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      if (bounds.contains([m[1], m[2]])) {
        inView.push(m);
      }
    }
    setVisibleCount(inView.length);

    // Dynamic spatial grid clustering when clustering is enabled and zoom < 14
    if (clustering && zoom < 14 && inView.length > 80) {
      const cellDeg = zoom <= 5 ? 2.2 : zoom <= 7 ? 1.0 : zoom <= 9 ? 0.35 : zoom <= 11 ? 0.12 : 0.04;
      const buckets = new Map<
        string,
        {
          latSum: number;
          lngSum: number;
          count: number;
          online: number;
          items: CompactMarker[];
        }
      >();

      for (const m of inView) {
        const gx = Math.floor(m[2] / cellDeg);
        const gy = Math.floor(m[1] / cellDeg);
        const key = `${gx}:${gy}`;
        let b = buckets.get(key);
        if (!b) {
          b = { latSum: 0, lngSum: 0, count: 0, online: 0, items: [] };
          buckets.set(key, b);
        }
        b.latSum += m[1];
        b.lngSum += m[2];
        b.count++;
        if (m[3] === 1) b.online++;
        if (b.items.length < 5) b.items.push(m);
      }

      for (const b of buckets.values()) {
        const lat = b.latSum / b.count;
        const lng = b.lngSum / b.count;

        if (b.count === 1) {
          const single = b.items[0];
          const isOnline = single[3] === 1;
          const circle = L.circleMarker([single[1], single[2]], {
            radius: 6,
            fillColor: isOnline ? "#10b981" : "#ef4444",
            color: "#09090b",
            weight: 1.5,
            fillOpacity: 0.9
          });
          circle.bindTooltip(`${single[5]} (${single[6]})`, {
            direction: "top",
            offset: [0, -6]
          });
          circle.on("click", () => {
            const cam = markerTupleToCamera(single);
            setPreviewCam(cam);
          });
          circle.addTo(group);
        } else {
          const size = b.count > 500 ? 44 : b.count > 100 ? 38 : 32;
          const colorClass =
            b.online / b.count > 0.5
              ? "bg-emerald-500/90 border-emerald-300 text-zinc-950"
              : "bg-amber-500/90 border-amber-300 text-zinc-950";
          const icon = L.divIcon({
            className: "custom-cluster-icon",
            html: `<div style="width:${size}px;height:${size}px;" class="rounded-full border-2 ${colorClass} font-bold text-xs flex items-center justify-center shadow-lg transition-transform hover:scale-110">${
              b.count >= 1000
                ? `${(b.count / 1000).toFixed(1)}k`
                : b.count
            }</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
          });
          const clusterMarker = L.marker([lat, lng], { icon });
          clusterMarker.bindTooltip(
            `${b.count.toLocaleString("id-ID")} Kamera (${b.online.toLocaleString(
              "id-ID"
            )} Online) — Klik untuk perbesar`,
            { direction: "top" }
          );
          clusterMarker.on("click", () => {
            map.setView([lat, lng], Math.min(16, zoom + 2), { animate: true });
          });
          clusterMarker.addTo(group);
        }
      }
      return;
    }

    // Individual camera markers (capped to 800 on screen if clustering is off)
    const slice = inView.slice(0, 800);
    for (const m of slice) {
      const isOnline = m[3] === 1;
      const isSelected = selectedCamera?.id === m[0];
      const circle = L.circleMarker([m[1], m[2]], {
        radius: isSelected ? 9 : 6,
        fillColor: isSelected
          ? "#38bdf8"
          : isOnline
          ? "#10b981"
          : "#ef4444",
        color: isSelected ? "#ffffff" : "#09090b",
        weight: isSelected ? 2.5 : 1.5,
        fillOpacity: 0.95
      });
      circle.bindTooltip(
        `${m[5]} • ${m[6]} (${isOnline ? "ONLINE" : "OFFLINE"})`,
        { direction: "top", offset: [0, -6] }
      );
      circle.on("click", () => {
        const cam = markerTupleToCamera(m);
        setPreviewCam(cam);
      });
      circle.addTo(group);
    }
  }, [markers, clustering, selectedCamera]);

  // Initialize Leaflet map
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

    const tile = L.tileLayer(TILE_LAYERS.dark.url, {
      attribution: TILE_LAYERS.dark.attribution,
      maxZoom: 19
    }).addTo(map);

    const group = L.layerGroup().addTo(map);

    mapRef.current = map;
    tileLayerRef.current = tile;
    layerGroupRef.current = group;

    map.on("moveend zoomend", () => {
      renderMarkers();
    });

    renderMarkers();

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers when data or clustering toggles
  useEffect(() => {
    renderMarkers();
  }, [renderMarkers]);

  // Switch tile layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const cfg = TILE_LAYERS[activeTile];
    tileLayerRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: 19
    }).addTo(map);
  }, [activeTile]);

  // Fly to selected province
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedProvince) return;
    const prov = provinces.find(
      (p) =>
        p.id === selectedProvince ||
        p.slug === selectedProvince ||
        p.name === selectedProvince
    );
    if (prov) {
      map.flyTo([prov.lat, prov.lng], 8, { duration: 1.1 });
    }
  }, [selectedProvince, provinces]);

  // Fly to selected camera
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedCamera) return;
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
        mapRef.current?.flyTo(
          [pos.coords.latitude, pos.coords.longitude],
          13,
          { duration: 1.2 }
        );
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
      className="relative w-full h-full min-h-[540px] bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800"
    >
      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[540px] z-0" />

      {/* Top-Left Map Status Pill */}
      <div className="absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-2 pointer-events-auto">
        <div className="px-3 py-1.5 rounded-lg bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-xs flex items-center gap-2 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-zinc-100">
            {visibleCount.toLocaleString("id-ID")}
          </span>
          <span className="text-zinc-400">kamera di area peta</span>
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

      {/* Top-Right Layer & Fullscreen Controls */}
      <div className="absolute top-3 right-3 z-[400] flex items-center gap-1.5 pointer-events-auto">
        <div className="flex items-center bg-zinc-950/90 backdrop-blur-md border border-zinc-800 rounded-lg p-1 shadow-lg">
          <Layers className="w-3.5 h-3.5 text-zinc-400 ml-1.5 mr-1" />
          {(Object.keys(TILE_LAYERS) as Array<keyof typeof TILE_LAYERS>).map(
            (key) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTile(key)}
                className={`px-2 py-1 rounded text-[11px] font-medium capitalize transition ${
                  activeTile === key
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {key}
              </button>
            )
          )}
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

      {/* Floating Camera Preview Card when Marker is Clicked */}
      {previewCam && (
        <div className="absolute bottom-4 left-4 z-[450] w-[340px] sm:w-[380px] rounded-xl bg-zinc-950/95 backdrop-blur-xl border border-zinc-700/80 shadow-2xl overflow-hidden pointer-events-auto">
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800">
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-zinc-100 truncate">
                {previewCam.name}
              </h4>
              <p className="text-[11px] text-zinc-400 truncate">
                {previewCam.city_name} • {previewCam.latitude.toFixed(4)},{" "}
                {previewCam.longitude.toFixed(4)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewCam(null)}
              className="text-xs text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-800"
            >
              Tutup
            </button>
          </div>

          <div className="h-[210px] w-full">
            <CCTVPlayer camera={previewCam} compact />
          </div>

          <div className="p-2.5 bg-zinc-900/90 border-t border-zinc-800 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onSelectCamera(previewCam)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-100 transition"
            >
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>Detail Lengkap</span>
            </button>
            <button
              type="button"
              onClick={() => onAddToMultiView(previewCam)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition"
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

