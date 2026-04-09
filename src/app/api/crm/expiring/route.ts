import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { getExpiringItems } from "@/lib/crm/expiring-items";

// GET /api/crm/expiring?withinDays=90
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;
    if (!(await getConfigBoolean("crm.enabled", check.tenantId, false)))
      return NextResponse.json(
        { error: "CRM nicht aktiviert" },
        { status: 404 },
      );

    const { searchParams } = new URL(request.url);
    const within = parseInt(searchParams.get("withinDays") ?? "90", 10);
    const withinDays = Number.isFinite(within) && within > 0 && within <= 365
      ? within
      : 90;

    const data = await getExpiringItems(check.tenantId!, withinDays);
    return NextResponse.json(serializePrisma(data));
  } catch (error) {
    logger.error({ err: error }, "Error fetching expiring items");
    return NextResponse.json(
      { error: "Fehler beim Laden der ablaufenden Verträge" },
      { status: 500 },
    );
  }
}
