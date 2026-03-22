import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";

/**
 * GET /api/sidebar-links
 * Returns active sidebar links the current user is allowed to see
 * based on their role hierarchy.
 */
export async function GET() {
  const check = await requireAuth();
  if (!check.authorized) return check.error;

  // We need the user's actual hierarchy — read from session (already resolved via cookie)
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  const hierarchy = session?.user?.roleHierarchy ?? 0;

  const links = await prisma.sidebarLink.findMany({
    where: {
      tenantId: check.tenantId,
      status: "ACTIVE",
      minHierarchy: { lte: hierarchy },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      url: true,
      icon: true,
      description: true,
      openInNewTab: true,
    },
  });

  return NextResponse.json(links);
}
