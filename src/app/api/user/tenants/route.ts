import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getRoleHierarchyForTenant } from "@/lib/auth/role-hierarchy";

// GET /api/user/tenants — list all tenant memberships for the current user
export async function GET() {
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

  // Compute role hierarchy per tenant
  const tenants = await Promise.all(
    memberships.map(async (m) => ({
      id: m.tenant.id,
      name: m.tenant.name,
      slug: m.tenant.slug,
      logoUrl: m.tenant.logoUrl,
      isPrimary: m.isPrimary,
      roleHierarchy: await getRoleHierarchyForTenant(userId, m.tenant.id),
    }))
  );

  return NextResponse.json({ tenants });
}
