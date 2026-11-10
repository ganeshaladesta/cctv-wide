import React from "react";
import Link from "next/link";
import { Shield, Globe2, Video, Eye, CheckCircle2 } from "lucide-react";
import { APP_CONFIG } from "@/lib/branding";
import { ResponsiveHeader, AppFooter } from "@/components/branding";
import { EagleEyesLogo, ProgramsCard } from "@/components/motion-ui";
import { getDataStore } from "@/lib/data-store";

export default function AboutPage() {
  const store = getDataStore();
  const stats = store.getStats();

  return (
    <div className="min-h-screen bg-transparent text-[#F3F6FB] flex flex-col">
      <ResponsiveHeader breadcrumbs={[{ label: "Tentang Sistem" }]} />

      <main className="relative z-[1] flex-1 max-w-5xl w-full mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-10 space-y-6">
        <div className="p-5 sm:p-8 rounded-2xl ee-surface space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 border-b border-[var(--border-subtle)] pb-6">
            <EagleEyesLogo size="lg" animateHover={false} />
            <div className="space-y-2 min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-[var(--border-subtle)] text-[#98A4B8] text-[11px] font-mono uppercase tracking-[0.12em]">
                <Eye className="w-3.5 h-3.5 text-[#60A5FA]" />
                <span>Integrated Surveillance Command</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#F3F6FB]">
                {APP_CONFIG.name}
              </h1>
              <p className="text-xs sm:text-sm text-[#98A4B8] leading-relaxed max-w-2xl">
                {APP_CONFIG.description}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <ProgramsCard
              index={0}
              enableShimmer
              className="p-4 rounded-xl bg-[#0C1018]/90 border border-[var(--border-default)] hover:border-[var(--border-strong)]"
            >
              <div className="flex items-center justify-between text-xs text-[#98A4B8]">
                <span>Total Kamera</span>
                <Video className="w-4 h-4 text-[#60A5FA]" />
              </div>
              <p className="text-lg font-extrabold text-[#F3F6FB] mt-1 font-mono tabular-nums">
                {stats.total_cameras.toLocaleString("id-ID")}
              </p>
            </ProgramsCard>

            <ProgramsCard
              index={1}
              enableShimmer
              className="p-4 rounded-xl bg-[#0C1018]/90 border border-[var(--border-default)] hover:border-[var(--border-strong)]"
            >
              <div className="flex items-center justify-between text-xs text-[#10B981]">
                <span>Kamera Online</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <p className="text-lg font-extrabold text-[#10B981] mt-1 font-mono tabular-nums">
                {stats.online_cameras.toLocaleString("id-ID")}
              </p>
            </ProgramsCard>

            <ProgramsCard
              index={2}
              enableShimmer
              className="p-4 rounded-xl bg-[#0C1018]/90 border border-[var(--border-default)] hover:border-[var(--border-strong)]"
            >
              <div className="flex items-center justify-between text-xs text-[#98A4B8]">
                <span>Cakupan Wilayah</span>
                <Globe2 className="w-4 h-4 text-[#F59E0B]" />
              </div>
              <p className="text-lg font-extrabold text-[#F59E0B] mt-1 font-mono tabular-nums">
                {stats.total_provinces} Provinsi • {stats.total_cities} Kota/Kab
              </p>
            </ProgramsCard>

            <ProgramsCard
              index={3}
              enableShimmer
              className="p-4 rounded-xl bg-[#0C1018]/90 border border-[var(--border-default)] hover:border-[var(--border-strong)]"
            >
              <div className="flex items-center justify-between text-xs text-[#98A4B8]">
                <span>Instansi Sumber</span>
                <Shield className="w-4 h-4 text-[#60A5FA]" />
              </div>
              <p className="text-lg font-extrabold text-[#60A5FA] mt-1 font-mono tabular-nums">
                {stats.total_sources.toLocaleString("id-ID")}
              </p>
            </ProgramsCard>
          </div>

          <div className="pt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] text-xs text-[#98A4B8]">
            <span>{APP_CONFIG.copyright}</span>
            <Link
              href="/"
              className="px-4 py-2 rounded-xl bg-[#3B82F6] hover:bg-[#60A5FA] text-white font-semibold transition-colors"
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
