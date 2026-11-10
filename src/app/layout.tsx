import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_CONFIG } from "@/lib/branding";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#09090b"
};

export const metadata: Metadata = {
  title: APP_CONFIG.title,
  applicationName: APP_CONFIG.name,
  description: APP_CONFIG.description,
  authors: [{ name: "Ganesha Ladesta" }],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: APP_CONFIG.primaryIcon,
        type: "image/webp"
      }
    ],
    shortcut: [APP_CONFIG.primaryIcon],
    apple: [
      {
        url: APP_CONFIG.primaryIcon,
        type: "image/webp"
      }
    ]
  },
  keywords: [
    "SCC - EAGLE EYES",
    "Eagle Eyes",
    "Bank Indonesia",
    "DLAF",
    "PAMBI",
    "CCTV Indonesia",
    "ATCS Indonesia",
    "Integrated Monitoring System",
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
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
