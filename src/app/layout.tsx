import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:
    "PANTAU NUSANTARA — Pemantauan CCTV Lalu Lintas & Publik 38 Provinsi Indonesia",
  description:
    "Platform pemantauan 23.355+ kamera CCTV lalu lintas (ATCS Dishub, Diskominfo, Bina Marga, Jasa Marga) di seluruh 38 Provinsi Indonesia. Gratis, tanpa batas waktu, dilengkapi Multi-View & Peta Interaktif. Developed by Ganesha Ladesta.",
  authors: [{ name: "Ganesha Ladesta" }],
  keywords: [
    "CCTV Indonesia",
    "ATCS Indonesia",
    "Pantau Nusantara",
    "CCTV Lalu Lintas",
    "Dishub ATCS",
    "CCTV Jalan Tol",
    "Ganesha Ladesta"
  ]
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}

