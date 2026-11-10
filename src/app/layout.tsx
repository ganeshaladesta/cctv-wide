import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_CONFIG } from "@/lib/branding";
import { LoadingOverlay } from "@/components/motion-ui";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#090B10"
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
        url: APP_CONFIG.favicons.ico,
        sizes: "any"
      },
      {
        url: APP_CONFIG.favicons.png32,
        sizes: "32x32",
        type: "image/png"
      },
      {
        url: APP_CONFIG.favicons.png16,
        sizes: "16x16",
        type: "image/png"
      },
      {
        url: APP_CONFIG.favicons.icon192,
        sizes: "192x192",
        type: "image/png"
      },
      {
        url: APP_CONFIG.favicons.icon512,
        sizes: "512x512",
        type: "image/png"
      }
    ],
    shortcut: [APP_CONFIG.favicons.ico],
    apple: [
      {
        url: APP_CONFIG.favicons.appleTouch,
        sizes: "180x180",
        type: "image/png"
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
        <LoadingOverlay durationMs={5000} />
        {children}
      </body>
    </html>
  );
}
