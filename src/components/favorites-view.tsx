"use client";

import React, { useState, useEffect, useMemo } from "react";
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
import { useFavorites } from "@/lib/hooks";
import { AnimatedDropdown, FavoritesButton } from "@/components/motion-ui";
import { CCTVPlayer } from "@/components/cctv-player";

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

  return (
    <div
      data-testid="favorites-page-container"
      className="space-y-4 bg-zinc-900/60 border border-[#252A35] rounded-2xl p-4 sm:p-5"
    >
      {/* Header & Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#252A35] pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-400">
            <Heart className="w-3.5 h-3.5 fill-white text-white" />
            <span>Personal Surveillance Watchlist</span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-white">
            Favorite CCTV ({favorites.length})
          </h2>
          <p className="text-xs text-zinc-400">
            Akses cepat ke kamera CCTV yang telah Anda tandai sebagai favorit di
            seluruh Indonesia.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-[#252A35] text-xs font-mono text-zinc-300">
            Menampilkan:{" "}
            <strong className="text-white">{filteredCameras.length}</strong> /{" "}
            {favorites.length} kamera
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      {favorites.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search within favorites */}
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              data-testid="favorites-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari di favorit (nama, kota, lokasi)..."
              className="w-full bg-zinc-950/90 border border-[#252A35] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/50"
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
          <RefreshCw className="w-6 h-6 text-white animate-spin" />
          <p className="text-xs text-zinc-400">
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
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          data-testid="favorites-empty-state"
          className="py-14 px-4 rounded-2xl bg-zinc-950/70 border border-[#252A35] flex flex-col items-center justify-center text-center gap-3"
        >
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-[#252A35] flex items-center justify-center">
            <Heart className="w-6 h-6 text-zinc-400" />
          </div>
          <p className="text-sm font-semibold text-white max-w-md">
            Belum ada CCTV favorit. Tambahkan kamera favorit untuk mengaksesnya
            lebih cepat.
          </p>
          <p className="text-xs text-zinc-400 max-w-md">
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
          <div className="py-10 px-4 rounded-xl bg-zinc-950/60 border border-[#252A35] text-center space-y-2">
            <p className="text-xs text-zinc-300 font-medium">
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
              className="text-xs text-sky-400 hover:text-sky-300 underline"
            >
              Reset Filter Favorit
            </button>
          </div>
        )}

      {/* Favorites Grid */}
      {!loading && !error && filteredCameras.length > 0 && (
        <div
          data-testid="favorites-camera-grid"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5"
        >
          <AnimatePresence mode="popLayout">
            {filteredCameras.map((cam) => {
              const inMultiView = effectiveMultiViewIds.has(cam.id);
              const addedAt = addedAtById.get(cam.id);

              return (
                <motion.div
                  key={cam.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ type: "spring", stiffness: 360, damping: 28 }}
                  data-testid={`favorite-camera-card-${cam.id}`}
                  className="bg-zinc-950/90 border border-[#252A35] hover:border-white/30 rounded-xl p-4 flex flex-col justify-between gap-3 transition"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 block">
                          {cam.province_name} • {cam.city_name}
                        </span>
                        <h3 className="text-sm font-bold text-white truncate">
                          {cam.name}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            cam.status === "ONLINE"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-red-500/15 text-red-400 border border-red-500/30"
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

                    <p className="text-xs text-zinc-400 flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="truncate">{cam.location}</span>
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 pt-1">
                      <span className="font-mono bg-zinc-900 px-2 py-0.5 rounded border border-[#252A35] text-zinc-300">
                        {cam.protocol} • {cam.source_name}
                      </span>
                      {addedAt && (
                        <span className="text-[10px] font-mono text-zinc-500">
                          Ditambahkan:{" "}
                          {new Date(addedAt).toLocaleDateString("id-ID")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="pt-2.5 border-t border-[#252A35] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenDetails(cam)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition"
                      >
                        <Play className="w-3 h-3" />
                        <span>Buka Stream</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleMultiView(cam)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                          inMultiView
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : "bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-[#252A35]"
                        }`}
                      >
                        <Grid className="w-3 h-3" />
                        <span>{inMultiView ? "Di Multi-View" : "+ Multi-View"}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/kamera/${cam.province_id.replace("prov-", "")}/${encodeURIComponent(cam.id)}`}
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-[#252A35] text-zinc-300 hover:text-white transition"
                        title="Halaman Detail Kamera"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeFavorite(cam.id)}
                        data-testid={`remove-favorite-${cam.id}`}
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/60 border border-[#252A35] hover:border-red-500/40 text-zinc-400 hover:text-red-300 transition"
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

      {/* Standalone Player Modal when used on /favorites route */}
      {activeModalCamera && (
        <div
          style={{ zIndex: 900 }}
          className="fixed inset-0 z-[900] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
          onClick={() => setActiveModalCamera(null)}
        >
          <div
            style={{ zIndex: 1000 }}
            className="relative z-[1000] w-full max-w-3xl bg-zinc-950 border border-[#252A35] rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-[260px] sm:h-[400px]">
              <CCTVPlayer
                camera={activeModalCamera}
                onClose={() => setActiveModalCamera(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

