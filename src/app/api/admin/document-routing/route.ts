/**
 * API Route: /api/admin/document-routing
 * GET: List all routing rules for the tenant
 * POST: Create a new routing rule
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const createRuleSchema = z.object({
  fundId: z.string().uuid().optional().nullable(),
  invoiceType: z.enum(["INVOICE", "CREDIT_NOTE"]),
  targetPath: z.string().min(1, "Pfad erforderlich").max(500),
  targetType: z.string().default("onedrive"),
  description: z.string().max(200).optional().nullable(),
  isActive: z.boolean().default(true),
});

// GET /api/admin/document-routing
export async function GET() {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const rules = await prisma.documentRoutingRule.findMany({
      where: { tenantId: check.tenantId! },
      include: {
        fund: { select: { id: true, name: true, legalForm: true } },
      },
      orderBy: [{ isActive: "desc" }, { targetPath: "asc" }],
    });

    return NextResponse.json({ data: rules });
  } catch (error) {
    logger.error({ err: error }, "Error fetching document routing rules");
    return NextResponse.json(
      { error: "Fehler beim Laden der Routing-Regeln" },
      { status: 500 }
    );
  }
}

// POST /api/admin/document-routing
export async function POST(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const body = await request.json();
    const data = createRuleSchema.parse(body);

    const rule = await prisma.documentRoutingRule.create({
      data: {
        tenantId: check.tenantId!,
        fundId: data.fundId || null,
        invoiceType: data.invoiceType,
        targetPath: data.targetPath,
        targetType: data.targetType,
        description: data.description || null,
        isActive: data.isActive,
      },
      include: {
        fund: { select: { id: true, name: true, legalForm: true } },
      },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating document routing rule");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Routing-Regel" },
      { status: 500 }
    );
  }
}
