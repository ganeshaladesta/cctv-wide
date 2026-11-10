import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronRight,
  Radio,
  MapPin,
  Shield,
  ExternalLink,
  Clock
} from "lucide-react";
import { getDataStore } from "@/lib/data-store";
import CCTVPlayer from "@/components/cctv-player";

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-900/80 px-4 lg:px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white"
            >
              <Radio className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                <Link href="/" className="hover:text-emerald-400">
                  Indonesia
                </Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <Link
                  href={`/kamera/${province}`}
                  className="hover:text-emerald-400"
                >
                  {camera.province_name}
                </Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-zinc-300">{camera.city_name}</span>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-emerald-400 font-medium truncate max-w-[220px]">
                  {camera.name}
                </span>
              </div>
              <h1 className="text-lg font-extrabold text-white mt-0.5">
                {camera.name}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/kamera/${province}`}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200"
            >
              ← Provinsi {camera.province_name}
            </Link>
            <Link
              href={`/?view=multiview&multi=${encodeURIComponent(camera.id)}`}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
            >
              Buka di Multi-View
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <div className="h-[420px] sm:h-[500px] rounded-xl overflow-hidden">
            <CCTVPlayer camera={camera} />
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-zinc-300">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>
                Sumber Resmi:{" "}
                <strong className="text-white">{camera.source_name}</strong>
              </span>
            </div>
            <a
              href={camera.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-medium"
            >
              <span>Buka Website Resmi Instansi</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2.5 text-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 border-b border-zinc-800 pb-2">
              Metadata & Spesifikasi Kamera
            </h2>
            <div className="flex justify-between py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400">ID Kamera</span>
              <span className="font-mono text-zinc-200">{camera.id}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400">Lokasi / Jalan</span>
              <span className="text-zinc-100 font-medium text-right">
                {camera.location}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400">Kota / Kabupaten</span>
              <span className="text-zinc-100 font-medium">
                {camera.city_name}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400">Provinsi</span>
              <span className="text-zinc-100 font-medium">
                {camera.province_name}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400">Koordinat (Lat, Lng)</span>
              <span className="font-mono text-emerald-400">
                {camera.latitude}, {camera.longitude}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400">Protokol Streaming</span>
              <span className="font-mono text-zinc-200">{camera.protocol}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-800/60">
              <span className="text-zinc-400">Status Saat Ini</span>
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
            <div className="flex justify-between py-1">
              <span className="text-zinc-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Verifikasi Terakhir
              </span>
              <span className="font-mono text-zinc-300">
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
                    className="py-2 flex items-center justify-between gap-2 text-xs hover:text-emerald-400 transition"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{nc.name}</p>
                      <p className="text-[11px] text-zinc-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {nc.city_name}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 shrink-0">
                      {nc.protocol}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-4 lg:px-6 py-4 text-center text-xs text-zinc-400">
        PANTAU NUSANTARA — Developed by Ganesha Ladesta.
      </footer>
    </div>
  );
}

