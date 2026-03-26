import crypto from "crypto";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "./index";
import { apiLogger } from "@/lib/logger";
import { rateLimit, API_RATE_LIMIT, getRateLimitResponse } from "@/lib/rate-limit";
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  checkPermission,
  getUserHighestHierarchy,
  ROLE_HIERARCHY,
} from "./permissions";

const ACTIVE_TENANT_COOKIE = "wpm-active-tenant";

/**
 * Read the signed wpm-active-tenant cookie and return the overridden tenantId.
 * Returns null if no cookie is set, the signature is invalid, or the userId doesn't match.
 */
async function getActiveTenantOverride(sessionUserId: string): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const signed = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;
    if (!signed) return null;

    const lastDot = signed.lastIndexOf(".");
    if (lastDot === -1) return null;

    const payload = signed.substring(0, lastDot);
    const signature = signed.substring(lastDot + 1);
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    if (signature.length !== expected.length) return null;
    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) {
      mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (mismatch !== 0) return null;

    const data = JSON.parse(payload) as { activeTenantId?: string; userId?: string };
    if (data.userId !== sessionUserId) return null;
    return data.activeTenantId ?? null;
  } catch {
    return null;
  }
}

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
  const tenantId = (await getActiveTenantOverride(userId)) ?? session.user.tenantId;

  // Validate roleHierarchy is a finite integer within the expected range.
  // Reject sessions carrying invalid values (e.g. NaN, Infinity, negative numbers, or
  // absurdly large values that could result from a tampered header).
  const rawHierarchy = session.user.roleHierarchy ?? 0;
  if (!Number.isFinite(rawHierarchy) || rawHierarchy < 0 || rawHierarchy > 200) {
    return {
      authorized: false,
      error: NextResponse.json(
        { error: "Ungültige Sitzungsdaten" },
        { status: 403 }
      ),
    };
  }

  // Superadmin (hierarchy >= 100) bypasses all permission checks.
  if (rawHierarchy >= 100) {
    return { authorized: true, userId, tenantId };
  }

  // Check permission(s) for non-superadmin users
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
  const tenantId = (await getActiveTenantOverride(userId)) ?? session.user.tenantId;

  // Validate roleHierarchy (same bounds check as requirePermission)
  const rawHierarchy = session.user.roleHierarchy ?? 0;
  if (!Number.isFinite(rawHierarchy) || rawHierarchy < 0 || rawHierarchy > 200) {
    return {
      authorized: false,
      error: NextResponse.json(
        { error: "Ungültige Sitzungsdaten" },
        { status: 403 }
      ),
    };
  }

  // Superadmin bypasses all checks
  if (rawHierarchy >= 100) {
    return { authorized: true, userId, tenantId, resourceRestricted: false, allowedResourceIds: [] };
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
 * Check if user is authenticated (no specific permission required).
 * Also enforces a global per-user API rate limit (100 req/min).
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

  const userId = session.user.id;

  // Global per-user rate limit for all API routes
  const rl = await rateLimit(`api:user:${userId}`, API_RATE_LIMIT);
  if (!rl.success) {
    return {
      authorized: false,
      error: getRateLimitResponse(rl, API_RATE_LIMIT),
    };
  }

  const tenantId = (await getActiveTenantOverride(userId)) ?? session.user.tenantId;
  return { authorized: true, userId, tenantId };
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

  const userId = session.user.id;
  const tenantId = (await getActiveTenantOverride(userId)) ?? session.user.tenantId;
  const hierarchy = await getUserHighestHierarchy(userId);
  if (hierarchy >= ROLE_HIERARCHY.SUPERADMIN) {
    return { authorized: true, userId, tenantId };
  }

  return {
    authorized: false,
    error: NextResponse.json({ error: "Nur für Superadmins zugänglich" }, { status: 403 }),
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

  const userId = session.user.id;
  const tenantId = (await getActiveTenantOverride(userId)) ?? session.user.tenantId;
  const hierarchy = await getUserHighestHierarchy(userId);
  if (hierarchy >= ROLE_HIERARCHY.ADMIN) {
    return { authorized: true, userId, tenantId };
  }

  return {
    authorized: false,
    error: NextResponse.json({ error: "Nur für Administratoren zugänglich" }, { status: 403 }),
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

  const userId = session.user.id;
  const tenantId = ((await getActiveTenantOverride(userId)) ?? session.user.tenantId) || "";

  // Validate roleHierarchy (same bounds check as API helpers)
  const rawHierarchy = session.user.roleHierarchy ?? 0;
  if (!Number.isFinite(rawHierarchy) || rawHierarchy < 0 || rawHierarchy > 200) {
    redirect(redirectTo);
  }

  // Superadmin bypasses all checks
  if (rawHierarchy >= 100) {
    return { userId, tenantId };
  }

  try {
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
      redirect(redirectTo);
    }
  } catch (error) {
    // Re-throw Next.js redirect errors (they use throw internally)
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    // Fail-secure: DB/network errors deny access instead of allowing it
    apiLogger.error({ err: error, userId, permission }, "[requirePagePermission] Permission check failed — denying access (fail-secure)");
    redirect(redirectTo);
  }

  return { userId, tenantId };
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

  const userId = session.user.id;
  const tenantId = ((await getActiveTenantOverride(userId)) ?? session.user.tenantId) || "";

  try {
    const hierarchy = await getUserHighestHierarchy(userId);
    if (hierarchy >= ROLE_HIERARCHY.ADMIN) {
      return { userId, tenantId };
    }
  } catch (error) {
    // Fail-secure: DB/network errors deny access instead of allowing it
    apiLogger.error({ err: error, userId }, "[requirePageAdmin] Hierarchy check failed — denying access (fail-secure)");
    redirect(redirectTo);
  }

  redirect(redirectTo);
}
