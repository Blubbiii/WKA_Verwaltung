import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

// GET /api/portal/my-permissions
// Returns the list of permission names for the current portal user.
// Used by the portal sidebar to filter navigation items based on
// the user's role-based portal permissions.
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    // Get all permissions through user's role assignments
    const assignments = await prisma.userRoleAssignment.findMany({
      where: { userId: session.user.id },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

    // Collect unique permission names from all assigned roles
    const permissions = new Set<string>();
    for (const assignment of assignments) {
      for (const rp of assignment.role.permissions) {
        permissions.add(rp.permission.name);
      }
    }

    return NextResponse.json({ permissions: Array.from(permissions) });
  } catch (error) {
    logger.error({ err: error }, "Error fetching portal permissions");
    return NextResponse.json(
      { error: "Fehler beim Laden der Berechtigungen" },
      { status: 500 }
    );
  }
}
