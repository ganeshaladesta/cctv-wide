/**
 * SCC - EAGLE EYES: UNRAS Persistent Incident Identity Registry & Deduplication Engine
 *
 * Guarantees the absolute business requirement:
 * ONE REAL-WORLD PROTEST INCIDENT MUST NEVER BE INSERTED MORE THAN ONCE.
 *
 * Features:
 * 1. Multi-signal persistent identity resolution.
 * 2. 4-Tier Candidate Classification (NEW, EXISTING, DUPLICATE, AMBIGUOUS).
 * 3. Exact and semantic order-invariant entity fingerprinting.
 * 4. Automatic quarantine to Review Queue for ambiguous candidates.
 */

import crypto from "node:crypto";
import { IdentityRegistryEntry, ReviewQueueItem } from "./types/protests";

// Common Indonesian stopwords in protest descriptions that should be excluded during semantic keyword comparison
const PROTEST_STOPWORDS = new Set([
  "dan", "di", "ke", "dari", "yang", "pada", "untuk", "dengan", "adalah",
  "oleh", "atau", "ini", "itu", "sebagai", "dalam", "atas", "terkait",
  "aksi", "damai", "unjuk", "rasa", "unras", "massa", "aspirasi", "penyampaian",
  "tentang", "perihal", "nomor", "no", "tahun", "thn", "menuntut", "meminta",
  "mendesak", "menolak", "agar", "supaya", "hari", "pukul", "jam", "wib",
  "rencana", "kegiatan", "titik", "lokasi", "kawasan", "depan", "gedung", "kantor"
]);

// Generic placeholders and jurisdiction names that should not be used as unique locations
const GENERIC_LOCATION_NAMES = new Set([
  "luar koperbi",
  "koperbi",
  "kp/kpw",
  "kp kpw",
  "kpbi",
  "kpwdn",
  "tidak diketahui",
  "belum ditentukan",
  "tbd",
  "lokasi belum ditentukan",
  "jakarta",
  "dki jakarta",
  "wilayah hukum",
  "indonesia"
]);

/**
 * Normalizes an entity string (lowercase, alphanumeric, collapsed spaces).
 */
export function normalizeEntityString(val: unknown): string {
  if (val === undefined || val === null) return "";
  return String(val)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts significant tokens from text, filtering stopwords and short words.
 */
export function extractKeywords(val: unknown): Set<string> {
  const norm = normalizeEntityString(val);
  const words = norm.split(" ");
  const keywords = new Set<string>();
  for (const w of words) {
    if (w.length >= 3 && !PROTEST_STOPWORDS.has(w)) {
      keywords.add(w);
    }
  }
  return keywords;
}

/**
 * Calculates Jaccard similarity coefficient between two sets of keyword tokens.
 */
export function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Checks if a location string is empty or matches generic jurisdiction placeholders.
 */
export function isGenericLocation(loc: unknown): boolean {
  if (loc === undefined || loc === null) return true;
  const norm = normalizeEntityString(loc);
  if (!norm || norm === "-" || norm === "--") return true;
  return GENERIC_LOCATION_NAMES.has(norm);
}

/**
 * Checks if two location strings refer to the same physical spot.
 */
export function isMatchingLocation(locA: unknown, locB: unknown): boolean {
  if (isGenericLocation(locA) || isGenericLocation(locB)) return false;
  const normA = normalizeEntityString(locA);
  const normB = normalizeEntityString(locB);
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  const tokensA = extractKeywords(locA);
  const tokensB = extractKeywords(locB);
  return calculateJaccardSimilarity(tokensA, tokensB) >= 0.5;
}

/**
 * Generates an exact entity fingerprint: FP_EXACT:{YYYYMMDD}:{HASH16}
 */
export function generateExactFingerprint(
  eventDateWib: string,
  lokasi: unknown,
  aliansi: unknown,
  isu: unknown
): string {
  const normDate = eventDateWib.trim();
  const normLoc = normalizeEntityString(lokasi);
  const normOrg = normalizeEntityString(aliansi);
  const normIsu = normalizeEntityString(isu);

  const payload = [normDate, normLoc, normOrg, normIsu].join("|");
  const hash = crypto.createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16).toUpperCase();
  const dateCompact = normDate.replace(/-/g, "");
  return `FP_EXACT:${dateCompact}:${hash}`;
}

/**
 * Generates an order-invariant semantic fingerprint: FP_SEM:{YYYYMMDD}:{HASH16}
 * Grounds identity on Event Date + Normalized Organization + Sorted Core Demand Keywords.
 * This remains invariant even when Excel reporting changes phrasing order or location specificity.
 */
export function generateSemanticFingerprint(
  eventDateWib: string,
  aliansi: unknown,
  isu: unknown
): string | null {
  const normDate = eventDateWib.trim();
  const normOrg = normalizeEntityString(aliansi);
  const issueKeywords = Array.from(extractKeywords(isu)).sort();

  // Need at least organization OR at least 2 significant demand keywords
  if (!normOrg && issueKeywords.length < 2) {
    return null;
  }

  const payload = [normDate, normOrg, issueKeywords.join(",")].join("|");
  const hash = crypto.createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16).toUpperCase();
  const dateCompact = normDate.replace(/-/g, "");
  return `FP_SEM:${dateCompact}:${hash}`;
}

/**
 * Generates a stable source key from raw ID UNRAS / KODE_UNRAS if available.
 * If specific location is available, scopes the source key to the incident point.
 */
export function generateSourceKey(rawKode: unknown, lokasi?: unknown): string | null {
  if (rawKode === undefined || rawKode === null) return null;
  const str = String(rawKode).trim().toUpperCase();
  const clean = str.replace(/[^A-Z0-9]/g, "");
  if (!clean || clean === "-" || clean === "--") return null;

  if (lokasi) {
    const normLoc = normalizeEntityString(lokasi);
    if (normLoc && !isGenericLocation(normLoc)) {
      const hashLoc = crypto.createHash("sha256").update(normLoc, "utf8").digest("hex").slice(0, 8).toUpperCase();
      return `SRC:${clean}:${hashLoc}`;
    }
  }
  return `SRC:${clean}`;
}

export interface CandidateClassification {
  action: "NEW" | "EXISTING" | "DUPLICATE" | "AMBIGUOUS";
  confidence: "confirmed" | "probable" | "ambiguous" | "distinct";
  canonicalId?: string;
  reason: string;
  similarityScore?: number;
  fingerprints: {
    exact: string;
    semantic: string | null;
    sourceKey: string | null;
  };
}

export interface ExistingProtestComparisonItem {
  id: string;
  id_kejadian: string;
  kode_unras?: string | null;
  tanggal: string;
  lokasi: string;
  organisasi_kelompok?: string | null;
  isu_tuntutan: string;
  created_at?: string;
}

/**
 * 4-Tier Candidate Classifier
 * Evaluates candidate against Persistent Identity Registry and active same-day incidents.
 */
export function classifyCandidate(
  candidate: {
    id_kejadian: string;
    kode_unras: string;
    tanggal: string; // YYYY-MM-DD
    lokasi: string;
    organisasi_kelompok?: string | null;
    isu_tuntutan: string;
  },
  existingRegistryKeys: Map<string, string>, // identity_key -> canonical_id
  existingProtestsOnDate: ExistingProtestComparisonItem[]
): CandidateClassification {
  const fpExact = generateExactFingerprint(
    candidate.tanggal,
    candidate.lokasi,
    candidate.organisasi_kelompok,
    candidate.isu_tuntutan
  );
  const fpSem = generateSemanticFingerprint(
    candidate.tanggal,
    candidate.organisasi_kelompok,
    candidate.isu_tuntutan
  );
  const sourceKey = generateSourceKey(candidate.kode_unras, candidate.lokasi);

  const fingerprints = {
    exact: fpExact,
    semantic: fpSem,
    sourceKey
  };

  // ---------------------------------------------------------------------------
  // Tier 1: Exact stable identifiers in Registry
  // ---------------------------------------------------------------------------
  const exactIdKey = `ID:${candidate.id_kejadian}`;
  if (existingRegistryKeys.has(exactIdKey)) {
    return {
      action: "EXISTING",
      confidence: "confirmed",
      canonicalId: existingRegistryKeys.get(exactIdKey)!,
      reason: `Identifier '${candidate.id_kejadian}' sudah tercatat di sistem registry identitas`,
      fingerprints
    };
  }

  if (sourceKey && existingRegistryKeys.has(sourceKey)) {
    const canonicalId = existingRegistryKeys.get(sourceKey)!;
    return {
      action: "DUPLICATE",
      confidence: "confirmed",
      canonicalId,
      reason: `Kunci sumber '${sourceKey}' telah dipetakan ke rekor kanonikal ${canonicalId}`,
      fingerprints
    };
  }

  // ---------------------------------------------------------------------------
  // Tier 2: Exact Normalized Fingerprint in Registry
  // ---------------------------------------------------------------------------
  if (existingRegistryKeys.has(fpExact)) {
    const canonicalId = existingRegistryKeys.get(fpExact)!;
    return {
      action: "DUPLICATE",
      confidence: "confirmed",
      canonicalId,
      reason: `Fingerprint eksak cocok dengan kejadian ${canonicalId}`,
      fingerprints
    };
  }

  // ---------------------------------------------------------------------------
  // Tier 3: Semantic Order-Invariant Fingerprint in Registry
  // ---------------------------------------------------------------------------
  if (fpSem && existingRegistryKeys.has(fpSem)) {
    const canonicalId = existingRegistryKeys.get(fpSem)!;
    const candLocGeneric = isGenericLocation(candidate.lokasi);
    const existingMatch = existingProtestsOnDate.find((p) => p.id_kejadian === canonicalId);
    const existLocGeneric = existingMatch ? isGenericLocation(existingMatch.lokasi) : false;
    const locMatch = existingMatch ? isMatchingLocation(candidate.lokasi, existingMatch.lokasi) : false;

    // Only auto-deduplicate via semantic fingerprint if at least one location is generic,
    // or locations match, or there is no existing protest object to compare locations.
    if (!existingMatch || candLocGeneric || existLocGeneric || locMatch) {
      return {
        action: "DUPLICATE",
        confidence: "confirmed",
        canonicalId,
        reason: `Fingerprint semantik kelompok & tuntutan cocok dengan kejadian ${canonicalId}`,
        fingerprints
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Tier 4: Cross-check against all existing protests on the same date
  // ---------------------------------------------------------------------------
  const candIsuTokens = extractKeywords(candidate.isu_tuntutan);
  const candOrgTokens = extractKeywords(candidate.organisasi_kelompok);
  const candLocGeneric = isGenericLocation(candidate.lokasi);

  for (const existing of existingProtestsOnDate) {
    if (existing.id_kejadian === candidate.id_kejadian) {
      return {
        action: "EXISTING",
        confidence: "confirmed",
        canonicalId: existing.id_kejadian,
        reason: `id_kejadian identik dengan rekor yang sudah tersimpan di database`,
        fingerprints
      };
    }

    const existIsuTokens = extractKeywords(existing.isu_tuntutan);
    const existOrgTokens = extractKeywords(existing.organisasi_kelompok);
    const existLocGeneric = isGenericLocation(existing.lokasi);

    const isuSim = calculateJaccardSimilarity(candIsuTokens, existIsuTokens);
    const orgSim = calculateJaccardSimilarity(candOrgTokens, existOrgTokens);
    const locMatch = isMatchingLocation(candidate.lokasi, existing.lokasi);

    // Rule A: Very high organization AND high issue overlap on same date -> Confirmed Duplicate
    if (orgSim >= 0.7 && isuSim >= 0.6) {
      return {
        action: "DUPLICATE",
        confidence: "confirmed",
        canonicalId: existing.id_kejadian,
        similarityScore: Math.max(orgSim, isuSim),
        reason: `Kesamaan organisasi (${(orgSim * 100).toFixed(0)}%) dan tuntutan isu (${(isuSim * 100).toFixed(0)}%) pada tanggal ${candidate.tanggal} menunjukkan kejadian yang sama`,
        fingerprints
      };
    }

    // Rule B: Matching physical location AND strong organization OR issue overlap -> Probable Duplicate
    if (locMatch && (orgSim >= 0.5 || isuSim >= 0.5)) {
      return {
        action: "DUPLICATE",
        confidence: "probable",
        canonicalId: existing.id_kejadian,
        similarityScore: Math.max(orgSim, isuSim),
        reason: `Lokasi sama ('${existing.lokasi}') dengan kesamaan organisasi/isu (${(Math.max(orgSim, isuSim) * 100).toFixed(0)}%) pada tanggal ${candidate.tanggal}`,
        fingerprints
      };
    }

    // Rule C: High organization match when one record has generic jurisdiction location (e.g. 'LUAR KOPERBI')
    if (orgSim >= 0.6 && (candLocGeneric || existLocGeneric)) {
      return {
        action: "DUPLICATE",
        confidence: "probable",
        canonicalId: existing.id_kejadian,
        similarityScore: orgSim,
        reason: `Organisasi identik/mirip (${(orgSim * 100).toFixed(0)}%) pada tanggal ${candidate.tanggal} dengan salah satu lokasi merupakan yurisdiksi umum ('${candLocGeneric ? candidate.lokasi : existing.lokasi}')`,
        fingerprints
      };
    }

    // Rule D: High issue overlap (>= 70%) on same date with generic location -> Probable Duplicate
    if (isuSim >= 0.7 && (candLocGeneric || existLocGeneric)) {
      return {
        action: "DUPLICATE",
        confidence: "probable",
        canonicalId: existing.id_kejadian,
        similarityScore: isuSim,
        reason: `Isu tuntutan sangat mirip (${(isuSim * 100).toFixed(0)}%) pada tanggal ${candidate.tanggal} dengan salah satu lokasi merupakan yurisdiksi umum`,
        fingerprints
      };
    }

    // Rule E: Ambiguous Overlap -> Quarantine in Review Queue
    // Partial similarity where we cannot be 100% sure if it's a separate protest or the same one
    if ((isuSim >= 0.35 && orgSim >= 0.35) || (locMatch && (isuSim >= 0.3 || orgSim >= 0.3))) {
      return {
        action: "AMBIGUOUS",
        confidence: "ambiguous",
        canonicalId: existing.id_kejadian,
        similarityScore: Math.max(orgSim, isuSim),
        reason: `Kemiripan parsial dengan kejadian ${existing.id_kejadian} pada ${candidate.tanggal} (org: ${(orgSim * 100).toFixed(0)}%, isu: ${(isuSim * 100).toFixed(0)}%). Ditahan untuk verifikasi operator.`,
        fingerprints
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Check Essential Fields Sufficiency
  // ---------------------------------------------------------------------------
  const isIsuEmpty = !normalizeEntityString(candidate.isu_tuntutan) || candidate.isu_tuntutan === "Aksi Unjuk Rasa";
  if (candLocGeneric && isIsuEmpty) {
    return {
      action: "AMBIGUOUS",
      confidence: "ambiguous",
      reason: `Field esensial (lokasi dan isu tuntutan) kosong atau hanya placeholder generik. Rekor tidak memiliki identitas unik yang dapat diverifikasi.`,
      fingerprints
    };
  }

  // Tier 4 Verdict: Truly New, Independent Incident
  return {
    action: "NEW",
    confidence: "distinct",
    reason: `Kejadian unik baru terverifikasi pada tanggal ${candidate.tanggal}`,
    fingerprints
  };
}
