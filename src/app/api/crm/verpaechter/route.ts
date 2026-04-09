import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { getVerpaechterList } from "@/lib/crm/verpaechter";

// GET /api/crm/verpaechter
export async function GET() {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;
    if (!(await getConfigBoolean("crm.enabled", check.tenantId, false)))
      return NextResponse.json(
        { error: "CRM nicht aktiviert" },
        { status: 404 },
      );

    const rows = await getVerpaechterList(check.tenantId!);
    return NextResponse.json(serializePrisma(rows));
  } catch (error) {
    logger.error({ err: error }, "Error fetching verpaechter list");
    return NextResponse.json(
      { error: "Fehler beim Laden der Verpächter" },
      { status: 500 },
    );
  }
}
