import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { generateZm } from "@/lib/accounting/reports/zm";
import { generateZmXml } from "@/lib/accounting/reports/zm-xml";

// GET /api/buchhaltung/zm/xml?from=2026-01-01&to=2026-03-31
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const now = new Date();
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const periodStart = from
      ? new Date(from)
      : new Date(now.getFullYear(), currentQuarter * 3, 1);
    const periodEnd = to
      ? new Date(to)
      : new Date(now.getFullYear(), currentQuarter * 3 + 3, 0, 23, 59, 59);

    const [result, tenant] = await Promise.all([
      generateZm(check.tenantId!, periodStart, periodEnd),
      prisma.tenant.findUnique({ where: { id: check.tenantId! }, select: { vatId: true, name: true } }),
    ]);

    const xml = generateZmXml(result, {
      ownVatId: tenant?.vatId || "",
      companyName: tenant?.name || "",
    });

    const filename = `ZM_${result.year}Q${result.quarter}.xml`;

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating ZM XML");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
