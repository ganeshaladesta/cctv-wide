"use client";

import React, { useState } from "react";
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
import CCTVPlayer from "@/components/cctv-player";

export type GridLayoutSize = 1 | 2 | 4 | 6 | 9;

interface MultiViewGridProps {
  cameras: Camera[];
  onSetCameras: (cams: Camera[]) => void;
  onSelectDetail: (cam: Camera) => void;
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
  onSelectDetail
}: MultiViewGridProps) {
  const [layoutSize, setLayoutSize] = useState<GridLayoutSize>(4);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Camera[]>([]);
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="space-y-4">
      {/* Control Header */}
      <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Grid className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-zinc-100">
                Multi-View Command Wall
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold">
                100% GRATIS • TANPA BATAS WAKTU
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Pantau 1, 2, 4, 6, atau 9 kamera CCTV secara simultan dengan lazy-loading otomatis.
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
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                layoutSize === opt.size
                  ? "bg-emerald-600 border-emerald-500 text-white shadow"
                  : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700"
              }`}
            >
              {opt.label}
            </button>
          ))}

          <button
            type="button"
            onClick={handleShareMultiView}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700 transition"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
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
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-800/60 text-xs transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Kosongkan</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Presets Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          Preset Wilayah:
        </span>
        {REGIONAL_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => loadPreset(preset.query)}
            className="px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 hover:text-emerald-300 shrink-0 transition"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Responsive Camera Grid */}
      <div className={`grid gap-3 ${currentLayout.gridClass}`}>
        {slots.map((cam, idx) => (
          <div
            key={cam ? `${cam.id}-${idx}` : `empty-slot-${idx}`}
            className={`relative rounded-xl overflow-hidden bg-zinc-900/60 border border-zinc-800 flex flex-col ${
              layoutSize === 1
                ? "h-[540px]"
                : layoutSize === 2
                ? "h-[380px]"
                : "h-[270px]"
            }`}
          >
            {cam ? (
              <>
                <div className="absolute top-2 right-2 z-30 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectDetail(cam)}
                    className="px-2 py-0.5 rounded bg-zinc-900/90 hover:bg-zinc-800 text-[10px] font-medium text-zinc-200 border border-zinc-700"
                  >
                    Detail
                  </button>
                  <button
                    type="button"
                    onClick={() => openPickerForSlot(idx)}
                    className="px-2 py-0.5 rounded bg-zinc-900/90 hover:bg-zinc-800 text-[10px] font-medium text-emerald-300 border border-zinc-700"
                  >
                    Ganti
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCameraAt(idx)}
                    className="px-1.5 py-0.5 rounded bg-red-950/90 hover:bg-red-900 text-[10px] font-medium text-red-200 border border-red-800"
                  >
                    ✕
                  </button>
                </div>
                <CCTVPlayer camera={cam} />
              </>
            ) : (
              <button
                type="button"
                onClick={() => openPickerForSlot(idx)}
                className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-900/90 transition group"
              >
                <div className="w-11 h-11 rounded-full bg-zinc-800/80 group-hover:bg-emerald-500/20 border border-zinc-700 group-hover:border-emerald-500/40 flex items-center justify-center transition">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium">
                  Tambah Kamera ke Slot #{idx + 1}
                </span>
                <span className="text-[11px] text-zinc-500">
                  Pilih dari 23.355 kamera di 38 Provinsi
                </span>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Camera Slot Picker Modal */}
      {pickerSlot !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[82vh]">
            <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tv className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-zinc-100">
                  Pilih Kamera untuk Slot #{pickerSlot + 1}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPickerSlot(null)}
                className="text-xs text-zinc-400 hover:text-white px-2.5 py-1 rounded bg-zinc-800"
              >
                Tutup
              </button>
            </div>

            <div className="p-3 border-b border-zinc-800">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => handleSearchCameras(e.target.value)}
                  placeholder="Cari nama kamera, jalan, kota, atau provinsi (contoh: Malioboro, Pasteur, Medan, Tol)..."
                  className="w-full pl-9 pr-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {searching ? (
                <div className="col-span-full py-10 text-center text-xs text-zinc-400">
                  Mencari kamera online...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="col-span-full py-10 text-center text-xs text-zinc-500">
                  Tidak ada kamera yang cocok dengan pencarian.
                </div>
              ) : (
                searchResults.map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => assignCameraToSlot(cam)}
                    className="text-left p-2.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 transition flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-100 truncate">
                        {cam.name}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {cam.city_name}, {cam.province_name}
                      </p>
                      <p className="text-[10px] text-emerald-400 truncate mt-0.5">
                        {cam.source_name} • {cam.protocol}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold shrink-0">
                      Pilih
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

