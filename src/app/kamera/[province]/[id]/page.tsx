import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MapPin,
  Shield,
  ExternalLink,
  Clock
} from "lucide-react";
import { getDataStore } from "@/lib/data-store";
import CCTVPlayer from "@/components/cctv-player";
import { ResponsiveHeader, AppFooter } from "@/components/branding";
import { FavoritesButton } from "@/components/motion-ui";

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
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-zinc-950 text-zinc-100 flex flex-col">
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
              href={`/kamera/${province}`}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200"
            >
              ← Provinsi {camera.province_name}
            </Link>
            <Link
              href={`/?view=multiview&multi=${encodeURIComponent(camera.id)}`}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white"
            >
              Buka di Multi-View
            </Link>
          </>
        }
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-6 py-5 sm:py-6 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        <div className="lg:col-span-8 space-y-4 min-w-0">
          <div className="h-[260px] sm:h-[420px] md:h-[500px] rounded-xl overflow-hidden">
            <CCTVPlayer camera={camera} />
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-zinc-300 min-w-0">
              <Shield className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="truncate">
                Sumber Resmi:{" "}
                <strong className="text-white">{camera.source_name}</strong>
              </span>
            </div>
            <a
              href={camera.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-medium shrink-0"
            >
              <span>Buka Website Resmi Instansi</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4 min-w-0">
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2.5 text-xs">
            <h1 className="text-sm font-extrabold text-white border-b border-zinc-800 pb-2 truncate">
              {camera.name}
            </h1>
            <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400 shrink-0">ID Kamera</span>
              <span className="font-mono text-zinc-200 truncate">{camera.id}</span>
            </div>
            <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400 shrink-0">Lokasi / Jalan</span>
              <span className="text-zinc-100 font-medium text-right truncate">
                {camera.location}
              </span>
            </div>
            <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400 shrink-0">Kota / Kabupaten</span>
              <span className="text-zinc-100 font-medium text-right truncate">
                {camera.city_name}
              </span>
            </div>
            <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400 shrink-0">Provinsi</span>
              <span className="text-zinc-100 font-medium text-right truncate">
                {camera.province_name}
              </span>
            </div>
            <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400 shrink-0">Koordinat (Lat, Lng)</span>
              <span className="font-mono text-sky-400 text-right">
                {camera.latitude}, {camera.longitude}
              </span>
            </div>
            <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400 shrink-0">Protokol Streaming</span>
              <span className="font-mono text-zinc-200">{camera.protocol}</span>
            </div>
            <div className="flex justify-between gap-2 py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400 shrink-0">Status Saat Ini</span>
              <span
                className={`font-bold ${
                  camera.status === "ONLINE"
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {camera.status}
              </span>
            </div>
            <div className="flex justify-between gap-2 py-1">
              <span className="text-zinc-400 flex items-center gap-1 shrink-0">
                <Clock className="w-3.5 h-3.5" /> Verifikasi Terakhir
              </span>
              <span className="font-mono text-zinc-300 text-right">
                {new Date(camera.last_checked_at).toLocaleString("id-ID")}
              </span>
            </div>
          </div>

          {nearby.length > 0 && (
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Kamera Terdekat di Sekitar Lokasi
              </h3>
              <div className="divide-y divide-zinc-800/70">
                {nearby.map((nc) => (
                  <Link
                    key={nc.id}
                    href={`/kamera/${province}/${encodeURIComponent(nc.id)}`}
                    className="py-2 flex items-center justify-between gap-2 text-xs hover:text-sky-400 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{nc.name}</p>
                      <p className="text-[11px] text-zinc-400 flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 shrink-0" /> {nc.city_name}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-sky-400 shrink-0">
                      {nc.protocol}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
