import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPermissions, getUserHighestHierarchy } from "@/lib/auth/permissions";
import { authLogger } from "@/lib/logger";

// GET /api/auth/my-permissions
// Returns the list of permission names for the current user.
// Used by the dashboard sidebar to filter navigation items based on
// the user's actual role-based permissions instead of legacy role checks.
// Also returns roleHierarchy for client-side hierarchy checks.
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const [userPerms, roleHierarchy] = await Promise.all([
      getUserPermissions(session.user.id),
      getUserHighestHierarchy(session.user.id),
    ]);

    return NextResponse.json({
      permissions: userPerms.permissions,
      role: session.user.role, // Legacy enum value (kept for backward compat)
      roleHierarchy, // New hierarchy level for client-side checks
    });
  } catch (error) {
    authLogger.error({ err: error }, "Error fetching user permissions");
    return NextResponse.json(
      { error: "Fehler beim Laden der Berechtigungen" },
      { status: 500 }
    );
  }
}
