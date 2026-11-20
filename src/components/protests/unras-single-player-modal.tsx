"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ArrowLeft,
  Video,
  MapPin,
  Building2,
  Radio,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ExternalLink
} from "lucide-react";
import { Camera } from "@/lib/types";
import { ProtestEvent } from "@/lib/types/protests";
import CCTVPlayer from "@/components/cctv-player";
import { FavoritesButton } from "@/components/motion-ui";
import { SPRINGS } from "@/lib/motion";

export interface UnrasSinglePlayerModalProps {
  camera: Camera | null;
  event?: ProtestEvent | null;
  onClose: () => void;
}

export function UnrasSinglePlayerModal({
  camera,
  event,
  onClose
}: UnrasSinglePlayerModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard navigation: Escape closes ONLY this player modal and stops propagation
  useEffect(() => {
    if (!camera) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [camera, onClose]);

  if (!mounted || typeof document === "undefined" || !camera) {
    return null;
  }

  const isOnline = camera.status === "ONLINE" || (camera as any).status === 1;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="unras-single-player-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        style={{ zIndex: 100010 }}
        onClick={onClose}
        className="fixed inset-0 z-[100010] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 pointer-events-auto"
      >
        <motion.div
          key={`unras-single-dialog-${camera.id}`}
          role="dialog"
          aria-modal="true"
          aria-label={camera.name}
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.12 } }}
          transition={SPRINGS.modal}
          style={{ zIndex: 100015 }}
          onClick={(e) => e.stopPropagation()}
          className="relative z-[100015] w-full max-w-4xl rounded-2xl bg-[#090C12] border border-[var(--border-default)] shadow-[var(--shadow-elevated)] overflow-hidden max-h-[92dvh] flex flex-col"
        >
          {/* Header */}
          <div className="px-3.5 sm:px-5 py-3 bg-[#0C1018] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="min-w-0 flex-1 basis-48">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isOnline ? "bg-emerald-400 animate-pulse" : "bg-red-400"
                  }`}
                />
                <h3 className="text-sm sm:text-base font-bold text-[#F3F6FB] truncate">
                  {camera.name}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#98A4B8] mt-0.5">
                <span>{camera.city_name}, {camera.province_name}</span>
                <span>•</span>
                <span className="font-mono text-[#E2E8F0]">ID: {camera.id}</span>
                {event && (
                  <>
                    <span>•</span>
                    <span className="text-blue-300 font-semibold truncate max-w-[200px]">
                      Perimeter: {event.lokasi}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <FavoritesButton
                cameraId={camera.id}
                cameraName={camera.name}
                size="md"
                showLabel={false}
              />

              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/20"
                title="Tutup Player dan Kembali ke Pemilihan Kamera (Esc)"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Kembali ke Pemilihan Kamera</span>
                <span className="hidden sm:inline text-[10px] bg-blue-700/60 px-1 py-0.5 rounded font-mono">
                  Esc
                </span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-[#98A4B8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Tutup Player"
                title="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 flex flex-col md:flex-row gap-4">
            {/* Left: Video Player */}
            <div className="flex-1 min-w-0">
              <div className="aspect-video w-full rounded-xl overflow-hidden bg-black border border-[var(--border-subtle)] relative shadow-inner">
                <CCTVPlayer camera={camera} autoPlay />
              </div>

              {event && (
                <div className="mt-3 p-3 rounded-xl bg-[#131B2E] border border-blue-500/20 text-xs text-[#C5D0E3] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-semibold text-white block truncate">
                      {event.isu_tuntutan || event.lokasi}
                    </span>
                    <span className="text-[11px] text-[#98A4B8]">
                      Kode: <strong className="text-white font-mono">{event.kode_unras}</strong> • Tanggal: {event.tanggal}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-[10px] shrink-0 border border-blue-500/30 uppercase">
                    {event.status}
                  </span>
                </div>
              )}
            </div>

            {/* Right: Technical Information */}
            <div className="w-full md:w-72 shrink-0 space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#111622] border border-[var(--border-default)] space-y-2">
                <h4 className="font-bold text-[#F3F6FB] uppercase tracking-wider text-[11px] font-mono flex items-center gap-1.5 text-blue-400">
                  <ShieldCheck className="w-3.5 h-3.5" /> Informasi Kamera
                </h4>
                <div className="space-y-1.5 pt-1 text-[11px]">
                  <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
                    <span className="text-[#98A4B8]">Status</span>
                    <span className={`font-bold flex items-center gap-1 ${isOnline ? "text-emerald-400" : "text-red-400"}`}>
                      {isOnline ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {isOnline ? "ONLINE" : "OFFLINE"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
                    <span className="text-[#98A4B8]">Instansi</span>
                    <span className="text-[#60A5FA] font-medium text-right truncate max-w-[150px]">
                      {camera.source_name || "CCTV Publik"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
                    <span className="text-[#98A4B8]">Wilayah</span>
                    <span className="text-[#F3F6FB] text-right truncate max-w-[150px]">
                      {camera.city_name}, {camera.province_name}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
                    <span className="text-[#98A4B8]">Protokol</span>
                    <span className="text-[#E2E8F0] font-mono">{camera.protocol || "HLS"}</span>
                  </div>
                  <div className="flex justify-between gap-2 py-1">
                    <span className="text-[#98A4B8]">GPS</span>
                    <span className="text-[#E2E8F0] font-mono text-[10px]">
                      {camera.latitude}, {camera.longitude}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

