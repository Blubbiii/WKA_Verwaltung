import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requireAuth } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";

// GET /api/user/tenants — list all tenant memberships for the current user
export async function GET() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const userId = check.userId!;

    const memberships = await prisma.userTenantMembership.findMany({
      where: { userId, status: "ACTIVE" },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, logoUrl: true },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    // Batch-fetch all role assignments for this user across all tenants (1 query instead of N)
    const tenantIds = memberships.map((m) => m.tenant.id);
    const allAssignments = await prisma.userRoleAssignment.findMany({
      where: {
        userId,
        OR: [{ tenantId: { in: tenantIds } }, { tenantId: null }],
      },
      include: { role: { select: { hierarchy: true } } },
    });

    // Build hierarchy map per tenant
    const globalMax = Math.max(
      0,
      ...allAssignments.filter((a) => a.tenantId === null).map((a) => a.role.hierarchy)
    );

    const hierarchyByTenant = new Map<string, number>();
    for (const tenantId of tenantIds) {
      const tenantAssignments = allAssignments.filter((a) => a.tenantId === tenantId);
      const tenantMax = tenantAssignments.length > 0
        ? Math.max(0, ...tenantAssignments.map((a) => a.role.hierarchy))
        : 0;
      hierarchyByTenant.set(tenantId, Math.max(tenantMax, globalMax));
    }

    const tenants = memberships.map((m) => ({
      id: m.tenant.id,
      name: m.tenant.name,
      slug: m.tenant.slug,
      logoUrl: m.tenant.logoUrl,
      isPrimary: m.isPrimary,
      roleHierarchy: hierarchyByTenant.get(m.tenant.id) ?? 0,
    }));

    return NextResponse.json({ tenants });
  } catch {
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Mandanten" });
  }
}
