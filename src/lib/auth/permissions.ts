import { prisma } from "@/lib/prisma";
import { auth } from "./index";
import { getCachedPermissions, setCachedPermissions } from "./permissionCache";

// ============================================================================
// TYPES
// ============================================================================

export interface UserPermissions {
  permissions: string[];
  roles: Array<{
    id: string;
    name: string;
    isSystem: boolean;
    resourceType: string;
    resourceIds: string[];
    permissions: string[];
  }>;
}

export interface PermissionCheck {
  hasPermission: boolean;
  resourceRestricted: boolean;
  allowedResourceIds: string[];
}

// ============================================================================
// PERMISSION HELPERS
// ============================================================================

/**
 * Get all permissions for a user (including from all assigned roles)
 * Verwendet Caching um wiederholte DB-Abfragen zu vermeiden
 */
export async function getUserPermissions(userId: string): Promise<UserPermissions> {
  // 1. Pruefe zuerst den Cache (async — Redis-backed)
  const cached = await getCachedPermissions(userId);
  if (cached) {
    return cached;
  }

  // 2. Bei Cache-Miss: Datenbank abfragen
  const roleAssignments = await prisma.userRoleAssignment.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  const permissionsSet = new Set<string>();
  const roles: UserPermissions["roles"] = [];

  for (const assignment of roleAssignments) {
    // Collect per-role permissions
    const rolePermissions = assignment.role.permissions.map(
      (rp) => rp.permission.name
    );

    // Collect role info including its permissions
    roles.push({
      id: assignment.role.id,
      name: assignment.role.name,
      isSystem: assignment.role.isSystem,
      resourceType: assignment.resourceType,
      resourceIds: assignment.resourceIds,
      permissions: rolePermissions,
    });

    // Collect all permissions from this role into the flat set
    for (const name of rolePermissions) {
      permissionsSet.add(name);
    }
  }

  const result: UserPermissions = {
    permissions: Array.from(permissionsSet),
    roles,
  };

  // 3. Ergebnis im Cache speichern
  setCachedPermissions(userId, result);

  return result;
}

/**
 * Check if a user has a specific permission
 * Optionally checks resource-level restrictions
 *
 * Verwendet getUserPermissions() intern, welches den Cache nutzt,
 * um wiederholte DB-Abfragen zu vermeiden.
 */
export async function checkPermission(
  userId: string,
  permission: string,
  resourceType?: string,
  resourceId?: string
): Promise<PermissionCheck> {
  // Nutze getUserPermissions() welches den Cache verwendet
  const userPerms = await getUserPermissions(userId);

  // Schneller Ausschluss: Wenn die Permission in keiner Rolle existiert,
  // können wir sofort false zurückgeben
  if (!userPerms.permissions.includes(permission)) {
    return {
      hasPermission: false,
      resourceRestricted: false,
      allowedResourceIds: [],
    };
  }

  let hasPerm = false;
  let resourceRestricted = false;
  const allowedResourceIds: string[] = [];

  for (const role of userPerms.roles) {
    // Pruefe ob diese spezifische Rolle die Permission hat
    const roleHasPermission = role.permissions.includes(permission);

    if (!roleHasPermission) continue;

    // Rolle hat die Permission
    hasPerm = true;

    // Pruefe ob die Rolle global ist (keine Resource-Einschraenkung)
    if (role.resourceType === "__global__") {
      return {
        hasPermission: true,
        resourceRestricted: false,
        allowedResourceIds: [],
      };
    }

    // Resource-restricted Rolle
    if (resourceType && role.resourceType === resourceType) {
      resourceRestricted = true;
      allowedResourceIds.push(...role.resourceIds);

      // Pruefe ob die spezifische Ressource erlaubt ist
      if (resourceId && role.resourceIds.includes(resourceId)) {
        return {
          hasPermission: true,
          resourceRestricted: true,
          allowedResourceIds: role.resourceIds,
        };
      }
    }
  }

  // Wenn resource-restricted und spezifische Ressource angefragt aber nicht gefunden
  if (resourceRestricted && resourceId && !allowedResourceIds.includes(resourceId)) {
    return {
      hasPermission: false,
      resourceRestricted: true,
      allowedResourceIds,
    };
  }

  return {
    hasPermission: hasPerm,
    resourceRestricted,
    allowedResourceIds,
  };
}

/**
 * Simple boolean check if user has permission (ignoring resource restrictions)
 */
export async function hasPermission(userId: string, permission: string): Promise<boolean> {
  const result = await checkPermission(userId, permission);
  return result.hasPermission;
}

/**
 * Check multiple permissions at once
 * Returns true only if user has ALL specified permissions
 */
export async function hasAllPermissions(
  userId: string,
  permissions: string[]
): Promise<boolean> {
  const userPerms = await getUserPermissions(userId);
  return permissions.every((p) => userPerms.permissions.includes(p));
}

/**
 * Check multiple permissions at once
 * Returns true if user has ANY of the specified permissions
 */
export async function hasAnyPermission(
  userId: string,
  permissions: string[]
): Promise<boolean> {
  const userPerms = await getUserPermissions(userId);
  return permissions.some((p) => userPerms.permissions.includes(p));
}

// ============================================================================
// ROLE HIERARCHY HELPERS
// ============================================================================
// These functions replace legacy UserRole enum checks (SUPERADMIN, ADMIN, etc.)
// with numeric hierarchy-based checks from the new Role model.
// Higher hierarchy = more privileges: 100=Superadmin, 80=Admin, 60=Manager, etc.
// ============================================================================

/**
 * Hierarchy level constants for role-based checks.
 * Use these instead of hardcoded numbers for clarity.
 */
export const ROLE_HIERARCHY = {
  SUPERADMIN: 100,
  ADMIN: 80,
  MANAGER: 60,
  MITARBEITER: 50,
  NUR_LESEN: 40,
  PORTAL: 20,
} as const;

/**
 * Get the highest hierarchy level from a user's assigned roles.
 * Falls back to 0 if the user has no role assignments.
 *
 * Uses getUserPermissions() which is cached, so this is efficient.
 */
export async function getUserHighestHierarchy(userId: string): Promise<number> {
  const assignments = await prisma.userRoleAssignment.findMany({
    where: { userId },
    include: { role: { select: { hierarchy: true } } },
  });
  if (assignments.length === 0) return 0;
  return Math.max(0, ...assignments.map(a => a.role.hierarchy));
}

/**
 * Check if a user's highest role hierarchy is at least Admin level (>= 80).
 */
export async function isAtLeastAdmin(userId: string): Promise<boolean> {
  const hierarchy = await getUserHighestHierarchy(userId);
  return hierarchy >= ROLE_HIERARCHY.ADMIN;
}

/**
 * Check if a user's highest role hierarchy is Superadmin level (>= 100).
 */
export async function isSuperadmin(userId: string): Promise<boolean> {
  const hierarchy = await getUserHighestHierarchy(userId);
  return hierarchy >= ROLE_HIERARCHY.SUPERADMIN;
}

/**
 * Check if a user's highest role hierarchy is at least Manager level (>= 60).
 */
export async function isAtLeastManager(userId: string): Promise<boolean> {
  const hierarchy = await getUserHighestHierarchy(userId);
  return hierarchy >= ROLE_HIERARCHY.MANAGER;
}

/**
 * Check hierarchy level against a threshold.
 * General-purpose function for custom hierarchy checks.
 */
export function isHierarchyAtLeast(hierarchy: number, threshold: number): boolean {
  return hierarchy >= threshold;
}

// ============================================================================
// SESSION HELPERS (for use in Server Components / API Routes)
// ============================================================================

/**
 * Get current session user's permissions
 */
export async function getSessionPermissions(): Promise<UserPermissions | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getUserPermissions(session.user.id);
}

/**
 * Check if current session user has a permission
 */
export async function sessionHasPermission(permission: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  return hasPermission(session.user.id, permission);
}

/**
 * Check if current session user has all permissions
 */
export async function sessionHasAllPermissions(permissions: string[]): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  return hasAllPermissions(session.user.id, permissions);
}

/**
 * Check if current session user has any of the permissions
 */
export async function sessionHasAnyPermission(permissions: string[]): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  return hasAnyPermission(session.user.id, permissions);
}

/**
 * Get current session user's highest role hierarchy level.
 * Returns 0 if not authenticated or no roles assigned.
 */
export async function getSessionHierarchy(): Promise<number> {
  const session = await auth();
  if (!session?.user?.id) return 0;
  return getUserHighestHierarchy(session.user.id);
}

/**
 * Check if current session user is at least Admin (hierarchy >= 80).
 */
export async function sessionIsAtLeastAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  return isAtLeastAdmin(session.user.id);
}

/**
 * Check if current session user is Superadmin (hierarchy >= 100).
 */
export async function sessionIsSuperadmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  return isSuperadmin(session.user.id);
}

// ============================================================================
// PERMISSION CONSTANTS (for easy reference)
// ============================================================================

export const PERMISSIONS = {
  // Parks
  PARKS_READ: "parks:read",
  PARKS_CREATE: "parks:create",
  PARKS_UPDATE: "parks:update",
  PARKS_DELETE: "parks:delete",
  PARKS_EXPORT: "parks:export",

  // Turbines
  TURBINES_READ: "turbines:read",
  TURBINES_CREATE: "turbines:create",
  TURBINES_UPDATE: "turbines:update",
  TURBINES_DELETE: "turbines:delete",
  TURBINES_EXPORT: "turbines:export",

  // Funds
  FUNDS_READ: "funds:read",
  FUNDS_CREATE: "funds:create",
  FUNDS_UPDATE: "funds:update",
  FUNDS_DELETE: "funds:delete",
  FUNDS_EXPORT: "funds:export",

  // Shareholders
  SHAREHOLDERS_READ: "shareholders:read",
  SHAREHOLDERS_CREATE: "shareholders:create",
  SHAREHOLDERS_UPDATE: "shareholders:update",
  SHAREHOLDERS_DELETE: "shareholders:delete",
  SHAREHOLDERS_EXPORT: "shareholders:export",

  // Plots
  PLOTS_READ: "plots:read",
  PLOTS_CREATE: "plots:create",
  PLOTS_UPDATE: "plots:update",
  PLOTS_DELETE: "plots:delete",
  PLOTS_EXPORT: "plots:export",

  // Leases
  LEASES_READ: "leases:read",
  LEASES_CREATE: "leases:create",
  LEASES_UPDATE: "leases:update",
  LEASES_DELETE: "leases:delete",
  LEASES_EXPORT: "leases:export",

  // Contracts
  CONTRACTS_READ: "contracts:read",
  CONTRACTS_CREATE: "contracts:create",
  CONTRACTS_UPDATE: "contracts:update",
  CONTRACTS_DELETE: "contracts:delete",
  CONTRACTS_EXPORT: "contracts:export",

  // Documents
  DOCUMENTS_READ: "documents:read",
  DOCUMENTS_CREATE: "documents:create",
  DOCUMENTS_UPDATE: "documents:update",
  DOCUMENTS_DELETE: "documents:delete",
  DOCUMENTS_DOWNLOAD: "documents:download",
  DOCUMENTS_EXPORT: "documents:export",

  // Invoices
  INVOICES_READ: "invoices:read",
  INVOICES_CREATE: "invoices:create",
  INVOICES_UPDATE: "invoices:update",
  INVOICES_DELETE: "invoices:delete",
  INVOICES_EXPORT: "invoices:export",

  // Votes
  VOTES_READ: "votes:read",
  VOTES_CREATE: "votes:create",
  VOTES_UPDATE: "votes:update",
  VOTES_DELETE: "votes:delete",
  VOTES_MANAGE: "votes:manage",

  // Service Events
  SERVICE_EVENTS_READ: "service-events:read",
  SERVICE_EVENTS_CREATE: "service-events:create",
  SERVICE_EVENTS_UPDATE: "service-events:update",
  SERVICE_EVENTS_DELETE: "service-events:delete",
  SERVICE_EVENTS_EXPORT: "service-events:export",

  // Energy
  ENERGY_READ: "energy:read",
  ENERGY_CREATE: "energy:create",
  ENERGY_UPDATE: "energy:update",
  ENERGY_DELETE: "energy:delete",
  ENERGY_EXPORT: "energy:export",

  // CRM
  CRM_READ: "crm:read",
  CRM_CREATE: "crm:create",
  CRM_UPDATE: "crm:update",
  CRM_DELETE: "crm:delete",

  // Inbox (Eingangsrechnungen)
  INBOX_READ: "inbox:read",
  INBOX_CREATE: "inbox:create",
  INBOX_UPDATE: "inbox:update",
  INBOX_DELETE: "inbox:delete",
  INBOX_APPROVE: "inbox:approve",
  INBOX_EXPORT: "inbox:export",
  VENDORS_READ: "vendors:read",
  VENDORS_WRITE: "vendors:write",

  // Reports
  REPORTS_READ: "reports:read",
  REPORTS_CREATE: "reports:create",
  REPORTS_EXPORT: "reports:export",

  // Settings
  SETTINGS_READ: "settings:read",
  SETTINGS_UPDATE: "settings:update",

  // Users
  USERS_READ: "users:read",
  USERS_CREATE: "users:create",
  USERS_UPDATE: "users:update",
  USERS_DELETE: "users:delete",
  USERS_IMPERSONATE: "users:impersonate",

  // Roles
  ROLES_READ: "roles:read",
  ROLES_CREATE: "roles:create",
  ROLES_UPDATE: "roles:update",
  ROLES_DELETE: "roles:delete",
  ROLES_ASSIGN: "roles:assign",

  // Admin
  ADMIN_MANAGE: "admin:manage",
  ADMIN_TENANTS: "admin:tenants",
  ADMIN_SYSTEM: "admin:system",
  ADMIN_IMPERSONATE: "admin:impersonate",
  ADMIN_AUDIT: "admin:audit",

  // Energy (granular)
  ENERGY_SCADA_IMPORT: "energy:scada:import",
  ENERGY_SETTLEMENTS_FINALIZE: "energy:settlements:finalize",
} as const;

export type PermissionName = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
