"use client";

import React, { useState, useEffect } from "react";
import { X, RefreshCw, CheckCircle2, AlertTriangle, Clock, Database, FileSpreadsheet, Server } from "lucide-react";
import { ProtestSyncLog } from "@/lib/types/protests";

interface ProtestSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncCompleted: () => void;
}

export function ProtestSyncModal({
  isOpen,
  onClose,
  onSyncCompleted
}: ProtestSyncModalProps) {
  const [loading, setLoading] = useState(false);
  const [fetchingLogs, setFetchingLogs] = useState(true);
  const [logs, setLogs] = useState<ProtestSyncLog[]>([]);
  const [isGraphConfigured, setIsGraphConfigured] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchSyncStatus = async () => {
    try {
      setFetchingLogs(true);
      const res = await fetch("/api/protests/sync");
      const json = await res.json();
      if (res.ok && json.success) {
        setIsGraphConfigured(Boolean(json.isGraphConfigured));
        setLogs(json.latestSyncLogs || []);
      }
    } catch {
      // Ignored
    } finally {
      setFetchingLogs(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSyncStatus();
      setStatusMessage(null);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRunSync = async (forceFixture: boolean = false) => {
    setLoading(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/protests/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-scc-user-role": "admin"
        },
        body: JSON.stringify({ forceFixture })
      });

      const json = await res.json();
      if (!res.ok && res.status !== 200 && res.status !== 409) {
        throw new Error(json.error || "Gagal menjalankan sinkronisasi data.");
      }

      setStatusMessage(json.message || "Penyelarasan data unjuk rasa selesai.");
      await fetchSyncStatus();
      onSyncCompleted();
    } catch (err: any) {
      setErrorMessage(err.message || "Terjadi kesalahan pada proses sinkronisasi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0D121B] border border-[var(--border-default)] rounded-2xl shadow-2xl p-5 sm:p-6 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Sinkronisasi Data Unjuk Rasa
              </h2>
              <p className="text-xs text-[#98A4B8]">
                Integrasi Workbook OneDrive Worksheet 'NEW UNRAS 2022-2026'
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

        {/* Integration Status Pill */}
        <div className="mt-4 p-3 rounded-xl bg-[#111622] border border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="text-[#98A4B8]">Status Sumber Data:</span>
            <span className={`font-semibold ${isGraphConfigured ? "text-emerald-400" : "text-amber-400"}`}>
              {isGraphConfigured ? "Microsoft Graph Live Terhubung" : "Offline Sample Fixture (Siap Sinkron)"}
            </span>
          </div>
          <span className="text-[11px] text-[#64748B] hidden sm:inline">
            Jadwal Harian: 05:00 WIB
          </span>
        </div>

        {/* Notifications */}
        {statusMessage && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Sync Actions */}
        <div className="mt-4 flex flex-col sm:flex-row items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleRunSync(false)}
            disabled={loading}
            className="w-full sm:flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Menyelaraskan Data...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Jalankan Sinkronisasi Sekarang</span>
              </>
            )}
          </button>

          {!isGraphConfigured && (
            <button
              type="button"
              onClick={() => handleRunSync(true)}
              disabled={loading}
              className="w-full sm:w-auto py-2.5 px-3 rounded-xl text-xs font-medium bg-[#161C2B] hover:bg-[#1E2638] text-[#98A4B8] hover:text-white border border-[var(--border-default)] transition-colors"
            >
              Uji Paksa Sample Fixture
            </button>
          )}
        </div>

        {/* Sync History Audit */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400" /> Riwayat Penyelarasan Terakhir
            </h3>
            <span className="text-[11px] text-[#64748B]">
              Total Log: {logs.length}
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {fetchingLogs ? (
              <div className="p-4 text-center text-xs text-[#98A4B8]">
                Memuat riwayat sinkronisasi...
              </div>
            ) : logs.length === 0 ? (
              <div className="p-4 text-center text-xs text-[#64748B] bg-[#111622] rounded-xl border border-[var(--border-subtle)]">
                Belum ada riwayat sinkronisasi yang tercatat.
              </div>
            ) : (
              logs.map((log) => {
                const isSuccess = log.status === "success";
                const isPartial = log.status === "partial";
                const isRunning = log.status === "running";
                const isSkipped = log.status === "skipped";

                return (
                  <div
                    key={log.id}
                    className="p-3 bg-[#111622] border border-[var(--border-subtle)] rounded-xl flex flex-col gap-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isSuccess
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              : isPartial
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                              : isRunning
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/30 animate-pulse"
                              : isSkipped
                              ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                              : "bg-red-500/10 text-red-400 border border-red-500/30"
                          }`}
                        >
                          {log.status}
                        </span>
                        <span className="text-white font-semibold">
                          {new Date(log.started_at).toLocaleString("id-ID")}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#64748B]">
                        {log.duration_ms ? `${log.duration_ms} ms` : "-"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#98A4B8]">
                      <span>Dipindai: <strong className="text-white">{log.records_processed}</strong></span>
                      <span>Baru: <strong className="text-emerald-400">+{log.records_created}</strong></span>
                      <span>Diperbarui: <strong className="text-blue-400">{log.records_updated}</strong></span>
                      <span>Dilewati: <strong className="text-slate-400">{log.records_skipped}</strong></span>
                      <span className="text-[#64748B]">Pemicu: {log.triggered_by}</span>
                    </div>

                    {log.error_details && (
                      <div className="text-[11px] text-amber-400/90 bg-amber-500/5 p-1.5 rounded border border-amber-500/20">
                        {log.error_details}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#98A4B8] hover:text-white hover:bg-white/5 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

