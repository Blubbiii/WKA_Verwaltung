import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// GET /api/admin/scada-codes/[controllerType] — Get all codes for a controller type
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ controllerType: string }> }
) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const { controllerType } = await params;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();

    const where = {
      controllerType,
      ...(search && {
        description: { contains: search, mode: "insensitive" as const },
      }),
    };

    const codes = await prisma.scadaStatusCode.findMany({
      where,
      orderBy: [{ mainCode: "asc" }, { subCode: "asc" }],
    });

    // Group by mainCode for hierarchical display
    const grouped: Record<
      number,
      {
        mainCode: number;
        parentLabel: string | null;
        codes: typeof codes;
      }
    > = {};

    for (const code of codes) {
      if (!grouped[code.mainCode]) {
        grouped[code.mainCode] = {
          mainCode: code.mainCode,
          parentLabel: code.parentLabel,
          codes: [],
        };
      }
      grouped[code.mainCode].codes.push(code);
    }

    return NextResponse.json({
      controllerType,
      totalCodes: codes.length,
      groups: Object.values(grouped),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching SCADA codes for type");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Statuscodes" });
  }
}
