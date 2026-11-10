import type { Metadata } from "next";
import { APP_CONFIG } from "@/lib/branding";
import { ResponsiveHeader, AppFooter } from "@/components/branding";
import { FavoritesPage } from "@/components/favorites-view";

export const metadata: Metadata = {
  title: `Favorite CCTV | ${APP_CONFIG.name}`,
  description: `Daftar kamera CCTV favorit Anda di ${APP_CONFIG.name} — ${APP_CONFIG.description}`
};

export default function FavoritesRoutePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <ResponsiveHeader
        breadcrumbs={[{ label: "Favorite CCTV" }]}
      />
      <main className="max-w-[1600px] w-full mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 flex-1">
        <FavoritesPage />
      </main>
      <AppFooter />
    </div>
  );
}

