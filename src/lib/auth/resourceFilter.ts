import { prisma } from "@/lib/prisma";
import { checkPermission } from "./permissions";
import {
  getAccessibleResourceIds,
  hasResourceAccess,
  ACCESS_LEVELS,
  type AccessLevel,
  type ResourceType,
} from "./resourceAccess";

// ============================================================================
// TYPES
// ============================================================================

export interface FilteredResult<T> {
  items: T[];
  totalCount: number;
  filteredCount: number;
  hasResourceRestrictions: boolean;
}

// ============================================================================
// RESOURCE FILTER FUNCTIONS
// ============================================================================

/**
 * Filtert eine Liste von Items basierend auf User-Zugriffsrechten
 *
 * Logik:
 * 1. Prueft ob User globale Permission hat -> alle Items zurueck
 * 2. Wenn ressourcenbeschraenkt -> filtert nach erlaubten IDs aus Rolle
 * 3. Zusaetzlich: Items mit direktem ResourceAccess werden hinzugefuegt
 *
 * @param userId - ID des Benutzers
 * @param items - Liste der zu filternden Items
 * @param resourceType - Typ der Ressource (PARK, FUND, etc.)
 * @param idField - Name des ID-Felds in den Items (default: "id")
 * @param permission - Benoetigte Permission (z.B. "parks:read")
 * @param minAccessLevel - Mindest-Level fuer direkten ResourceAccess
 */
export async function filterByResourceAccess<T extends Record<string, unknown>>(
  userId: string,
  items: T[],
  resourceType: ResourceType | string,
  idField: keyof T = "id" as keyof T,
  permission?: string,
  minAccessLevel: AccessLevel | string = ACCESS_LEVELS.READ
): Promise<FilteredResult<T>> {
  const totalCount = items.length;

  // 1. Pruefe Rollen-basierte Berechtigung
  let allowedFromRole: string[] | null = null;
  let hasGlobalAccess = false;

  if (permission) {
    const permCheck = await checkPermission(userId, permission, resourceType);

    if (permCheck.hasPermission) {
      if (!permCheck.resourceRestricted) {
        // Globale Berechtigung - alle Items erlaubt
        hasGlobalAccess = true;
      } else {
        // Ressourcen-beschraenkt - nur bestimmte IDs
        allowedFromRole = permCheck.allowedResourceIds;
      }
    }
  }

  // 2. Hole direkte ResourceAccess-IDs
  const directAccessIds = await getAccessibleResourceIds(
    userId,
    resourceType,
    minAccessLevel
  );

  // 3. Kombiniere erlaubte IDs
  if (hasGlobalAccess) {
    // Globaler Zugriff - alle zurueck
    return {
      items,
      totalCount,
      filteredCount: totalCount,
      hasResourceRestrictions: false,
    };
  }

  // Kombiniere Rolle + direkt
  const allowedIds = new Set<string>([
    ...(allowedFromRole ?? []),
    ...directAccessIds,
  ]);

  // 4. Filtere Items
  const filteredItems = items.filter((item) => {
    const itemId = item[idField] as string;
    return allowedIds.has(itemId);
  });

  return {
    items: filteredItems,
    totalCount,
    filteredCount: filteredItems.length,
    hasResourceRestrictions: true,
  };
}

/**
 * Prueft fuer ein einzelnes Item ob Zugriff erlaubt ist
 */
export async function hasAccessToItem(
  userId: string,
  resourceType: ResourceType | string,
  resourceId: string,
  permission?: string,
  minAccessLevel: AccessLevel | string = ACCESS_LEVELS.READ
): Promise<boolean> {
  // 1. Pruefe Rollen-basierte Berechtigung
  if (permission) {
    const permCheck = await checkPermission(userId, permission, resourceType, resourceId);
    if (permCheck.hasPermission) {
      return true;
    }
  }

  // 2. Pruefe direkten ResourceAccess
  return hasResourceAccess(userId, resourceType, resourceId, minAccessLevel);
}

/**
 * Holt alle IDs auf die ein User Zugriff hat (kombiniert Rolle + direkt)
 */
export async function getAllAccessibleIds(
  userId: string,
  resourceType: ResourceType | string,
  permission?: string,
  minAccessLevel: AccessLevel | string = ACCESS_LEVELS.READ
): Promise<{ ids: string[]; hasGlobalAccess: boolean }> {
  let roleIds: string[] = [];
  let hasGlobalAccess = false;

  // 1. Pruefe Rollen-basierte Berechtigung
  if (permission) {
    const permCheck = await checkPermission(userId, permission, resourceType);

    if (permCheck.hasPermission) {
      if (!permCheck.resourceRestricted) {
        hasGlobalAccess = true;
      } else {
        roleIds = permCheck.allowedResourceIds;
      }
    }
  }

  // Bei globalem Zugriff keine ID-Liste noetig
  if (hasGlobalAccess) {
    return { ids: [], hasGlobalAccess: true };
  }

  // 2. Hole direkte ResourceAccess-IDs
  const directIds = await getAccessibleResourceIds(userId, resourceType, minAccessLevel);

  // 3. Kombiniere
  const allIds = new Set([...roleIds, ...directIds]);

  return { ids: Array.from(allIds), hasGlobalAccess: false };
}

// ============================================================================
// PRISMA WHERE CLAUSE BUILDER
// ============================================================================

/**
 * Erstellt eine Prisma WHERE-Clause fuer ressourcenbasierte Filterung
 *
 * Kann direkt in Prisma-Queries verwendet werden:
 *
 * const where = await buildResourceWhereClause(userId, "PARK", "parks:read", "id");
 * const parks = await prisma.park.findMany({ where });
 */
export async function buildResourceWhereClause(
  userId: string,
  resourceType: ResourceType | string,
  permission?: string,
  idField: string = "id",
  minAccessLevel: AccessLevel | string = ACCESS_LEVELS.READ
): Promise<Record<string, unknown> | null> {
  const { ids, hasGlobalAccess } = await getAllAccessibleIds(
    userId,
    resourceType,
    permission,
    minAccessLevel
  );

  if (hasGlobalAccess) {
    // Keine Einschraenkung noetig
    return null;
  }

  if (ids.length === 0) {
    // Kein Zugriff - leere Ergebnismenge
    return { [idField]: { in: [] } };
  }

  // Nur erlaubte IDs
  return { [idField]: { in: ids } };
}

/**
 * Erweitert eine bestehende WHERE-Clause mit Ressourcen-Filterung
 */
export async function extendWhereWithResourceFilter(
  existingWhere: Record<string, unknown>,
  userId: string,
  resourceType: ResourceType | string,
  permission?: string,
  idField: string = "id",
  minAccessLevel: AccessLevel | string = ACCESS_LEVELS.READ
): Promise<Record<string, unknown>> {
  const resourceWhere = await buildResourceWhereClause(
    userId,
    resourceType,
    permission,
    idField,
    minAccessLevel
  );

  if (!resourceWhere) {
    // Keine Einschraenkung - Original zurueckgeben
    return existingWhere;
  }

  // Kombiniere mit AND
  return {
    AND: [existingWhere, resourceWhere],
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Prueft ob ein User Admin-Level Zugriff auf eine Ressource hat
 * (fuer Bearbeiten/Loeschen Operationen)
 */
export async function hasWriteAccess(
  userId: string,
  resourceType: ResourceType | string,
  resourceId: string,
  permission?: string
): Promise<boolean> {
  return hasAccessToItem(userId, resourceType, resourceId, permission, ACCESS_LEVELS.WRITE);
}

/**
 * Prueft ob ein User Admin-Level Zugriff auf eine Ressource hat
 * (fuer Verwalten/Admin Operationen)
 */
export async function hasAdminAccess(
  userId: string,
  resourceType: ResourceType | string,
  resourceId: string,
  permission?: string
): Promise<boolean> {
  return hasAccessToItem(userId, resourceType, resourceId, permission, ACCESS_LEVELS.ADMIN);
}

/**
 * Batch-Check: Filtert eine Liste von IDs nach Zugriffsrechten
 */
export async function filterAccessibleIds(
  userId: string,
  resourceType: ResourceType | string,
  resourceIds: string[],
  permission?: string,
  minAccessLevel: AccessLevel | string = ACCESS_LEVELS.READ
): Promise<string[]> {
  const { ids, hasGlobalAccess } = await getAllAccessibleIds(
    userId,
    resourceType,
    permission,
    minAccessLevel
  );

  if (hasGlobalAccess) {
    return resourceIds;
  }

  const allowedSet = new Set(ids);
  return resourceIds.filter((id) => allowedSet.has(id));
}

// ============================================================================
// RESOURCE HIERARCHY HELPERS
// ============================================================================

/**
 * Prueft Zugriff auf uebergeordnete Ressource
 * z.B. Turbine gehoert zu Park - Zugriff auf Park = Zugriff auf Turbine
 *
 * @param userId - ID des Benutzers
 * @param childResourceType - Typ der Kind-Ressource (z.B. TURBINE)
 * @param childResourceId - ID der Kind-Ressource
 * @param parentResourceType - Typ der Eltern-Ressource (z.B. PARK)
 * @param getParentId - Funktion um Parent-ID zu ermitteln
 * @param permission - Optional: Permission fuer Parent
 */
export async function hasAccessViaParent(
  userId: string,
  childResourceType: ResourceType | string,
  childResourceId: string,
  parentResourceType: ResourceType | string,
  getParentId: (childId: string) => Promise<string | null>,
  permission?: string
): Promise<boolean> {
  // 1. Pruefe direkten Zugriff auf Kind
  const directAccess = await hasAccessToItem(userId, childResourceType, childResourceId, permission);
  if (directAccess) return true;

  // 2. Pruefe Zugriff ueber Parent
  const parentId = await getParentId(childResourceId);
  if (!parentId) return false;

  return hasAccessToItem(userId, parentResourceType, parentId, permission);
}

/**
 * Beispiel-Implementierung fuer Turbine -> Park Hierarchie
 */
export async function hasTurbineAccessViaPark(
  userId: string,
  turbineId: string,
  permission?: string
): Promise<boolean> {
  return hasAccessViaParent(
    userId,
    "TURBINE",
    turbineId,
    "PARK",
    async (tId) => {
      const turbine = await prisma.turbine.findUnique({
        where: { id: tId },
        select: { parkId: true },
      });
      return turbine?.parkId ?? null;
    },
    permission
  );
}
