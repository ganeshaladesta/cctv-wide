import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Shield, ExternalLink } from "lucide-react";
import { getDataStore } from "@/lib/data-store";
import { ResponsiveHeader, AppFooter } from "@/components/branding";
import { FavoritesButton, ProgramsCard } from "@/components/motion-ui";

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
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-transparent text-[#F3F6FB] flex flex-col">
      <ResponsiveHeader
        breadcrumbs={[
          { label: "Direktori 38 Provinsi", href: "/kamera" },
          { label: prov.name }
        ]}
      />

      <main className="relative z-[1] flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-6 py-5 sm:py-6 space-y-5 sm:space-y-6">
        <div className="p-4 sm:p-5 rounded-2xl ee-surface">
          <h1 className="text-base sm:text-lg font-extrabold text-[#F3F6FB]">
            CCTV Publik Provinsi {prov.name} (
            {prov.total_cameras.toLocaleString("id-ID")} Kamera)
          </h1>
          <p className="text-xs text-[#98A4B8] mt-1">
            {prov.online_cameras.toLocaleString("id-ID")} kamera aktif di{" "}
            {cities.length} Kota/Kabupaten ({prov.source_count} instansi sumber).
          </p>
        </div>

        {/* City / Regency Pills */}
        <div>
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[#98A4B8] mb-2.5">
            Kota & Kabupaten di {prov.name} ({cities.length})
          </h2>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <Link
              href={`/kamera/${prov.slug}`}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                !city
                  ? "bg-[#3B82F6]/20 border-[#3B82F6]/50 text-white font-semibold"
                  : "bg-[#111622]/90 border-[var(--border-default)] text-[#98A4B8] hover:text-white hover:border-[var(--border-strong)]"
              }`}
            >
              Semua Kota ({prov.total_cameras.toLocaleString("id-ID")})
            </Link>
            {cities.map((c) => (
              <Link
                key={c.id}
                href={`/kamera/${prov.slug}?city=${encodeURIComponent(c.id)}`}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                  city === c.id
                    ? "bg-[#3B82F6]/20 border-[#3B82F6]/50 text-white font-semibold"
                    : "bg-[#111622]/90 border-[var(--border-default)] text-[#98A4B8] hover:text-white hover:border-[var(--border-strong)]"
                }`}
              >
                {c.name} ({c.total_cameras})
              </Link>
            ))}
          </div>
        </div>

        {/* Camera Cards */}
        <div>
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[#98A4B8] mb-3">
            Daftar Kamera CCTV ({cameras.length} ditampilkan)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cameras.map((cam, idx) => (
              <ProgramsCard
                key={cam.id}
                index={idx}
                className="p-3.5 sm:p-4 rounded-xl bg-[#111622]/95 hover:bg-[#161C2B] border border-[var(--border-default)] hover:border-[var(--border-accent)] flex flex-col justify-between min-w-0 shadow-[var(--shadow-card)]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        cam.status === "ONLINE"
                          ? "bg-emerald-500/15 text-[#10B981] border border-emerald-500/30"
                          : "bg-red-500/15 text-[#EF4444] border border-red-500/30"
                      }`}
                    >
                      {cam.status}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-[#E2E8F0] bg-[#0C1018] border border-[var(--border-subtle)] px-2 py-0.5 rounded-md">
                        {cam.protocol}
                      </span>
                      <FavoritesButton
                        cameraId={cam.id}
                        cameraName={cam.name}
                        size="sm"
                      />
                    </div>
                  </div>
                  <Link
                    href={`/kamera/${prov.slug}/${encodeURIComponent(cam.id)}`}
                    className="block mt-2"
                  >
                    <h3 className="text-sm font-bold text-[#F3F6FB] truncate hover:text-[#60A5FA] transition-colors">
                      {cam.name}
                    </h3>
                    <p className="text-xs text-[#98A4B8] mt-1 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#657287] shrink-0" />
                      <span className="truncate">
                        {cam.city_name}, {cam.province_name}
                      </span>
                    </p>
                    <p className="text-[11px] text-[#60A5FA] mt-1 flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{cam.source_name}</span>
                    </p>
                  </Link>
                </div>

                <div className="mt-3 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 text-xs text-[#98A4B8]">
                  <span className="font-mono text-[10px] text-[#657287] truncate tabular-nums">
                    {cam.latitude}, {cam.longitude}
                  </span>
                  <Link
                    href={`/kamera/${prov.slug}/${encodeURIComponent(cam.id)}`}
                    className="text-[#60A5FA] hover:text-white font-medium inline-flex items-center gap-1 shrink-0 transition-colors"
                  >
                    Buka Stream <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </ProgramsCard>
            ))}
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
