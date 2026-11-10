"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useId,
  useCallback,
  useRef
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { Heart, ChevronDown, Check, Search, X } from "lucide-react";
import { APP_CONFIG } from "@/lib/branding";
import {
  useFavorites,
  useFirstLoad,
  useDropdown,
  usePrefersReducedMotion
} from "@/lib/hooks";
import {
  EASE_STANDARD,
  EASE_CURTAIN,
  DURATIONS,
  SPRINGS,
  getProgramsEntranceDelay
} from "@/lib/motion";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export interface EagleEyesLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  animateHover?: boolean;
}

/**
 * Unboxed official SCC - EAGLE EYES emblem rendered cleanly without
 * any surrounding card box, border, or container frame.
 */
export function EagleEyesLogo({
  size = "md",
  className = "",
  animateHover = true
}: EagleEyesLogoProps) {
  const sizeClasses = {
    sm: "w-8 h-8 sm:w-9 sm:h-9",
    md: "w-10 h-10 sm:w-12 sm:h-12",
    lg: "w-16 h-16 sm:w-[72px] sm:h-[72px]",
    xl: "w-24 h-24 sm:w-28 sm:h-28"
  }[size];

  return (
    <motion.div
      whileHover={animateHover ? { scale: 1.04 } : undefined}
      transition={SPRINGS.snappy}
      data-testid="eagle-eyes-logo-container"
      className={`relative bg-transparent flex items-center justify-center shrink-0 ${sizeClasses} ${className}`}
    >
      <picture className="w-full h-full flex items-center justify-center bg-transparent">
        <source srcSet={APP_CONFIG.primaryIconWebp} type="image/webp" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={APP_CONFIG.primaryIcon}
          alt={APP_CONFIG.name}
          data-testid="eagle-eyes-logo-img"
          className="w-full h-full object-contain select-none bg-transparent"
          style={{ objectFit: "contain", background: "transparent" }}
        />
      </picture>
    </motion.div>
  );
}

const LOADING_STATUS_LINES = [
  "MENGINISIALISASI INTI PENGAWASAN...",
  "MENGHUBUNGKAN JARINGAN 38 PROVINSI...",
  "MEMUAT DATA TELEMETRI KAMERA AKTIF...",
  "MENYIAPKAN PETA GEOSPASIAL & DIRECT HLS...",
  "MEMVERIFIKASI KESIAPAN COMMAND CENTER..."
];

export interface LoadingOverlayProps {
  durationMs?: number;
  forceShow?: boolean;
}

// Module-level singleton ID prevents duplicate loader overlays across mounts
let activeLoaderInstanceId: string | null = null;

/**
 * Adapted Framer LoadingOverlay (JDvhQN):
 * 3-zone asymmetric telemetry layout, sequential line character reveal,
 * tabular progress readout, unboxed official Eagle Eyes emblem,
 * and upward curtain exit. Respects both minimum duration and app readiness.
 */
export function LoadingOverlay({
  durationMs = 5000,
  forceShow = false
}: LoadingOverlayProps) {
  const instanceId = useId();
  const [isPrimaryInstance, setIsPrimaryInstance] = useState(false);

  useEffect(() => {
    if (!activeLoaderInstanceId) {
      activeLoaderInstanceId = instanceId;
      setIsPrimaryInstance(true);
    }
    return () => {
      if (activeLoaderInstanceId === instanceId) {
        activeLoaderInstanceId = null;
      }
    };
  }, [instanceId]);

  const {
    isFirstLoad,
    appReady,
    minDurationDone,
    prefersReducedMotion,
    dismissFirstLoad
  } = useFirstLoad(durationMs);

  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  const visible = isPrimaryInstance && (forceShow || isFirstLoad);

  useEffect(() => {
    if (!visible) return;
    const prevOverflow =
      typeof document !== "undefined" ? document.body.style.overflow : "";
    if (typeof document !== "undefined") {
      document.body.style.overflow = "hidden";
    }
    startTimeRef.current = Date.now();
    const interval = window.setInterval(() => {
      if (!startTimeRef.current) return;
      const diff = Date.now() - startTimeRef.current;
      setElapsedMs(Math.min(diff, durationMs));
    }, 45);
    return () => {
      window.clearInterval(interval);
      if (typeof document !== "undefined") {
        document.body.style.overflow = prevOverflow;
      }
    };
  }, [visible, durationMs]);

  const rawProgress = Math.min(100, Math.round((elapsedMs / durationMs) * 100));
  // If minimum duration has finished but browser initialization is still in flight, hold at 99%
  const displayProgress =
    minDurationDone && !appReady ? 99 : rawProgress;

  const statusLines = useMemo(() => {
    if (minDurationDone && !appReady) {
      return [
        ...LOADING_STATUS_LINES.slice(0, 4),
        "MENYELESAIKAN INISIALISASI APLIKASI..."
      ];
    }
    return LOADING_STATUS_LINES;
  }, [minDurationDone, appReady]);

  const totalChars = useMemo(
    () => statusLines.reduce((sum, line) => sum + line.length, 0),
    [statusLines]
  );

  const revealedChars = useMemo(() => {
    if (prefersReducedMotion) return totalChars;
    const msPerChar = Math.max(14, Math.floor((durationMs * 0.85) / totalChars));
    return Math.min(totalChars, Math.floor(elapsedMs / msPerChar));
  }, [prefersReducedMotion, durationMs, totalChars, elapsedMs]);

  const lineRevealData = useMemo(() => {
    let remaining = revealedChars;
    let firstIncomplete = statusLines.length - 1;
    const items = statusLines.map((line, index) => {
      const shownCount = Math.max(0, Math.min(line.length, remaining));
      remaining -= shownCount;
      const done = shownCount >= line.length;
      if (!done && firstIncomplete === statusLines.length - 1) {
        firstIncomplete = index;
      }
      return {
        text: line.slice(0, shownCount),
        done
      };
    });
    const activeIndex =
      revealedChars >= totalChars
        ? statusLines.length - 1
        : Math.max(0, firstIncomplete);
    return { items, activeIndex };
  }, [revealedChars, statusLines, totalChars]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="scc-eagle-eyes-loading-overlay"
          data-testid="eagle-eyes-loading-overlay"
          initial={{ opacity: 1, y: "0%" }}
          animate={{ opacity: 1, y: "0%" }}
          exit={{
            opacity: 0,
            y: prefersReducedMotion ? "0%" : "-100%"
          }}
          transition={{
            duration: prefersReducedMotion ? 0.18 : DURATIONS.curtain,
            ease: EASE_CURTAIN
          }}
          style={{
            backgroundColor: "#090B10",
            zIndex: 2000,
            willChange: "transform, opacity"
          }}
          className="fixed inset-0 z-[2000] flex items-center justify-center px-4 sm:px-8 lg:px-12 py-4 select-none overflow-y-auto overflow-x-hidden"
          role="status"
          aria-live="polite"
          aria-busy={visible}
          aria-label={`Memuat ${APP_CONFIG.name}`}
        >
          {/* Subtle Ambient Horizon Accent */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 65% 45% at 50% 45%, rgba(59, 130, 246, 0.08) 0%, rgba(9, 11, 16, 0) 70%)"
            }}
          />

          <div className="relative z-10 w-full max-w-6xl mx-auto flex flex-col gap-5 sm:gap-9">
            {/* Official Eagle Eyes Emblem — Unboxed Direct Presentation */}
            <motion.div
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE_STANDARD }}
              className="flex flex-col items-center justify-center gap-3 text-center"
            >
              <EagleEyesLogo size="xl" animateHover={false} />
              <div className="space-y-1">
                <h1 className="text-base sm:text-xl font-bold tracking-[0.22em] uppercase text-[#F3F6FB]">
                  {APP_CONFIG.name}
                </h1>
                <p className="text-[11px] font-mono tracking-[0.18em] uppercase text-[#98A4B8]">
                  {APP_CONFIG.subtitle}
                </p>
              </div>
            </motion.div>

            {/* Framer LoadingOverlay 3-Zone Responsive Grid */}
            <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(260px,1.25fr)_auto_minmax(220px,1fr)] items-center gap-6 sm:gap-8 lg:gap-10 border-t border-b border-[var(--border-subtle)] py-6 sm:py-7">
              {/* Left: Sequential Telemetry Status List */}
              <ul
                aria-label="Loading status list"
                className="list-none m-0 p-0 flex flex-col gap-2 min-w-0 font-mono text-[11px] sm:text-xs uppercase tracking-[0.06em]"
              >
                {statusLines.map((line, index) => {
                  const isActive = index === lineRevealData.activeIndex;
                  const shownText =
                    lineRevealData.items[index]?.text ?? line;
                  const textToRender = prefersReducedMotion
                    ? line
                    : shownText || " ";

                  return (
                    <li
                      key={`${line}-${index}`}
                      className="flex items-center gap-2 min-w-0 truncate"
                      style={{
                        color: isActive ? "#60A5FA" : "#98A4B8",
                        opacity: isActive ? 1 : 0.7,
                        fontWeight: isActive ? 600 : 400
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: isActive ? "#3B82F6" : "#475569"
                        }}
                      />
                      <span className="truncate">{textToRender}</span>
                    </li>
                  );
                })}
              </ul>

              {/* Center: Tabular Progress Percentage Counter */}
              <div
                className="text-center font-mono font-bold tabular-nums tracking-[0.08em] text-[#F3F6FB] shrink-0"
                style={{
                  fontSize: "clamp(28px, 4.5vw, 56px)",
                  lineHeight: 1
                }}
              >
                ({" "}
                <span className="text-[#60A5FA]">
                  {String(displayProgress).padStart(2, "0")}
                </span>
                % )
              </div>

              {/* Right: System Readiness Summary & Skip Control */}
              <div className="flex flex-col md:col-span-2 lg:col-span-1 items-start lg:items-end text-left lg:text-right gap-3">
                <p className="text-xs leading-relaxed text-[#98A4B8] max-w-xs">
                  {APP_CONFIG.description}
                </p>
                <button
                  type="button"
                  onClick={dismissFirstLoad}
                  data-testid="skip-loading-overlay"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-[#3B82F6]/20 border border-[var(--border-default)] hover:border-[var(--border-accent)] text-[11px] font-mono uppercase tracking-[0.12em] text-[#E2E8F0] hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
                >
                  <span>Masuk Dashboard</span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface ProgramsCardProps {
  children: React.ReactNode;
  index?: number;
  className?: string;
  style?: React.CSSProperties;
  enableEntrance?: boolean;
  enableHoverLift?: boolean;
  enableShimmer?: boolean;
  testId?: string;
  onClick?: () => void;
  as?: "div" | "article";
}

/**
 * ProgramsCard — Dashboard card primitive inspired by Framer Programs (fpaSe9).
 * Implements calm staggered upward reveal, subtle GPU hover lift, border refinement,
 * and an understated metallic silver sheen sweep without bright colors or layout shift.
 */
export function ProgramsCard({
  children,
  index = 0,
  className = "",
  style,
  enableEntrance = true,
  enableHoverLift = true,
  enableShimmer = false,
  testId,
  onClick,
  as = "div"
}: ProgramsCardProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const delay = enableEntrance ? getProgramsEntranceDelay(index) : 0;

  const Component = as === "article" ? motion.article : motion.div;

  return (
    <Component
      data-testid={testId}
      onClick={onClick}
      initial={
        enableEntrance && !prefersReducedMotion
          ? { opacity: 0, y: 10 }
          : false
      }
      animate={{ opacity: 1, y: 0 }}
      whileHover={
        enableHoverLift && !prefersReducedMotion
          ? { y: -3, transition: { duration: 0.22, ease: EASE_STANDARD } }
          : undefined
      }
      transition={{
        duration: prefersReducedMotion ? 0 : DURATIONS.entrance,
        delay: prefersReducedMotion ? 0 : delay,
        ease: EASE_STANDARD
      }}
      style={style}
      className={`group/card relative min-w-0 transition-colors duration-200 ${className}`}
    >
      {enableShimmer && !prefersReducedMotion && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        >
          <span
            className="absolute -top-[20%] -left-[30%] w-[42%] h-[140%] opacity-0 group-hover/card:opacity-100 -translate-x-full group-hover/card:translate-x-[320%] -skew-x-12 transition-all duration-700 ease-out"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(226, 232, 240, 0.06) 50%, transparent 100%)"
            }}
          />
        </span>
      )}
      {children}
    </Component>
  );
}

export const MotionCard = ProgramsCard;

export interface DropdownOption {
  value: string;
  label: string;
  badge?: string | number;
}

export interface AnimatedDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  ariaLabel: string;
  testId?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export function AnimatedDropdown({
  value,
  onChange,
  options,
  placeholder = "Pilih opsi",
  ariaLabel,
  testId,
  searchable = false,
  searchPlaceholder = "Cari...",
  className = "",
  icon,
  disabled = false
}: AnimatedDropdownProps) {
  const [query, setQuery] = useState("");
  const highlightScopeId = useId();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    left: number;
    width: number;
  }>({ top: 0, left: 0, width: 220 });

  useEffect(() => {
    setMounted(true);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.toLowerCase().trim();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  const {
    isOpen,
    focusedIndex,
    setFocusedIndex,
    containerRef,
    menuRef,
    close,
    toggle
  } = useDropdown<HTMLDivElement>(filteredOptions.length, (idx) => {
    const target = filteredOptions[idx];
    if (target) {
      onChange(target.value);
      setQuery("");
    }
  });

  const updatePanelPosition = useCallback(() => {
    if (!containerRef.current || typeof window === "undefined") return;
    const rect = containerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const desiredWidth = Math.max(rect.width, 220);
    const clampedWidth = Math.min(desiredWidth, vw - 16);
    const clampedLeft = Math.max(8, Math.min(rect.left, vw - clampedWidth - 8));
    setPanelPos({
      top: Math.round(rect.bottom + 6),
      left: Math.round(clampedLeft),
      width: Math.round(clampedWidth)
    });
  }, [containerRef]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setHoveredIndex(null);
      return;
    }
    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [isOpen, updatePanelPosition]);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const dropdownMenuContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          key="morph-dropdown-panel"
          role="listbox"
          aria-label={ariaLabel}
          data-testid={testId ? `${testId}-menu` : undefined}
          initial={{ opacity: 0, scale: 0.96, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{
            opacity: 0,
            scale: 0.96,
            y: -6,
            transition: { duration: 0.14, ease: "easeOut" }
          }}
          transition={SPRINGS.snappy}
          style={{
            position: "fixed",
            top: panelPos.top,
            left: panelPos.left,
            width: panelPos.width,
            zIndex: 400,
            transformOrigin: "top center",
            backgroundColor: "rgba(9, 12, 18, 0.97)",
            borderColor: "var(--border-default)"
          }}
          className="z-[400] rounded-xl border shadow-2xl overflow-hidden backdrop-blur-xl"
        >
          {searchable && (
            <div className="p-2 border-b border-[var(--border-subtle)] bg-[#07090D]/80">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-[#98A4B8] absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  data-testid={testId ? `${testId}-search` : undefined}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setFocusedIndex(0);
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full ee-input rounded-lg pl-8 pr-7 py-1.5 text-xs placeholder:text-[#657287]"
                  autoFocus
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Hapus pencarian"
                    className="absolute right-2 text-[#98A4B8] hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[#657287]">
                Tidak ada opsi yang cocok
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted =
                  hoveredIndex === idx || focusedIndex === idx;

                return (
                  <button
                    key={`${opt.value}-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => {
                      onChange(opt.value);
                      close();
                    }}
                    className={`relative w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${
                      isSelected
                        ? "text-white font-semibold"
                        : "text-[#98A4B8] hover:text-[#F3F6FB]"
                    }`}
                  >
                    {(isHighlighted || isSelected) && (
                      <motion.span
                        layoutId={`dropdown-highlight-${highlightScopeId}`}
                        transition={SPRINGS.snappy}
                        className={`absolute inset-0 rounded-lg ${
                          isSelected
                            ? "bg-[#3B82F6]/20 border border-[#3B82F6]/45"
                            : "bg-white/[0.06]"
                        }`}
                      />
                    )}

                    <span className="relative z-10 truncate">{opt.label}</span>

                    <span className="relative z-10 flex items-center gap-1.5 shrink-0">
                      {opt.badge !== undefined && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#111622] text-[#98A4B8] border border-[var(--border-subtle)] tabular-nums">
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div
      ref={containerRef}
      data-testid={testId ? `${testId}-wrapper` : undefined}
      style={{ zIndex: isOpen ? 300 : undefined }}
      className={`relative z-[300] select-none ${className}`}
    >
      {/* Hidden native select for accessibility & automated queries */}
      <select
        aria-label={ariaLabel}
        data-testid={testId}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Trigger Button (z-index: 300) */}
      <motion.button
        type="button"
        disabled={disabled}
        whileTap={disabled ? undefined : { scale: 0.985 }}
        onClick={() => {
          if (!disabled) {
            updatePanelPosition();
            toggle();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        data-testid={testId ? `${testId}-trigger` : undefined}
        style={{ zIndex: 300 }}
        className={`relative z-[300] w-full flex items-center justify-between gap-2 bg-[#0B0E16]/90 hover:bg-[#111622] border text-xs rounded-xl px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] disabled:opacity-50 ${
          isOpen
            ? "border-[#3B82F6]/60 text-white shadow-[0_0_0_2px_rgba(59,130,246,0.16)]"
            : "border-[var(--border-default)] text-[#E2E8F0] hover:border-[var(--border-strong)]"
        }`}
      >
        <span className="flex items-center gap-1.5 min-w-0 truncate">
          {icon && <span className="text-[#98A4B8] shrink-0">{icon}</span>}
          <span className="truncate font-medium">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={SPRINGS.snappy}
          className="text-[#98A4B8] shrink-0"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.span>
      </motion.button>

      {/* Portaled Morphing Dropdown Panel (z-index: 400 in document.body) */}
      {mounted && typeof document !== "undefined"
        ? createPortal(dropdownMenuContent, document.body)
        : dropdownMenuContent}
    </div>
  );
}

export interface FavoritesButtonProps {
  cameraId: string;
  cameraName?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function FavoritesButton({
  cameraId,
  cameraName,
  size = "sm",
  showLabel = false,
  className = ""
}: FavoritesButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const active = isFavorite(cameraId);

  const sizeStyles = {
    sm: "p-1.5 text-[11px]",
    md: "px-2.5 py-1.5 text-xs",
    lg: "px-3 py-2 text-xs"
  }[size];

  const iconSize = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-4 h-4"
  }[size];

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.85 }}
      transition={SPRINGS.snappy}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(cameraId);
      }}
      data-testid={`favorite-btn-${cameraId}`}
      aria-pressed={active}
      aria-label={
        active
          ? `Hapus ${cameraName || "kamera"} dari Favorit`
          : `Tambah ${cameraName || "kamera"} ke Favorit`
      }
      title={active ? "Hapus dari CCTV Favorit" : "Tambahkan ke CCTV Favorit"}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] ${
        active
          ? "bg-[#3B82F6]/20 border-[#3B82F6]/50 text-white"
          : "bg-[#111622] hover:bg-[#161C2B] border-[var(--border-default)] text-[#E2E8F0] hover:text-white"
      } ${sizeStyles} ${className}`}
    >
      <motion.span
        key={active ? "fav-filled" : "fav-outline"}
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={SPRINGS.snappy}
        className="inline-flex items-center justify-center"
      >
        <Heart
          className={`${iconSize} ${
            active ? "fill-[#60A5FA] text-[#60A5FA]" : "fill-transparent text-[#98A4B8]"
          }`}
        />
      </motion.span>
      {showLabel && (
        <span>{active ? "Tersimpan di Favorit" : "Favoritkan"}</span>
      )}
    </motion.button>
  );
}
