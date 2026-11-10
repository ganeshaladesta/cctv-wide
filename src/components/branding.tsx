"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Map as MapIcon,
  Grid,
  FolderTree,
  Building2,
  Menu,
  X,
  Info,
  ChevronRight,
  Heart,
  Radio,
  ArrowUpRight
} from "lucide-react";
import { APP_CONFIG } from "@/lib/branding";
import { useFavorites, usePrefersReducedMotion } from "@/lib/hooks";
import { EagleEyesLogo } from "@/components/motion-ui";
import { EASE_STANDARD, SPRINGS } from "@/lib/motion";

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
      className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] rounded-xl"
    >
      {/* Official Unboxed Eagle Eyes Emblem — Larger & Transparent */}
      <EagleEyesLogo size="md" />

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs xs:text-sm sm:text-base font-bold tracking-[0.06em] uppercase text-[#F3F6FB] truncate">
            {APP_CONFIG.name}
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] border border-[var(--border-subtle)] text-[#98A4B8] text-[10px] font-mono uppercase tracking-wider shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            <span>Live Command</span>
          </span>
        </div>
        {!compact && (
          <p className="text-[11px] text-[#98A4B8] truncate max-w-[190px] xs:max-w-[260px] sm:max-w-[360px] lg:max-w-[440px]">
            {subtitleOverride || APP_CONFIG.subtitle}
          </p>
        )}
      </div>
    </Link>
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
  const pathname = usePathname();

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
          transition={SPRINGS.drawer}
          className="xl:hidden border-t border-[var(--border-subtle)] bg-[#090C12]/95 px-3 sm:px-4 py-3 space-y-3 overflow-hidden"
        >
          {onSelectTab ? (
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleTabClick("map")}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === "map"
                    ? "bg-[#3B82F6]/20 border border-[#3B82F6]/45 text-white"
                    : "bg-[#111622] border border-[var(--border-subtle)] text-[#98A4B8] hover:text-white hover:bg-[#161C2B]"
                }`}
              >
                <MapIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Peta Interaktif</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabClick("multiview")}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === "multiview"
                    ? "bg-[#3B82F6]/20 border border-[#3B82F6]/45 text-white"
                    : "bg-[#111622] border border-[var(--border-subtle)] text-[#98A4B8] hover:text-white hover:bg-[#161C2B]"
                }`}
              >
                <Grid className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Multi-View ({multiViewCount})</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabClick("directory")}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === "directory"
                    ? "bg-[#3B82F6]/20 border border-[#3B82F6]/45 text-white"
                    : "bg-[#111622] border border-[var(--border-subtle)] text-[#98A4B8] hover:text-white hover:bg-[#161C2B]"
                }`}
              >
                <FolderTree className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Direktori Kamera</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabClick("provinces")}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === "provinces"
                    ? "bg-[#3B82F6]/20 border border-[#3B82F6]/45 text-white"
                    : "bg-[#111622] border border-[var(--border-subtle)] text-[#98A4B8] hover:text-white hover:bg-[#161C2B]"
                }`}
              >
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">38 Provinsi & Sumber</span>
              </button>

              <button
                type="button"
                data-testid="mobile-nav-favorites"
                onClick={() => handleTabClick("favorites")}
                className={`w-full xs:col-span-2 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === "favorites"
                    ? "bg-[#3B82F6]/20 border border-[#3B82F6]/45 text-white"
                    : "bg-[#111622] border border-[var(--border-subtle)] text-[#98A4B8] hover:text-white hover:bg-[#161C2B]"
                }`}
              >
                <Heart
                  className={`w-3.5 h-3.5 shrink-0 ${
                    favoritesCount > 0 ? "fill-[#60A5FA] text-[#60A5FA]" : ""
                  }`}
                />
                <span className="truncate">
                  Favorite CCTV ({favoritesCount})
                </span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-1.5">
              <Link
                href="/"
                onClick={onClose}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                  pathname === "/"
                    ? "bg-[#3B82F6]/20 border-[#3B82F6]/45 text-white"
                    : "bg-[#111622] border-[var(--border-subtle)] text-[#E2E8F0] hover:bg-[#161C2B]"
                }`}
              >
                <MapIcon className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
                <span>Command Center</span>
              </Link>
              <Link
                href="/favorites"
                onClick={onClose}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                  pathname?.startsWith("/favorites")
                    ? "bg-[#3B82F6]/20 border-[#3B82F6]/45 text-white"
                    : "bg-[#111622] border-[var(--border-subtle)] text-[#E2E8F0] hover:bg-[#161C2B]"
                }`}
              >
                <Heart className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
                <span>Favorite CCTV ({favoritesCount})</span>
              </Link>
              <Link
                href="/kamera"
                onClick={onClose}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                  pathname?.startsWith("/kamera")
                    ? "bg-[#3B82F6]/20 border-[#3B82F6]/45 text-white"
                    : "bg-[#111622] border-[var(--border-subtle)] text-[#E2E8F0] hover:bg-[#161C2B]"
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-[#E2E8F0] shrink-0" />
                <span>Direktori 38 Provinsi</span>
              </Link>
              <Link
                href="/about"
                onClick={onClose}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                  pathname?.startsWith("/about")
                    ? "bg-[#3B82F6]/20 border-[#3B82F6]/45 text-white"
                    : "bg-[#111622] border-[var(--border-subtle)] text-[#E2E8F0] hover:bg-[#161C2B]"
                }`}
              >
                <Info className="w-3.5 h-3.5 text-[#98A4B8] shrink-0" />
                <span>Tentang Sistem</span>
              </Link>
            </div>
          )}

          <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#98A4B8]">
            {onSelectTab ? (
              <Link
                href="/about"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 text-[#E2E8F0] hover:text-white font-medium"
              >
                <Info className="w-3.5 h-3.5 text-[#60A5FA]" />
                <span>Tentang {APP_CONFIG.name}</span>
              </Link>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#98A4B8]">
                {APP_CONFIG.subtitle}
              </span>
            )}
            <span className="text-[#657287]">{APP_CONFIG.copyright}</span>
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

/**
 * Breathing Navbar (adapted from Framer zaglB4 + NavLinkPill).
 * Floating obsidian glass shell with restrained ambient horizontal drift,
 * unboxed Eagle Eyes emblem, pill active indicators, and cohesive mobile drawer.
 */
export function ResponsiveHeader({
  activeTab,
  onSelectTab,
  multiViewCount = 0,
  breadcrumbs,
  rightActions
}: ResponsiveHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { favorites } = useFavorites();
  const pathname = usePathname();
  const prefersReducedMotion = usePrefersReducedMotion();

  const tabNavItems: Array<{
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
      label: "38 Provinsi",
      icon: <Building2 className="w-3.5 h-3.5" />
    },
    {
      tab: "favorites",
      label: `Favorite (${favorites.length})`,
      testId: "nav-tab-favorites",
      icon: (
        <Heart
          className={`w-3.5 h-3.5 ${
            favorites.length > 0 ? "fill-[#60A5FA] text-[#60A5FA]" : ""
          }`}
        />
      )
    }
  ];

  const routeNavItems = [
    {
      href: "/",
      label: "Command Center",
      icon: <MapIcon className="w-3.5 h-3.5" />,
      active: pathname === "/"
    },
    {
      href: "/favorites",
      label: `Favorite CCTV (${favorites.length})`,
      icon: (
        <Heart
          className={`w-3.5 h-3.5 ${
            favorites.length > 0 ? "fill-[#60A5FA] text-[#60A5FA]" : ""
          }`}
        />
      ),
      active: pathname?.startsWith("/favorites"),
      testId: "header-link-favorites"
    },
    {
      href: "/kamera",
      label: "38 Provinsi",
      icon: <Building2 className="w-3.5 h-3.5" />,
      active: pathname?.startsWith("/kamera")
    },
    {
      href: "/about",
      label: "Tentang Sistem",
      icon: <Info className="w-3.5 h-3.5" />,
      active: pathname?.startsWith("/about")
    }
  ];

  return (
    <header className="sticky top-0 z-[60] pointer-events-none px-2.5 sm:px-4 lg:px-6 pt-2 sm:pt-2.5">
      <nav
        aria-label="Navigasi Utama"
        className="pointer-events-auto relative max-w-[1600px] mx-auto rounded-2xl ee-shell-surface overflow-x-clip"
      >
        {/* Subtle Restrained Breathing Ambient Glow Inside Shell */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        >
          <div
            className="ee-breathe-ambient absolute -top-12 left-6 w-64 sm:w-80 h-28 rounded-full"
            style={{
              background:
                "radial-gradient(50% 50% at 50% 50%, rgba(59, 130, 246, 0.22) 0%, rgba(59, 130, 246, 0) 100%)",
              filter: "blur(26px)"
            }}
          />
        </div>

        <div className="relative z-[1] px-3 sm:px-4 lg:px-5 py-2 sm:py-2.5">
          {/* Primary Navbar Row */}
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Left: Unboxed Eagle Eyes Logo + Application Title */}
            <div className="min-w-0 flex-1">
              <AppBranding />
            </div>

            {/* Right Desktop NavLinkPill Strip (xl+) */}
            {onSelectTab ? (
              <div className="hidden xl:flex items-center gap-1 rounded-xl bg-white/[0.03] border border-[var(--border-subtle)] p-1 shrink-0">
                {tabNavItems.map((item) => {
                  const isActive = activeTab === item.tab;
                  return (
                    <motion.button
                      key={item.tab}
                      type="button"
                      data-testid={item.testId}
                      onClick={() => onSelectTab(item.tab)}
                      whileHover={
                        !prefersReducedMotion ? { y: -1 } : undefined
                      }
                      whileTap={{ scale: 0.97 }}
                      transition={SPRINGS.snappy}
                      className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] ${
                        isActive
                          ? "text-white"
                          : "text-[#98A4B8] hover:text-[#F3F6FB]"
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="header-nav-active-pill"
                          transition={SPRINGS.pill}
                          className="absolute inset-0 rounded-lg bg-[#3B82F6]/20 border border-[#3B82F6]/45"
                        />
                      )}
                      <span className="relative z-10 inline-flex items-center gap-1.5">
                        {item.icon}
                        <span>{item.label}</span>
                      </span>
                    </motion.button>
                  );
                })}
                <Link
                  href="/about"
                  title="Tentang Sistem"
                  className="ml-0.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#98A4B8] hover:text-white hover:bg-white/[0.06] transition-colors inline-flex items-center gap-1"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>Tentang</span>
                </Link>
              </div>
            ) : (
              <div className="hidden xl:flex items-center gap-1.5 shrink-0">
                <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] border border-[var(--border-subtle)] p-1">
                  {routeNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-testid={item.testId}
                      className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        item.active
                          ? "text-white bg-[#3B82F6]/20 border border-[#3B82F6]/45"
                          : "text-[#98A4B8] hover:text-[#F3F6FB] hover:bg-white/[0.05]"
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
                {rightActions && (
                  <div className="flex items-center gap-1.5 pl-1">
                    {rightActions}
                  </div>
                )}
              </div>
            )}

            {/* Mobile/Tablet Hamburger Button (< xl) */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              aria-label="Toggle Menu Navigasi"
              aria-expanded={mobileMenuOpen}
              data-testid="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="xl:hidden p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-[var(--border-default)] text-[#F3F6FB] shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-white" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </motion.button>
          </div>

          {/* Optional Breadcrumb & Context Action Row */}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs text-[#98A4B8]">
              <div className="flex flex-wrap items-center gap-1 min-w-0">
                <Link
                  href="/"
                  className="hover:text-[#60A5FA] shrink-0 transition-colors"
                >
                  {APP_CONFIG.name}
                </Link>
                {breadcrumbs.map((bc, idx) => (
                  <React.Fragment key={idx}>
                    <ChevronRight className="w-3.5 h-3.5 text-[#657287] shrink-0" />
                    {bc.href ? (
                      <Link
                        href={bc.href}
                        className="hover:text-[#60A5FA] truncate max-w-[150px] sm:max-w-[240px] transition-colors"
                      >
                        {bc.label}
                      </Link>
                    ) : (
                      <span className="text-[#F3F6FB] font-medium truncate max-w-[180px] sm:max-w-[300px]">
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

        {/* Collapsible Mobile Drawer */}
        <MobileNavigation
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          multiViewCount={multiViewCount}
          favoritesCount={favorites.length}
        />
      </nav>
    </header>
  );
}

export const ResponsiveNavigation = ResponsiveHeader;

function FooterPillLink({
  href,
  label,
  external = false
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  const baseClass =
    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-[#98A4B8] hover:text-[#F3F6FB] hover:bg-white/[0.06] transition-all duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]";

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClass} font-mono`}
      >
        <span>{label}</span>
        <ArrowUpRight className="w-3 h-3 opacity-60 shrink-0" />
      </a>
    );
  }

  return (
    <Link href={href} className={baseClass}>
      <span>{label}</span>
    </Link>
  );
}

/**
 * Breathing Footer (adapted from Framer aoASzs + FooterLink).
 * Matches the Breathing Navbar glass shell, removes fake social links,
 * preserves clean Eagle Eyes branding, and includes only real application links.
 */
export function AppFooter() {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <footer
      data-testid="app-footer"
      className="mt-auto w-full px-2.5 sm:px-4 lg:px-6 pt-6 pb-6 sm:pb-8"
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0.9, y: 6 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: "some" }}
        transition={{ duration: 0.35, ease: EASE_STANDARD }}
        className="relative max-w-[1600px] mx-auto rounded-2xl sm:rounded-3xl ee-shell-surface overflow-hidden"
      >
        {/* Subtle Restrained Breathing Glows Inside Shell */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        >
          <div
            className="ee-breathe-ambient absolute -bottom-16 -left-6 w-72 sm:w-96 h-40 rounded-full"
            style={{
              background:
                "radial-gradient(50% 50% at 50% 50%, rgba(59, 130, 246, 0.16) 0%, rgba(59, 130, 246, 0) 100%)",
              filter: "blur(32px)"
            }}
          />
          <div
            className="ee-breathe-ambient absolute -top-12 right-6 w-64 sm:w-80 h-32 rounded-full"
            style={{
              background:
                "radial-gradient(50% 50% at 50% 50%, rgba(226, 232, 240, 0.08) 0%, rgba(226, 232, 240, 0) 100%)",
              filter: "blur(30px)",
              animationDelay: "1.8s"
            }}
          />
        </div>

        <div className="relative z-[1] px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-6">
          {/* Top Row: Brand Identity + Bank Indonesia Attribution + Real Navigation Columns */}
          <div className="flex flex-col md:flex-row items-start justify-between gap-6 sm:gap-8">
            {/* Brand & Institutional Identity */}
            <div className="space-y-4 max-w-md min-w-0">
              <div className="flex items-center gap-3">
                <EagleEyesLogo size="md" animateHover={false} />
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-bold tracking-[0.06em] uppercase text-[#F3F6FB] truncate">
                    {APP_CONFIG.name}
                  </p>
                  <p className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#98A4B8]">
                    {APP_CONFIG.subtitle}
                  </p>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-[#98A4B8]">
                {APP_CONFIG.description}
              </p>

              {/* Restrained Bank Indonesia Institutional Identity */}
              <div
                data-testid="footer-institutional-identity"
                className="pt-3.5 border-t border-[var(--border-subtle)] flex items-center gap-3 min-w-0"
              >
                <svg
                  width="0"
                  height="0"
                  aria-hidden="true"
                  focusable="false"
                  className="absolute pointer-events-none"
                >
                  <defs>
                    <filter
                      id="ee-bi-alpha-knockout"
                      colorInterpolationFilters="sRGB"
                    >
                      <feColorMatrix
                        type="matrix"
                        values="0 0 0 0 0.953  0 0 0 0 0.965  0 0 0 0 0.984  0.78 0.78 0.78 0 -0.38"
                      />
                    </filter>
                  </defs>
                </svg>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={APP_CONFIG.institutional.logoPath}
                  alt={APP_CONFIG.institutional.ownerName}
                  data-testid="bank-indonesia-footer-logo"
                  width={768}
                  height={768}
                  className="w-11 h-11 sm:w-12 sm:h-12 object-contain shrink-0 select-none bg-transparent"
                  style={{
                    filter: "url(#ee-bi-alpha-knockout)"
                  }}
                />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs font-semibold text-[#F3F6FB] tracking-[0.01em] leading-snug">
                    {APP_CONFIG.institutional.propertyOfText}
                  </p>
                  <p className="text-[11px] font-medium text-[#E2E8F0] leading-snug">
                    {APP_CONFIG.institutional.poweredByText}
                  </p>
                  <p className="text-[11px] font-mono text-[#98A4B8] leading-snug">
                    {APP_CONFIG.institutional.developedByText}
                  </p>
                </div>
              </div>
            </div>

            {/* Structured Real Application Columns */}
            <div className="grid grid-cols-2 gap-6 sm:gap-12 w-full md:w-auto">
              <div className="space-y-1.5">
                <h3 className="px-2.5 text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-[#60A5FA]">
                  Navigasi
                </h3>
                <ul className="space-y-0.5 list-none m-0 p-0">
                  <li>
                    <FooterPillLink href="/" label="Command Center" />
                  </li>
                  <li>
                    <FooterPillLink href="/favorites" label="Favorite CCTV" />
                  </li>
                  <li>
                    <FooterPillLink
                      href="/kamera"
                      label="Direktori 38 Provinsi"
                    />
                  </li>
                  <li>
                    <FooterPillLink href="/about" label="Tentang Sistem" />
                  </li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <h3 className="px-2.5 text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-[#E2E8F0]">
                  Data & Telemetri
                </h3>
                <ul className="space-y-0.5 list-none m-0 p-0">
                  <li>
                    <FooterPillLink
                      href="/?view=multiview"
                      label="Multi-View Wall"
                    />
                  </li>
                  <li>
                    <FooterPillLink
                      href="/api/stats"
                      label="API Statistik"
                      external
                    />
                  </li>
                  <li>
                    <FooterPillLink
                      href="/api/sources"
                      label="API Sumber"
                      external
                    />
                  </li>
                  <li>
                    <FooterPillLink
                      href="/api/provinces"
                      label="API 38 Provinsi"
                      external
                    />
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Hairline Divider */}
          <div className="h-px w-full bg-[var(--border-subtle)]" />

          {/* Bottom Copyright & Operational Attribution */}
          <div
            data-testid="footer-copyright-bar"
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-[#98A4B8]"
          >
            <p className="text-[#98A4B8]">
              © 2026{" "}
              <span className="text-[#E2E8F0] font-medium">
                {APP_CONFIG.name}
              </span>
              . {APP_CONFIG.copyright}
            </p>
            <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#98A4B8]">
              <Radio className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
              <span>38 Provinsi Indonesia • Pemantauan Real-Time</span>
            </div>
          </div>
        </div>
      </motion.div>
    </footer>
  );
}
