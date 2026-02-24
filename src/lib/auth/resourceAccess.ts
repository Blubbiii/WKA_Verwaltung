import { prisma } from "@/lib/prisma";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Unterstuetzte Ressourcen-Typen
 */
export const RESOURCE_TYPES = {
  PARK: "PARK",
  FUND: "FUND",
  TURBINE: "TURBINE",
  DOCUMENT: "DOCUMENT",
  CONTRACT: "CONTRACT",
  LEASE: "LEASE",
  INVOICE: "INVOICE",
  SHAREHOLDER: "SHAREHOLDER",
} as const;

export type ResourceType = (typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES];

/**
 * Zugriffslevel (hierarchisch aufsteigend)
 */
export const ACCESS_LEVELS = {
  READ: "READ",
  WRITE: "WRITE",
  ADMIN: "ADMIN",
} as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[keyof typeof ACCESS_LEVELS];

/**
 * Hierarchie der Zugriffslevel (hoeher = mehr Rechte)
 */
const ACCESS_LEVEL_HIERARCHY: Record<AccessLevel, number> = {
  READ: 1,
  WRITE: 2,
  ADMIN: 3,
};

export interface ResourceAccessEntry {
  id: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  accessLevel: string;
  createdAt: Date;
  createdBy: string | null;
  expiresAt: Date | null;
  notes: string | null;
}

export interface ResourceAccessWithUser extends ResourceAccessEntry {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface ResourceAccessWithResource extends ResourceAccessEntry {
  resourceName?: string; // Wird durch Join geholt
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Prueft ob ein AccessLevel mindestens so hoch ist wie ein anderes
 */
function isAccessLevelSufficient(
  actualLevel: string,
  requiredLevel: string
): boolean {
  const actual = ACCESS_LEVEL_HIERARCHY[actualLevel as AccessLevel] ?? 0;
  const required = ACCESS_LEVEL_HIERARCHY[requiredLevel as AccessLevel] ?? 0;
  return actual >= required;
}

/**
 * Prueft ob ein Zugriff abgelaufen ist
 */
function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return new Date() > expiresAt;
}

// ============================================================================
// RESOURCE ACCESS FUNCTIONS
// ============================================================================

/**
 * Prueft ob ein User Zugriff auf eine bestimmte Ressource hat
 *
 * @param userId - ID des Benutzers
 * @param resourceType - Typ der Ressource (PARK, FUND, etc.)
 * @param resourceId - ID der spezifischen Ressource
 * @param minLevel - Mindest-Zugriffslevel (default: READ)
 * @returns true wenn Zugriff gewaehrt ist
 */
export async function hasResourceAccess(
  userId: string,
  resourceType: ResourceType | string,
  resourceId: string,
  minLevel: AccessLevel | string = ACCESS_LEVELS.READ
): Promise<boolean> {
  const access = await prisma.resourceAccess.findUnique({
    where: {
      userId_resourceType_resourceId: {
        userId,
        resourceType,
        resourceId,
      },
    },
  });

  if (!access) return false;
  if (isExpired(access.expiresAt)) return false;

  return isAccessLevelSufficient(access.accessLevel, minLevel);
}

/**
 * Holt den Zugriffslevel eines Users auf eine Ressource
 *
 * @returns AccessLevel oder null wenn kein Zugriff
 */
export async function getResourceAccessLevel(
  userId: string,
  resourceType: ResourceType | string,
  resourceId: string
): Promise<AccessLevel | null> {
  const access = await prisma.resourceAccess.findUnique({
    where: {
      userId_resourceType_resourceId: {
        userId,
        resourceType,
        resourceId,
      },
    },
  });

  if (!access) return null;
  if (isExpired(access.expiresAt)) return null;

  return access.accessLevel as AccessLevel;
}

/**
 * Gewaehrt einem User Zugriff auf eine Ressource
 *
 * @param userId - ID des Benutzers dem Zugriff gewaehrt wird
 * @param resourceType - Typ der Ressource
 * @param resourceId - ID der Ressource
 * @param accessLevel - Zugriffslevel
 * @param grantedBy - ID des Admins der Zugriff gewaehrt
 * @param options - Optionale Parameter (expiresAt, notes)
 */
export async function grantResourceAccess(
  userId: string,
  resourceType: ResourceType | string,
  resourceId: string,
  accessLevel: AccessLevel | string,
  grantedBy: string,
  options?: {
    expiresAt?: Date;
    notes?: string;
  }
): Promise<ResourceAccessEntry> {
  // Upsert: Erstelle oder aktualisiere Zugriff
  const access = await prisma.resourceAccess.upsert({
    where: {
      userId_resourceType_resourceId: {
        userId,
        resourceType,
        resourceId,
      },
    },
    update: {
      accessLevel,
      createdBy: grantedBy,
      expiresAt: options?.expiresAt ?? null,
      notes: options?.notes ?? null,
    },
    create: {
      userId,
      resourceType,
      resourceId,
      accessLevel,
      createdBy: grantedBy,
      expiresAt: options?.expiresAt ?? null,
      notes: options?.notes ?? null,
    },
  });

  return access;
}

/**
 * Entzieht einem User den Zugriff auf eine Ressource
 *
 * @returns true wenn Zugriff entfernt wurde, false wenn keiner existierte
 */
export async function revokeResourceAccess(
  userId: string,
  resourceType: ResourceType | string,
  resourceId: string
): Promise<boolean> {
  try {
    await prisma.resourceAccess.delete({
      where: {
        userId_resourceType_resourceId: {
          userId,
          resourceType,
          resourceId,
        },
      },
    });
    return true;
  } catch {
    // Record nicht gefunden
    return false;
  }
}

/**
 * Holt alle Ressourcen-Zugriffe eines Users
 *
 * @param userId - ID des Benutzers
 * @param resourceType - Optional: Filtert nach Ressourcen-Typ
 */
export async function getUserResourceAccess(
  userId: string,
  resourceType?: ResourceType | string
): Promise<ResourceAccessEntry[]> {
  const accessList = await prisma.resourceAccess.findMany({
    where: {
      userId,
      ...(resourceType && { resourceType }),
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: [
      { resourceType: "asc" },
      { createdAt: "desc" },
    ],
  });

  return accessList;
}

/**
 * Holt alle User die Zugriff auf eine bestimmte Ressource haben
 *
 * @param resourceType - Typ der Ressource
 * @param resourceId - ID der Ressource
 */
export async function getResourceAccessList(
  resourceType: ResourceType | string,
  resourceId: string
): Promise<ResourceAccessWithUser[]> {
  const accessList = await prisma.resourceAccess.findMany({
    where: {
      resourceType,
      resourceId,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: [
      { accessLevel: "desc" },
      { createdAt: "asc" },
    ],
  });

  return accessList;
}

/**
 * Holt alle Ressource-IDs auf die ein User Zugriff hat
 * Nützlich für Listen-Filterung
 *
 * @param userId - ID des Benutzers
 * @param resourceType - Typ der Ressource
 * @param minLevel - Mindest-Zugriffslevel
 */
export async function getAccessibleResourceIds(
  userId: string,
  resourceType: ResourceType | string,
  minLevel: AccessLevel | string = ACCESS_LEVELS.READ
): Promise<string[]> {
  const accessList = await prisma.resourceAccess.findMany({
    where: {
      userId,
      resourceType,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    select: {
      resourceId: true,
      accessLevel: true,
    },
  });

  // Filter nach Mindest-Level
  return accessList
    .filter((a) => isAccessLevelSufficient(a.accessLevel, minLevel))
    .map((a) => a.resourceId);
}

/**
 * Loescht alle abgelaufenen Zugriffe (Cleanup-Job)
 *
 * @returns Anzahl der gelöschten Einträge
 */
export async function cleanupExpiredAccess(): Promise<number> {
  const result = await prisma.resourceAccess.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  return result.count;
}

/**
 * Batch-Operation: Gewaehrt mehreren Usern Zugriff auf eine Ressource
 */
export async function grantResourceAccessBulk(
  userIds: string[],
  resourceType: ResourceType | string,
  resourceId: string,
  accessLevel: AccessLevel | string,
  grantedBy: string,
  options?: {
    expiresAt?: Date;
    notes?: string;
  }
): Promise<number> {
  const results = await Promise.all(
    userIds.map((userId) =>
      grantResourceAccess(userId, resourceType, resourceId, accessLevel, grantedBy, options)
    )
  );

  return results.length;
}

/**
 * Entzieht allen Usern den Zugriff auf eine Ressource
 * Nützlich wenn Ressource gelöscht wird
 */
export async function revokeAllResourceAccess(
  resourceType: ResourceType | string,
  resourceId: string
): Promise<number> {
  const result = await prisma.resourceAccess.deleteMany({
    where: {
      resourceType,
      resourceId,
    },
  });

  return result.count;
}

// ============================================================================
// COMBINED PERMISSION CHECK (Role + Resource Access)
// ============================================================================

/**
 * Kombinierte Prüfung: Hat User entweder über Rolle ODER direkt Zugriff?
 *
 * Logik:
 * 1. Wenn User globale Rolle mit passendem Permission hat -> Zugriff
 * 2. Wenn User ressourcenbeschraenkte Rolle hat und Ressource in Liste -> Zugriff
 * 3. Wenn User direkten ResourceAccess hat -> Zugriff
 *
 * @param userId - ID des Benutzers
 * @param permission - Benötigte Permission (z.B. "parks:read")
 * @param resourceType - Ressourcen-Typ
 * @param resourceId - ID der Ressource
 * @param minAccessLevel - Mindest-Level für direkten Zugriff
 */
export async function hasAccessToResource(
  userId: string,
  permission: string,
  resourceType: ResourceType | string,
  resourceId: string,
  minAccessLevel: AccessLevel | string = ACCESS_LEVELS.READ
): Promise<boolean> {
  // Import checkPermission dynamisch um zirkulaere Imports zu vermeiden
  const { checkPermission } = await import("./permissions");

  // 1. Pruefe Rollen-basierte Berechtigung
  const permCheck = await checkPermission(userId, permission, resourceType, resourceId);

  if (permCheck.hasPermission) {
    // Hat globale Berechtigung oder Ressource ist in erlaubter Liste
    return true;
  }

  // 2. Pruefe direkten ResourceAccess
  return hasResourceAccess(userId, resourceType, resourceId, minAccessLevel);
}
