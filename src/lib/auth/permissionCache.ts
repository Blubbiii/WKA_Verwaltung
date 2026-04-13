import type { UserPermissions } from "./permission-types";
import { cache } from "@/lib/cache";
import { CACHE_PREFIXES } from "@/lib/cache/types";
import { bumpPermissionVersion } from "./session-invalidation";

// ============================================================================
// PERMISSION CACHE MODUL — Redis-backed via shared cache service
// ============================================================================
// Uses the centralized Redis cache (with in-memory fallback) for
// cross-instance consistency. TTL default: 300 seconds (5 minutes).
// ============================================================================

const PERMISSION_PREFIX = `${CACHE_PREFIXES.USER}:permissions`;
const DEFAULT_TTL_SECONDS = 300; // 5 minutes
let cacheTTLSeconds = DEFAULT_TTL_SECONDS;

function permKey(userId: string): string {
  return `${PERMISSION_PREFIX}:${userId}`;
}

/**
 * Get cached permissions for a user (Redis → memory fallback)
 */
export async function getCachedPermissions(userId: string): Promise<UserPermissions | null> {
  return cache.get<UserPermissions>(permKey(userId));
}

/**
 * Store permissions in cache for a user
 * @param ttlSeconds - TTL in seconds (default: 300)
 */
export async function setCachedPermissions(
  userId: string,
  permissions: UserPermissions,
  ttlSeconds: number = cacheTTLSeconds
): Promise<void> {
  await cache.set(permKey(userId), permissions, ttlSeconds);
}

/**
 * Invalidate cache for a specific user (on role assignment changes).
 *
 * Auch die Permission-Version wird gebumped — die Node-seitige Enforcement
 * über requirePermission() fetched sofort neue Daten aus der DB.
 * Der JWT-Token im Browser enthält weiterhin die alte roleHierarchy bis
 * zum nächsten Session-Refresh, aber das ist rein kosmetisch (UI) — echte
 * Auth-Checks laufen durch den frisch invalidierten Cache.
 */
export async function invalidateUser(userId: string): Promise<void> {
  await cache.del(permKey(userId));
  await bumpPermissionVersion(userId);
}

/**
 * Invalidate all permission caches (on role definition changes).
 *
 * Bumpt NICHT alle User-Versionen einzeln — bei Role-Definition-Changes
 * sind alle User betroffen. Nächster Permission-Lookup erzwingt DB-Re-fetch
 * via geleertem Cache. Für selektive JWT-Invalidation wäre ein Scan über
 * alle aktiven Sessions nötig, was den Kosten-/Nutzen-Rahmen sprengt.
 */
export async function invalidateAll(): Promise<void> {
  await cache.delPattern(`${PERMISSION_PREFIX}:*`);
}

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

export function setCacheTTL(ttlMs: number): void {
  if (ttlMs < 0) throw new Error("TTL muss positiv sein");
  cacheTTLSeconds = Math.round(ttlMs / 1000);
}

export function getCacheTTL(): number {
  return cacheTTLSeconds * 1000;
}
