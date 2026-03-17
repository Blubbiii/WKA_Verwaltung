import { prisma } from "@/lib/prisma";

/**
 * Compute the highest role hierarchy for a user within a specific tenant.
 * Includes both tenant-scoped assignments (tenantId matches) and global
 * assignments (tenantId is null).
 */
export async function getRoleHierarchyForTenant(
  userId: string,
  tenantId: string
): Promise<number> {
  const assignments = await prisma.userRoleAssignment.findMany({
    where: {
      userId,
      OR: [{ tenantId }, { tenantId: null }],
    },
    include: { role: { select: { hierarchy: true } } },
  });

  return assignments.length > 0
    ? Math.max(0, ...assignments.map((a) => a.role.hierarchy))
    : 0;
}
