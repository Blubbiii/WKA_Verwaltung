import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { getGesellschafterList } from "@/lib/crm/gesellschafter";

// GET /api/crm/gesellschafter
export async function GET() {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;
    if (!(await getConfigBoolean("crm.enabled", check.tenantId, false)))
      return NextResponse.json(
        { error: "CRM nicht aktiviert" },
        { status: 404 },
      );

    const rows = await getGesellschafterList(check.tenantId!);
    return NextResponse.json(serializePrisma(rows));
  } catch (error) {
    logger.error({ err: error }, "Error fetching gesellschafter list");
    return NextResponse.json(
      { error: "Fehler beim Laden der Gesellschafter" },
      { status: 500 },
    );
  }
}
