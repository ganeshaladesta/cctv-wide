"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Map as MapIcon,
  Grid,
  FolderTree,
  Building2,
  Menu,
  X,
  Eye,
  Info,
  ChevronRight,
  Heart
} from "lucide-react";
import { APP_CONFIG } from "@/lib/branding";
import { useFavorites } from "@/lib/hooks";
import { EagleEyesLogo } from "@/components/motion-ui";

export type DashboardTab =
  | "map"
  | "multiview"
  | "directory"
  | "provinces"
  | "favorites";

interface AppBrandingProps {
  compact?: boolean;
  subtitleOverride?: string;
}

export function AppBranding({
  compact = false,
  subtitleOverride
}: AppBrandingProps) {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 sm:gap-3 min-w-0 group focus:outline-none"
    >
      {/* Primary Application Identity Icon — Eagle Eyes Logo Only */}
      <EagleEyesLogo size="md" />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-sm sm:text-base lg:text-lg font-extrabold tracking-tight text-white truncate">
            {APP_CONFIG.name}
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 border border-[#252A35] text-zinc-200 text-[10px] font-mono uppercase font-semibold shrink-0">
            <Eye className="w-3 h-3 text-white" />
            <span className="hidden xs:inline">Integrated</span> Surveillance
          </span>
        </div>
        {!compact && (
          <p className="text-[11px] text-zinc-400 truncate max-w-[220px] sm:max-w-[380px] md:max-w-[460px] xl:max-w-[540px]">
            {subtitleOverride || APP_CONFIG.description}
          </p>
        )}
      </div>
    </Link>
  );
}

interface InstitutionalLogosProps {
  size?: "sm" | "md";
  className?: string;
}

export function InstitutionalLogos({
  size = "md",
  className = ""
}: InstitutionalLogosProps) {
  const imgHeight =
    size === "sm"
      ? "h-4 sm:h-5 max-w-[68px] sm:max-w-[84px]"
      : "h-5 sm:h-6 max-w-[78px] sm:max-w-[96px]";

  return (
    <div
      data-testid="institutional-logos"
      aria-label="Institutional Logos: Bank Indonesia, DLAF, PAMBI"
      className={`flex items-center gap-1.5 sm:gap-2 shrink-0 ${className}`}
    >
      {/* Logo 1: Bank Indonesia */}
      <div
        title={APP_CONFIG.logos.bankIndonesia.name}
        className="h-7 sm:h-8 px-2 py-1 rounded-md bg-white/95 border border-zinc-300/80 flex items-center justify-center shadow-xs"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={APP_CONFIG.logos.bankIndonesia.src}
          alt={APP_CONFIG.logos.bankIndonesia.alt}
          className={`${imgHeight} w-auto object-contain`}
          style={{ objectFit: "contain" }}
        />
      </div>

      {/* Logo 2: DLAF */}
      <div
        title={APP_CONFIG.logos.dlaf.name}
        className="h-7 sm:h-8 px-2 py-1 rounded-md bg-white/95 border border-zinc-300/80 flex items-center justify-center shadow-xs"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={APP_CONFIG.logos.dlaf.src}
          alt={APP_CONFIG.logos.dlaf.alt}
          className={`${imgHeight} w-auto object-contain`}
          style={{ objectFit: "contain" }}
        />
      </div>

      {/* Logo 3: PAMBI */}
      <div
        title={APP_CONFIG.logos.pambi.name}
        className="h-7 sm:h-8 px-2 py-1 rounded-md bg-white/95 border border-zinc-300/80 flex items-center justify-center shadow-xs"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={APP_CONFIG.logos.pambi.src}
          alt={APP_CONFIG.logos.pambi.alt}
          className={`${imgHeight} w-auto object-contain`}
          style={{ objectFit: "contain" }}
        />
      </div>
    </div>
  );
}

interface MobileNavigationProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: DashboardTab;
  onSelectTab?: (tab: DashboardTab) => void;
  multiViewCount?: number;
  favoritesCount?: number;
}

export function MobileNavigation({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  multiViewCount = 0,
  favoritesCount = 0
}: MobileNavigationProps) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("resize"));
    }
  }, [isOpen]);

  const handleTabClick = (tab: DashboardTab) => {
    onSelectTab?.(tab);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="mobile-navigation-drawer"
          data-testid="mobile-navigation-drawer"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="xl:hidden border-t border-[#252A35] bg-[#090B10]/98 px-3 py-3 space-y-3 overflow-hidden"
        >
          {onSelectTab ? (
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleTabClick("map")}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  activeTab === "map"
                    ? "bg-sky-600 text-white shadow"
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <MapIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Peta Interaktif</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabClick("multiview")}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  activeTab === "multiview"
                    ? "bg-sky-600 text-white shadow"
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <Grid className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Multi-View ({multiViewCount})</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabClick("directory")}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  activeTab === "directory"
                    ? "bg-sky-600 text-white shadow"
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <FolderTree className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Direktori Kamera</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabClick("provinces")}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  activeTab === "provinces"
                    ? "bg-sky-600 text-white shadow"
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">38 Provinsi & Sumber</span>
              </button>

              <button
                type="button"
                data-testid="mobile-nav-favorites"
                onClick={() => handleTabClick("favorites")}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  activeTab === "favorites"
                    ? "bg-sky-600 text-white shadow"
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <Heart
                  className={`w-3.5 h-3.5 shrink-0 ${
                    favoritesCount > 0 ? "fill-white text-white" : ""
                  }`}
                />
                <span className="truncate">
                  Favorite CCTV ({favoritesCount})
                </span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xs:grid-cols-3 gap-1.5">
              <Link
                href="/"
                onClick={onClose}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-zinc-200"
              >
                <MapIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Command Center</span>
              </Link>
              <Link
                href="/favorites"
                onClick={onClose}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-zinc-200"
              >
                <Heart className="w-3.5 h-3.5 text-white shrink-0" />
                <span>Favorite CCTV ({favoritesCount})</span>
              </Link>
              <Link
                href="/kamera"
                onClick={onClose}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-zinc-200"
              >
                <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Direktori 38 Provinsi</span>
              </Link>
            </div>
          )}

          <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
            <Link
              href="/about"
              onClick={onClose}
              className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-medium"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Tentang {APP_CONFIG.name}</span>
            </Link>
            <span className="text-zinc-500">{APP_CONFIG.copyright}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface ResponsiveHeaderProps {
  activeTab?: DashboardTab;
  onSelectTab?: (tab: DashboardTab) => void;
  multiViewCount?: number;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  rightActions?: React.ReactNode;
}

export function ResponsiveHeader({
  activeTab,
  onSelectTab,
  multiViewCount = 0,
  breadcrumbs,
  rightActions
}: ResponsiveHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { favorites } = useFavorites();

  const navItems: Array<{
    tab: DashboardTab;
    label: string;
    icon: React.ReactNode;
    testId?: string;
  }> = [
    {
      tab: "map",
      label: "Peta Interaktif",
      icon: <MapIcon className="w-3.5 h-3.5" />
    },
    {
      tab: "multiview",
      label: `Multi-View (${multiViewCount})`,
      icon: <Grid className="w-3.5 h-3.5" />
    },
    {
      tab: "directory",
      label: "Direktori Kamera",
      icon: <FolderTree className="w-3.5 h-3.5" />
    },
    {
      tab: "provinces",
      label: "38 Provinsi & Sumber",
      icon: <Building2 className="w-3.5 h-3.5" />
    },
    {
      tab: "favorites",
      label: `Favorite CCTV (${favorites.length})`,
      testId: "nav-tab-favorites",
      icon: (
        <Heart
          className={`w-3.5 h-3.5 ${
            favorites.length > 0 ? "fill-white text-white" : ""
          }`}
        />
      )
    }
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#090B10]/95 backdrop-blur-xl border-b border-[#252A35]">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3">
        {/* Main Header Row */}
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Primary Application Identity */}
          <div className="min-w-0 flex-1">
            <AppBranding />
          </div>

          {/* Center-Right: Institutional Logos on Tablet/Desktop */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <InstitutionalLogos size="md" />
          </div>

          {/* Right: Desktop Navigation Tabs or Custom Actions */}
          {onSelectTab ? (
            <nav
              aria-label="Main Navigation"
              className="hidden xl:flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-[#252A35] shrink-0"
            >
              {navItems.map((item) => {
                const isActive = activeTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    type="button"
                    data-testid={item.testId}
                    onClick={() => onSelectTab(item.tab)}
                    className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                      isActive
                        ? "text-white"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="header-nav-active-pill"
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 32
                        }}
                        className="absolute inset-0 rounded-lg bg-sky-600 shadow"
                      />
                    )}
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      {item.icon}
                      <span>{item.label}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          ) : (
            <div className="hidden xl:flex items-center gap-2 shrink-0">
              {rightActions || (
                <>
                  <Link
                    href="/favorites"
                    data-testid="header-link-favorites"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-[#252A35] text-xs font-medium text-zinc-200 transition"
                  >
                    <Heart
                      className={`w-3.5 h-3.5 ${
                        favorites.length > 0 ? "fill-white text-white" : ""
                      }`}
                    />
                    <span>Favorite CCTV ({favorites.length})</span>
                  </Link>
                  <Link
                    href="/kamera"
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-[#252A35] text-xs font-medium text-zinc-200 transition"
                  >
                    Direktori 38 Provinsi
                  </Link>
                  <Link
                    href="/"
                    className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white transition"
                  >
                    Command Center
                  </Link>
                </>
              )}
            </div>
          )}

          {/* Mobile/Tablet Hamburger Button (< xl) */}
          <button
            type="button"
            aria-label="Toggle Menu Navigasi"
            data-testid="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="xl:hidden p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-[#252A35] text-zinc-200 shrink-0 transition"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5 text-white" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Mobile Institutional Logos Sub-bar (< md) */}
        <div className="flex md:hidden items-center justify-between gap-2 mt-2 pt-2 border-t border-zinc-800/70 overflow-x-auto">
          <InstitutionalLogos size="sm" />
          <span className="text-[10px] font-mono text-zinc-300 uppercase tracking-wider shrink-0">
            Real-Time Monitoring
          </span>
        </div>

        {/* Optional Breadcrumb Bar for Directory / Detail Pages */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="mt-2 pt-2 border-t border-zinc-800/70 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
            <div className="flex flex-wrap items-center gap-1 min-w-0">
              <Link href="/" className="hover:text-sky-400 shrink-0">
                {APP_CONFIG.name}
              </Link>
              {breadcrumbs.map((bc, idx) => (
                <React.Fragment key={idx}>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                  {bc.href ? (
                    <Link
                      href={bc.href}
                      className="hover:text-sky-400 truncate max-w-[160px] sm:max-w-[240px]"
                    >
                      {bc.label}
                    </Link>
                  ) : (
                    <span className="text-white font-medium truncate max-w-[180px] sm:max-w-[280px]">
                      {bc.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </div>
            {rightActions && (
              <div className="flex xl:hidden items-center gap-1.5 flex-wrap">
                {rightActions}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Collapsible Mobile Navigation Drawer */}
      <MobileNavigation
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        multiViewCount={multiViewCount}
        favoritesCount={favorites.length}
      />
    </header>
  );
}

export const ResponsiveNavigation = ResponsiveHeader;

export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-[#252A35] bg-[#090B10] px-3 sm:px-4 lg:px-6 py-4 text-xs text-zinc-400">
      <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <EagleEyesLogo size="sm" animateHover={false} />
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-zinc-100">{APP_CONFIG.name}</span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-300 font-semibold">
                {APP_CONFIG.copyright}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500">
              {APP_CONFIG.description}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-[11px] shrink-0">
          <Link href="/" className="hover:text-white transition">
            Command Center
          </Link>
          <Link href="/favorites" className="hover:text-white transition">
            Favorite CCTV
          </Link>
          <Link href="/kamera" className="hover:text-white transition">
            Direktori 38 Provinsi
          </Link>
          <Link href="/about" className="hover:text-white transition">
            Tentang Sistem
          </Link>
          <a
            href="/api/stats"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white font-mono transition"
          >
            API Statistik
          </a>
          <a
            href="/api/sources"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white font-mono transition"
          >
            API Sumber
          </a>
        </div>
      </div>
    </footer>
  );
}
