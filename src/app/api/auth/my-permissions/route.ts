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
      // Bug-Fix: war vorher INTERNAL_ERROR (500), was im DevTools wie ein
      // Server-Crash aussieht und das ganze Sidebar/Layout in eine Fehler-
      // schlaufe schickt. Korrekt ist UNAUTHORIZED (401) — andere Endpoints
      // werfen das auch bei abgelaufener Session, der Client interpretiert
      // 401 sauber als "Login nötig" statt als Crash.
      return apiError("UNAUTHORIZED", 401, { message: "Nicht authentifiziert" });
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
