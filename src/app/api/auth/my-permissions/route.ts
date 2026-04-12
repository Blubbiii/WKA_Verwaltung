import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPermissions, getUserHighestHierarchy } from "@/lib/auth/permissions";
import { authLogger } from "@/lib/logger";

import { apiError } from "@/lib/api-errors";
// GET /api/auth/my-permissions
// Returns the list of permission names for the current user.
// Used by the dashboard sidebar to filter navigation items based on
// the user's actual role-based permissions instead of legacy role checks.
// Also returns roleHierarchy for client-side hierarchy checks.
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError("INTERNAL_ERROR", undefined, { message: "Nicht authentifiziert" });
    }

    const [userPerms, roleHierarchy] = await Promise.all([
      getUserPermissions(session.user.id),
      getUserHighestHierarchy(session.user.id),
    ]);

    return NextResponse.json({
      permissions: userPerms.permissions,
      roleHierarchy, // Hierarchy level for client-side checks
    });
  } catch (error) {
    authLogger.error({ err: error }, "Error fetching user permissions");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Berechtigungen" });
  }
}
