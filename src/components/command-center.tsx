"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Building2,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Globe2,
  PlusSquare,
  ChevronLeft,
  ChevronRight,
  Shield,
  Video,
  MapPin,
  Radio
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
import {
  EagleEyesLogo,
  AnimatedDropdown,
  FavoritesButton,
  ProgramsCard
} from "@/components/motion-ui";
import { FavoritesPage } from "@/components/favorites-view";
import {
  CameraInteraction,
  CameraDetailModal,
  CameraVideoPlayer
} from "@/components/camera-interfaces";
import MultiViewGrid from "@/components/multi-view-grid";

const InteractiveMap = dynamic(() => import("@/components/interactive-map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[420px] sm:h-[560px] rounded-2xl bg-[#0D121B]/85 border border-[var(--border-default)] flex flex-col items-center justify-center gap-3 p-4">
      <EagleEyesLogo size="lg" animateHover={false} />
      <div className="w-7 h-7 border-2 border-[#3B82F6] border-t-white rounded-full animate-spin" />
      <span className="text-xs text-[#98A4B8] font-mono text-center">
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

  // Mutually Exclusive Camera Interaction State Machine
  const [cameraInteraction, setCameraInteraction] =
    useState<CameraInteraction>({ type: "none" });
  const [nearbyCameras, setNearbyCameras] = useState<Camera[]>([]);
  const [probeStatus, setProbeStatus] = useState<{
    loading: boolean;
    result?: string;
  }>({ loading: false });

  // Shared camera detail cache to avoid duplicate API requests
  const cameraDetailCacheRef = useRef<
    Map<string, { camera: Camera; nearby: Camera[] }>
  >(new Map());

  // Seed cache with initialCameras and current cameras page
  useEffect(() => {
    for (const c of cameras) {
      if (!cameraDetailCacheRef.current.has(c.id)) {
        cameraDetailCacheRef.current.set(c.id, { camera: c, nearby: [] });
      }
    }
  }, [cameras]);

  // URL query hydration on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const view = sp.get("view");
      if (
        view === "multiview" ||
        view === "directory" ||
        view === "provinces" ||
        view === "favorites"
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

  // Load cities (all cities when no province selected, or filtered by province)
  useEffect(() => {
    setSelectedCity("");
    const url = selectedProvince
      ? `/api/cities?province_id=${encodeURIComponent(selectedProvince)}`
      : `/api/cities`;
    fetch(url)
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
    const timer = setTimeout(
      () => {
        fetchFilteredCameras(1, controller.signal);
      },
      searchQuery ? 180 : 0
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetchFilteredCameras, searchQuery]);

  const hydrateCameraDetail = useCallback(
    async (cameraId: string, fallbackCam?: Camera) => {
      const cached = cameraDetailCacheRef.current.get(cameraId);
      if (cached && cached.nearby.length > 0) {
        setNearbyCameras(cached.nearby);
        setCameraInteraction((prev) =>
          prev.type !== "none" && prev.cameraId === cameraId
            ? { ...prev, camera: cached.camera }
            : prev
        );
        return;
      }

      try {
        const res = await fetch(
          `/api/cameras/${encodeURIComponent(cameraId)}`
        );
        if (res.ok) {
          const json = await res.json();
          const fullCam: Camera | undefined = json.data || fallbackCam;
          const near: Camera[] = Array.isArray(json.nearby) ? json.nearby : [];
          if (fullCam) {
            cameraDetailCacheRef.current.set(cameraId, {
              camera: fullCam,
              nearby: near
            });
            setNearbyCameras(near);
            setCameraInteraction((prev) =>
              prev.type !== "none" && prev.cameraId === cameraId
                ? { ...prev, camera: fullCam }
                : prev
            );
          }
        }
      } catch {}
    },
    []
  );

  // 1. Directory Click Handler -> Opens ONLY Full Camera Detail Modal
  const handleDirectoryCameraClick = useCallback(
    (cameraId: string, cam?: Camera) => {
      const resolved =
        cam ||
        cameraDetailCacheRef.current.get(cameraId)?.camera ||
        cameras.find((c) => c.id === cameraId);
      setProbeStatus({ loading: false });
      setCameraInteraction({
        type: "camera-detail",
        cameraId,
        camera: resolved
      });
      hydrateCameraDetail(cameraId, resolved);
    },
    [cameras, hydrateCameraDetail]
  );

  // 2. Map Marker Click Handler -> Opens ONLY Compact Floating Map Preview
  const handleMapMarkerClick = useCallback(
    (cameraId: string, cam?: Camera) => {
      const resolved =
        cam ||
        cameraDetailCacheRef.current.get(cameraId)?.camera ||
        cameras.find((c) => c.id === cameraId);
      setCameraInteraction({
        type: "map-preview",
        cameraId,
        camera: resolved
      });
    },
    [cameras]
  );

  // 3. Transition from Compact Map Preview -> Full Camera Detail Modal
  const handleOpenFullDetail = useCallback(
    (cameraId: string, cam?: Camera) => {
      const resolved =
        cam ||
        (cameraInteraction.type !== "none"
          ? cameraInteraction.camera
          : undefined) ||
        cameraDetailCacheRef.current.get(cameraId)?.camera ||
        cameras.find((c) => c.id === cameraId);
      setProbeStatus({ loading: false });
      setCameraInteraction({
        type: "camera-detail",
        cameraId,
        camera: resolved
      });
      hydrateCameraDetail(cameraId, resolved);
    },
    [cameraInteraction, cameras, hydrateCameraDetail]
  );

  // 4. Close any open camera interface
  const handleCloseCameraInterface = useCallback(() => {
    setCameraInteraction({ type: "none" });
  }, []);

  const handleAddToMultiView = useCallback((cam: Camera) => {
    setMultiViewCameras((prev) => {
      if (prev.some((c) => c.id === cam.id)) return prev;
      return [...prev, cam].slice(-9);
    });
    setCameraInteraction({ type: "none" });
    setActiveTab("multiview");
  }, []);

  const handleVerifyStreamLive = useCallback(async (cam: Camera) => {
    setProbeStatus({ loading: true });
    try {
      const res = await fetch(`/api/health?id=${encodeURIComponent(cam.id)}`);
      const json = await res.json();
      setProbeStatus({
        loading: false,
        result: `${json.status} • HTTP ${json.httpStatus} • ${json.latencyMs}ms • Protocol: ${json.protocol}`
      });
      if (json.status === "ONLINE" || json.status === "OFFLINE") {
        setCameraInteraction((prev) =>
          prev.type === "camera-detail" && prev.camera
            ? { ...prev, camera: { ...prev.camera, status: json.status } }
            : prev
        );
      }
    } catch {
      setProbeStatus({ loading: false, result: "Gagal memverifikasi stream" });
    }
  }, []);

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedProvince("");
    setSelectedCity("");
    setSelectedSource("");
    setSelectedStatus("");
    setSelectedProtocol("");
  };

  const provinceOptions = useMemo(
    () => [
      {
        value: "",
        label: "Semua 38 Provinsi",
        badge: stats.total_cameras.toLocaleString("id-ID")
      },
      ...provinces.map((p) => ({
        value: p.id,
        label: p.name,
        badge: p.total_cameras.toLocaleString("id-ID")
      }))
    ],
    [provinces, stats.total_cameras]
  );

  const cityOptions = useMemo(
    () => [
      { value: "", label: "Semua Kota / Kabupaten" },
      ...cities.map((c) => ({
        value: c.id,
        label: c.name,
        badge: c.total_cameras
      }))
    ],
    [cities]
  );

  const sourceOptions = useMemo(
    () => [
      { value: "", label: "Semua Sumber / Provider" },
      ...sources.slice(0, 120).map((s) => ({
        value: s.id,
        label: s.name,
        badge: s.total_cameras
      }))
    ],
    [sources]
  );

  const statusOptions = useMemo(
    () => [
      { value: "", label: "Semua Status" },
      {
        value: "ONLINE",
        label: "ONLINE (Aktif)",
        badge: stats.online_cameras.toLocaleString("id-ID")
      },
      {
        value: "OFFLINE",
        label: "OFFLINE (Gangguan)",
        badge: stats.offline_cameras.toLocaleString("id-ID")
      }
    ],
    [stats.online_cameras, stats.offline_cameras]
  );

  const protocolOptions = useMemo(
    () => [
      { value: "", label: "Semua Protokol" },
      { value: "HLS", label: "HLS (.m3u8)" },
      { value: "MJPEG", label: "MJPEG Stream" },
      { value: "SNAPSHOT", label: "JPEG Snapshot" },
      { value: "WEBSOCKET", label: "WebSocket" },
      { value: "EMBED", label: "Embedded Player" }
    ],
    []
  );

  const multiViewIdSet = useMemo(
    () => new Set(multiViewCameras.map((c) => c.id)),
    [multiViewCameras]
  );

  const activePreviewCamera =
    cameraInteraction.type === "map-preview"
      ? cameraInteraction.camera || null
      : null;

  const activeDetailCamera =
    cameraInteraction.type === "camera-detail"
      ? cameraInteraction.camera || null
      : null;

  const kpiCards = [
    {
      label: "Total Kamera CCTV",
      value: stats.total_cameras.toLocaleString("id-ID"),
      icon: <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#E2E8F0] shrink-0" />,
      valueColor: "text-[#F3F6FB]",
      borderTone: "border-[var(--border-default)] hover:border-[var(--border-strong)]"
    },
    {
      label: "Kamera Aktif (Online)",
      value: stats.online_cameras.toLocaleString("id-ID"),
      icon: <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#10B981] shrink-0" />,
      valueColor: "text-[#10B981]",
      borderTone: "border-emerald-500/25 hover:border-emerald-400/45"
    },
    {
      label: "Kamera Offline",
      value: stats.offline_cameras.toLocaleString("id-ID"),
      icon: <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#EF4444] shrink-0" />,
      valueColor: "text-[#EF4444]",
      borderTone: "border-red-500/20 hover:border-red-400/40"
    },
    {
      label: "Cakupan Provinsi",
      value: `${stats.total_provinces} / 38`,
      icon: <Globe2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#60A5FA] shrink-0" />,
      valueColor: "text-[#60A5FA]",
      borderTone: "border-[var(--border-default)] hover:border-[var(--border-accent)]"
    },
    {
      label: "Kota / Kabupaten",
      value: stats.total_cities.toLocaleString("id-ID"),
      icon: <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#F59E0B] shrink-0" />,
      valueColor: "text-[#F3F6FB]",
      borderTone: "border-[var(--border-default)] hover:border-[var(--border-strong)]"
    },
    {
      label: "Instansi / Sumber",
      value: stats.total_sources.toLocaleString("id-ID"),
      icon: <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#60A5FA] shrink-0" />,
      valueColor: "text-[#E2E8F0]",
      borderTone: "border-[var(--border-default)] hover:border-[var(--border-strong)]"
    }
  ];

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-transparent text-[#F3F6FB] flex flex-col">
      {/* Breathing Navbar */}
      <ResponsiveHeader
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        multiViewCount={multiViewCameras.length}
      />

      {/* National Telemetry KPI Strip (Programs-inspired staggered cards) */}
      <section
        aria-label="Statistik Pemantauan Nasional"
        className="relative z-[1] px-2.5 sm:px-4 lg:px-6 pt-3 pb-2"
      >
        <div className="max-w-[1600px] mx-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-2.5">
          {kpiCards.map((kpi, idx) => (
            <ProgramsCard
              key={kpi.label}
              index={idx}
              enableShimmer
              className={`p-3 sm:p-3.5 rounded-2xl ee-surface ${kpi.borderTone}`}
            >
              <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-[#98A4B8]">
                <span className="truncate">{kpi.label}</span>
                {kpi.icon}
              </div>
              <p
                className={`text-base sm:text-lg font-extrabold mt-1 font-mono tabular-nums truncate ${kpi.valueColor}`}
              >
                {kpi.value}
              </p>
            </ProgramsCard>
          ))}
        </div>
      </section>

      {/* Global Search & Animated Morph Dropdown Filter Bar (below Main Navbar) */}
      <section
        data-testid="filter-search-toolbar"
        className="relative z-[40] px-2.5 sm:px-4 lg:px-6 py-2"
      >
        <div className="max-w-[1600px] mx-auto rounded-2xl ee-shell-surface px-3 py-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 min-[1400px]:grid-cols-[minmax(195px,1.35fr)_minmax(160px,1.05fr)_minmax(186px,1.2fr)_minmax(186px,1.2fr)_minmax(130px,0.82fr)_minmax(144px,0.92fr)_auto] items-center gap-2">
          {/* Search Input */}
          <div className="relative sm:col-span-2 lg:col-span-6 min-[1400px]:col-span-1 min-w-0">
            <Search className="w-4 h-4 text-[#98A4B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-testid="global-camera-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama kamera, simpang jalan, kota, provinsi..."
              className="w-full max-w-full min-w-0 pl-9 pr-4 py-2 rounded-xl ee-input text-xs placeholder-[#657287]"
            />
          </div>

          {/* Province Morph Dropdown */}
          <div className="lg:col-span-3 min-[1400px]:col-span-1 min-w-0">
            <AnimatedDropdown
              value={selectedProvince}
              onChange={setSelectedProvince}
              options={provinceOptions}
              placeholder="Semua 38 Provinsi"
              ariaLabel="Filter Provinsi"
              testId="filter-province"
              searchable
              searchPlaceholder="Cari provinsi..."
              icon={<Globe2 className="w-3.5 h-3.5" />}
            />
          </div>

          {/* City Morph Dropdown */}
          <div className="lg:col-span-3 min-[1400px]:col-span-1 min-w-0">
            <AnimatedDropdown
              value={selectedCity}
              onChange={setSelectedCity}
              options={cityOptions}
              placeholder="Semua Kota / Kabupaten"
              ariaLabel="Filter Kota/Kabupaten"
              testId="filter-city"
              searchable
              searchPlaceholder="Cari kota/kabupaten..."
              icon={<MapPin className="w-3.5 h-3.5" />}
            />
          </div>

          {/* Source / Provider Morph Dropdown */}
          <div className="lg:col-span-4 min-[1400px]:col-span-1 min-w-0">
            <AnimatedDropdown
              value={selectedSource}
              onChange={setSelectedSource}
              options={sourceOptions}
              placeholder="Semua Sumber / Provider"
              ariaLabel="Filter Sumber / Provider"
              testId="filter-source"
              searchable
              searchPlaceholder="Cari Dishub / provider..."
              icon={<Shield className="w-3.5 h-3.5" />}
            />
          </div>

          {/* Status Morph Dropdown */}
          <div className="lg:col-span-3 min-[1400px]:col-span-1 min-w-0">
            <AnimatedDropdown
              value={selectedStatus}
              onChange={setSelectedStatus}
              options={statusOptions}
              placeholder="Status"
              ariaLabel="Filter Status Kamera"
              testId="filter-status"
            />
          </div>

          {/* Protocol Morph Dropdown */}
          <div className="lg:col-span-3 min-[1400px]:col-span-1 min-w-0">
            <AnimatedDropdown
              value={selectedProtocol}
              onChange={setSelectedProtocol}
              options={protocolOptions}
              placeholder="Protokol"
              ariaLabel="Filter Protokol Stream"
              testId="filter-protocol"
              icon={<Radio className="w-3.5 h-3.5" />}
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-2 min-[1400px]:col-span-1 flex items-center justify-between lg:justify-end gap-2">
            {(searchQuery ||
              selectedProvince ||
              selectedCity ||
              selectedSource ||
              selectedStatus ||
              selectedProtocol) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-2.5 py-1.5 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-default)] text-[11px] font-medium text-[#E2E8F0] transition-colors shrink-0"
              >
                Reset
              </button>
            )}

            <div className="text-[11px] text-[#98A4B8] font-mono tabular-nums truncate">
              <span className="text-[#F3F6FB] font-bold">
                {totalMatching.toLocaleString("id-ID")}
              </span>{" "}
              cam
            </div>
          </div>
        </div>
      </section>

      {/* Main Workspace Area */}
      <main className="relative z-[1] flex-1 max-w-[1600px] w-full mx-auto px-2.5 sm:px-4 lg:px-6 py-2.5 sm:py-3.5">
        {activeTab === "map" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4">
            {/* Left Interactive Map (8 cols on desktop, isolated at z-index: 0) */}
            <div className="lg:col-span-8 h-[460px] sm:h-[560px] lg:h-[620px] min-w-0">
              <InteractiveMap
                markers={markers}
                provinces={provinces}
                selectedProvince={selectedProvince}
                selectedCity={selectedCity}
                previewCamera={activePreviewCamera}
                loadingMarkers={loadingMarkers}
                onMarkerClick={handleMapMarkerClick}
                onClosePreview={handleCloseCameraInterface}
                onOpenFullDetail={handleOpenFullDetail}
                onAddToMultiView={handleAddToMultiView}
              />
            </div>

            {/* Right Live Camera Directory Sidebar (DAFTAR KAMERA — 4 cols on desktop) */}
            <div
              data-testid="daftar-kamera-sidebar"
              className="lg:col-span-4 h-[480px] sm:h-[560px] lg:h-[620px] rounded-2xl ee-surface flex flex-col overflow-hidden min-w-0"
            >
              <div className="px-3.5 py-2.5 bg-[#0C1018] border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Filter className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#F3F6FB] truncate">
                    Daftar Kamera ({totalMatching.toLocaleString("id-ID")})
                  </h2>
                </div>
                <span className="text-[11px] text-[#98A4B8] font-mono tabular-nums shrink-0">
                  Hal {page}/{totalPages}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                {loadingCameras ? (
                  <div className="p-8 text-center text-xs text-[#98A4B8]">
                    Memuat daftar kamera...
                  </div>
                ) : cameras.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#657287]">
                    Tidak ada kamera yang sesuai filter.
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
                        onClick={() => handleDirectoryCameraClick(cam.id, cam)}
                        className="text-left min-w-0 flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] rounded-md"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              cam.status === "ONLINE"
                                ? "bg-[#10B981]"
                                : "bg-[#EF4444]"
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
                          onClick={() => handleAddToMultiView(cam)}
                          title="Tambah ke Multi-View"
                          aria-label={`Tambah ${cam.name} ke Multi-View`}
                          className="p-1.5 rounded-lg bg-[#161C2B] hover:bg-[#3B82F6] border border-[var(--border-subtle)] text-[#98A4B8] hover:text-white transition-colors"
                        >
                          <PlusSquare className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pagination Footer */}
              <div className="p-2.5 bg-[#0C1018] border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => fetchFilteredCameras(page - 1)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-subtle)] disabled:opacity-40 text-xs text-[#E2E8F0] transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Sebelumnya</span>
                </button>
                <span className="text-[11px] text-[#98A4B8] font-mono tabular-nums truncate">
                  Hal {page}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => fetchFilteredCameras(page + 1)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-subtle)] disabled:opacity-40 text-xs text-[#E2E8F0] transition-colors"
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
            onSelectDetail={(cam) => handleDirectoryCameraClick(cam.id, cam)}
          />
        )}

        {activeTab === "directory" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
              {cameras.slice(0, 12).map((cam, idx) => (
                <ProgramsCard
                  key={cam.id}
                  index={idx}
                  enableHoverLift={false}
                  enableShimmer={false}
                  className="rounded-2xl ee-surface hover:border-[var(--border-strong)] overflow-hidden flex flex-col"
                >
                  <div className="h-[190px] sm:h-[200px]">
                    <CameraVideoPlayer camera={cam} autoPlay={false} compact />
                  </div>
                  <div className="p-3 flex items-center justify-between gap-2 bg-[#0C1018]">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#F3F6FB] truncate">
                        {cam.name}
                      </p>
                      <p className="text-[11px] text-[#98A4B8] truncate">
                        {cam.city_name}, {cam.province_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <FavoritesButton
                        cameraId={cam.id}
                        cameraName={cam.name}
                        size="sm"
                      />
                      <button
                        type="button"
                        onClick={() => handleDirectoryCameraClick(cam.id, cam)}
                        className="px-2 py-1 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-subtle)] text-[11px] text-[#E2E8F0] transition-colors"
                      >
                        Detail
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddToMultiView(cam)}
                        className="px-2 py-1 rounded-lg bg-[#3B82F6] hover:bg-[#60A5FA] text-[11px] font-semibold text-white transition-colors"
                      >
                        +Multi
                      </button>
                    </div>
                  </div>
                </ProgramsCard>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl ee-surface">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => fetchFilteredCameras(page - 1)}
                className="px-3 py-1.5 rounded-xl bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-default)] disabled:opacity-40 text-xs font-medium text-[#E2E8F0] transition-colors"
              >
                ← Sebelumnya
              </button>
              <span className="text-xs text-[#98A4B8] font-mono tabular-nums text-center">
                Halaman {page} / {totalPages} (
                {totalMatching.toLocaleString("id-ID")} Kamera)
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => fetchFilteredCameras(page + 1)}
                className="px-3 py-1.5 rounded-xl bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-default)] disabled:opacity-40 text-xs font-medium text-[#E2E8F0] transition-colors"
              >
                Berikutnya →
              </button>
            </div>
          </div>
        )}

        {activeTab === "provinces" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xs font-mono font-bold text-[#E2E8F0] uppercase tracking-[0.14em] mb-3">
                Direktori Hirarkis 38 Provinsi Indonesia
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {provinces.map((p, idx) => (
                  <ProgramsCard
                    key={p.id}
                    index={idx}
                    enableShimmer
                    className="p-3.5 rounded-2xl ee-surface hover:border-[var(--border-accent)] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-[#161C2B] border border-[var(--border-subtle)] text-[#98A4B8]">
                          {p.island}
                        </span>
                        <span className="text-xs font-mono text-[#10B981] font-bold tabular-nums">
                          {p.online_cameras.toLocaleString("id-ID")} Online
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-[#F3F6FB] mt-2 truncate">
                        {p.name}
                      </h3>
                      <p className="text-xs text-[#98A4B8] mt-0.5 font-mono">
                        {p.total_cameras.toLocaleString("id-ID")} kamera •{" "}
                        {p.city_count} Kota/Kab • {p.source_count} Sumber
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProvince(p.id);
                          setActiveTab("map");
                        }}
                        className="text-xs text-[#60A5FA] hover:text-white font-medium transition-colors"
                      >
                        Buka di Peta →
                      </button>
                      <Link
                        href={`/kamera/${p.slug}`}
                        className="text-xs text-[#98A4B8] hover:text-white transition-colors"
                      >
                        Halaman Provinsi
                      </Link>
                    </div>
                  </ProgramsCard>
                ))}
              </div>
            </div>

            {sources.length > 0 && (
              <div>
                <h2 className="text-xs font-mono font-bold text-[#E2E8F0] uppercase tracking-[0.14em] mb-3">
                  Sumber Instansi Resmi Terverifikasi ({sources.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {sources.slice(0, 36).map((s, idx) => (
                    <ProgramsCard
                      key={s.id}
                      index={idx}
                      className="p-3 rounded-xl ee-surface hover:border-[var(--border-strong)] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[#F3F6FB] truncate">
                          {s.name}
                        </p>
                        <p className="text-[11px] text-[#98A4B8] truncate">
                          {s.city_name}, {s.province_name} • {s.protocol}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSource(s.id);
                          setActiveTab("directory");
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#161C2B] hover:bg-[#3B82F6] border border-[var(--border-subtle)] text-xs font-mono text-[#E2E8F0] hover:text-white shrink-0 transition-colors tabular-nums"
                      >
                        {s.total_cameras} cam
                      </button>
                    </ProgramsCard>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "favorites" && (
          <FavoritesPage
            onSelectCamera={(cam) => handleDirectoryCameraClick(cam.id, cam)}
            onToggleMultiView={handleAddToMultiView}
            multiViewIds={multiViewIdSet}
          />
        )}
      </main>

      {/* Portaled Full Camera Detail Modal — Rendered ONLY when interaction.type === "camera-detail" */}
      <CameraDetailModal
        camera={activeDetailCamera}
        provinces={provinces}
        nearbyCameras={nearbyCameras}
        probeStatus={probeStatus}
        onClose={handleCloseCameraInterface}
        onVerifyStreamLive={handleVerifyStreamLive}
        onAddToMultiView={handleAddToMultiView}
        onSelectNearbyCamera={(nc) => handleDirectoryCameraClick(nc.id, nc)}
      />

      {/* Breathing Footer */}
      <AppFooter />
    </div>
  );
}
