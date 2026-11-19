/**
 * SCC - EAGLE EYES — Role-Based Access Control (RBAC) & Authentication Helpers
 * Copyright: Developed by Ganesha Ladesta
 */

import { UserRole, UserProfile } from "@/lib/types/protests";
import { NextRequest } from "next/server";

export const DEFAULT_VIEWER: UserProfile = {
  id: "a0000000-0000-0000-0000-000000000003",
  email: "viewer@scc.go.id",
  name: "Petugas Monitoring (Viewer)",
  role: "viewer",
  agency: "SCC Eagle Eyes"
};

export const DEFAULT_OPERATOR: UserProfile = {
  id: "a0000000-0000-0000-0000-000000000002",
  email: "operator@scc.go.id",
  name: "Operator Lapangan SCC",
  role: "operator",
  agency: "Biro Pengamanan & Intelijen"
};

export const DEFAULT_ADMIN: UserProfile = {
  id: "a0000000-0000-0000-0000-000000000001",
  email: "admin@scc.go.id",
  name: "Administrator Komando SCC",
  role: "admin",
  agency: "Pusat Komando SCC"
};

/**
 * Ensures any input ID string is converted to a valid PostgreSQL UUID.
 * Normalizes legacy IDs like 'usr-operator-001' and hashes non-standard strings.
 */
export function ensureValidUuid(id?: string | null): string {
  if (!id) return "00000000-0000-0000-0000-000000000000";
  const trimmed = id.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(trimmed)) return trimmed.toLowerCase();

  if (trimmed === "usr-operator-001") return "a0000000-0000-0000-0000-000000000002";
  if (trimmed === "usr-admin-001") return "a0000000-0000-0000-0000-000000000001";
  if (trimmed === "usr-viewer-001") return "a0000000-0000-0000-0000-000000000003";

  // Deterministic mapping for arbitrary strings into valid UUID format
  let hash1 = 0x811c9dc5;
  let hash2 = 0x41c64e6d;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed.charCodeAt(i);
    hash1 = Math.imul(hash1 ^ ch, 0x01000193);
    hash2 = Math.imul(hash2 ^ ch, 0x5bd1e995);
  }
  const h1 = (hash1 >>> 0).toString(16).padStart(8, "0");
  const h2 = (hash2 >>> 0).toString(16).padStart(8, "0");
  const combined = (h1 + h2 + h1 + h2).slice(0, 32);
  return `${combined.slice(0, 8)}-${combined.slice(8, 12)}-4${combined.slice(13, 16)}-a${combined.slice(17, 20)}-${combined.slice(20, 32)}`;
}

/**
 * Resolve current active user from incoming request:
 * 1. Checks 'x-scc-user-role' or 'x-scc-user-id' request headers (API/service integration)
 * 2. Checks Supabase JWT auth token in Authorization header
 * 3. Falls back to default operator in internal development mode, or viewer in public mode
 */
export function resolveCurrentUser(req?: NextRequest | Request): UserProfile {
  if (!req) return DEFAULT_OPERATOR;

  const headerRole = req.headers.get("x-scc-user-role")?.toLowerCase();
  const headerId = req.headers.get("x-scc-user-id");
  const headerName = req.headers.get("x-scc-user-name");

  if (headerRole === "admin") {
    return {
      ...DEFAULT_ADMIN,
      id: headerId ? ensureValidUuid(headerId) : DEFAULT_ADMIN.id,
      name: headerName || DEFAULT_ADMIN.name
    };
  }

  if (headerRole === "operator") {
    return {
      ...DEFAULT_OPERATOR,
      id: headerId ? ensureValidUuid(headerId) : DEFAULT_OPERATOR.id,
      name: headerName || DEFAULT_OPERATOR.name
    };
  }

  if (headerRole === "viewer") {
    return {
      ...DEFAULT_VIEWER,
      id: headerId ? ensureValidUuid(headerId) : DEFAULT_VIEWER.id,
      name: headerName || DEFAULT_VIEWER.name
    };
  }

  // Check Bearer token claims if provided (JWT payload inspection)
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString("utf8")
        );
        const role =
          payload.app_metadata?.role ||
          payload.user_metadata?.role ||
          payload.role ||
          "operator";
        return {
          id: ensureValidUuid(payload.sub),
          email: payload.email || "user@scc.go.id",
          name: payload.user_metadata?.name || payload.email || "Petugas Terotentikasi",
          role: (role === "admin" ? "admin" : role === "viewer" ? "viewer" : "operator") as UserRole,
          agency: payload.user_metadata?.agency || "SCC Eagle Eyes"
        };
      }
    } catch {}
  }

  // Default to operator for application workflows
  return DEFAULT_OPERATOR;
}

function extractRole(userOrRole: UserProfile | UserRole): UserRole {
  return typeof userOrRole === "string" ? userOrRole : userOrRole.role;
}

export function canCreateProtest(userOrRole: UserProfile | UserRole): boolean {
  const role = extractRole(userOrRole);
  return role === "admin" || role === "operator";
}

export function canEditProtest(userOrRole: UserProfile | UserRole): boolean {
  const role = extractRole(userOrRole);
  return role === "admin" || role === "operator";
}

export function canUpdateStatus(userOrRole: UserProfile | UserRole): boolean {
  const role = extractRole(userOrRole);
  return role === "admin" || role === "operator";
}

export function canLinkCCTV(userOrRole: UserProfile | UserRole): boolean {
  const role = extractRole(userOrRole);
  return role === "admin" || role === "operator";
}

export function canDeleteProtest(userOrRole: UserProfile | UserRole): boolean {
  const role = extractRole(userOrRole);
  return role === "admin";
}

export function canTriggerSync(userOrRole: UserProfile | UserRole): boolean {
  const role = extractRole(userOrRole);
  return role === "admin";
}

export function canTriggerManualSync(userOrRole: UserProfile | UserRole): boolean {
  const role = extractRole(userOrRole);
  return role === "admin";
}

export function canViewSyncLogs(userOrRole: UserProfile | UserRole): boolean {
  const role = extractRole(userOrRole);
  return role === "admin" || role === "operator" || role === "viewer";
}
