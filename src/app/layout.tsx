import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { APP_CONFIG } from "@/lib/branding";
import { MotionProvider, LoadingOverlay } from "@/components/motion-ui";
import { CodexRevealBackground } from "@/components/codex-reveal-background";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap"
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07090D"
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
    "CCTV Indonesia",
    "ATCS Indonesia",
    "Integrated Monitoring System",
    "Surveillance Command Center",
    "Ganesha Ladesta"
  ]
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`dark ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen font-sans text-[#F3F6FB] antialiased overflow-x-hidden relative bg-transparent">
        <MotionProvider>
          <CodexRevealBackground />
          <LoadingOverlay durationMs={5000} />
          <div className="relative z-[1] min-h-screen flex flex-col">
            {children}
          </div>
        </MotionProvider>
      </body>
    </html>
  );
}
