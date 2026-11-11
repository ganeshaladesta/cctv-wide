"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  MapPin,
  Building2,
  Eye,
  PlusSquare,
  Activity,
  ExternalLink
} from "lucide-react";
import { Camera, Province } from "@/lib/types";
import { CameraVideoPlayer } from "@/components/cctv-player";
import { FavoritesButton } from "@/components/motion-ui";

export type CameraInteraction =
  | { type: "none" }
  | { type: "map-preview"; cameraId: string; camera?: Camera }
  | { type: "camera-detail"; cameraId: string; camera?: Camera };

export { CameraVideoPlayer };

export interface CameraTechnicalInformationProps {
  camera: Camera;
  nearbyCameras: Camera[];
  probeStatus: { loading: boolean; result?: string };
  onVerifyStreamLive: (camera: Camera) => void;
  onAddToMultiView: (camera: Camera) => void;
  onSelectNearbyCamera: (camera: Camera) => void;
}

export function CameraTechnicalInformation({
  camera,
  nearbyCameras,
  probeStatus,
  onVerifyStreamLive,
  onAddToMultiView,
  onSelectNearbyCamera
}: CameraTechnicalInformationProps) {
  return (
    <div
      data-testid="camera-technical-information"
      className="space-y-3 text-xs min-w-0"
    >
      <div className="p-3.5 rounded-xl bg-zinc-900 border border-[#252A35] space-y-2">
        <h4 className="font-bold text-zinc-200 uppercase tracking-wider text-[11px]">
          Informasi Teknis Kamera
        </h4>
        <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/80">
          <span className="text-zinc-400 shrink-0">Provinsi</span>
          <span className="text-zinc-100 font-medium text-right truncate">
            {camera.province_name}
          </span>
        </div>
        <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/80">
          <span className="text-zinc-400 shrink-0">Kota / Kabupaten</span>
          <span className="text-zinc-100 font-medium text-right truncate">
            {camera.city_name}
          </span>
        </div>
        <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/80">
          <span className="text-zinc-400 shrink-0">Instansi Sumber</span>
          <span className="text-sky-400 font-medium text-right truncate">
            {camera.source_name}
          </span>
        </div>
        <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/80">
          <span className="text-zinc-400 shrink-0">Koordinat GPS</span>
          <span className="text-zinc-200 font-mono text-right">
            {camera.latitude}, {camera.longitude}
          </span>
        </div>
        <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/80">
          <span className="text-zinc-400 shrink-0">Protokol Stream</span>
          <span className="text-zinc-200 font-mono">{camera.protocol}</span>
        </div>
        <div className="flex justify-between gap-2 py-1">
          <span className="text-zinc-400 shrink-0">Status Terakhir</span>
          <span
            className={`font-bold ${
              camera.status === "ONLINE" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {camera.status}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onAddToMultiView(camera)}
          data-testid="modal-add-multiview-btn"
          className="w-full py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold flex items-center justify-center gap-1.5 transition"
        >
          <PlusSquare className="w-4 h-4" />
          <span>Tambahkan ke Multi-View Wall</span>
        </button>

        <button
          type="button"
          onClick={() => onVerifyStreamLive(camera)}
          disabled={probeStatus.loading}
          data-testid="modal-verify-stream-btn"
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
          href={camera.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-[#252A35] text-zinc-300 flex items-center justify-center gap-1.5 transition"
        >
          <span>Kunjungi Portal Resmi Pemerintah</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {nearbyCameras.length > 0 && (
        <div className="p-3 rounded-xl bg-zinc-900 border border-[#252A35]">
          <h5 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
            Kamera Terdekat
          </h5>
          <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
            {nearbyCameras.map((nc) => (
              <button
                key={nc.id}
                type="button"
                onClick={() => onSelectNearbyCamera(nc)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 flex items-center justify-between gap-2"
              >
                <span className="truncate text-zinc-200">{nc.name}</span>
                <span className="text-[10px] font-mono text-sky-400 shrink-0">
                  {nc.protocol}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export interface CameraMapPreviewProps {
  camera: Camera | null;
  provinces: Province[];
  onClose: () => void;
  onOpenFullDetail: (cameraId: string, camera: Camera) => void;
  onAddToMultiView: (camera: Camera) => void;
}

export function CameraMapPreview({
  camera,
  provinces,
  onClose,
  onOpenFullDetail,
  onAddToMultiView
}: CameraMapPreviewProps) {
  const previewProvinceSlug = camera
    ? provinces.find((p) => p.id === camera.province_id)?.slug ||
      camera.province_id.replace(/^prov-/, "")
    : "dki-jakarta";

  return (
    <AnimatePresence>
      {camera && (
        <motion.div
          key={`map-preview-${camera.id}`}
          data-testid="map-camera-popup"
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{
            opacity: 0,
            scale: 0.94,
            y: 12,
            transition: { duration: 0.14, ease: "easeOut" }
          }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          style={{ zIndex: 30 }}
          className="absolute bottom-3 left-2.5 right-2.5 sm:left-4 sm:right-auto z-[30] sm:w-[370px] rounded-xl bg-zinc-950/95 backdrop-blur-xl border border-zinc-700/80 shadow-2xl overflow-hidden pointer-events-auto"
        >
          {/* Header: Name, Status Badge, Favorite & Close Button */}
          <div className="flex items-start justify-between gap-2 px-3.5 py-2.5 bg-zinc-900 border-b border-zinc-800">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                    camera.status === "ONLINE"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      : "bg-red-500/20 text-red-400 border border-red-500/40"
                  }`}
                >
                  {camera.status === "ONLINE" ? (
                    <CheckCircle2 className="w-2.5 h-2.5" />
                  ) : (
                    <XCircle className="w-2.5 h-2.5" />
                  )}
                  {camera.status}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {camera.protocol}
                </span>
              </div>
              <h4 className="text-xs font-bold text-zinc-100 truncate mt-1">
                {camera.name}
              </h4>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <FavoritesButton
                cameraId={camera.id}
                cameraName={camera.name}
                size="sm"
              />
              <button
                type="button"
                data-testid="map-preview-close-btn"
                onClick={onClose}
                className="text-xs text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-zinc-800 shrink-0"
              >
                ✕ Tutup
              </button>
            </div>
          </div>

          {/* Metadata Strip: City, Province & Source Agency */}
          <div className="px-3.5 py-2 bg-zinc-900/60 border-b border-zinc-800/80 space-y-1 text-[11px]">
            <div className="flex items-center gap-1.5 text-zinc-300 truncate">
              <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">
                {camera.city_name}, {camera.province_name}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-400 truncate">
              <Building2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">{camera.source_name}</span>
            </div>
          </div>

          {/* Compact Live Camera Stream Preview */}
          <div className="h-[195px] w-full bg-black">
            {camera.stream_url ? (
              <CameraVideoPlayer camera={camera} compact />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-400">
                <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-[11px] font-mono">
                  Memuat detail stream kamera...
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons: Detail Kamera, Halaman Kamera, Multi-View */}
          <div className="p-2.5 bg-zinc-900/95 border-t border-zinc-800 flex items-center justify-between gap-1.5">
            <button
              type="button"
              data-testid="map-preview-detail-btn"
              onClick={() => onOpenFullDetail(camera.id, camera)}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-100 transition"
            >
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>Detail Kamera</span>
            </button>

            <Link
              href={`/kamera/${encodeURIComponent(
                previewProvinceSlug
              )}/${encodeURIComponent(camera.id)}`}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-sky-400 hover:text-sky-300 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Halaman</span>
            </Link>

            <button
              type="button"
              onClick={() => onAddToMultiView(camera)}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition"
            >
              <PlusSquare className="w-3.5 h-3.5" />
              <span>+ Multi-View</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface CameraDetailModalProps {
  camera: Camera | null;
  provinces: Province[];
  nearbyCameras: Camera[];
  probeStatus: { loading: boolean; result?: string };
  onClose: () => void;
  onVerifyStreamLive: (camera: Camera) => void;
  onAddToMultiView: (camera: Camera) => void;
  onSelectNearbyCamera: (camera: Camera) => void;
}

export function CameraDetailModal({
  camera,
  provinces,
  nearbyCameras,
  probeStatus,
  onClose,
  onVerifyStreamLive,
  onAddToMultiView,
  onSelectNearbyCamera
}: CameraDetailModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scrolling and listen for Escape while modal is open
  useEffect(() => {
    if (!camera || typeof document === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [camera, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  const modalContent = (
    <AnimatePresence>
      {camera && (
        <motion.div
          key="camera-detail-modal-backdrop"
          data-testid="camera-detail-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ zIndex: 900 }}
          onClick={onClose}
          className="fixed inset-0 z-[900] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 pointer-events-auto"
        >
          <motion.div
            key={`camera-detail-dialog-${camera.id}`}
            role="dialog"
            aria-modal="true"
            aria-label={camera.name}
            data-testid="camera-detail-modal"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.95,
              y: 12,
              transition: { duration: 0.15, ease: "easeOut" }
            }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            style={{ zIndex: 1000 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-[1000] w-full max-w-4xl rounded-2xl bg-zinc-950 border border-[#252A35] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
          >
            {/* Modal Header */}
            <div className="px-4 sm:px-5 py-3 bg-zinc-900 border-b border-[#252A35] flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-bold text-white truncate">
                  {camera.name}
                </h3>
                <p className="text-xs text-zinc-400 truncate">
                  {camera.city_name}, {camera.province_name} • ID:{" "}
                  <span className="font-mono text-zinc-300">{camera.id}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <FavoritesButton
                  cameraId={camera.id}
                  cameraName={camera.name}
                  size="md"
                  showLabel
                />
                <Link
                  href={`/kamera/${encodeURIComponent(
                    provinces.find((p) => p.id === camera.province_id)?.slug ||
                      camera.province_id.replace("prov-", "")
                  )}/${encodeURIComponent(camera.id)}`}
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200"
                >
                  Halaman Penuh
                </Link>
                <button
                  type="button"
                  data-testid="close-camera-detail-modal"
                  onClick={onClose}
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200"
                >
                  ✕ Tutup
                </button>
              </div>
            </div>

            {/* Modal Body: Video Player + Technical Info */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
              <div className="lg:col-span-8 h-[240px] sm:h-[380px]">
                {camera.stream_url ? (
                  <CameraVideoPlayer camera={camera} />
                ) : (
                  <div className="w-full h-full rounded-lg bg-zinc-950 border border-zinc-800/80 flex flex-col items-center justify-center gap-2 text-zinc-400">
                    <div className="w-7 h-7 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-mono">
                      Memuat detail kamera...
                    </span>
                  </div>
                )}
              </div>

              <div className="lg:col-span-4 min-w-0">
                <CameraTechnicalInformation
                  camera={camera}
                  nearbyCameras={nearbyCameras}
                  probeStatus={probeStatus}
                  onVerifyStreamLive={onVerifyStreamLive}
                  onAddToMultiView={onAddToMultiView}
                  onSelectNearbyCamera={onSelectNearbyCamera}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
