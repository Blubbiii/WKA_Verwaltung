/**
 * Available Tenants API
 *
 * GET - List all tenants (for dropdown selection in stakeholder forms)
 */

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

export async function GET() {
  try {
    const check = await requirePermission("management-billing:read");
    if (!check.authorized) return check.error;

    const enabled = await getConfigBoolean("management-billing.enabled", check.tenantId, false);
    if (!enabled) {
      return NextResponse.json({ error: "Feature nicht aktiviert" }, { status: 404 });
    }

    // Superadmin: all tenants; others: only their own
    const tenants = await prisma.tenant.findMany({
      where: check.tenantId ? { id: check.tenantId } : undefined,
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ tenants });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET available-tenants error");
    return NextResponse.json(
      { error: "Fehler beim Laden der Mandanten" },
      { status: 500 }
    );
  }
}
