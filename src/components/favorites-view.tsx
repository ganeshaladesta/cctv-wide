"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart,
  Search,
  MapPin,
  Trash2,
  ExternalLink,
  Grid,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Play,
  Building2,
  Activity
} from "lucide-react";
import { Camera } from "@/lib/types";
import { useFavorites, usePrefersReducedMotion } from "@/lib/hooks";
import { AnimatedDropdown, FavoritesButton } from "@/components/motion-ui";
import { CCTVPlayer } from "@/components/cctv-player";
import { EASE_STANDARD, SPRINGS, getProgramsEntranceDelay } from "@/lib/motion";

export interface FavoritesPageProps {
  onSelectCamera?: (cam: Camera) => void;
  onToggleMultiView?: (cam: Camera) => void;
  multiViewIds?: Set<string>;
}

const MULTIVIEW_STORAGE_KEY = "scc-eagle-eyes-multiview-v2";

export function FavoritesPage({
  onSelectCamera,
  onToggleMultiView,
  multiViewIds
}: FavoritesPageProps) {
  const { favorites, hydrated, removeFavorite } = useFavorites();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [provinceFilter, setProvinceFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeModalCamera, setActiveModalCamera] = useState<Camera | null>(
    null
  );
  const [localMultiViewIds, setLocalMultiViewIds] = useState<Set<string>>(
    new Set()
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!activeModalCamera || typeof document === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setActiveModalCamera(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeModalCamera]);

  useEffect(() => {
    if (multiViewIds) return;
    try {
      const saved = window.localStorage.getItem(MULTIVIEW_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setLocalMultiViewIds(new Set(parsed));
        }
      }
    } catch {}
  }, [multiViewIds]);

  const favoriteIdsKey = useMemo(
    () => favorites.map((f) => f.cameraId).join(","),
    [favorites]
  );

  useEffect(() => {
    if (!hydrated) return;
    if (!favoriteIdsKey) {
      setCameras([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(
      `/api/cameras?ids=${encodeURIComponent(favoriteIdsKey)}&limit=all`
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const list: Camera[] = Array.isArray(json.data) ? json.data : [];
        setCameras(list);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Gagal memuat daftar kamera favorit."
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [favoriteIdsKey, hydrated]);

  // Dynamic filter options derived from favorited cameras
  const provinceOptions = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const c of cameras) {
      const prev = map.get(c.province_id);
      if (prev) prev.count++;
      else map.set(c.province_id, { label: c.province_name, count: 1 });
    }
    return [
      { value: "", label: "Semua Provinsi", badge: cameras.length },
      ...Array.from(map.entries()).map(([id, d]) => ({
        value: id,
        label: d.label,
        badge: d.count
      }))
    ];
  }, [cameras]);

  const cityOptions = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const c of cameras) {
      if (provinceFilter && c.province_id !== provinceFilter) continue;
      const prev = map.get(c.city_id);
      if (prev) prev.count++;
      else map.set(c.city_id, { label: c.city_name, count: 1 });
    }
    return [
      { value: "", label: "Semua Kota / Kabupaten" },
      ...Array.from(map.entries()).map(([id, d]) => ({
        value: id,
        label: d.label,
        badge: d.count
      }))
    ];
  }, [cameras, provinceFilter]);

  const statusOptions = useMemo(
    () => [
      { value: "", label: "Semua Status" },
      { value: "ONLINE", label: "ONLINE" },
      { value: "OFFLINE", label: "OFFLINE" }
    ],
    []
  );

  const filteredCameras = useMemo(() => {
    return cameras.filter((cam) => {
      if (provinceFilter && cam.province_id !== provinceFilter) return false;
      if (cityFilter && cam.city_id !== cityFilter) return false;
      if (statusFilter && cam.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          cam.name.toLowerCase().includes(q) ||
          cam.city_name.toLowerCase().includes(q) ||
          cam.province_name.toLowerCase().includes(q) ||
          cam.source_name.toLowerCase().includes(q) ||
          cam.location.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [cameras, provinceFilter, cityFilter, statusFilter, searchQuery]);

  const effectiveMultiViewIds = multiViewIds || localMultiViewIds;

  const handleToggleMultiView = (cam: Camera) => {
    if (onToggleMultiView) {
      onToggleMultiView(cam);
      return;
    }
    setLocalMultiViewIds((prev) => {
      const next = new Set(prev);
      if (next.has(cam.id)) next.delete(cam.id);
      else if (next.size < 16) next.add(cam.id);
      try {
        window.localStorage.setItem(
          MULTIVIEW_STORAGE_KEY,
          JSON.stringify(Array.from(next))
        );
      } catch {}
      return next;
    });
  };

  const handleOpenDetails = (cam: Camera) => {
    if (onSelectCamera) {
      onSelectCamera(cam);
    } else {
      setActiveModalCamera(cam);
    }
  };

  const addedAtById = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of favorites) {
      map.set(f.cameraId, f.addedAt);
    }
    return map;
  }, [favorites]);

  const standaloneModal = (
    <AnimatePresence>
      {activeModalCamera && (
        <motion.div
          key="favorites-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ zIndex: 900 }}
          className="fixed inset-0 z-[900] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
          onClick={() => setActiveModalCamera(null)}
        >
          <motion.div
            key={`favorites-modal-${activeModalCamera.id}`}
            role="dialog"
            aria-modal="true"
            aria-label={activeModalCamera.name}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={SPRINGS.modal}
            style={{ zIndex: 1000 }}
            className="relative z-[1000] w-full max-w-3xl bg-[#090C12] border border-[var(--border-default)] rounded-2xl overflow-hidden shadow-[var(--shadow-elevated)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-[240px] sm:h-[400px]">
              <CCTVPlayer
                camera={activeModalCamera}
                onClose={() => setActiveModalCamera(null)}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div
      data-testid="favorites-page-container"
      className="space-y-4 ee-surface rounded-2xl p-4 sm:p-5"
    >
      {/* Header & Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#98A4B8]">
            <Heart className="w-3.5 h-3.5 fill-[#60A5FA] text-[#60A5FA]" />
            <span>Personal Surveillance Watchlist</span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-[#F3F6FB]">
            Favorite CCTV ({favorites.length})
          </h2>
          <p className="text-xs text-[#98A4B8]">
            Akses cepat ke kamera CCTV yang telah Anda tandai sebagai favorit di
            seluruh Indonesia.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-[#090C12] border border-[var(--border-default)] text-xs font-mono tabular-nums text-[#98A4B8]">
            Menampilkan:{" "}
            <strong className="text-[#F3F6FB]">{filteredCameras.length}</strong> /{" "}
            {favorites.length} kamera
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      {favorites.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search within favorites */}
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[#98A4B8] absolute left-3 pointer-events-none" />
            <input
              type="text"
              data-testid="favorites-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari di favorit (nama, kota, lokasi)..."
              className="w-full ee-input rounded-xl pl-9 pr-3 py-2 text-xs placeholder:text-[#657287]"
            />
          </div>

          {/* Province Dropdown */}
          <AnimatedDropdown
            value={provinceFilter}
            onChange={(val) => {
              setProvinceFilter(val);
              setCityFilter("");
            }}
            options={provinceOptions}
            placeholder="Semua Provinsi"
            ariaLabel="Filter Provinsi Favorit"
            testId="favorites-province-filter"
            searchable
            icon={<Building2 className="w-3.5 h-3.5" />}
          />

          {/* City Dropdown */}
          <AnimatedDropdown
            value={cityFilter}
            onChange={setCityFilter}
            options={cityOptions}
            placeholder="Semua Kota / Kabupaten"
            ariaLabel="Filter Kota Favorit"
            testId="favorites-city-filter"
            searchable
            icon={<MapPin className="w-3.5 h-3.5" />}
          />

          {/* Status Dropdown */}
          <AnimatedDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            placeholder="Semua Status"
            ariaLabel="Filter Status Favorit"
            testId="favorites-status-filter"
            icon={<Activity className="w-3.5 h-3.5" />}
          />
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div
          data-testid="favorites-loading-state"
          className="py-14 flex flex-col items-center justify-center gap-3 text-center"
        >
          <RefreshCw className="w-6 h-6 text-[#60A5FA] animate-spin" />
          <p className="text-xs text-[#98A4B8]">
            Memuat data kamera favorit Anda...
          </p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div
          data-testid="favorites-error-state"
          className="p-6 rounded-xl bg-red-950/30 border border-red-500/30 text-center space-y-2"
        >
          <p className="text-xs text-red-300 font-semibold">{error}</p>
        </div>
      )}

      {/* Empty State when no favorites added */}
      {!loading && !error && favorites.length === 0 && (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE_STANDARD }}
          data-testid="favorites-empty-state"
          className="py-14 px-4 rounded-2xl bg-[#0C1018]/80 border border-[var(--border-default)] flex flex-col items-center justify-center text-center gap-3"
        >
          <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-[var(--border-subtle)] flex items-center justify-center">
            <Heart className="w-6 h-6 text-[#98A4B8]" />
          </div>
          <p className="text-sm font-semibold text-[#F3F6FB] max-w-md">
            Belum ada CCTV favorit. Tambahkan kamera favorit untuk mengaksesnya
            lebih cepat.
          </p>
          <p className="text-xs text-[#98A4B8] max-w-md">
            Klik ikon hati pada kartu kamera, peta interaktif, pemutar CCTV,
            atau halaman detail kamera untuk menyimpan kamera ke daftar ini.
          </p>
        </motion.div>
      )}

      {/* Filtered Empty State */}
      {!loading &&
        !error &&
        favorites.length > 0 &&
        filteredCameras.length === 0 && (
          <div className="py-10 px-4 rounded-xl bg-[#0C1018]/75 border border-[var(--border-default)] text-center space-y-2">
            <p className="text-xs text-[#E2E8F0] font-medium">
              Tidak ada kamera favorit yang cocok dengan filter pencarian.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setProvinceFilter("");
                setCityFilter("");
                setStatusFilter("");
              }}
              className="text-xs text-[#60A5FA] hover:text-white underline"
            >
              Reset Filter Favorit
            </button>
          </div>
        )}

      {/* Favorites Grid (Programs-inspired entrance & controlled hover lift) */}
      {!loading && !error && filteredCameras.length > 0 && (
        <div
          data-testid="favorites-camera-grid"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5"
        >
          <AnimatePresence mode="popLayout">
            {filteredCameras.map((cam, idx) => {
              const inMultiView = effectiveMultiViewIds.has(cam.id);
              const addedAt = addedAtById.get(cam.id);

              return (
                <motion.div
                  key={cam.id}
                  layout
                  initial={
                    prefersReducedMotion
                      ? false
                      : { opacity: 0, y: 10, scale: 0.98 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  whileHover={
                    prefersReducedMotion
                      ? undefined
                      : {
                          y: -3,
                          transition: { duration: 0.2, ease: EASE_STANDARD }
                        }
                  }
                  transition={{
                    duration: 0.36,
                    delay: getProgramsEntranceDelay(idx),
                    ease: EASE_STANDARD
                  }}
                  data-testid={`favorite-camera-card-${cam.id}`}
                  className="bg-[#0C1018] border border-[var(--border-default)] hover:border-[var(--border-strong)] rounded-2xl p-4 flex flex-col justify-between gap-3 transition-colors shadow-[var(--shadow-card)]"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#60A5FA] block truncate">
                          {cam.province_name} • {cam.city_name}
                        </span>
                        <h3 className="text-sm font-bold text-[#F3F6FB] truncate">
                          {cam.name}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            cam.status === "ONLINE"
                              ? "bg-emerald-500/15 text-[#10B981] border border-emerald-500/30"
                              : "bg-red-500/15 text-[#EF4444] border border-red-500/30"
                          }`}
                        >
                          {cam.status === "ONLINE" ? (
                            <CheckCircle2 className="w-2.5 h-2.5" />
                          ) : (
                            <XCircle className="w-2.5 h-2.5" />
                          )}
                          {cam.status}
                        </span>
                        <FavoritesButton
                          cameraId={cam.id}
                          cameraName={cam.name}
                          size="sm"
                        />
                      </div>
                    </div>

                    <p className="text-xs text-[#98A4B8] flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-[#657287] shrink-0" />
                      <span className="truncate">{cam.location}</span>
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#98A4B8] pt-1">
                      <span className="font-mono bg-[#111622] px-2 py-0.5 rounded-md border border-[var(--border-subtle)] text-[#E2E8F0]">
                        {cam.protocol} • {cam.source_name}
                      </span>
                      {addedAt && (
                        <span className="text-[10px] font-mono text-[#657287]">
                          Ditambahkan:{" "}
                          {new Date(addedAt).toLocaleDateString("id-ID")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="pt-2.5 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenDetails(cam)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-[#60A5FA] text-white text-xs font-semibold transition-colors"
                      >
                        <Play className="w-3 h-3" />
                        <span>Buka Stream</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleMultiView(cam)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          inMultiView
                            ? "bg-emerald-500/20 text-[#10B981] border-emerald-500/40"
                            : "bg-[#111622] hover:bg-[#161C2B] text-[#E2E8F0] border-[var(--border-default)]"
                        }`}
                      >
                        <Grid className="w-3 h-3" />
                        <span>{inMultiView ? "Di Multi-View" : "+ Multi-View"}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/kamera/${cam.province_id.replace("prov-", "")}/${encodeURIComponent(cam.id)}`}
                        className="p-1.5 rounded-lg bg-[#111622] hover:bg-[#161C2B] border border-[var(--border-default)] text-[#E2E8F0] hover:text-white transition-colors"
                        title="Halaman Detail Kamera"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeFavorite(cam.id)}
                        data-testid={`remove-favorite-${cam.id}`}
                        className="p-1.5 rounded-lg bg-[#111622] hover:bg-red-950/60 border border-[var(--border-default)] hover:border-red-500/40 text-[#98A4B8] hover:text-red-300 transition-colors"
                        title="Hapus dari Favorit"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Standalone Portaled Player Modal when used on /favorites route */}
      {mounted && typeof document !== "undefined"
        ? createPortal(standaloneModal, document.body)
        : standaloneModal}
    </div>
  );
}
