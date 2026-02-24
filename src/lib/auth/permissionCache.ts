import type { UserPermissions } from "./permissions";

// ============================================================================
// PERMISSION CACHE MODUL
// ============================================================================
// In-Memory Cache mit TTL für User-Permissions
// Optimiert die Performance durch Vermeidung wiederholter DB-Abfragen
// ============================================================================

// Cache-Eintrag Interface
interface CacheEntry {
  permissions: UserPermissions;
  expiresAt: number;
}

// Cache Storage - Map<userId, CacheEntry>
const permissionCache = new Map<string, CacheEntry>();

// Default TTL: 5 Minuten (in Millisekunden)
const DEFAULT_TTL_MS = 5 * 60 * 1000;

// Konfigurierbare TTL (kann später via Environment Variable gesetzt werden)
let cacheTTL = DEFAULT_TTL_MS;

// ============================================================================
// CACHE FUNKTIONEN
// ============================================================================

/**
 * Holt gecachte Permissions für einen User
 * @param userId - Die User-ID
 * @returns Die gecachten Permissions oder null wenn nicht vorhanden/abgelaufen
 */
export function getCachedPermissions(userId: string): UserPermissions | null {
  const entry = permissionCache.get(userId);

  if (!entry) {
    return null;
  }

  // Pruefe ob der Cache-Eintrag abgelaufen ist
  if (Date.now() > entry.expiresAt) {
    // Abgelaufenen Eintrag entfernen
    permissionCache.delete(userId);
    return null;
  }

  return entry.permissions;
}

/**
 * Speichert Permissions im Cache für einen User
 * @param userId - Die User-ID
 * @param permissions - Die zu cachenden Permissions
 * @param ttl - Optionale TTL in Millisekunden (Standard: 5 Minuten)
 */
export function setCachedPermissions(
  userId: string,
  permissions: UserPermissions,
  ttl: number = cacheTTL
): void {
  const entry: CacheEntry = {
    permissions,
    expiresAt: Date.now() + ttl,
  };

  permissionCache.set(userId, entry);
}

/**
 * Invalidiert den Cache für einen spezifischen User
 * Wird aufgerufen wenn die Rollen eines Users geändert werden
 * @param userId - Die User-ID deren Cache gelöscht werden soll
 */
export function invalidateUser(userId: string): void {
  permissionCache.delete(userId);
}

/**
 * Invalidiert den gesamten Cache
 * Wird aufgerufen wenn Rollen selbst geändert werden (Permissions einer Rolle)
 * da dies alle User mit dieser Rolle betrifft
 */
export function invalidateAll(): void {
  permissionCache.clear();
}

// ============================================================================
// CACHE KONFIGURATION UND UTILITIES
// ============================================================================

/**
 * Setzt die Cache TTL
 * @param ttlMs - TTL in Millisekunden
 */
export function setCacheTTL(ttlMs: number): void {
  if (ttlMs < 0) {
    throw new Error("TTL muss positiv sein");
  }
  cacheTTL = ttlMs;
}

/**
 * Gibt die aktuelle Cache TTL zurück
 * @returns TTL in Millisekunden
 */
export function getCacheTTL(): number {
  return cacheTTL;
}

/**
 * Gibt die aktuelle Cache-Größe zurück (Anzahl der Einträge)
 * Nützlich für Monitoring und Debugging
 * @returns Anzahl der Cache-Einträge
 */
export function getCacheSize(): number {
  return permissionCache.size;
}

/**
 * Gibt Cache-Statistiken zurück
 * Nützlich für Monitoring und Debugging
 */
export function getCacheStats(): {
  size: number;
  ttlMs: number;
  entries: Array<{ userId: string; expiresIn: number }>;
} {
  const now = Date.now();
  const entries: Array<{ userId: string; expiresIn: number }> = [];

  permissionCache.forEach((entry, userId) => {
    entries.push({
      userId,
      expiresIn: Math.max(0, entry.expiresAt - now),
    });
  });

  return {
    size: permissionCache.size,
    ttlMs: cacheTTL,
    entries,
  };
}

/**
 * Entfernt abgelaufene Einträge aus dem Cache
 * Kann periodisch aufgerufen werden um Speicher freizugeben
 * @returns Anzahl der entfernten Einträge
 */
export function cleanupExpiredEntries(): number {
  const now = Date.now();
  let removed = 0;

  permissionCache.forEach((entry, userId) => {
    if (now > entry.expiresAt) {
      permissionCache.delete(userId);
      removed++;
    }
  });

  return removed;
}

// ============================================================================
// EXPORT FUER POTENTIELLE REDIS-MIGRATION
// ============================================================================
// Diese Funktionen definieren das Interface das auch eine Redis-Implementation
// implementieren muesste. Bei einer Migration zu Redis:
// 1. Erstelle neue Datei permissionCacheRedis.ts
// 2. Implementiere die gleichen Funktionen mit Redis-Backend
// 3. Aendere den Import in permissions.ts
// ============================================================================

export type PermissionCacheInterface = {
  getCachedPermissions: typeof getCachedPermissions;
  setCachedPermissions: typeof setCachedPermissions;
  invalidateUser: typeof invalidateUser;
  invalidateAll: typeof invalidateAll;
  setCacheTTL: typeof setCacheTTL;
  getCacheTTL: typeof getCacheTTL;
  getCacheSize: typeof getCacheSize;
  getCacheStats: typeof getCacheStats;
  cleanupExpiredEntries: typeof cleanupExpiredEntries;
};
