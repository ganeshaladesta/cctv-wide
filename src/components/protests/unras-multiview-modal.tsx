"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ArrowLeft,
  Grid,
  Video,
  MapPin,
  Users,
  ShieldAlert,
  Calendar,
  Trash2,
  EyeOff,
  Maximize2,
  RefreshCw,
  AlertCircle
} from "lucide-react";
import { Camera } from "@/lib/types";
import { ProtestEvent, ProtestCameraLink } from "@/lib/types/protests";
import CCTVPlayer from "@/components/cctv-player";
import { FavoritesButton } from "@/components/motion-ui";
import { SPRINGS } from "@/lib/motion";

export type UnrasGridLayout = 1 | 2 | 4 | 6 | 9;

export interface UnrasMultiViewModalProps {
  isOpen: boolean;
  event: ProtestEvent;
  cameraLinks: ProtestCameraLink[];
  onClose: () => void;
  onUnlinkCamera?: (cameraId: string) => Promise<void>;
  onSelectSingleCamera?: (camera: Camera) => void;
}

const LAYOUT_OPTIONS: Array<{
  size: UnrasGridLayout;
  label: string;
  gridClass: string;
}> = [
  { size: 1, label: "1 Kamera", gridClass: "grid-cols-1" },
  { size: 2, label: "2 Kamera", gridClass: "grid-cols-1 md:grid-cols-2" },
  { size: 4, label: "4 Kamera (2×2)", gridClass: "grid-cols-1 md:grid-cols-2" },
  { size: 6, label: "6 Kamera (3×2)", gridClass: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" },
  { size: 9, label: "9 Kamera (3×3)", gridClass: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" }
];

export function UnrasMultiViewModal({
  isOpen,
  event,
  cameraLinks,
  onClose,
  onUnlinkCamera,
  onSelectSingleCamera
}: UnrasMultiViewModalProps) {
  const [mounted, setMounted] = useState(false);
  const [layoutSize, setLayoutSize] = useState<UnrasGridLayout>(4);
  const [hiddenCameraIds, setHiddenCameraIds] = useState<Set<string>>(new Set());
  const [resolvedCameras, setResolvedCameras] = useState<Camera[]>([]);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard navigation: Escape key closes ONLY this modal and stops propagation to parent
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [isOpen, onClose]);

  // Auto-tune optimal layout size based on linked camera count
  useEffect(() => {
    if (!isOpen) return;
    const count = cameraLinks.length;
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
    // Reset hidden state when reopening
    setHiddenCameraIds(new Set());
  }, [isOpen, cameraLinks.length]);

  // Resolve camera stream objects for all linked cameras
  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;
    async function resolveStreams() {
      setResolving(true);
      const cams: Camera[] = [];

      for (const link of cameraLinks) {
        if (link.camera && link.camera.stream_url) {
          cams.push(link.camera);
        } else {
          try {
            const res = await fetch(`/api/cameras/${encodeURIComponent(link.camera_id)}`);
            const json = await res.json();
            if (json.success && json.data) {
              cams.push(json.data);
            } else if (link.camera) {
              cams.push(link.camera);
            }
          } catch {
            if (link.camera) cams.push(link.camera);
          }
        }
      }

      if (!isCancelled) {
        setResolvedCameras(cams);
        setResolving(false);
      }
    }

    resolveStreams();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, cameraLinks]);

  if (!mounted || typeof document === "undefined" || !isOpen) {
    return null;
  }

  // Active cameras to display (filtering hidden slots)
  const displayedCameras = resolvedCameras.filter((c) => !hiddenCameraIds.has(c.id));
  const currentLayout = LAYOUT_OPTIONS.find((l) => l.size === layoutSize) || LAYOUT_OPTIONS[2];

  // Fill slots according to layout size
  const slots: Array<Camera | null> = Array.from({ length: layoutSize }).map((_, idx) => {
    return displayedCameras[idx] || null;
  });

  const handleHideCamera = (camId: string) => {
    setHiddenCameraIds((prev) => {
      const next = new Set(prev);
      next.add(camId);
      return next;
    });
  };

  const handleUnhideAll = () => {
    setHiddenCameraIds(new Set());
  };

  const handleConfirmUnlink = async (cam: Camera) => {
    if (!onUnlinkCamera) return;
    const confirmMessage = `Cabut tautan kamera "${cam.name}" dari perimeter aksi unjuk rasa ini secara permanen?`;
    if (window.confirm(confirmMessage)) {
      await onUnlinkCamera(cam.id);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="unras-multiview-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        style={{ zIndex: 100010 }}
        onClick={onClose}
        className="fixed inset-0 z-[100010] bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 pointer-events-auto"
      >
        <motion.div
          key="unras-multiview-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`Dedicated Multi-View Monitoring - ${event.kode_unras}`}
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.12 } }}
          transition={SPRINGS.modal}
          style={{ zIndex: 100015 }}
          onClick={(e) => e.stopPropagation()}
          className="relative z-[100015] w-[98vw] max-w-7xl h-[94dvh] rounded-2xl bg-[#090C12] border border-blue-500/30 shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Dedicated Header Bar */}
          <div className="px-3.5 sm:px-5 py-3 bg-gradient-to-r from-[#0C1018] via-[#101726] to-[#0C1018] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Left: Event Details */}
            <div className="min-w-0 flex-1 basis-64">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30 uppercase">
                  {event.kode_unras}
                </span>
                <span className="text-xs text-[#98A4B8] font-mono">
                  {event.tanggal}
                </span>
                <span className="text-xs text-[#64748B]">•</span>
                <span className="text-xs text-amber-300 font-semibold">
                  Estimasi Massa: ±{event.estimasi_massa_source ? event.estimasi_massa_source.toLocaleString("id-ID") : "-"} orang
                </span>
              </div>

              <h2 className="text-sm sm:text-base font-bold text-white truncate mt-1">
                {event.isu_tuntutan || event.lokasi}
              </h2>
              <p className="text-xs text-[#98A4B8] truncate mt-0.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span>Perimeter: <strong className="text-white">{event.lokasi}</strong> • {event.kota_kabupaten}, {event.provinsi}</span>
              </p>
            </div>

            {/* Center / Right: Layout Controls & Actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Layout Switcher */}
              <div className="flex items-center gap-1 bg-[#06090E] p-1 rounded-xl border border-[var(--border-subtle)]">
                {LAYOUT_OPTIONS.map((opt) => (
                  <button
                    key={opt.size}
                    type="button"
                    onClick={() => setLayoutSize(opt.size)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      layoutSize === opt.size
                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/30"
                        : "text-[#98A4B8] hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {opt.size} Cam
                  </button>
                ))}
              </div>

              {hiddenCameraIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleUnhideAll}
                  className="px-2.5 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900 border border-purple-500/30 text-purple-200 text-xs font-medium transition-colors"
                >
                  Tampilkan Semua ({hiddenCameraIds.size} tersembunyi)
                </button>
              )}

              {/* Close / Return Button */}
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/30"
                title="Kembali ke Pemilihan Kamera (Esc)"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Kembali ke Pemilihan</span>
                <span className="hidden sm:inline text-[10px] bg-blue-700/70 px-1 py-0.5 rounded font-mono">
                  Esc
                </span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-[#98A4B8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Tutup Multi-View"
                title="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body: Live Streaming Multi-Camera Grid */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-[#05070B]">
            {resolving && resolvedCameras.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-[#98A4B8]">
                <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
                <span>Menghubungkan stream live kamera perimeter unjuk rasa...</span>
              </div>
            ) : displayedCameras.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
                <AlertCircle className="w-10 h-10 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Semua slot kamera saat ini disembunyikan</h3>
                <p className="text-xs text-[#98A4B8] max-w-md">
                  Kamera tetap tersimpan dan tertaut ke aksi unras ini di database. Klik tombol di bawah untuk menampilkan kembali.
                </p>
                <button
                  type="button"
                  onClick={handleUnhideAll}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  Tampilkan Semua Kamera
                </button>
              </div>
            ) : (
              <div className={`grid gap-3 h-full ${currentLayout.gridClass}`}>
                {slots.map((cam, idx) => (
                  <div
                    key={cam ? `unras-slot-${cam.id}-${idx}` : `unras-empty-slot-${idx}`}
                    className={`relative rounded-xl overflow-hidden bg-[#0C1018] border border-[var(--border-default)] flex flex-col min-w-0 shadow-lg ${
                      layoutSize === 1
                        ? "min-h-[450px] sm:min-h-[620px]"
                        : layoutSize === 2
                        ? "min-h-[300px] sm:min-h-[420px]"
                        : "min-h-[240px] sm:min-h-[310px]"
                    }`}
                  >
                    {cam ? (
                      <>
                        {/* Slot Header */}
                        <div className="px-2.5 py-1.5 bg-[#090C12] border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 shrink-0 font-bold">
                              Slot #{idx + 1}
                            </span>
                            <span className="text-xs font-semibold text-[#E2E8F0] truncate" title={cam.name}>
                              {cam.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                cam.status === "ONLINE" || (cam as any).status === 1
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : "bg-red-500/20 text-red-400 border border-red-500/30"
                              }`}
                            >
                              {cam.status || "ONLINE"}
                            </span>

                            {onSelectSingleCamera && (
                              <button
                                type="button"
                                onClick={() => onSelectSingleCamera(cam)}
                                className="p-1 rounded-md text-[#98A4B8] hover:text-white hover:bg-white/10 transition-colors"
                                title="Fokus Single Player"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {onUnlinkCamera && (
                              <button
                                type="button"
                                onClick={() => handleConfirmUnlink(cam)}
                                className="p-1 rounded-md text-amber-400 hover:bg-amber-500/10 transition-colors"
                                title="Cabut tautan kamera dari unras ini permanen"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleHideCamera(cam.id)}
                              className="p-1 rounded-md text-[#98A4B8] hover:text-red-400 hover:bg-white/10 transition-colors"
                              title="Sembunyikan dari layar (kamera tetap tertaut di database)"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Live Player Container */}
                        <div className="flex-1 min-h-0 bg-black relative">
                          <CCTVPlayer camera={cam} compact autoPlay />
                        </div>
                      </>
                    ) : (
                      /* Empty Slot placeholder */
                      <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-[#64748B] bg-[#070A0F]">
                        <Video className="w-6 h-6 mb-1 opacity-40 text-blue-400" />
                        <span className="text-xs font-semibold">Slot #{idx + 1} Kosong</span>
                        <span className="text-[11px] text-[#475569] mt-0.5">
                          Tautkan lebih banyak kamera di tab CCTV untuk mengisi slot ini
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

