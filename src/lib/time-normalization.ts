/**
 * SCC - EAGLE EYES: Time Normalization Utility
 * Normalizes varied Indonesian Excel and operator time strings into PostgreSQL TIME standard (HH:MM:SS)
 *
 * Rules:
 * - Strips WIB/WITA/WIT/UTC/GMT suffixes
 * - Trims whitespace
 * - Handles Indonesian dot notation (e.g. 09.30 -> 09:30:00)
 * - Handles Excel fractional day numbers (e.g. 0.375 -> 09:00:00)
 * - Validates hour (00-23), minute (00-59), second (00-59)
 * - Never passes timezone labels to PostgreSQL TIME columns
 * - Never silently converts invalid inputs to midnight (returns descriptive error)
 */

export interface TimeNormalizationResult {
  time: string | null; // "HH:MM:SS" or null
  original: unknown;
  error?: string;
}

export function normalizeTimeString(raw: unknown): TimeNormalizationResult {
  if (raw === null || raw === undefined) {
    return { time: null, original: raw };
  }

  // Handle Excel numeric fraction of a day (e.g., 0.375 for 09:00:00)
  if (typeof raw === "number") {
    if (isNaN(raw) || raw < 0 || raw >= 1) {
      return {
        time: null,
        original: raw,
        error: `Nilai numerik waktu di luar rentang 0-1 (fraction of day): ${raw}`
      };
    }
    const totalSeconds = Math.round(raw * 86400);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return {
      time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      original: raw
    };
  }

  let str = String(raw).trim();
  if (!str || str.toLowerCase() === "null" || str.toLowerCase() === "undefined") {
    return { time: null, original: raw };
  }

  // Strip common timezone labels case-insensitively first
  str = str.replace(/\b(wib|wita|wit|utc|gmt)\b/gi, "").trim();

  // If ISO string like "2026-11-19T09:30:00+07:00", extract the time part
  if (/\d+T\d+/i.test(str)) {
    const afterT = str.split(/T/i)[1];
    str = afterT.split("+")[0].split("-")[0].replace("Z", "").trim();
  }

  // If time range specified like "09:00 - 12:00" or "09.00 s/d 12.00", take start time
  if (str.includes("-")) {
    str = str.split("-")[0].trim();
  } else if (/s\/d|sd/i.test(str)) {
    str = str.split(/s\/d|sd/i)[0].trim();
  }

  // Replace Indonesian dot notation: "09.30" -> "09:30"
  str = str.replace(/\./g, ":").trim();

  // Match HH:MM:SS or HH:MM
  const match = str.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) {
    return {
      time: null,
      original: raw,
      error: `Format waktu tidak valid: '${String(raw).trim()}'. Diharapkan format 'HH:MM' atau 'HH:MM:SS'.`
    };
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] !== undefined ? parseInt(match[3], 10) : 0;

  if (hours < 0 || hours > 23) {
    return {
      time: null,
      original: raw,
      error: `Jam tidak valid (${hours}). Harus berada di rentang 00-23.`
    };
  }
  if (minutes < 0 || minutes > 59) {
    return {
      time: null,
      original: raw,
      error: `Menit tidak valid (${minutes}). Harus berada di rentang 00-59.`
    };
  }
  if (seconds < 0 || seconds > 59) {
    return {
      time: null,
      original: raw,
      error: `Detik tidak valid (${seconds}). Harus berada di rentang 00-59.`
    };
  }

  const normalized = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return { time: normalized, original: raw };
}
