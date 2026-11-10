import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Radio, MapPin, Shield, ExternalLink } from "lucide-react";
import { getDataStore } from "@/lib/data-store";

export default async function ProvinceDirectoryPage(props: {
  params: Promise<{ province: string }>;
  searchParams: Promise<{ city?: string }>;
}) {
  const { province } = await props.params;
  const { city } = await props.searchParams;
  const store = getDataStore();
  const prov = store.getProvince(province);

  if (!prov) {
    notFound();
  }

  const cities = store.getCities(prov.id);
  const cameras = store
    .queryCameras({
      province: prov.id,
      city: city || undefined
    })
    .slice(0, 120);

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
                <Link href="/kamera" className="hover:text-emerald-400">
                  Provinsi
                </Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-zinc-200 font-medium">{prov.name}</span>
              </div>
              <h1 className="text-lg font-extrabold text-white">
                CCTV Publik Provinsi {prov.name} ({prov.total_cameras.toLocaleString("id-ID")} Kamera)
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/kamera"
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200"
            >
              Semua Provinsi
            </Link>
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
            >
              Buka Peta Command Center
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-6 py-6 space-y-6">
        {/* City / Regency Pills */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2.5">
            Kota & Kabupaten di {prov.name} ({cities.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/kamera/${prov.slug}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                !city
                  ? "bg-emerald-600 border-emerald-500 text-white"
                  : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
              }`}
            >
              Semua Kota ({prov.total_cameras.toLocaleString("id-ID")})
            </Link>
            {cities.map((c) => (
              <Link
                key={c.id}
                href={`/kamera/${prov.slug}?city=${encodeURIComponent(c.id)}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  city === c.id
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                }`}
              >
                {c.name} ({c.total_cameras})
              </Link>
            ))}
          </div>
        </div>

        {/* Camera Cards */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
            Daftar Kamera CCTV ({cameras.length} ditampilkan)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cameras.map((cam) => (
              <Link
                key={cam.id}
                href={`/kamera/${prov.slug}/${encodeURIComponent(cam.id)}`}
                className="p-4 rounded-xl bg-zinc-900/90 hover:bg-zinc-900 border border-zinc-800 hover:border-emerald-500/60 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        cam.status === "ONLINE"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-red-500/20 text-red-300 border border-red-500/30"
                      }`}
                    >
                      {cam.status}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                      {cam.protocol}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mt-2">
                    {cam.name}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="truncate">
                      {cam.city_name}, {cam.province_name}
                    </span>
                  </p>
                  <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{cam.source_name}</span>
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-300">
                  <span className="font-mono text-[10px] text-zinc-500">
                    {cam.latitude}, {cam.longitude}
                  </span>
                  <span className="text-emerald-400 font-medium inline-flex items-center gap-1">
                    Buka Stream <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-4 lg:px-6 py-4 text-center text-xs text-zinc-400">
        PANTAU NUSANTARA — Developed by Ganesha Ladesta.
      </footer>
    </div>
  );
}

