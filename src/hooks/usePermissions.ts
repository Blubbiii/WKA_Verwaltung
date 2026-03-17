"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";

interface PermissionsData {
  permissions: string[];
  roleHierarchy: number;
}

interface UsePermissionsResult {
  /** Flat array of all permission names the user has */
  permissions: string[];
  /** Highest role hierarchy level (0=none, 40=viewer, 60=manager, 80=admin, 100=superadmin) */
  roleHierarchy: number;
  /** Whether the permissions have been loaded from the server */
  loaded: boolean;
  /** Whether the permissions are currently loading */
  loading: boolean;
  /** Error message if the fetch failed */
  error: string | null;
  /** Check if the user has a specific permission */
  hasPermission: (permission: string) => boolean;
  /** Check if the user has ANY of the given permissions */
  hasAnyPermission: (permissions: string[]) => boolean;
  /** Check if the user has ALL of the given permissions */
  hasAllPermissions: (permissions: string[]) => boolean;
  /** Re-fetch permissions from the server */
  refresh: () => void;
}

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });

/**
 * Client-side hook to fetch and check user permissions.
 *
 * Uses SWR for deduplication, caching, and stale-while-revalidate.
 * Multiple components calling usePermissions() share the same cached data.
 *
 * @example
 * const { hasPermission, loaded } = usePermissions();
 * if (loaded && hasPermission("parks:read")) { ... }
 */
export function usePermissions(): UsePermissionsResult {
  const { data, error, isLoading, mutate } = useSWR<PermissionsData>(
    "/api/auth/my-permissions",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60_000,
      refreshInterval: 0,
    }
  );

  const permissions = data?.permissions ?? [];
  const roleHierarchy = data?.roleHierarchy ?? 0;
  const loaded = !isLoading;

  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);

  const hasPermission = useCallback(
    (permission: string) => permissionsSet.has(permission),
    [permissionsSet]
  );

  const hasAnyPermission = useCallback(
    (perms: string[]) => perms.some((p) => permissionsSet.has(p)),
    [permissionsSet]
  );

  const hasAllPermissions = useCallback(
    (perms: string[]) => perms.every((p) => permissionsSet.has(p)),
    [permissionsSet]
  );

  return {
    permissions,
    roleHierarchy,
    loaded,
    loading: isLoading,
    error: error?.message ?? null,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    refresh: () => mutate(),
  };
}
