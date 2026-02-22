import { NextRequest, NextResponse } from "next/server";
import { auth } from "./index";
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
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

  // Final fallback: check admin:* permissions
  const hasAdminPermission = await hasAnyPermission(session.user.id, [
    "admin:tenants",
    "admin:system",
  ]);

  if (hasAdminPermission) {
    return {
      authorized: true,
      userId: session.user.id,
      tenantId: session.user.tenantId,
    };
  }

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

  // Final fallback: check users/roles permissions
  const hasAdminPermission = await hasAnyPermission(session.user.id, [
    "users:read",
    "users:create",
    "roles:read",
  ]);

  if (hasAdminPermission) {
    return {
      authorized: true,
      userId: session.user.id,
      tenantId: session.user.tenantId,
    };
  }

  return {
    authorized: false,
    error: NextResponse.json(
      { error: "Nur für Administratoren zugänglich" },
      { status: 403 }
    ),
  };
}
