"use client";

import React, { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Building2,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Globe2,
  ExternalLink,
  PlusSquare,
  Activity,
  ChevronLeft,
  ChevronRight,
  Shield,
  Video
} from "lucide-react";
import {
  Camera,
  CCTVSource,
  City,
  CompactMarker,
  DashboardStats,
  Province
} from "@/lib/types";
import { APP_CONFIG } from "@/lib/branding";
import {
  ResponsiveHeader,
  AppFooter,
  DashboardTab
} from "@/components/branding";
import CCTVPlayer from "@/components/cctv-player";
import MultiViewGrid from "@/components/multi-view-grid";

const InteractiveMap = dynamic(() => import("@/components/interactive-map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[420px] sm:h-[560px] rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col items-center justify-center gap-3 p-4">
      <div className="w-11 h-11 rounded-xl bg-white/95 border border-amber-500/40 p-1.5 flex items-center justify-center shadow">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={APP_CONFIG.primaryIcon}
          alt={APP_CONFIG.name}
          className="w-full h-full object-contain"
          style={{ objectFit: "contain" }}
        />
      </div>
      <div className="w-7 h-7 border-2 border-sky-500 border-t-amber-400 rounded-full animate-spin" />
      <span className="text-xs text-zinc-400 font-mono text-center">
        Memuat Peta Interaktif {APP_CONFIG.name} (OpenStreetMap)...
      </span>
    </div>
  )
});

interface CommandCenterProps {
  initialStats: DashboardStats;
  initialProvinces: Province[];
  initialCameras: Camera[];
}

export default function CommandCenter({
  initialStats,
  initialProvinces,
  initialCameras
}: CommandCenterProps) {
  const [stats] = useState<DashboardStats>(initialStats);
  const [provinces] = useState<Province[]>(initialProvinces);
  const [cities, setCities] = useState<City[]>([]);
  const [sources, setSources] = useState<CCTVSource[]>([]);

  const [activeTab, setActiveTab] = useState<DashboardTab>("map");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvince, setSelectedProvince] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedProtocol, setSelectedProtocol] = useState("");

  const [cameras, setCameras] = useState<Camera[]>(initialCameras);
  const [totalMatching, setTotalMatching] = useState(
    initialStats.total_cameras
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    Math.ceil(initialStats.total_cameras / 24)
  );
  const [loadingCameras, setLoadingCameras] = useState(false);

  const [markers, setMarkers] = useState<CompactMarker[]>([]);
  const [loadingMarkers, setLoadingMarkers] = useState(true);
  const [multiViewCameras, setMultiViewCameras] = useState<Camera[]>(
    initialCameras.slice(0, 4)
  );
  const [detailCamera, setDetailCamera] = useState<Camera | null>(null);
  const [nearbyCameras, setNearbyCameras] = useState<Camera[]>([]);
  const [probeStatus, setProbeStatus] = useState<{
    loading: boolean;
    result?: string;
  }>({ loading: false });

  // URL query hydration on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const view = sp.get("view");
      if (
        view === "multiview" ||
        view === "directory" ||
        view === "provinces"
      ) {
        setActiveTab(view);
      }
      const multiIds = sp.get("multi");
      if (multiIds) {
        setActiveTab("multiview");
        fetch(`/api/cameras?ids=${encodeURIComponent(multiIds)}`)
          .then((r) => r.json())
          .then((j) => {
            if (Array.isArray(j.data) && j.data.length > 0) {
              setMultiViewCameras(j.data.slice(0, 9));
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  // Load cities & sources when province changes
  useEffect(() => {
    if (!selectedProvince) {
      setCities([]);
      setSelectedCity("");
      return;
    }
    setSelectedCity("");
    fetch(`/api/cities?province_id=${encodeURIComponent(selectedProvince)}`)
      .then((r) => r.json())
      .then((j) => setCities(j.data || []))
      .catch(() => {});
  }, [selectedProvince]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedProvince) params.set("province", selectedProvince);
    if (selectedCity) params.set("city", selectedCity);
    fetch(`/api/sources?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => setSources(j.data || []))
      .catch(() => {});
  }, [selectedProvince, selectedCity]);

  // Synchronized fetch for filtered cameras & map markers
  const fetchFilteredCameras = useCallback(
    async (targetPage = 1, signal?: AbortSignal) => {
      setLoadingCameras(true);
      setLoadingMarkers(true);
      try {
        const params = new URLSearchParams();
        if (searchQuery.trim()) params.set("q", searchQuery.trim());
        if (selectedProvince) params.set("province", selectedProvince);
        if (selectedCity) params.set("city", selectedCity);
        if (selectedSource) params.set("source", selectedSource);
        if (selectedStatus) params.set("status", selectedStatus);
        if (selectedProtocol) params.set("protocol", selectedProtocol);

        const listParams = new URLSearchParams(params);
        listParams.set("page", String(targetPage));
        listParams.set("limit", "24");

        const markerParams = new URLSearchParams(params);
        markerParams.set("mode", "markers");

        const [camRes, markerRes] = await Promise.all([
          fetch(`/api/cameras?${listParams.toString()}`, { signal }),
          fetch(`/api/cameras?${markerParams.toString()}`, { signal })
        ]);
        const [camJson, markerJson] = await Promise.all([
          camRes.json(),
          markerRes.json()
        ]);

        if (signal?.aborted) return;

        setCameras(camJson.data || []);
        setTotalMatching(
          typeof camJson.total === "number" ? camJson.total : 0
        );
        setPage(camJson.page || 1);
        setTotalPages(camJson.total_pages || 1);
        if (Array.isArray(markerJson.markers)) {
          setMarkers(markerJson.markers);
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("Failed to fetch cameras:", err);
        }
      } finally {
        if (!signal?.aborted) {
          setLoadingCameras(false);
          setLoadingMarkers(false);
        }
      }
    },
    [
      searchQuery,
      selectedProvince,
      selectedCity,
      selectedSource,
      selectedStatus,
      selectedProtocol
    ]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchFilteredCameras(1, controller.signal);
    }, searchQuery ? 180 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetchFilteredCameras, searchQuery]);

  const handleOpenCameraDetail = async (cam: Camera) => {
    setDetailCamera(cam);
    setProbeStatus({ loading: false });
    try {
      const res = await fetch(`/api/cameras/${encodeURIComponent(cam.id)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) setDetailCamera(json.data);
        setNearbyCameras(json.nearby || []);
      }
    } catch {}
  };

  const handleAddToMultiView = (cam: Camera) => {
    setMultiViewCameras((prev) => {
      if (prev.some((c) => c.id === cam.id)) return prev;
      return [...prev, cam].slice(-9);
    });
    setActiveTab("multiview");
  };

  const handleVerifyStreamLive = async (cam: Camera) => {
    setProbeStatus({ loading: true });
    try {
      const res = await fetch(`/api/health?id=${encodeURIComponent(cam.id)}`);
      const json = await res.json();
      setProbeStatus({
        loading: false,
        result: `${json.status} • HTTP ${json.httpStatus} • ${json.latencyMs}ms • Protocol: ${json.protocol}`
      });
      if (json.status === "ONLINE" || json.status === "OFFLINE") {
        setDetailCamera((prev) =>
          prev ? { ...prev, status: json.status } : null
        );
      }
    } catch {
      setProbeStatus({ loading: false, result: "Gagal memverifikasi stream" });
    }
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedProvince("");
    setSelectedCity("");
    setSelectedSource("");
    setSelectedStatus("");
    setSelectedProtocol("");
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Unified Institutional Responsive Header */}
      <ResponsiveHeader
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        multiViewCount={multiViewCameras.length}
      />

      {/* National Telemetry KPI Strip (Responsive 2-col on mobile/tablet, 6-col on desktop) */}
      <section
        aria-label="Statistik Pemantauan Nasional"
        className="border-b border-zinc-800/80 bg-zinc-900/40 px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3"
      >
        <div className="max-w-[1600px] mx-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-2.5">
          <div className="p-2.5 sm:p-3 rounded-xl bg-zinc-900/90 border border-zinc-800/90 min-w-0">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-zinc-400">
              <span className="truncate">Total Kamera CCTV</span>
              <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400 shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-extrabold text-white mt-1 font-mono truncate">
              {stats.total_cameras.toLocaleString("id-ID")}
            </p>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-zinc-900/90 border border-emerald-900/50 min-w-0">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-emerald-400">
              <span className="truncate">Kamera Aktif (Online)</span>
              <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-extrabold text-emerald-400 mt-1 font-mono truncate">
              {stats.online_cameras.toLocaleString("id-ID")}
            </p>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-zinc-900/90 border border-red-900/40 min-w-0">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-red-400">
              <span className="truncate">Kamera Offline</span>
              <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-extrabold text-red-400 mt-1 font-mono truncate">
              {stats.offline_cameras.toLocaleString("id-ID")}
            </p>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-zinc-900/90 border border-zinc-800/90 min-w-0">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-zinc-400">
              <span className="truncate">Cakupan Provinsi</span>
              <Globe2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400 shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-extrabold text-sky-400 mt-1 font-mono truncate">
              {stats.total_provinces} / 38
            </p>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-zinc-900/90 border border-zinc-800/90 min-w-0">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-zinc-400">
              <span className="truncate">Kota / Kabupaten</span>
              <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-extrabold text-amber-400 mt-1 font-mono truncate">
              {stats.total_cities.toLocaleString("id-ID")}
            </p>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-zinc-900/90 border border-zinc-800/90 min-w-0">
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-zinc-400">
              <span className="truncate">Instansi / Sumber</span>
              <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-extrabold text-amber-300 mt-1 font-mono truncate">
              {stats.total_sources.toLocaleString("id-ID")}
            </p>
          </div>
        </div>
      </section>

      {/* Global Search & Filter Bar (Stacks cleanly on mobile, horizontal on desktop) */}
      <section className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3 bg-zinc-950 border-b border-zinc-800/80">
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative sm:col-span-2 lg:flex-1 lg:min-w-[240px] min-w-0">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama kamera, simpang jalan, kota, provinsi, atau instansi Dishub..."
              className="w-full max-w-full min-w-0 pl-9 pr-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Province Select */}
          <select
            aria-label="Filter Provinsi"
            value={selectedProvince}
            onChange={(e) => setSelectedProvince(e.target.value)}
            className="w-full max-w-full lg:w-auto min-w-0 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
          >
            <option value="">Semua 38 Provinsi</option>
            {provinces.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.total_cameras.toLocaleString("id-ID")})
              </option>
            ))}
          </select>

          {/* City Select */}
          <select
            aria-label="Filter Kota/Kabupaten"
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            disabled={!selectedProvince}
            className="w-full max-w-full lg:w-auto min-w-0 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 disabled:opacity-50 focus:outline-none focus:border-sky-500"
          >
            <option value="">Semua Kota / Kabupaten</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.total_cameras})
              </option>
            ))}
          </select>

          {/* Status Select */}
          <select
            aria-label="Filter Status Kamera"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full max-w-full lg:w-auto min-w-0 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
          >
            <option value="">Semua Status</option>
            <option value="ONLINE">ONLINE (Aktif)</option>
            <option value="OFFLINE">OFFLINE (Gangguan)</option>
          </select>

          {/* Protocol Select */}
          <select
            aria-label="Filter Protokol Stream"
            value={selectedProtocol}
            onChange={(e) => setSelectedProtocol(e.target.value)}
            className="w-full max-w-full lg:w-auto min-w-0 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
          >
            <option value="">Semua Protokol</option>
            <option value="HLS">HLS (.m3u8)</option>
            <option value="MJPEG">MJPEG Stream</option>
            <option value="SNAPSHOT">JPEG Snapshot</option>
            <option value="WEBSOCKET">WebSocket</option>
            <option value="EMBED">Embedded Player</option>
          </select>

          <div className="sm:col-span-2 lg:col-span-1 flex items-center justify-between lg:justify-end gap-2 lg:ml-auto">
            {(searchQuery ||
              selectedProvince ||
              selectedCity ||
              selectedSource ||
              selectedStatus ||
              selectedProtocol) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition shrink-0"
              >
                Reset Filter
              </button>
            )}

            <div className="text-xs text-zinc-400 font-mono">
              Menampilkan{" "}
              <span className="text-amber-400 font-bold">
                {totalMatching.toLocaleString("id-ID")}
              </span>{" "}
              kamera
            </div>
          </div>
        </div>
      </section>

      {/* Main Workspace Area */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
        {activeTab === "map" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Interactive Map (8 cols on desktop) */}
            <div className="lg:col-span-8 h-[460px] sm:h-[560px] lg:h-[620px] min-w-0">
              <InteractiveMap
                markers={markers}
                provinces={provinces}
                selectedProvince={selectedProvince}
                selectedCity={selectedCity}
                selectedCamera={detailCamera}
                loadingMarkers={loadingMarkers}
                onSelectCamera={handleOpenCameraDetail}
                onAddToMultiView={handleAddToMultiView}
              />
            </div>

            {/* Right Live Camera Feed Sidebar (4 cols on desktop) */}
            <div className="lg:col-span-4 h-[480px] sm:h-[560px] lg:h-[620px] rounded-xl bg-zinc-900/70 border border-zinc-800 flex flex-col overflow-hidden min-w-0">
              <div className="px-3.5 py-2.5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Filter className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200 truncate">
                    Daftar Kamera ({totalMatching.toLocaleString("id-ID")})
                  </h2>
                </div>
                <span className="text-[11px] text-zinc-400 font-mono shrink-0">
                  Hal {page}/{totalPages}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
                {loadingCameras ? (
                  <div className="p-8 text-center text-xs text-zinc-400">
                    Memuat daftar kamera...
                  </div>
                ) : cameras.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500">
                    Tidak ada kamera yang sesuai filter.
                  </div>
                ) : (
                  cameras.map((cam) => (
                    <div
                      key={cam.id}
                      className="p-3 hover:bg-zinc-800/50 transition flex items-start justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenCameraDetail(cam)}
                        className="text-left min-w-0 flex-1"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              cam.status === "ONLINE"
                                ? "bg-emerald-400"
                                : "bg-red-400"
                            }`}
                          />
                          <p className="text-xs font-semibold text-zinc-100 truncate">
                            {cam.name}
                          </p>
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                          {cam.city_name}, {cam.province_name}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                          {cam.source_name} • {cam.protocol}
                        </p>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleAddToMultiView(cam)}
                          title="Tambah ke Multi-View"
                          className="p-1.5 rounded bg-zinc-800 hover:bg-sky-600 text-zinc-300 hover:text-white transition"
                        >
                          <PlusSquare className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pagination Footer */}
              <div className="p-2.5 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => fetchFilteredCameras(page - 1)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs text-zinc-200"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Sebelumnya</span>
                </button>
                <span className="text-[11px] text-zinc-400 font-mono truncate">
                  Hal {page}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => fetchFilteredCameras(page + 1)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs text-zinc-200"
                >
                  <span>Berikutnya</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "multiview" && (
          <MultiViewGrid
            cameras={multiViewCameras}
            onSetCameras={setMultiViewCameras}
            onSelectDetail={handleOpenCameraDetail}
          />
        )}

        {activeTab === "directory" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
              {cameras.slice(0, 12).map((cam) => (
                <div
                  key={cam.id}
                  className="rounded-xl bg-zinc-900/80 border border-zinc-800 overflow-hidden flex flex-col min-w-0"
                >
                  <div className="h-[190px] sm:h-[200px]">
                    <CCTVPlayer camera={cam} autoPlay={false} compact />
                  </div>
                  <div className="p-3 flex items-center justify-between gap-2 bg-zinc-900">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-zinc-100 truncate">
                        {cam.name}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate">
                        {cam.city_name}, {cam.province_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenCameraDetail(cam)}
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-200"
                      >
                        Detail
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddToMultiView(cam)}
                        className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-[11px] text-white"
                      >
                        +Multi
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => fetchFilteredCameras(page - 1)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-medium"
              >
                ← Sebelumnya
              </button>
              <span className="text-xs text-zinc-400 font-mono text-center">
                Halaman {page} / {totalPages} ({totalMatching.toLocaleString("id-ID")} Kamera)
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => fetchFilteredCameras(page + 1)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-medium"
              >
                Berikutnya →
              </button>
            </div>
          </div>
        )}

        {activeTab === "provinces" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider mb-3">
                Direktori Hirarkis 38 Provinsi Indonesia
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {provinces.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-sky-500/50 transition flex flex-col justify-between min-w-0"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                          {p.island}
                        </span>
                        <span className="text-xs font-mono text-emerald-400 font-bold">
                          {p.online_cameras.toLocaleString("id-ID")} Online
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-white mt-2 truncate">
                        {p.name}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {p.total_cameras.toLocaleString("id-ID")} kamera •{" "}
                        {p.city_count} Kota/Kab • {p.source_count} Sumber
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProvince(p.id);
                          setActiveTab("map");
                        }}
                        className="text-xs text-sky-400 hover:text-sky-300 font-medium"
                      >
                        Buka di Peta →
                      </button>
                      <Link
                        href={`/kamera/${p.slug}`}
                        className="text-xs text-zinc-400 hover:text-white"
                      >
                        Halaman Provinsi
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {sources.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider mb-3">
                  Sumber Instansi Resmi Terverifikasi ({sources.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {sources.slice(0, 36).map((s) => (
                    <div
                      key={s.id}
                      className="p-3 rounded-lg bg-zinc-900/70 border border-zinc-800 flex items-center justify-between gap-2 min-w-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-zinc-100 truncate">
                          {s.name}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {s.city_name}, {s.province_name} • {s.protocol}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSource(s.id);
                          setActiveTab("directory");
                        }}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-sky-600 text-xs font-mono text-zinc-200 hover:text-white shrink-0 transition"
                      >
                        {s.total_cameras} cam
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Camera Detail Modal */}
      {detailCamera && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-4 sm:px-5 py-3 bg-zinc-900 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">
                  {detailCamera.name}
                </h3>
                <p className="text-xs text-zinc-400 truncate">
                  {detailCamera.city_name}, {detailCamera.province_name} • ID:{" "}
                  <span className="font-mono text-zinc-300">
                    {detailCamera.id}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <Link
                  href={`/kamera/${encodeURIComponent(
                    provinces.find((p) => p.id === detailCamera.province_id)
                      ?.slug || detailCamera.province_id.replace("prov-", "")
                  )}/${encodeURIComponent(detailCamera.id)}`}
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200"
                >
                  Halaman Penuh
                </Link>
                <button
                  type="button"
                  onClick={() => setDetailCamera(null)}
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200"
                >
                  ✕ Tutup
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
              <div className="lg:col-span-8 h-[240px] sm:h-[380px]">
                <CCTVPlayer camera={detailCamera} />
              </div>

              <div className="lg:col-span-4 space-y-3 text-xs min-w-0">
                <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                  <h4 className="font-bold text-zinc-200 uppercase tracking-wider text-[11px]">
                    Informasi Teknis Kamera
                  </h4>
                  <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/80">
                    <span className="text-zinc-400 shrink-0">Provinsi</span>
                    <span className="text-zinc-100 font-medium text-right truncate">
                      {detailCamera.province_name}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/80">
                    <span className="text-zinc-400 shrink-0">Kota / Kabupaten</span>
                    <span className="text-zinc-100 font-medium text-right truncate">
                      {detailCamera.city_name}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/80">
                    <span className="text-zinc-400 shrink-0">Instansi Sumber</span>
                    <span className="text-sky-400 font-medium text-right truncate">
                      {detailCamera.source_name}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/80">
                    <span className="text-zinc-400 shrink-0">Koordinat GPS</span>
                    <span className="text-zinc-200 font-mono text-right">
                      {detailCamera.latitude}, {detailCamera.longitude}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/80">
                    <span className="text-zinc-400 shrink-0">Protokol Stream</span>
                    <span className="text-zinc-200 font-mono">
                      {detailCamera.protocol}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 py-1">
                    <span className="text-zinc-400 shrink-0">Status Terakhir</span>
                    <span
                      className={`font-bold ${
                        detailCamera.status === "ONLINE"
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {detailCamera.status}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddToMultiView(detailCamera)}
                    className="w-full py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <PlusSquare className="w-4 h-4" />
                    <span>Tambahkan ke Multi-View Wall</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleVerifyStreamLive(detailCamera)}
                    disabled={probeStatus.loading}
                    className="w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium flex items-center justify-center gap-1.5 transition"
                  >
                    <Activity className="w-4 h-4 text-amber-400" />
                    <span>
                      {probeStatus.loading
                        ? "Memeriksa Koneksi Stream..."
                        : "Cek Kesehatan Stream (Live Probe)"}
                    </span>
                  </button>

                  {probeStatus.result && (
                    <div className="p-2 rounded bg-zinc-900 border border-zinc-700 text-[11px] font-mono text-emerald-300 break-words">
                      {probeStatus.result}
                    </div>
                  )}

                  <a
                    href={detailCamera.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 flex items-center justify-center gap-1.5 transition"
                  >
                    <span>Kunjungi Portal Resmi Pemerintah</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {nearbyCameras.length > 0 && (
                  <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                      Kamera Terdekat
                    </h5>
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                      {nearbyCameras.map((nc) => (
                        <button
                          key={nc.id}
                          type="button"
                          onClick={() => handleOpenCameraDetail(nc)}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 flex items-center justify-between gap-2"
                        >
                          <span className="truncate text-zinc-200">
                            {nc.name}
                          </span>
                          <span className="text-[10px] font-mono text-sky-400 shrink-0">
                            {nc.protocol}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unified Institutional Footer */}
      <AppFooter />
    </div>
  );
}
