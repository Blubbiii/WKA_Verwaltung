import { NextRequest, NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "./index";
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  checkPermission,
  getUserHighestHierarchy,
  ROLE_HIERARCHY,
} from "./permissions";

// ============================================================================
// PERMISSION MIDDLEWARE FOR API ROUTES
// ============================================================================

export interface PermissionCheckResult {
  authorized: boolean;
  userId?: string;
  tenantId?: string;
  error?: NextResponse;
  /** If true, the user's access is restricted to specific resources */
  resourceRestricted?: boolean;
  /** IDs of resources the user is allowed to access (empty = unrestricted) */
  allowedResourceIds?: string[];
}

/**
 * Check if the current session has the required permission(s)
 * Use this at the beginning of API route handlers
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   const check = await requirePermission("parks:read");
 *   if (!check.authorized) return check.error;
 *
 *   // ... rest of handler using check.userId and check.tenantId
 * }
 */
export async function requirePermission(
  permission: string | string[],
  options?: {
    requireAll?: boolean;  // If array, require ALL permissions (default: false = ANY)
  }
): Promise<PermissionCheckResult> {
  const session = await auth();

  // Check if user is authenticated
  if (!session?.user?.id) {
    return {
      authorized: false,
      error: NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      ),
    };
  }

  const userId = session.user.id;
  const tenantId = session.user.tenantId;

  // Only SUPERADMIN bypasses permission checks (global access across all tenants).
  // All other roles (including ADMIN) must have explicit permissions assigned.
  if (session.user.role === "SUPERADMIN") {
    return {
      authorized: true,
      userId,
      tenantId,
    };
  }

  // Check permission(s) for non-admin roles
  let hasRequiredPermission: boolean;

  if (Array.isArray(permission)) {
    if (options?.requireAll) {
      hasRequiredPermission = await hasAllPermissions(userId, permission);
    } else {
      hasRequiredPermission = await hasAnyPermission(userId, permission);
    }
  } else {
    hasRequiredPermission = await hasPermission(userId, permission);
  }

  if (!hasRequiredPermission) {
    return {
      authorized: false,
      error: NextResponse.json(
        { error: "Keine Berechtigung für diese Aktion" },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId,
    tenantId,
  };
}

/**
 * Check permission with resource-level enforcement.
 * Returns allowedResourceIds so API routes can filter data accordingly.
 *
 * @param permission - Required permission (single string)
 * @param resourceType - The resource type to check restrictions for (e.g. "Park", "Fund")
 *
 * @example
 * const check = await requirePermissionWithResources("parks:read", "Park");
 * if (!check.authorized) return check.error;
 *
 * // If resource-restricted, filter query
 * const where = check.resourceRestricted
 *   ? { id: { in: check.allowedResourceIds }, tenantId: check.tenantId }
 *   : { tenantId: check.tenantId };
 */
export async function requirePermissionWithResources(
  permission: string,
  resourceType: string
): Promise<PermissionCheckResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      authorized: false,
      error: NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      ),
    };
  }

  const userId = session.user.id;
  const tenantId = session.user.tenantId;

  // Superadmin bypasses all checks
  if (session.user.role === "SUPERADMIN") {
    return {
      authorized: true,
      userId,
      tenantId,
      resourceRestricted: false,
      allowedResourceIds: [],
    };
  }

  const result = await checkPermission(userId, permission, resourceType);

  if (!result.hasPermission) {
    return {
      authorized: false,
      error: NextResponse.json(
        { error: "Keine Berechtigung für diese Aktion" },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId,
    tenantId,
    resourceRestricted: result.resourceRestricted,
    allowedResourceIds: result.allowedResourceIds,
  };
}

/**
 * Check if user is authenticated (no specific permission required)
 */
export async function requireAuth(): Promise<PermissionCheckResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      authorized: false,
      error: NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      ),
    };
  }

  return {
    authorized: true,
    userId: session.user.id,
    tenantId: session.user.tenantId,
  };
}

/**
 * Check if user is a Superadmin.
 * Uses the new hierarchy system (>= 100) as primary check,
 * with legacy enum as fallback for backward compatibility.
 */
export async function requireSuperadmin(): Promise<PermissionCheckResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      authorized: false,
      error: NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      ),
    };
  }

  // Primary check: hierarchy-based (new system)
  const hierarchy = await getUserHighestHierarchy(session.user.id);
  if (hierarchy >= ROLE_HIERARCHY.SUPERADMIN) {
    return {
      authorized: true,
      userId: session.user.id,
      tenantId: session.user.tenantId,
    };
  }

  // Fallback: legacy enum check for backward compatibility
  if (session.user.role === "SUPERADMIN") {
    return {
      authorized: true,
      userId: session.user.id,
      tenantId: session.user.tenantId,
    };
  }

  // Note: Removed overly permissive fallback that granted superadmin access
  // based on individual admin:tenants or admin:system permissions.
  // Only hierarchy-based check and legacy enum are trusted for superadmin access.

  return {
    authorized: false,
    error: NextResponse.json(
      { error: "Nur für Superadmins zugänglich" },
      { status: 403 }
    ),
  };
}

/**
 * Check if user is an Admin or higher.
 * Uses the new hierarchy system (>= 80) as primary check,
 * with legacy enum as fallback for backward compatibility.
 */
export async function requireAdmin(): Promise<PermissionCheckResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      authorized: false,
      error: NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      ),
    };
  }

  // Primary check: hierarchy-based (new system)
  const hierarchy = await getUserHighestHierarchy(session.user.id);
  if (hierarchy >= ROLE_HIERARCHY.ADMIN) {
    return {
      authorized: true,
      userId: session.user.id,
      tenantId: session.user.tenantId,
    };
  }

  // Fallback: legacy enum check for backward compatibility
  if (["ADMIN", "SUPERADMIN"].includes(session.user.role || "")) {
    return {
      authorized: true,
      userId: session.user.id,
      tenantId: session.user.tenantId,
    };
  }

  // Note: Removed overly permissive fallback that granted admin access
  // based on individual users:read or roles:read permissions.
  // Only hierarchy-based check and legacy enum are trusted for admin access.

  return {
    authorized: false,
    error: NextResponse.json(
      { error: "Nur für Administratoren zugänglich" },
      { status: 403 }
    ),
  };
}

// ============================================================================
// PAGE-LEVEL PERMISSION CHECKS (for Server Components / Layouts)
// ============================================================================

/**
 * Server-side permission check for page routes.
 * Redirects to /dashboard if the user lacks the required permission.
 * Use in layout.tsx or page.tsx server components.
 *
 * @example
 * // In a layout.tsx:
 * export default async function AdminLayout({ children }) {
 *   await requirePagePermission("admin:manage");
 *   return <>{children}</>;
 * }
 */
export async function requirePagePermission(
  permission: string | string[],
  options?: { requireAll?: boolean; redirectTo?: string }
): Promise<{ userId: string; tenantId: string }> {
  const session = await auth();
  const redirectTo = options?.redirectTo || "/dashboard";

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Superadmin bypasses all checks
  if (session.user.role === "SUPERADMIN") {
    return { userId: session.user.id, tenantId: session.user.tenantId || "" };
  }

  try {
    let hasRequiredPermission: boolean;

    if (Array.isArray(permission)) {
      if (options?.requireAll) {
        hasRequiredPermission = await hasAllPermissions(session.user.id, permission);
      } else {
        hasRequiredPermission = await hasAnyPermission(session.user.id, permission);
      }
    } else {
      hasRequiredPermission = await hasPermission(session.user.id, permission);
    }

    if (!hasRequiredPermission) {
      redirect(redirectTo);
    }
  } catch (error) {
    // Re-throw Next.js redirect errors (they use throw internally)
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    // For DB/network errors: fail-open (API routes enforce permissions anyway)
    console.error("[requirePagePermission] Permission check failed, allowing access:", error);
  }

  return { userId: session.user.id, tenantId: session.user.tenantId || "" };
}

/**
 * Server-side admin check for page routes.
 * Redirects to /dashboard if the user is not an admin.
 */
export async function requirePageAdmin(
  options?: { redirectTo?: string }
): Promise<{ userId: string; tenantId: string }> {
  const session = await auth();
  const redirectTo = options?.redirectTo || "/dashboard";

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Superadmin always passes
  if (session.user.role === "SUPERADMIN") {
    return { userId: session.user.id, tenantId: session.user.tenantId || "" };
  }

  // Legacy enum fallback (checked before DB query for speed)
  if (["ADMIN", "SUPERADMIN"].includes(session.user.role || "")) {
    return { userId: session.user.id, tenantId: session.user.tenantId || "" };
  }

  try {
    // Hierarchy check (requires DB query)
    const hierarchy = await getUserHighestHierarchy(session.user.id);
    if (hierarchy >= ROLE_HIERARCHY.ADMIN) {
      return { userId: session.user.id, tenantId: session.user.tenantId || "" };
    }
  } catch (error) {
    // For DB errors: fail-open (API routes enforce permissions anyway)
    console.error("[requirePageAdmin] Hierarchy check failed, allowing access:", error);
    return { userId: session.user.id, tenantId: session.user.tenantId || "" };
  }

  redirect(redirectTo);
}
