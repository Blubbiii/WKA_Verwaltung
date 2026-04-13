/**
 * Session Invalidation via Permission-Version
 *
 * Problem: WPM nutzt NextAuth v5 JWT strategy. JWT-Tokens sind stateless —
 * eine Rollen-Änderung an einem User wirkt erst nach dem nächsten Logout
 * oder JWT-Expiry (session.maxAge, default 30 Tage).
 *
 * Lösung: Pro User speichern wir in Redis einen "permissions-version"-
 * Timestamp. Der JWT-Token enthält den Timestamp der beim Login gültig war.
 * Auf jedem JWT-Refresh vergleichen wir beide: ist die Redis-Version neuer
 * (= jemand hat dem User inzwischen Rollen zugewiesen/entfernt), forcen
 * wir ein Re-fetch der User-Daten aus der DB und updaten den Token.
 *
 * Performance: 1 Redis GET pro NextAuth getSession(). Akzeptabel weil
 * Redis-Fallback auf in-memory zuerst fliegt.
 */

import { cache } from "@/lib/cache";
import { CACHE_PREFIXES } from "@/lib/cache/types";

const VERSION_PREFIX = `${CACHE_PREFIXES.USER}:perm-version`;
// Permission-Version muss länger leben als Session-Cookies — 60 Tage.
const VERSION_TTL_SECONDS = 60 * 24 * 60 * 60;

function versionKey(userId: string): string {
  return `${VERSION_PREFIX}:${userId}`;
}

/**
 * Read the current permission-version for a user.
 * Returns 0 if no version has been set yet (user has never had a permission
 * change → any existing JWT is considered fresh).
 */
export async function getPermissionVersion(userId: string): Promise<number> {
  const v = await cache.get<number>(versionKey(userId));
  return typeof v === "number" ? v : 0;
}

/**
 * Bump the permission-version for a user. Call this whenever you assign,
 * revoke, or change a user's roles or role-assignments. The NEXT JWT
 * refresh for this user will detect the new version and re-fetch user
 * data from the DB.
 */
export async function bumpPermissionVersion(userId: string): Promise<number> {
  const now = Date.now();
  await cache.set(versionKey(userId), now, VERSION_TTL_SECONDS);
  return now;
}

/**
 * Decide whether a JWT-Token's permission-version is stale compared to
 * the current Redis value. Used in the jwt() NextAuth callback.
 */
export async function isPermissionVersionStale(
  userId: string,
  tokenVersion: number | undefined,
): Promise<boolean> {
  const current = await getPermissionVersion(userId);
  // Kein Token-Version → legacy JWT von vor der Invalidation-Einführung, nicht stale
  if (tokenVersion == null) return false;
  return current > tokenVersion;
}
