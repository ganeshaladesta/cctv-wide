import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Shield, ExternalLink, Clock } from "lucide-react";
import { getDataStore } from "@/lib/data-store";
import CCTVPlayer from "@/components/cctv-player";
import { ResponsiveHeader, AppFooter } from "@/components/branding";
import { FavoritesButton, ProgramsCard } from "@/components/motion-ui";

export default async function CameraDetailPage(props: {
  params: Promise<{ province: string; id: string }>;
}) {
  const { province, id } = await props.params;
  const decodedId = decodeURIComponent(id);
  const store = getDataStore();
  const camera = store.getCameraById(decodedId);

  if (!camera) {
    notFound();
  }

  const nearby = store.getNearbyCameras(camera, 8);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-transparent text-[#F3F6FB] flex flex-col">
      <ResponsiveHeader
        breadcrumbs={[
          { label: "Direktori 38 Provinsi", href: "/kamera" },
          { label: camera.province_name, href: `/kamera/${province}` },
          { label: camera.name }
        ]}
        rightActions={
          <>
            <FavoritesButton
              cameraId={camera.id}
              cameraName={camera.name}
              size="md"
              showLabel
            />
            <Link
              href={`/?view=multiview&multi=${encodeURIComponent(camera.id)}`}
              className="px-3 py-1.5 rounded-xl bg-[#3B82F6] hover:bg-[#60A5FA] text-xs font-semibold text-white transition-colors"
            >
              Buka di Multi-View
            </Link>
          </>
        }
      />

      <main className="relative z-[1] flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-6 py-5 sm:py-6 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        <div className="lg:col-span-8 space-y-4 min-w-0">
          <div className="h-[260px] sm:h-[420px] md:h-[500px] rounded-2xl overflow-hidden border border-[var(--border-default)] shadow-[var(--shadow-card)] bg-black">
            <CCTVPlayer camera={camera} />
          </div>

          <ProgramsCard
            index={0}
            enableHoverLift={false}
            className="p-3.5 sm:p-4 rounded-xl ee-surface flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-2 text-[#98A4B8] min-w-0">
              <Shield className="w-4 h-4 text-[#60A5FA] shrink-0" />
              <span className="truncate">
                Sumber Resmi:{" "}
                <strong className="text-[#F3F6FB]">{camera.source_name}</strong>
              </span>
            </div>
            <a
              href={camera.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[#60A5FA] hover:text-white font-medium shrink-0 transition-colors"
            >
              <span>Buka Website Resmi Instansi</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </ProgramsCard>
        </div>

        <div className="lg:col-span-4 space-y-4 min-w-0">
          <ProgramsCard
            index={1}
            enableHoverLift={false}
            className="p-4 rounded-xl ee-surface space-y-2.5 text-xs"
          >
            <h1 className="text-sm font-extrabold text-[#F3F6FB] border-b border-[var(--border-subtle)] pb-2 truncate">
              {camera.name}
            </h1>
            <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
              <span className="text-[#98A4B8] shrink-0">ID Kamera</span>
              <span className="font-mono text-[#E2E8F0] truncate">
                {camera.id}
              </span>
            </div>
            <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
              <span className="text-[#98A4B8] shrink-0">Lokasi / Jalan</span>
              <span className="text-[#F3F6FB] font-medium text-right truncate">
                {camera.location}
              </span>
            </div>
            <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
              <span className="text-[#98A4B8] shrink-0">Kota / Kabupaten</span>
              <span className="text-[#F3F6FB] font-medium text-right truncate">
                {camera.city_name}
              </span>
            </div>
            <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
              <span className="text-[#98A4B8] shrink-0">Provinsi</span>
              <span className="text-[#F3F6FB] font-medium text-right truncate">
                {camera.province_name}
              </span>
            </div>
            <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
              <span className="text-[#98A4B8] shrink-0">
                Koordinat (Lat, Lng)
              </span>
              <span className="font-mono text-[#60A5FA] text-right tabular-nums">
                {camera.latitude}, {camera.longitude}
              </span>
            </div>
            <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
              <span className="text-[#98A4B8] shrink-0">Protokol Streaming</span>
              <span className="font-mono text-[#E2E8F0]">
                {camera.protocol}
              </span>
            </div>
            <div className="flex justify-between gap-2 py-1 border-b border-[var(--border-subtle)]">
              <span className="text-[#98A4B8] shrink-0">Status Saat Ini</span>
              <span
                className={`font-bold ${
                  camera.status === "ONLINE"
                    ? "text-[#10B981]"
                    : "text-[#EF4444]"
                }`}
              >
                {camera.status}
              </span>
            </div>
            <div className="flex justify-between gap-2 py-1">
              <span className="text-[#98A4B8] flex items-center gap-1 shrink-0">
                <Clock className="w-3.5 h-3.5" /> Verifikasi Terakhir
              </span>
              <span className="font-mono text-[#E2E8F0] text-right tabular-nums">
                {new Date(camera.last_checked_at).toLocaleString("id-ID")}
              </span>
            </div>
          </ProgramsCard>

          {nearby.length > 0 && (
            <ProgramsCard
              index={2}
              enableHoverLift={false}
              className="p-4 rounded-xl ee-surface space-y-2.5"
            >
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#E2E8F0]">
                Kamera Terdekat di Sekitar Lokasi
              </h3>
              <div className="divide-y divide-[var(--border-subtle)]">
                {nearby.map((nc) => (
                  <Link
                    key={nc.id}
                    href={`/kamera/${province}/${encodeURIComponent(nc.id)}`}
                    className="py-2 flex items-center justify-between gap-2 text-xs hover:text-[#60A5FA] transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[#F3F6FB] truncate">
                        {nc.name}
                      </p>
                      <p className="text-[11px] text-[#98A4B8] flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 shrink-0" /> {nc.city_name}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#0C1018] border border-[var(--border-subtle)] text-[#60A5FA] shrink-0">
                      {nc.protocol}
                    </span>
                  </Link>
                ))}
              </div>
            </ProgramsCard>
          )}
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
