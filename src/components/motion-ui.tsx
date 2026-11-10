"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useId,
  useCallback
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, ChevronDown, Check, Search, X } from "lucide-react";
import { APP_CONFIG } from "@/lib/branding";
import { useFavorites, useFirstLoad, useDropdown } from "@/lib/hooks";

export interface EagleEyesLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  animateHover?: boolean;
}

export function EagleEyesLogo({
  size = "md",
  className = "",
  animateHover = true
}: EagleEyesLogoProps) {
  const sizeClasses = {
    sm: "w-8 h-8 p-1 rounded-lg",
    md: "w-9 h-9 sm:w-10 sm:h-10 p-1 rounded-xl",
    lg: "w-14 h-14 p-1.5 rounded-2xl",
    xl: "w-24 h-24 sm:w-28 sm:h-28 p-2.5 rounded-3xl"
  }[size];

  return (
    <motion.div
      whileHover={animateHover ? { scale: 1.04 } : undefined}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      data-testid="eagle-eyes-logo-container"
      className={`relative bg-[#090B10] border border-[#252A35] flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(255,255,255,0.06)] overflow-hidden ${sizeClasses} ${className}`}
    >
      <picture className="w-full h-full flex items-center justify-center">
        <source srcSet={APP_CONFIG.primaryIconWebp} type="image/webp" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={APP_CONFIG.primaryIcon}
          alt={APP_CONFIG.name}
          data-testid="eagle-eyes-logo-img"
          className="w-full h-full object-contain select-none"
          style={{ objectFit: "contain" }}
        />
      </picture>
    </motion.div>
  );
}

const LOADING_STATUS_STEPS = [
  "MENGINISIALISASI INTI PENGAWASAN...",
  "MENGHUBUNGKAN JARINGAN 38 PROVINSI...",
  "MEMVERIFIKASI TELEMETRI KAMERA AKTIF...",
  "MENYINKRONKAN PETA GEOSPASIAL & HLS...",
  "SISTEM PEMANTAUAN SIAP"
];

export interface LoadingOverlayProps {
  durationMs?: number;
  forceShow?: boolean;
}

export function LoadingOverlay({
  durationMs = 5000,
  forceShow = false
}: LoadingOverlayProps) {
  const { isFirstLoad, prefersReducedMotion, dismissFirstLoad } =
    useFirstLoad(durationMs);
  const [elapsedMs, setElapsedMs] = useState(0);

  const visible = forceShow || isFirstLoad;

  useEffect(() => {
    if (!visible) return;
    const start = Date.now();
    const interval = setInterval(() => {
      const diff = Date.now() - start;
      setElapsedMs(Math.min(diff, durationMs));
    }, 50);
    return () => clearInterval(interval);
  }, [visible, durationMs]);

  const progress = Math.min(100, Math.round((elapsedMs / durationMs) * 100));
  const radarActive = elapsedMs >= 1000 || prefersReducedMotion;
  const stepIndex = Math.min(
    LOADING_STATUS_STEPS.length - 1,
    Math.floor((elapsedMs / durationMs) * LOADING_STATUS_STEPS.length)
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="scc-eagle-eyes-loading-overlay"
          data-testid="eagle-eyes-loading-overlay"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ backgroundColor: "#090B10", zIndex: 2000 }}
          className="fixed inset-0 z-[2000] flex flex-col items-center justify-center px-4 select-none overflow-hidden"
          role="status"
          aria-live="polite"
          aria-label={`Memuat ${APP_CONFIG.name}`}
        >
          {/* Subtle Ambient Grid & Radial Glow */}
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.08) 0%, transparent 60%), linear-gradient(to right, #252A35 1px, transparent 1px), linear-gradient(to bottom, #252A35 1px, transparent 1px)",
              backgroundSize: "100% 100%, 48px 48px, 48px 48px"
            }}
          />

          {/* Center Emblem + Circular Radar Scanning System */}
          <div className="relative flex items-center justify-center w-52 h-52 sm:w-60 sm:h-60 mb-6">
            {/* Outer Static Frame Ring */}
            <div
              className="absolute inset-0 rounded-full border"
              style={{ borderColor: "#252A35" }}
            />

            {/* 1.0s+: Circular Scanning / Radar Indicator */}
            <AnimatePresence>
              {radarActive && (
                <>
                  {/* Rotating Conic Radar Sweep */}
                  {!prefersReducedMotion && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1, rotate: 360 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        opacity: { duration: 0.35 },
                        scale: { duration: 0.4 },
                        rotate: {
                          duration: 2.2,
                          ease: "linear",
                          repeat: Infinity
                        }
                      }}
                      data-testid="loading-radar-sweep"
                      className="absolute inset-2 rounded-full"
                      style={{
                        background:
                          "conic-gradient(from 0deg, transparent 0deg, transparent 260deg, rgba(255,255,255,0.22) 345deg, rgba(255,255,255,0.55) 360deg)"
                      }}
                    />
                  )}

                  {/* Inner Mask for Ring Effect */}
                  <div
                    className="absolute inset-[6px] rounded-full"
                    style={{ backgroundColor: "#090B10" }}
                  />

                  {/* Segmented Counter-Rotating Tech Ring */}
                  <motion.svg
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: 0.85,
                      rotate: prefersReducedMotion ? 0 : -360
                    }}
                    transition={{
                      opacity: { duration: 0.4 },
                      rotate: {
                        duration: 8,
                        ease: "linear",
                        repeat: Infinity
                      }
                    }}
                    className="absolute inset-3 w-[calc(100%-24px)] h-[calc(100%-24px)]"
                    viewBox="0 0 200 200"
                  >
                    <circle
                      cx="100"
                      cy="100"
                      r="92"
                      fill="none"
                      stroke="#252A35"
                      strokeWidth="1.5"
                    />
                    <circle
                      cx="100"
                      cy="100"
                      r="92"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="2"
                      strokeDasharray="36 24 12 24"
                      strokeLinecap="round"
                    />
                    <circle
                      cx="100"
                      cy="100"
                      r="78"
                      fill="none"
                      stroke="#A1A1AA"
                      strokeWidth="1"
                      strokeDasharray="6 14"
                      opacity="0.5"
                    />
                  </motion.svg>

                  {/* Expanding Pulse Ring */}
                  {!prefersReducedMotion && (
                    <motion.div
                      initial={{ scale: 0.75, opacity: 0.6 }}
                      animate={{ scale: 1.12, opacity: 0 }}
                      transition={{
                        duration: 1.8,
                        ease: "easeOut",
                        repeat: Infinity
                      }}
                      className="absolute inset-4 rounded-full border border-white/30"
                    />
                  )}
                </>
              )}
            </AnimatePresence>

            {/* 0.0s Fade-in + 0.5s Smooth Scale of Eagle Eyes Logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.78 }}
              animate={{
                opacity: 1,
                scale: elapsedMs >= 500 || prefersReducedMotion ? 1 : 0.88
              }}
              transition={{
                opacity: { duration: 0.45, ease: "easeOut" },
                scale: {
                  type: "spring",
                  stiffness: 220,
                  damping: 20
                }
              }}
              className="relative z-10 flex items-center justify-center w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-[#090B10] border border-[#252A35] p-3 shadow-[0_0_40px_rgba(255,255,255,0.12)]"
            >
              <picture className="w-full h-full flex items-center justify-center">
                <source srcSet={APP_CONFIG.primaryIconWebp} type="image/webp" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={APP_CONFIG.primaryIcon}
                  alt={APP_CONFIG.name}
                  className="w-full h-full object-contain"
                  style={{ objectFit: "contain" }}
                />
              </picture>
            </motion.div>
          </div>

          {/* Application Title & Telemetry Status */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.45 }}
            className="relative z-10 text-center max-w-md w-full space-y-3"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#252A35] bg-white/[0.03]">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span
                className="text-[10px] font-mono tracking-[0.22em] uppercase"
                style={{ color: "#A1A1AA" }}
              >
                INTEGRATED SURVEILLANCE COMMAND
              </span>
            </div>

            <h1
              className="text-xl sm:text-2xl font-black tracking-[0.14em] uppercase"
              style={{ color: "#FFFFFF" }}
            >
              {APP_CONFIG.name}
            </h1>

            <p
              className="text-xs leading-relaxed px-2"
              style={{ color: "#A1A1AA" }}
            >
              {APP_CONFIG.description}
            </p>

            {/* Progress Bar & Telemetry Status Line */}
            <div className="pt-2 space-y-2 max-w-xs mx-auto">
              <div
                className="h-1 w-full rounded-full overflow-hidden border"
                style={{
                  backgroundColor: "#12151E",
                  borderColor: "#252A35"
                }}
              >
                <motion.div
                  className="h-full bg-white rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.1, ease: "linear" }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono">
                <span
                  className="truncate max-w-[230px]"
                  style={{ color: "#A1A1AA" }}
                >
                  {LOADING_STATUS_STEPS[stepIndex]}
                </span>
                <span
                  className="font-bold tabular-nums"
                  style={{ color: "#FFFFFF" }}
                >
                  {progress}%
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={dismissFirstLoad}
                data-testid="skip-loading-overlay"
                className="text-[10px] font-mono uppercase tracking-widest px-3 py-1 rounded border border-[#252A35] text-[#A1A1AA] hover:text-white hover:border-white/40 transition"
              >
                Masuk Sekarang →
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

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
          initial={{ opacity: 0, scale: 0.94, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{
            opacity: 0,
            scale: 0.95,
            y: -6,
            transition: { duration: 0.14, ease: "easeOut" }
          }}
          transition={{
            type: "spring",
            stiffness: 420,
            damping: 30,
            mass: 0.75
          }}
          style={{
            position: "fixed",
            top: panelPos.top,
            left: panelPos.left,
            width: panelPos.width,
            zIndex: 400,
            transformOrigin: "top center",
            backgroundColor: "#090B10",
            borderColor: "#252A35"
          }}
          className="z-[400] rounded-xl border shadow-2xl overflow-hidden backdrop-blur-xl"
        >
          {searchable && (
            <div className="p-2 border-b border-[#252A35] bg-zinc-950/80">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  data-testid={testId ? `${testId}-search` : undefined}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setFocusedIndex(0);
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full bg-zinc-900/90 border border-[#252A35] rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/40"
                  autoFocus
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 text-zinc-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-zinc-500">
                Tidak ada opsi yang cocok
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted =
                  hoveredIndex === idx || focusedIndex === idx;

                return (
                  <motion.button
                    key={`${opt.value}-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.14,
                      delay: Math.min(idx * 0.012, 0.12)
                    }}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => {
                      onChange(opt.value);
                      close();
                    }}
                    className={`relative w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${
                      isSelected
                        ? "text-white font-semibold"
                        : "text-zinc-300 hover:text-white"
                    }`}
                  >
                    {/* Sliding Highlight Background */}
                    {(isHighlighted || isSelected) && (
                      <motion.span
                        layoutId={`dropdown-highlight-${highlightScopeId}`}
                        transition={{
                          type: "spring",
                          stiffness: 450,
                          damping: 34
                        }}
                        className={`absolute inset-0 rounded-lg ${
                          isSelected
                            ? "bg-white/15 border border-white/25"
                            : "bg-white/[0.07]"
                        }`}
                      />
                    )}

                    <span className="relative z-10 truncate">{opt.label}</span>

                    <span className="relative z-10 flex items-center gap-1.5 shrink-0">
                      {opt.badge !== undefined && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-[#252A35]">
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-white shrink-0" />
                      )}
                    </span>
                  </motion.button>
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
      {/* Hidden native select for accessibility & automated form queries */}
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
        className={`relative z-[300] w-full flex items-center justify-between gap-2 bg-zinc-950/90 hover:bg-zinc-900 border text-xs rounded-xl px-3 py-2 text-left transition-colors focus:outline-none disabled:opacity-50 ${
          isOpen
            ? "border-white/50 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.18)]"
            : "border-[#252A35] text-zinc-200 hover:border-zinc-700"
        }`}
      >
        <span className="flex items-center gap-1.5 min-w-0 truncate">
          {icon && <span className="text-zinc-400 shrink-0">{icon}</span>}
          <span className="truncate font-medium">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 360, damping: 26 }}
          className="text-zinc-400 shrink-0"
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
      whileTap={{ scale: 0.78 }}
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 450, damping: 20 }}
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
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors focus:outline-none ${
        active
          ? "bg-white/15 border-white/40 text-white shadow-[0_0_12px_rgba(255,255,255,0.16)]"
          : "bg-zinc-900/90 hover:bg-zinc-800 border-[#252A35] text-white/85 hover:text-white"
      } ${sizeStyles} ${className}`}
    >
      <motion.span
        key={active ? "fav-filled" : "fav-outline"}
        initial={{ scale: 0.7 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
        className="inline-flex items-center justify-center"
      >
        <Heart
          className={`${iconSize} ${
            active ? "fill-white text-white" : "fill-transparent text-white"
          }`}
        />
      </motion.span>
      {showLabel && (
        <span>{active ? "Tersimpan di Favorit" : "Favoritkan"}</span>
      )}
    </motion.button>
  );
}
