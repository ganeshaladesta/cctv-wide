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
import { FavoritesButton, ProgramsCard } from "@/components/motion-ui";
import { SPRINGS } from "@/lib/motion";

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
      <ProgramsCard
        index={0}
        enableHoverLift={false}
        enableShimmer
        className="p-3.5 rounded-xl bg-[#111622] border border-[var(--border-default)] space-y-2"
      >
        <h4 className="font-bold text-[#F3F6FB] uppercase tracking-wider text-[11px] font-mono">
          Informasi Teknis Kamera
        </h4>
        <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
          <span className="text-[#98A4B8] shrink-0">Provinsi</span>
          <span className="text-[#F3F6FB] font-medium text-right truncate">
            {camera.province_name}
          </span>
        </div>
        <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
          <span className="text-[#98A4B8] shrink-0">Kota / Kabupaten</span>
          <span className="text-[#F3F6FB] font-medium text-right truncate">
            {camera.city_name}
          </span>
        </div>
        <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
          <span className="text-[#98A4B8] shrink-0">Instansi Sumber</span>
          <span className="text-[#60A5FA] font-medium text-right truncate">
            {camera.source_name}
          </span>
        </div>
        <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
          <span className="text-[#98A4B8] shrink-0">Koordinat GPS</span>
          <span className="text-[#E2E8F0] font-mono tabular-nums text-right">
            {camera.latitude}, {camera.longitude}
          </span>
        </div>
        <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
          <span className="text-[#98A4B8] shrink-0">Protokol Stream</span>
          <span className="text-[#E2E8F0] font-mono">{camera.protocol}</span>
        </div>
        <div className="flex justify-between gap-2 py-1">
          <span className="text-[#98A4B8] shrink-0">Status Terakhir</span>
          <span
            className={`font-bold ${
              camera.status === "ONLINE" ? "text-[#10B981]" : "text-[#EF4444]"
            }`}
          >
            {camera.status}
          </span>
        </div>
      </ProgramsCard>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onAddToMultiView(camera)}
          data-testid="modal-add-multiview-btn"
          className="w-full py-2 px-3 rounded-xl bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-semibold flex items-center justify-center gap-1.5 transition-colors"
        >
          <PlusSquare className="w-4 h-4" />
          <span>Tambahkan ke Multi-View Wall</span>
        </button>

        <button
          type="button"
          onClick={() => onVerifyStreamLive(camera)}
          disabled={probeStatus.loading}
          data-testid="modal-verify-stream-btn"
          className="w-full py-2 px-3 rounded-xl bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-default)] text-[#E2E8F0] font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
        >
          <Activity className="w-4 h-4 text-[#F59E0B]" />
          <span>
            {probeStatus.loading
              ? "Memeriksa Koneksi Stream..."
              : "Cek Kesehatan Stream (Live Probe)"}
          </span>
        </button>

        {probeStatus.result && (
          <div className="p-2.5 rounded-xl bg-[#0C1018] border border-[var(--border-default)] text-[11px] font-mono text-[#10B981] break-words">
            {probeStatus.result}
          </div>
        )}

        <a
          href={camera.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-2 px-3 rounded-xl bg-[#111622] hover:bg-[#161C2B] border border-[var(--border-default)] text-[#E2E8F0] flex items-center justify-center gap-1.5 transition-colors"
        >
          <span>Kunjungi Portal Resmi Pemerintah</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {nearbyCameras.length > 0 && (
        <ProgramsCard
          index={1}
          enableHoverLift={false}
          className="p-3 rounded-xl bg-[#111622] border border-[var(--border-default)]"
        >
          <h5 className="text-[11px] font-bold font-mono uppercase tracking-wider text-[#98A4B8] mb-2">
            Kamera Terdekat
          </h5>
          <div className="space-y-1 max-h-[140px] overflow-y-auto">
            {nearbyCameras.map((nc) => (
              <button
                key={nc.id}
                type="button"
                onClick={() => onSelectNearbyCamera(nc)}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/[0.06] flex items-center justify-between gap-2 transition-colors"
              >
                <span className="truncate text-[#E2E8F0]">{nc.name}</span>
                <span className="text-[10px] font-mono text-[#60A5FA] shrink-0">
                  {nc.protocol}
                </span>
              </button>
            ))}
          </div>
        </ProgramsCard>
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
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{
            opacity: 0,
            scale: 0.95,
            y: 10,
            transition: { duration: 0.14, ease: "easeOut" }
          }}
          transition={SPRINGS.modal}
          style={{ zIndex: 30 }}
          className="absolute bottom-3 left-2.5 right-2.5 sm:left-4 sm:right-auto z-[30] sm:w-[372px] rounded-2xl bg-[#090C12]/95 backdrop-blur-xl border border-[var(--border-default)] shadow-[var(--shadow-elevated)] overflow-hidden pointer-events-auto"
        >
          {/* Header: Name, Status Badge, Favorite & Close Button */}
          <div className="flex items-start justify-between gap-2 px-3.5 py-2.5 bg-[#0C1018] border-b border-[var(--border-subtle)]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                    camera.status === "ONLINE"
                      ? "bg-emerald-500/20 text-[#10B981] border border-emerald-500/40"
                      : "bg-red-500/20 text-[#EF4444] border border-red-500/40"
                  }`}
                >
                  {camera.status === "ONLINE" ? (
                    <CheckCircle2 className="w-2.5 h-2.5" />
                  ) : (
                    <XCircle className="w-2.5 h-2.5" />
                  )}
                  {camera.status}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#161C2B] text-[#E2E8F0] border border-[var(--border-subtle)]">
                  {camera.protocol}
                </span>
              </div>
              <h4 className="text-xs font-bold text-[#F3F6FB] truncate mt-1">
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
                className="text-xs text-[#98A4B8] hover:text-white px-2 py-1 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] shrink-0 transition-colors"
              >
                ✕ Tutup
              </button>
            </div>
          </div>

          {/* Metadata Strip: City, Province & Source Agency */}
          <div className="px-3.5 py-2 bg-[#090C12]/80 border-b border-[var(--border-subtle)] space-y-1 text-[11px]">
            <div className="flex items-center gap-1.5 text-[#E2E8F0] truncate">
              <MapPin className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
              <span className="truncate">
                {camera.city_name}, {camera.province_name}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[#98A4B8] truncate">
              <Building2 className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
              <span className="truncate">{camera.source_name}</span>
            </div>
          </div>

          {/* Compact Live Camera Stream Preview */}
          <div className="h-[195px] w-full bg-black">
            <CameraVideoPlayer camera={camera} compact />
          </div>

          {/* Action Buttons: Detail Kamera, Halaman Kamera, Multi-View */}
          <div className="p-2.5 bg-[#0C1018] border-t border-[var(--border-subtle)] flex items-center justify-between gap-1.5">
            <button
              type="button"
              data-testid="map-preview-detail-btn"
              onClick={() => onOpenFullDetail(camera.id, camera)}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-subtle)] text-xs font-medium text-[#F3F6FB] transition-colors"
            >
              <Eye className="w-3.5 h-3.5 text-[#60A5FA]" />
              <span>Detail Kamera</span>
            </button>

            <Link
              href={`/kamera/${encodeURIComponent(
                previewProvinceSlug
              )}/${encodeURIComponent(camera.id)}`}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-subtle)] text-xs font-medium text-[#E2E8F0] hover:text-white transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Halaman</span>
            </Link>

            <button
              type="button"
              onClick={() => onAddToMultiView(camera)}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-[#60A5FA] text-xs font-semibold text-white transition-colors"
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
          transition={{ duration: 0.18 }}
          style={{ zIndex: 900 }}
          onClick={onClose}
          className="fixed inset-0 z-[900] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 pointer-events-auto"
        >
          <motion.div
            key={`camera-detail-dialog-${camera.id}`}
            role="dialog"
            aria-modal="true"
            aria-label={camera.name}
            data-testid="camera-detail-modal"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.96,
              y: 10,
              transition: { duration: 0.14, ease: "easeOut" }
            }}
            transition={SPRINGS.modal}
            style={{ zIndex: 1000 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-[1000] w-full max-w-4xl rounded-2xl bg-[#090C12] border border-[var(--border-default)] shadow-[var(--shadow-elevated)] overflow-hidden max-h-[92dvh] flex flex-col"
          >
            {/* Modal Header */}
            <div className="px-3.5 sm:px-5 py-3 bg-[#0C1018] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1 basis-48">
                <h3 className="text-sm sm:text-base font-bold text-[#F3F6FB] truncate">
                  {camera.name}
                </h3>
                <p className="text-xs text-[#98A4B8] truncate">
                  {camera.city_name}, {camera.province_name} • ID:{" "}
                  <span className="font-mono text-[#E2E8F0]">{camera.id}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
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
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-subtle)] text-xs font-medium text-[#E2E8F0] transition-colors"
                >
                  Halaman Penuh
                </Link>
                <button
                  type="button"
                  data-testid="close-camera-detail-modal"
                  onClick={onClose}
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#161C2B] hover:bg-[#1C2436] border border-[var(--border-default)] text-xs font-semibold text-white transition-colors"
                >
                  ✕ Tutup
                </button>
              </div>
            </div>

            {/* Modal Body: Video Player + Technical Info */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
              <div className="lg:col-span-8 h-[220px] xs:h-[260px] sm:h-[380px]">
                <CameraVideoPlayer camera={camera} />
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
