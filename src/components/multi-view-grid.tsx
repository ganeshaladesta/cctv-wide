"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Grid,
  Plus,
  Trash2,
  Share2,
  Sparkles,
  Search,
  Tv,
  Check
} from "lucide-react";
import { Camera } from "@/lib/types";
import { ProtestEvent } from "@/lib/types/protests";
import CCTVPlayer from "@/components/cctv-player";
import { FavoritesButton, ProgramsCard } from "@/components/motion-ui";
import { SPRINGS } from "@/lib/motion";

export type GridLayoutSize = 1 | 2 | 4 | 6 | 9;

export interface UnrasMonitoringContext {
  event: ProtestEvent;
  onReturnToDetail: () => void;
  onExitUnrasMode: () => void;
  onUnlinkCamera?: (cameraId: string) => Promise<void>;
}

export interface MultiViewGridProps {
  cameras: Camera[];
  onSetCameras: (cams: Camera[]) => void;
  onSelectDetail: (cam: Camera) => void;
  unrasContext?: UnrasMonitoringContext | null;
}

const LAYOUT_OPTIONS: Array<{
  size: GridLayoutSize;
  label: string;
  gridClass: string;
}> = [
  { size: 1, label: "1 Kamera", gridClass: "grid-cols-1" },
  { size: 2, label: "2 Kamera", gridClass: "grid-cols-1 md:grid-cols-2" },
  { size: 4, label: "4 Kamera (2×2)", gridClass: "grid-cols-1 md:grid-cols-2" },
  {
    size: 6,
    label: "6 Kamera (3×2)",
    gridClass: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
  },
  {
    size: 9,
    label: "9 Kamera (3×3)",
    gridClass: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
  }
];

const REGIONAL_PRESETS: Array<{ label: string; query: string }> = [
  { label: "Kota Bandung (PELINDUNG)", query: "Bandung" },
  { label: "DI Yogyakarta & Malioboro", query: "Yogyakarta" },
  { label: "DKI Jakarta & BaliTower", query: "Jakarta" },
  { label: "Tol Jasa Marga Nasional", query: "Tol" },
  { label: "Kota Medan ATCS", query: "Medan" },
  { label: "Kota Denpasar Bali", query: "Denpasar" }
];

export default function MultiViewGrid({
  cameras,
  onSetCameras,
  onSelectDetail,
  unrasContext
}: MultiViewGridProps) {
  const [layoutSize, setLayoutSize] = useState<GridLayoutSize>(4);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Camera[]>([]);
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // In UNRAS monitoring mode, auto-tune optimal layout size according to camera count
  useEffect(() => {
    if (unrasContext) {
      const count = cameras.length;
      if (count <= 1) {
        setLayoutSize(1);
      } else if (count === 2) {
        setLayoutSize(2);
      } else if (count <= 4) {
        setLayoutSize(4);
      } else if (count <= 6) {
        setLayoutSize(6);
      } else {
        setLayoutSize(9);
      }
    }
  }, [unrasContext, cameras.length]);

  useEffect(() => {
    if (pickerSlot === null || typeof document === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPickerSlot(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerSlot]);

  const currentLayout =
    LAYOUT_OPTIONS.find((l) => l.size === layoutSize) || LAYOUT_OPTIONS[2];

  const handleSearchCameras = async (q: string) => {
    setSearchTerm(q);
    setSearching(true);
    try {
      const res = await fetch(
        `/api/cameras?q=${encodeURIComponent(q)}&status=ONLINE&limit=24`
      );
      const json = await res.json();
      setSearchResults(json.data || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const openPickerForSlot = (slotIdx: number) => {
    setPickerSlot(slotIdx);
    handleSearchCameras(searchTerm || "Bandung");
  };

  const assignCameraToSlot = (cam: Camera) => {
    if (pickerSlot === null) return;
    const next = [...cameras];
    if (pickerSlot < next.length) {
      next[pickerSlot] = cam;
    } else {
      next.push(cam);
    }
    onSetCameras(next.slice(0, 9));
    setPickerSlot(null);
  };

  const removeCameraAt = (idx: number) => {
    const next = cameras.filter((_, i) => i !== idx);
    onSetCameras(next);
  };

  const loadPreset = async (query: string) => {
    try {
      const res = await fetch(
        `/api/cameras?q=${encodeURIComponent(query)}&status=ONLINE&limit=${layoutSize}`
      );
      const json = await res.json();
      if (Array.isArray(json.data) && json.data.length > 0) {
        onSetCameras(json.data.slice(0, layoutSize));
      }
    } catch {}
  };

  const handleShareMultiView = () => {
    if (typeof window === "undefined") return;
    const ids = cameras
      .slice(0, layoutSize)
      .map((c) => c.id)
      .join(",");
    const url = `${window.location.origin}/?view=multiview&multi=${encodeURIComponent(
      ids
    )}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const slots = Array.from({ length: layoutSize }, (_, idx) => cameras[idx] || null);

  const pickerModalContent = (
    <AnimatePresence>
      {pickerSlot !== null && (
        <motion.div
          key="multiview-slot-picker-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          style={{ zIndex: 900 }}
          onClick={() => setPickerSlot(null)}
          className="fixed inset-0 z-[900] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
        >
          <motion.div
            key="multiview-slot-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Pilih Kamera untuk Slot #${pickerSlot + 1}`}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={SPRINGS.modal}
            style={{ zIndex: 1000 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-[1000] w-full max-w-2xl rounded-2xl bg-[#090C12] border border-[var(--border-default)] shadow-[var(--shadow-elevated)] overflow-hidden flex flex-col max-h-[84dvh]"
          >
            <div className="px-4 py-3 bg-[#0C1018] border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Tv className="w-4 h-4 text-[#60A5FA] shrink-0" />
                <h3 className="text-sm font-bold text-[#F3F6FB] truncate">
                  Pilih Kamera untuk Slot #{pickerSlot + 1}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPickerSlot(null)}
                className="text-xs text-[#E2E8F0] hover:text-white px-2.5 py-1 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-subtle)] transition-colors"
              >
                Tutup
              </button>
            </div>

            <div className="p-3 border-b border-[var(--border-subtle)]">
              <div className="relative">
                <Search className="w-4 h-4 text-[#98A4B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => handleSearchCameras(e.target.value)}
                  placeholder="Cari nama kamera, jalan, kota, atau provinsi (contoh: Malioboro, Pasteur, Medan, Tol)..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl ee-input text-xs placeholder-[#657287]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {searching ? (
                <div className="col-span-full py-10 text-center text-xs text-[#98A4B8]">
                  Mencari kamera online...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="col-span-full py-10 text-center text-xs text-[#657287]">
                  Tidak ada kamera yang cocok dengan pencarian.
                </div>
              ) : (
                searchResults.map((cam) => (
                  <div
                    key={cam.id}
                    onClick={() => assignCameraToSlot(cam)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        assignCameraToSlot(cam);
                      }
                    }}
                    className="cursor-pointer text-left p-2.5 rounded-xl bg-[#111622] hover:bg-[#161C2B] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-colors flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#F3F6FB] truncate">
                        {cam.name}
                      </p>
                      <p className="text-[11px] text-[#98A4B8] truncate mt-0.5">
                        {cam.city_name}, {cam.province_name}
                      </p>
                      <p className="text-[10px] text-[#60A5FA] truncate mt-0.5 font-mono">
                        {cam.source_name} • {cam.protocol}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <FavoritesButton
                        cameraId={cam.id}
                        cameraName={cam.name}
                        size="sm"
                      />
                      <span className="px-2 py-0.5 rounded-md bg-[#3B82F6]/20 border border-[#3B82F6]/40 text-[#E2E8F0] text-[10px] font-semibold">
                        Pilih
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="space-y-4">
      {/* UNRAS Dedicated Workspace Banner */}
      {unrasContext && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/60 via-[#111622] to-indigo-950/50 border border-blue-500/40 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 tracking-wider uppercase animate-pulse">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                WORKSPACE MONITORING UNJUK RASA
              </span>
              <span className="text-xs font-mono font-bold text-white px-2 py-0.5 rounded bg-white/10 border border-white/15">
                {unrasContext.event.kode_unras || unrasContext.event.id_kejadian}
              </span>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                {unrasContext.event.status}
              </span>
              <span className="text-[11px] text-[#98A4B8]">
                Estimasi Massa: <strong className="text-white">±{unrasContext.event.estimasi_massa_source || "-"}</strong> orang
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-white truncate">
              {unrasContext.event.isu_tuntutan || unrasContext.event.lokasi || "Pantauan Aksi Unjuk Rasa"}
            </h2>
            <p className="text-xs text-[#98A4B8] truncate mt-0.5">
              Perimeter: <strong className="text-white">{unrasContext.event.lokasi}</strong> • {unrasContext.event.kota_kabupaten}, {unrasContext.event.provinsi}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={unrasContext.onReturnToDetail}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer"
            >
              <span>📋 Buka Detail Aksi</span>
            </button>
            <button
              type="button"
              onClick={unrasContext.onExitUnrasMode}
              className="px-3 py-1.5 rounded-xl bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-default)] text-xs font-medium text-[#98A4B8] hover:text-white transition-colors cursor-pointer"
              title="Kembali ke Multi-View Global"
            >
              <span>✕ Keluar Mode UNRAS</span>
            </button>
          </div>
        </div>
      )}

      {/* Control Header */}
      <div className="p-3.5 sm:p-4 rounded-2xl ee-surface flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-[#3B82F6]/15 border border-[#3B82F6]/35 text-[#60A5FA] shrink-0">
            <Grid className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-[#F3F6FB]">
                {unrasContext ? "Multi-View Pantauan Perimeter Aksi" : "Multi-View Command Wall"}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-white/[0.04] text-[#E2E8F0] border border-[var(--border-subtle)] text-[10px] font-mono uppercase tracking-wider">
                {unrasContext ? "UNRAS SCOPED" : "REAL-TIME • MULTI-STREAM"}
              </span>
            </div>
            <p className="text-xs text-[#98A4B8]">
              {unrasContext
                ? `Monitoring terisolasi khusus aksi: ${unrasContext.event.lokasi} • ${cameras.length} kamera aktif`
                : "Pantau 1, 2, 4, 6, atau 9 kamera CCTV secara simultan dengan lazy-loading otomatis."}
            </p>
          </div>
        </div>

        {/* Layout Selector Buttons (1, 2, 4, 6, 9) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {LAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.size}
              type="button"
              onClick={() => setLayoutSize(opt.size)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                layoutSize === opt.size
                  ? "bg-[#3B82F6] border-[#3B82F6] text-white"
                  : "bg-[#0C1018] border-[var(--border-default)] text-[#98A4B8] hover:text-white hover:border-[var(--border-strong)]"
              }`}
            >
              {opt.label}
            </button>
          ))}

          <button
            type="button"
            onClick={handleShareMultiView}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#161C2B] hover:bg-[#1C2436] text-xs font-medium text-[#E2E8F0] border border-[var(--border-default)] transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#10B981]" />
                <span>Tersalin!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Bagikan Wall</span>
              </>
            )}
          </button>

          {cameras.length > 0 && (
            <button
              type="button"
              onClick={() => onSetCameras([])}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-800/50 text-xs transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Kosongkan</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Presets Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#98A4B8] shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-[#60A5FA]" />
          Preset Wilayah:
        </span>
        {REGIONAL_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => loadPreset(preset.query)}
            className="px-3 py-1 rounded-full bg-[#111622] hover:bg-[#161C2B] border border-[var(--border-default)] hover:border-[var(--border-accent)] text-xs text-[#E2E8F0] hover:text-white shrink-0 transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Responsive Camera Grid (ProgramsCard entrance without transforming active video players) */}
      <div className={`grid gap-3 ${currentLayout.gridClass}`}>
        {slots.map((cam, idx) => (
          <ProgramsCard
            key={cam ? `${cam.id}-${idx}` : `empty-slot-${idx}`}
            index={idx}
            enableHoverLift={!cam}
            enableShimmer={!cam}
            className={`relative rounded-2xl overflow-hidden ee-surface hover:border-[var(--border-strong)] flex flex-col min-w-0 ${
              layoutSize === 1
                ? "h-[360px] sm:h-[550px]"
                : layoutSize === 2
                ? "h-[280px] sm:h-[390px]"
                : "h-[260px] sm:h-[300px]"
            }`}
          >
            {cam ? (
              <>
                <div className="px-2.5 py-1.5 bg-[#090C12] border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#98A4B8] shrink-0">
                      Slot #{idx + 1}
                    </span>
                    <span className="text-[11px] font-semibold text-[#E2E8F0] truncate">
                      {cam.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <FavoritesButton
                      cameraId={cam.id}
                      cameraName={cam.name}
                      size="sm"
                    />
                    <button
                      type="button"
                      onClick={() => onSelectDetail(cam)}
                      className="px-2 py-0.5 rounded-md bg-[#111622] hover:bg-[#1C2436] text-[10px] font-medium text-[#E2E8F0] border border-[var(--border-default)] transition-colors"
                    >
                      Detail
                    </button>
                    <button
                      type="button"
                      onClick={() => openPickerForSlot(idx)}
                      className="px-2 py-0.5 rounded-md bg-[#111622] hover:bg-[#1C2436] text-[10px] font-medium text-[#60A5FA] border border-[var(--border-default)] transition-colors"
                    >
                      Ganti
                    </button>
                    {unrasContext?.onUnlinkCamera && (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Cabut tautan kamera "${cam.name}" dari aksi unras ini secara permanen?`
                            )
                          ) {
                            unrasContext.onUnlinkCamera?.(cam.id);
                          }
                        }}
                        title="Cabut tautan kamera dari aksi unras ini secara permanen"
                        className="px-1.5 py-0.5 rounded-md bg-amber-950/80 hover:bg-amber-900 text-[10px] font-medium text-amber-200 border border-amber-800/60 transition-colors cursor-pointer"
                      >
                        Cabut
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeCameraAt(idx)}
                      aria-label={`Hapus slot ${idx + 1}`}
                      title={
                        unrasContext
                          ? "Sembunyikan dari layar (kamera tetap tertaut ke aksi unras)"
                          : "Hapus dari slot layar"
                      }
                      className="px-1.5 py-0.5 rounded-md bg-red-950/80 hover:bg-red-900 text-[10px] font-medium text-red-200 border border-red-800/60 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <CCTVPlayer camera={cam} compact />
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => openPickerForSlot(idx)}
                className="w-full h-full flex flex-col items-center justify-center gap-2 text-[#98A4B8] hover:text-white hover:bg-[#161C2B]/70 transition-colors group"
              >
                <div className="w-11 h-11 rounded-full bg-[#161C2B] group-hover:bg-[#3B82F6]/20 border border-[var(--border-default)] group-hover:border-[#3B82F6]/50 flex items-center justify-center transition-colors">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold">
                  Tambah Kamera ke Slot #{idx + 1}
                </span>
                <span className="text-[11px] text-[#657287]">
                  Pilih dari 23.355 kamera di 38 Provinsi
                </span>
              </button>
            )}
          </ProgramsCard>
        ))}
      </div>

      {/* Portaled Camera Slot Picker Modal (z-index: 900/1000 above Navbar & Map) */}
      {mounted && typeof document !== "undefined"
        ? createPortal(pickerModalContent, document.body)
        : pickerModalContent}
    </div>
  );
}
