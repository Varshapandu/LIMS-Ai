"use client";

/**
 * Role-Based Access Control (RBAC) for frontend routes.
 *
 * Defines which roles can access which pages and provides a
 * hook + guard component for enforcement (analysis item 7.1).
 */

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { loadStoredUser, type AuthUser } from "./auth-storage";

/* ─── Role definitions ─── */
export type AppRole = "ADMIN" | "LAB_TECHNICIAN" | "DOCTOR";

/* ─── Route → allowed roles mapping ─── */
const ROUTE_PERMISSIONS: Record<string, AppRole[]> = {
  "/dashboard":        ["ADMIN", "LAB_TECHNICIAN", "DOCTOR"],
  "/billing":          ["ADMIN"],
  "/collection":       ["ADMIN", "LAB_TECHNICIAN"],
  "/results":          ["ADMIN", "LAB_TECHNICIAN"],
  "/approvals":        ["ADMIN", "DOCTOR"],
  "/reference-ranges": ["ADMIN"],
  "/reports":          ["ADMIN", "DOCTOR"],
};

/**
 * Check if a user role has access to a given path.
 */
export function hasAccess(path: string, role: string): boolean {
  const allowed = ROUTE_PERMISSIONS[path];
  if (!allowed) return true; // unknown routes are open
  return allowed.includes(role as AppRole);
}

/**
 * Get the list of nav items visible to the current user role.
 */
export function getVisibleRoutes(role: string): string[] {
  return Object.entries(ROUTE_PERMISSIONS)
    .filter(([, roles]) => roles.includes(role as AppRole))
    .map(([path]) => path);
}

/**
 * Hook that checks RBAC for the current route and redirects
 * to /dashboard if the user lacks access.
 */
export function useRbacGuard(pathname: string): { allowed: boolean; user: AuthUser | null } {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    const stored = loadStoredUser();
    setUser(stored);

    if (stored && !hasAccess(pathname, stored.role)) {
      setAllowed(false);
      router.replace("/dashboard");
    } else {
      setAllowed(true);
    }
  }, [pathname, router]);

  return { allowed, user };
}

/**
 * Guard component — renders children only if the current user's
 * role permits access to the wrapped route.
 */
export function RbacGate({
  path,
  children,
  fallback = null,
}: {
  path: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { allowed } = useRbacGuard(path);

  if (!allowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
