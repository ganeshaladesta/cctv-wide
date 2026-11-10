"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface FavoriteRecord {
  cameraId: string;
  addedAt: string;
}

const FAVORITES_STORAGE_KEY = "scc_eagle_eyes_favorites";
const FAVORITES_SYNC_EVENT = "scc-eagle-eyes-favorites-sync";
const FIRST_LOAD_SESSION_KEY = "scc_eagle_eyes_first_load_done";

function readFavoritesFromStorage(): FavoriteRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const valid: FavoriteRecord[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof item.cameraId === "string" &&
        item.cameraId.trim().length > 0 &&
        !seen.has(item.cameraId)
      ) {
        seen.add(item.cameraId);
        valid.push({
          cameraId: item.cameraId,
          addedAt:
            typeof item.addedAt === "string"
              ? item.addedAt
              : new Date().toISOString()
        });
      }
    }
    return valid;
  } catch {
    return [];
  }
}

function writeFavoritesToStorage(records: FavoriteRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent(FAVORITES_SYNC_EVENT));
  } catch {}
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFavorites(readFavoritesFromStorage());
    setHydrated(true);

    const handleSync = () => {
      setFavorites(readFavoritesFromStorage());
    };
    window.addEventListener(FAVORITES_SYNC_EVENT, handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener(FAVORITES_SYNC_EVENT, handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, []);

  const isFavorite = useCallback(
    (cameraId: string): boolean => {
      return favorites.some((f) => f.cameraId === cameraId);
    },
    [favorites]
  );

  const addFavorite = useCallback((cameraId: string) => {
    if (!cameraId) return;
    const current = readFavoritesFromStorage();
    if (current.some((f) => f.cameraId === cameraId)) return;
    const next: FavoriteRecord[] = [
      { cameraId, addedAt: new Date().toISOString() },
      ...current
    ];
    writeFavoritesToStorage(next);
    setFavorites(next);
  }, []);

  const removeFavorite = useCallback((cameraId: string) => {
    const current = readFavoritesFromStorage();
    const next = current.filter((f) => f.cameraId !== cameraId);
    writeFavoritesToStorage(next);
    setFavorites(next);
  }, []);

  const toggleFavorite = useCallback((cameraId: string) => {
    if (!cameraId) return;
    const current = readFavoritesFromStorage();
    const exists = current.some((f) => f.cameraId === cameraId);
    const next = exists
      ? current.filter((f) => f.cameraId !== cameraId)
      : [{ cameraId, addedAt: new Date().toISOString() }, ...current];
    writeFavoritesToStorage(next);
    setFavorites(next);
  }, []);

  return {
    favorites,
    hydrated,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite
  };
}

export function useFirstLoad(durationMs = 5000) {
  const [isFirstLoad, setIsFirstLoad] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPrefersReducedMotion(reduced);

    try {
      const alreadyLoaded = window.sessionStorage.getItem(
        FIRST_LOAD_SESSION_KEY
      );
      if (!alreadyLoaded) {
        setIsFirstLoad(true);
        const effectiveDuration = reduced ? 600 : durationMs;
        const timer = setTimeout(() => {
          try {
            window.sessionStorage.setItem(FIRST_LOAD_SESSION_KEY, "1");
          } catch {}
          setIsFirstLoad(false);
        }, effectiveDuration);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, [durationMs]);

  const dismissFirstLoad = useCallback(() => {
    try {
      window.sessionStorage.setItem(FIRST_LOAD_SESSION_KEY, "1");
    } catch {}
    setIsFirstLoad(false);
  }, []);

  return {
    isFirstLoad,
    prefersReducedMotion,
    dismissFirstLoad
  };
}

export function useDropdown<T extends HTMLElement = HTMLDivElement>(
  itemCount = 0,
  onSelectIndex?: (index: number) => void
) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<T | null>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown" && itemCount > 0) {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % itemCount);
      } else if (e.key === "ArrowUp" && itemCount > 0) {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + itemCount) % itemCount);
      } else if (e.key === "Enter" && focusedIndex >= 0 && onSelectIndex) {
        e.preventDefault();
        onSelectIndex(focusedIndex);
        close();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, itemCount, focusedIndex, onSelectIndex, close]);

  return {
    isOpen,
    setIsOpen,
    focusedIndex,
    setFocusedIndex,
    containerRef,
    close,
    toggle
  };
}

