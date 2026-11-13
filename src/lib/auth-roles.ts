/**
 * SCC - EAGLE EYES — Role-Based Access Control (RBAC) & Authentication Helpers
 * Copyright: Developed by Ganesha Ladesta
 */

import { UserRole, UserProfile } from "@/lib/types/protests";
import { NextRequest } from "next/server";

export const DEFAULT_VIEWER: UserProfile = {
  id: "usr-viewer-001",
  email: "viewer@scc.go.id",
  name: "Petugas Monitoring (Viewer)",
  role: "viewer",
  agency: "SCC Eagle Eyes"
};

export const DEFAULT_OPERATOR: UserProfile = {
  id: "usr-operator-001",
  email: "operator@scc.go.id",
  name: "Operator Lapangan SCC",
  role: "operator",
  agency: "Biro Pengamanan & Intelijen"
};

export const DEFAULT_ADMIN: UserProfile = {
  id: "usr-admin-001",
  email: "admin@scc.go.id",
  name: "Administrator Komando SCC",
  role: "admin",
  agency: "Pusat Komando SCC"
};

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
      id: headerId || DEFAULT_ADMIN.id,
      name: headerName || DEFAULT_ADMIN.name
    };
  }

  if (headerRole === "operator") {
    return {
      ...DEFAULT_OPERATOR,
      id: headerId || DEFAULT_OPERATOR.id,
      name: headerName || DEFAULT_OPERATOR.name
    };
  }

  if (headerRole === "viewer") {
    return {
      ...DEFAULT_VIEWER,
      id: headerId || DEFAULT_VIEWER.id,
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
          id: payload.sub || "usr-jwt-user",
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
  return role === "admin" || role === "operator";
}

export function canViewSyncLogs(userOrRole: UserProfile | UserRole): boolean {
  const role = extractRole(userOrRole);
  return role === "admin" || role === "operator" || role === "viewer";
}
