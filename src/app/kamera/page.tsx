import React from "react";
import Link from "next/link";
import { ChevronRight, Globe2, Building2 } from "lucide-react";
import { getDataStore } from "@/lib/data-store";
import { ResponsiveHeader, AppFooter } from "@/components/branding";

export default function DirectoryRootPage() {
  const store = getDataStore();
  const provinces = store.getProvinces();
  const stats = store.getStats();

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-zinc-950 text-zinc-100 flex flex-col">
      <ResponsiveHeader
        breadcrumbs={[{ label: "Direktori 38 Provinsi" }]}
        rightActions={
          <Link
            href="/"
            className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white transition"
          >
            ← Kembali ke Command Center
          </Link>
        }
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-6 py-5 sm:py-6 space-y-5 sm:space-y-6">
        <div className="p-3.5 sm:p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <Globe2 className="w-5 h-5 sm:w-6 sm:h-6 text-sky-400 shrink-0 mt-0.5 sm:mt-0" />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-extrabold text-white">
                Direktori Hirarkis CCTV Publik Indonesia (38 Provinsi)
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Total {stats.total_cameras.toLocaleString("id-ID")} kamera (
                {stats.online_cameras.toLocaleString("id-ID")} Online) dari{" "}
                {stats.total_sources} instansi di {stats.total_cities} Kota/Kabupaten.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-3.5">
          {provinces.map((prov) => (
            <Link
              key={prov.id}
              href={`/kamera/${prov.slug}`}
              className="p-3.5 sm:p-4 rounded-xl bg-zinc-900/90 hover:bg-zinc-900 border border-zinc-800 hover:border-sky-500/60 transition flex flex-col justify-between group min-w-0"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono truncate">
                    {prov.island}
                  </span>
                  <span className="text-emerald-400 font-mono font-bold shrink-0">
                    {prov.online_cameras.toLocaleString("id-ID")} Live
                  </span>
                </div>
                <h2 className="text-sm sm:text-base font-bold text-white group-hover:text-sky-400 mt-2.5 transition truncate">
                  {prov.name}
                </h2>
                <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">
                    {prov.city_count} Kota/Kab •{" "}
                    {prov.total_cameras.toLocaleString("id-ID")} Kamera
                  </span>
                </p>
              </div>

              <div className="mt-4 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-xs text-sky-400 font-medium">
                <span>Lihat Kota & Kamera</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
