import React from "react";
import Link from "next/link";
import { Shield, Globe2, Video, Eye, CheckCircle2 } from "lucide-react";
import { APP_CONFIG } from "@/lib/branding";
import {
  ResponsiveHeader,
  InstitutionalLogos,
  AppFooter
} from "@/components/branding";
import { getDataStore } from "@/lib/data-store";

export default function AboutPage() {
  const store = getDataStore();
  const stats = store.getStats();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <ResponsiveHeader
        breadcrumbs={[{ label: "Tentang Sistem" }]}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-10 space-y-6">
        <div className="p-5 sm:p-8 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-mono font-semibold">
                <Eye className="w-3.5 h-3.5 text-amber-400" />
                <span>INTEGRATED SURVEILLANCE COMMAND</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                {APP_CONFIG.name}
              </h1>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-2xl">
                {APP_CONFIG.description}
              </p>
            </div>

            <InstitutionalLogos size="md" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Total Kamera</span>
                <Video className="w-4 h-4 text-sky-400" />
              </div>
              <p className="text-lg font-extrabold text-white mt-1 font-mono">
                {stats.total_cameras.toLocaleString("id-ID")}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800">
              <div className="flex items-center justify-between text-xs text-emerald-400">
                <span>Kamera Online</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <p className="text-lg font-extrabold text-emerald-400 mt-1 font-mono">
                {stats.online_cameras.toLocaleString("id-ID")}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Cakupan Wilayah</span>
                <Globe2 className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-lg font-extrabold text-amber-400 mt-1 font-mono">
                {stats.total_provinces} Provinsi • {stats.total_cities} Kota/Kab
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Instansi Sumber</span>
                <Shield className="w-4 h-4 text-sky-400" />
              </div>
              <p className="text-lg font-extrabold text-sky-400 mt-1 font-mono">
                {stats.total_sources.toLocaleString("id-ID")}
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 text-xs text-zinc-400">
            <span>{APP_CONFIG.copyright}</span>
            <Link
              href="/"
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold transition"
            >
              Kembali ke Dashboard Utama
            </Link>
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}

