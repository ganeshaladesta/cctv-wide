"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Plus, AlertTriangle, MapPin, Calendar, Clock, Users, Shield } from "lucide-react";
import { ProtestEvent, ProtestUrgency } from "@/lib/types/protests";

interface ProtestCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newEvent: ProtestEvent) => void;
}

export function ProtestCreateModal({
  isOpen,
  onClose,
  onCreated
}: ProtestCreateModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split("T")[0],
    waktu_mulai: "09:00 WIB",
    lokasi: "",
    titik_kumpul: "",
    sasaran_aksi: "",
    isu_tuntutan: "",
    estimasi_massa_source: "",
    organisasi_kelompok: "",
    korlap_pimpinan: "",
    provinsi: "DKI Jakarta",
    kota_kabupaten: "Jakarta Pusat",
    wilayah_hukum: "Polres Metro Jakarta Pusat",
    urgency: "medium" as ProtestUrgency,
    validated_lat: "",
    validated_lng: "",
    situation_summary: ""
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

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
  }, [isOpen, onClose]);

  if (!isOpen || !mounted || typeof document === "undefined") return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload: Record<string, any> = {
        ...formData,
        estimasi_massa_source: formData.estimasi_massa_source ? parseInt(formData.estimasi_massa_source, 10) : null,
        validated_lat: formData.validated_lat ? parseFloat(formData.validated_lat) : null,
        validated_lng: formData.validated_lng ? parseFloat(formData.validated_lng) : null
      };

      const res = await fetch("/api/protests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-scc-user-role": "operator"
        },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Gagal menyimpan data aksi unjuk rasa.");
      }

      onCreated(json.data);
      onClose();
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat menyimpan data.");
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div
      className="unras-modal-wrapper"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unras-create-title"
    >
      <div
        className="unras-modal-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="unras-detail-modal"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="relative w-full max-w-2xl bg-[#0D121B] border border-[var(--border-default)] rounded-2xl shadow-2xl p-5 sm:p-6 my-auto pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <h2 id="unras-create-title" className="text-base font-bold text-white tracking-wide">
                  Tambah Aksi Unjuk Rasa Manual
                </h2>
              <p className="text-xs text-[#98A4B8]">
                Entri pemantauan situasi lapangan SCC - EAGLE EYES
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#98A4B8] hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#98A4B8] mb-1">
                Tanggal Pelaksanaan <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={formData.tanggal}
                  onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                  className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#98A4B8] mb-1">
                Waktu Pelaksanaan
              </label>
              <input
                type="text"
                placeholder="Contoh: 09:00 WIB"
                value={formData.waktu_mulai}
                onChange={(e) => setFormData({ ...formData, waktu_mulai: e.target.value })}
                className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#98A4B8] mb-1">
              Lokasi Utama Aksi <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Depan Gedung DPR/MPR RI, Jl. Gatot Subroto"
              value={formData.lokasi}
              onChange={(e) => setFormData({ ...formData, lokasi: e.target.value })}
              className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#98A4B8] mb-1">
                Titik Kumpul (Tikum)
              </label>
              <input
                type="text"
                placeholder="Contoh: TVRI Senayan"
                value={formData.titik_kumpul}
                onChange={(e) => setFormData({ ...formData, titik_kumpul: e.target.value })}
                className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#98A4B8] mb-1">
                Sasaran Aksi
              </label>
              <input
                type="text"
                placeholder="Contoh: Gerbang Utama DPR"
                value={formData.sasaran_aksi}
                onChange={(e) => setFormData({ ...formData, sasaran_aksi: e.target.value })}
                className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#98A4B8] mb-1">
              Isu & Tuntutan Aksi <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              rows={2}
              placeholder="Ringkasan isu atau tuntutan yang disampaikan..."
              value={formData.isu_tuntutan}
              onChange={(e) => setFormData({ ...formData, isu_tuntutan: e.target.value })}
              className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#98A4B8] mb-1">
                Estimasi Massa (Orang)
              </label>
              <input
                type="number"
                min="0"
                placeholder="Contoh: 500"
                value={formData.estimasi_massa_source}
                onChange={(e) => setFormData({ ...formData, estimasi_massa_source: e.target.value })}
                className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#98A4B8] mb-1">
                Elemen / Organisasi
              </label>
              <input
                type="text"
                placeholder="Contoh: Aliansi Buruh"
                value={formData.organisasi_kelompok}
                onChange={(e) => setFormData({ ...formData, organisasi_kelompok: e.target.value })}
                className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#98A4B8] mb-1">
                Tingkat Urgensi
              </label>
              <select
                value={formData.urgency}
                onChange={(e) => setFormData({ ...formData, urgency: e.target.value as ProtestUrgency })}
                className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="low">Rendah (Low)</option>
                <option value="medium">Sedang (Medium)</option>
                <option value="high">Tinggi (High)</option>
                <option value="critical">Kritis (Critical)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#98A4B8] mb-1">
                Provinsi
              </label>
              <input
                type="text"
                value={formData.provinsi}
                onChange={(e) => setFormData({ ...formData, provinsi: e.target.value })}
                className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#98A4B8] mb-1">
                Kota / Kabupaten
              </label>
              <input
                type="text"
                value={formData.kota_kabupaten}
                onChange={(e) => setFormData({ ...formData, kota_kabupaten: e.target.value })}
                className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#98A4B8] mb-1">
                Wilayah Hukum
              </label>
              <input
                type="text"
                value={formData.wilayah_hukum}
                onChange={(e) => setFormData({ ...formData, wilayah_hukum: e.target.value })}
                className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Optional Coordinates */}
          <div className="p-3 bg-[#111622] border border-[var(--border-subtle)] rounded-xl">
            <span className="block text-xs font-semibold text-[#98A4B8] mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-400" /> Koordinat Geospasial (Opsional untuk Pemetaan)
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  placeholder="Latitude (cth: -6.2115)"
                  value={formData.validated_lat}
                  onChange={(e) => setFormData({ ...formData, validated_lat: e.target.value })}
                  className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Longitude (cth: 106.8016)"
                  value={formData.validated_lng}
                  onChange={(e) => setFormData({ ...formData, validated_lng: e.target.value })}
                  className="w-full bg-[#161C2B] border border-[var(--border-default)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <p className="text-[10px] text-[#64748B] mt-1">
              Jika dikosongkan, aksi akan berstatus belum terpetakan (unmapped) dan tidak ditampilkan di layer peta sampai koordinat divalidasi.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#98A4B8] hover:text-white hover:bg-white/5 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Simpan Aksi Unjuk Rasa</span>
                </>
              )}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

