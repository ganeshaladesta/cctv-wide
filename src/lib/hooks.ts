"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DEFAULT_OPERATOR, ensureValidUuid } from "@/lib/auth-roles";

export interface FavoriteRecord {
  cameraId: string;
  addedAt: string;
}

export type PresetGridLayoutSize = 1 | 2 | 4 | 6 | 9;

export interface FavoriteWallPreset {
  id: string;
  name: string;
  /** Ordered camera IDs assigned to each slot (null/empty string represents an empty slot in partial layouts) */
  cameraIds: Array<string | null>;
  gridLayout: PresetGridLayoutSize;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
}

const FAVORITES_STORAGE_KEY = "scc_eagle_eyes_favorites";
const FAVORITES_SYNC_EVENT = "scc-eagle-eyes-favorites-sync";
export const FAVORITE_PRESETS_STORAGE_KEY = "scc_eagle_eyes_favorite_presets_v1";
export const FAVORITE_PRESETS_SYNC_EVENT = "scc-eagle-eyes-favorite-presets-sync";
export const OPERATOR_ID_STORAGE_KEY = "scc_eagle_eyes_operator_id";
const FIRST_LOAD_SESSION_KEY = "scc_eagle_eyes_first_load_done";

const VALID_GRID_LAYOUTS: ReadonlySet<PresetGridLayoutSize> = new Set([1, 2, 4, 6, 9]);

export function resolveActiveOperatorId(overrideOwnerId?: string | null): string {
  if (overrideOwnerId && overrideOwnerId.trim().length > 0) {
    return ensureValidUuid(overrideOwnerId.trim());
  }
  if (typeof window !== "undefined") {
    try {
      const sp = new URLSearchParams(window.location.search);
      const urlOperator = sp.get("operator_id");
      if (urlOperator && urlOperator.trim().length > 0) {
        return ensureValidUuid(urlOperator.trim());
      }
      const storedOperator = window.localStorage.getItem(OPERATOR_ID_STORAGE_KEY);
      if (storedOperator && storedOperator.trim().length > 0) {
        return ensureValidUuid(storedOperator.trim());
      }
    } catch {}
  }
  return DEFAULT_OPERATOR.id;
}

export function normalizePresetSlotCameraIds(
  slotCameraIds: ReadonlyArray<string | null | undefined>,
  gridLayout: PresetGridLayoutSize
): Array<string | null> {
  return Array.from({ length: gridLayout }, (_, idx) => {
    const raw = slotCameraIds[idx];
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    // Never accept temporary stream URLs as permanent camera identifiers
    if (!trimmed || /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/api/proxy")) {
      return null;
    }
    return trimmed;
  });
}

function sanitizeStoredPresets(rawList: unknown): FavoriteWallPreset[] {
  if (!Array.isArray(rawList)) return [];
  const seenIds = new Set<string>();
  const valid: FavoriteWallPreset[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "string" || !rec.id.trim() || seenIds.has(rec.id)) continue;
    if (typeof rec.name !== "string" || !rec.name.trim()) continue;
    if (typeof rec.ownerId !== "string" || !rec.ownerId.trim()) continue;

    const layoutNum = Number(rec.gridLayout) as PresetGridLayoutSize;
    const gridLayout: PresetGridLayoutSize = VALID_GRID_LAYOUTS.has(layoutNum)
      ? layoutNum
      : 4;
    const rawCameras = Array.isArray(rec.cameraIds) ? rec.cameraIds : [];
    const cameraIds = normalizePresetSlotCameraIds(
      rawCameras as Array<string | null | undefined>,
      gridLayout
    );

    const nowIso = new Date().toISOString();
    seenIds.add(rec.id);
    valid.push({
      id: rec.id.trim(),
      name: rec.name.trim(),
      cameraIds,
      gridLayout,
      createdAt: typeof rec.createdAt === "string" && rec.createdAt ? rec.createdAt : nowIso,
      updatedAt: typeof rec.updatedAt === "string" && rec.updatedAt ? rec.updatedAt : nowIso,
      ownerId: ensureValidUuid(rec.ownerId)
    });
  }
  return valid;
}

export function readAllFavoritePresetsFromStorage(
  storage?: Pick<Storage, "getItem">
): FavoriteWallPreset[] {
  const targetStorage =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!targetStorage) return [];
  try {
    const raw = targetStorage.getItem(FAVORITE_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeStoredPresets(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeAllFavoritePresetsToStorage(
  presets: FavoriteWallPreset[],
  storage?: Pick<Storage, "setItem">
): void {
  const targetStorage =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!targetStorage) return;
  try {
    targetStorage.setItem(FAVORITE_PRESETS_STORAGE_KEY, JSON.stringify(presets));
    if (!storage && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(FAVORITE_PRESETS_SYNC_EVENT));
    }
  } catch {}
}

export function readOperatorFavoritePresets(
  operatorId: string,
  storage?: Pick<Storage, "getItem">
): FavoriteWallPreset[] {
  const normalizedOwner = ensureValidUuid(operatorId);
  return readAllFavoritePresetsFromStorage(storage).filter(
    (p) => p.ownerId === normalizedOwner
  );
}

export function createOperatorFavoritePreset(
  params: {
    name: string;
    cameraIds: ReadonlyArray<string | null | undefined>;
    gridLayout: PresetGridLayoutSize;
    ownerId: string;
    id?: string;
    nowIso?: string;
  },
  storage?: Pick<Storage, "getItem" | "setItem">
): FavoriteWallPreset {
  const trimmedName = params.name.trim();
  if (!trimmedName) {
    throw new Error("Nama preset tidak boleh kosong.");
  }
  const normalizedOwner = ensureValidUuid(params.ownerId);
  const gridLayout: PresetGridLayoutSize = VALID_GRID_LAYOUTS.has(params.gridLayout)
    ? params.gridLayout
    : 4;
  const cameraIds = normalizePresetSlotCameraIds(params.cameraIds, gridLayout);
  const now = params.nowIso || new Date().toISOString();
  const id =
    params.id ||
    `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const preset: FavoriteWallPreset = {
    id,
    name: trimmedName,
    cameraIds,
    gridLayout,
    createdAt: now,
    updatedAt: now,
    ownerId: normalizedOwner
  };

  const all = readAllFavoritePresetsFromStorage(storage);
  writeAllFavoritePresetsToStorage([preset, ...all.filter((p) => p.id !== id)], storage);
  return preset;
}

export function renameOperatorFavoritePreset(
  params: {
    presetId: string;
    newName: string;
    ownerId: string;
    nowIso?: string;
  },
  storage?: Pick<Storage, "getItem" | "setItem">
): FavoriteWallPreset | null {
  const trimmedName = params.newName.trim();
  if (!trimmedName) return null;
  const normalizedOwner = ensureValidUuid(params.ownerId);
  const all = readAllFavoritePresetsFromStorage(storage);
  let updatedPreset: FavoriteWallPreset | null = null;
  const now = params.nowIso || new Date().toISOString();

  const next = all.map((p) => {
    if (p.id === params.presetId && p.ownerId === normalizedOwner) {
      updatedPreset = {
        ...p,
        name: trimmedName,
        updatedAt: now
      };
      return updatedPreset;
    }
    return p;
  });

  if (updatedPreset) {
    writeAllFavoritePresetsToStorage(next, storage);
  }
  return updatedPreset;
}

export function updateOperatorFavoritePresetConfig(
  params: {
    presetId: string;
    cameraIds: ReadonlyArray<string | null | undefined>;
    gridLayout: PresetGridLayoutSize;
    ownerId: string;
    nowIso?: string;
  },
  storage?: Pick<Storage, "getItem" | "setItem">
): FavoriteWallPreset | null {
  const normalizedOwner = ensureValidUuid(params.ownerId);
  const gridLayout: PresetGridLayoutSize = VALID_GRID_LAYOUTS.has(params.gridLayout)
    ? params.gridLayout
    : 4;
  const cameraIds = normalizePresetSlotCameraIds(params.cameraIds, gridLayout);
  const all = readAllFavoritePresetsFromStorage(storage);
  let updatedPreset: FavoriteWallPreset | null = null;
  const now = params.nowIso || new Date().toISOString();

  const next = all.map((p) => {
    if (p.id === params.presetId && p.ownerId === normalizedOwner) {
      updatedPreset = {
        ...p,
        cameraIds,
        gridLayout,
        updatedAt: now
      };
      return updatedPreset;
    }
    return p;
  });

  if (updatedPreset) {
    writeAllFavoritePresetsToStorage(next, storage);
  }
  return updatedPreset;
}

export function deleteOperatorFavoritePreset(
  params: {
    presetId: string;
    ownerId: string;
  },
  storage?: Pick<Storage, "getItem" | "setItem">
): boolean {
  const normalizedOwner = ensureValidUuid(params.ownerId);
  const all = readAllFavoritePresetsFromStorage(storage);
  const next = all.filter(
    (p) => !(p.id === params.presetId && p.ownerId === normalizedOwner)
  );
  if (next.length === all.length) return false;
  writeAllFavoritePresetsToStorage(next, storage);
  return true;
}

export function useFavoritePresets(overrideOperatorId?: string) {
  const [operatorId, setOperatorId] = useState<string>(() =>
    resolveActiveOperatorId(overrideOperatorId)
  );
  const [presets, setPresets] = useState<FavoriteWallPreset[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const activeOpId = resolveActiveOperatorId(overrideOperatorId);
    setOperatorId(activeOpId);
    setPresets(readOperatorFavoritePresets(activeOpId));
    setHydrated(true);

    const handleSync = () => {
      const currentOpId = resolveActiveOperatorId(overrideOperatorId);
      setOperatorId(currentOpId);
      setPresets(readOperatorFavoritePresets(currentOpId));
    };
    window.addEventListener(FAVORITE_PRESETS_SYNC_EVENT, handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener(FAVORITE_PRESETS_SYNC_EVENT, handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, [overrideOperatorId]);

  const savePreset = useCallback(
    (
      name: string,
      cameraIds: ReadonlyArray<string | null | undefined>,
      gridLayout: PresetGridLayoutSize
    ): FavoriteWallPreset => {
      const activeOpId = resolveActiveOperatorId(overrideOperatorId);
      const created = createOperatorFavoritePreset({
        name,
        cameraIds,
        gridLayout,
        ownerId: activeOpId
      });
      setPresets(readOperatorFavoritePresets(activeOpId));
      return created;
    },
    [overrideOperatorId]
  );

  const renamePreset = useCallback(
    (presetId: string, newName: string): FavoriteWallPreset | null => {
      const activeOpId = resolveActiveOperatorId(overrideOperatorId);
      const updated = renameOperatorFavoritePreset({
        presetId,
        newName,
        ownerId: activeOpId
      });
      if (updated) {
        setPresets(readOperatorFavoritePresets(activeOpId));
      }
      return updated;
    },
    [overrideOperatorId]
  );

  const updatePresetConfig = useCallback(
    (
      presetId: string,
      cameraIds: ReadonlyArray<string | null | undefined>,
      gridLayout: PresetGridLayoutSize
    ): FavoriteWallPreset | null => {
      const activeOpId = resolveActiveOperatorId(overrideOperatorId);
      const updated = updateOperatorFavoritePresetConfig({
        presetId,
        cameraIds,
        gridLayout,
        ownerId: activeOpId
      });
      if (updated) {
        setPresets(readOperatorFavoritePresets(activeOpId));
      }
      return updated;
    },
    [overrideOperatorId]
  );

  const deletePreset = useCallback(
    (presetId: string): boolean => {
      const activeOpId = resolveActiveOperatorId(overrideOperatorId);
      const ok = deleteOperatorFavoritePreset({
        presetId,
        ownerId: activeOpId
      });
      if (ok) {
        setPresets(readOperatorFavoritePresets(activeOpId));
      }
      return ok;
    },
    [overrideOperatorId]
  );

  return {
    operatorId,
    presets,
    hydrated,
    savePreset,
    renamePreset,
    updatePresetConfig,
    deletePreset
  };
}

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

export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return prefersReducedMotion;
}

export function useFirstLoad(durationMs = 5000) {
  const [isFirstLoad, setIsFirstLoad] = useState(false);
  const [minDurationDone, setMinDurationDone] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let alreadyLoaded = false;
    try {
      alreadyLoaded = Boolean(
        window.sessionStorage.getItem(FIRST_LOAD_SESSION_KEY)
      );
    } catch {}

    if (alreadyLoaded) {
      setIsFirstLoad(false);
      setMinDurationDone(true);
      setAppReady(true);
      return;
    }

    setIsFirstLoad(true);

    // Track actual document / initialization readiness
    const markReady = () => setAppReady(true);
    if (document.readyState === "complete") {
      markReady();
    } else {
      window.addEventListener("load", markReady, { once: true });
    }

    // Safety readiness timeout in case an external subresource stalls window.load indefinitely
    const fallbackReadyTimer = window.setTimeout(
      markReady,
      Math.max(durationMs + 4000, 9000)
    );

    const effectiveMinDuration = reduced ? 450 : durationMs;
    const minTimer = window.setTimeout(() => {
      setMinDurationDone(true);
    }, effectiveMinDuration);

    return () => {
      window.removeEventListener("load", markReady);
      window.clearTimeout(fallbackReadyTimer);
      window.clearTimeout(minTimer);
    };
  }, [durationMs]);

  // Dismiss only once BOTH minimum initial display duration AND app initialization are complete
  useEffect(() => {
    if (!isFirstLoad || !minDurationDone || !appReady) return;
    try {
      window.sessionStorage.setItem(FIRST_LOAD_SESSION_KEY, "1");
    } catch {}
    setIsFirstLoad(false);
  }, [isFirstLoad, minDurationDone, appReady]);

  const dismissFirstLoad = useCallback(() => {
    try {
      window.sessionStorage.setItem(FIRST_LOAD_SESSION_KEY, "1");
    } catch {}
    setMinDurationDone(true);
    setAppReady(true);
    setIsFirstLoad(false);
  }, []);

  return {
    isFirstLoad,
    appReady,
    minDurationDone,
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
  const menuRef = useRef<HTMLDivElement | null>(null);

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
      const target = e.target as Node;
      const inContainer =
        containerRef.current && containerRef.current.contains(target);
      const inMenu = menuRef.current && menuRef.current.contains(target);
      if (!inContainer && !inMenu) {
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
    menuRef,
    close,
    toggle
  };
}
