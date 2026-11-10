import React from "react";
import Link from "next/link";
import { Radio, ChevronRight, Globe2, Building2 } from "lucide-react";
import { getDataStore } from "@/lib/data-store";

export default function DirectoryRootPage() {
  const store = getDataStore();
  const provinces = store.getProvinces();
  const stats = store.getStats();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-900/70 px-4 lg:px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white"
            >
              <Radio className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Link href="/" className="hover:text-emerald-400">
                  Indonesia
                </Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-zinc-200 font-medium">
                  Direktori 38 Provinsi
                </span>
              </div>
              <h1 className="text-lg font-extrabold text-white">
                Direktori Hirarkis CCTV Publik Indonesia (38 Provinsi)
              </h1>
            </div>
          </div>

          <Link
            href="/"
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition"
          >
            ← Kembali ke Command Center
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-6 py-6 space-y-6">
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Globe2 className="w-6 h-6 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold text-white">
                Hirarki Nasional: Indonesia → Provinsi → Kota/Kabupaten → Kamera → Stream
              </h2>
              <p className="text-xs text-zinc-400">
                Total {stats.total_cameras.toLocaleString("id-ID")} kamera ({stats.online_cameras.toLocaleString("id-ID")} Online) dari {stats.total_sources} instansi di {stats.total_cities} Kota/Kabupaten.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {provinces.map((prov) => (
            <Link
              key={prov.id}
              href={`/kamera/${prov.slug}`}
              className="p-4 rounded-xl bg-zinc-900/90 hover:bg-zinc-900 border border-zinc-800 hover:border-emerald-500/60 transition flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                    {prov.island}
                  </span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {prov.online_cameras.toLocaleString("id-ID")} Live
                  </span>
                </div>
                <h3 className="text-base font-bold text-white group-hover:text-emerald-400 mt-2.5 transition">
                  {prov.name}
                </h3>
                <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-zinc-500" />
                  <span>
                    {prov.city_count} Kota/Kab •{" "}
                    {prov.total_cameras.toLocaleString("id-ID")} Kamera
                  </span>
                </p>
              </div>

              <div className="mt-4 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-xs text-emerald-400 font-medium">
                <span>Lihat Kota & Kamera</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-4 lg:px-6 py-4 text-center text-xs text-zinc-400">
        PANTAU NUSANTARA — Developed by Ganesha Ladesta.
      </footer>
    </div>
  );
}

