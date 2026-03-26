/**
 * API Route: /api/admin/document-routing/[id]
 * PATCH: Update a routing rule
 * DELETE: Delete a routing rule
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const updateRuleSchema = z.object({
  fundId: z.string().uuid().optional().nullable(),
  invoiceType: z.enum(["INVOICE", "CREDIT_NOTE"]).optional(),
  targetPath: z.string().min(1).max(500).optional(),
  targetType: z.string().optional(),
  description: z.string().max(200).optional().nullable(),
  isActive: z.boolean().optional(),
});

// PATCH /api/admin/document-routing/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const data = updateRuleSchema.parse(body);

    const existing = await prisma.documentRoutingRule.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Routing-Regel nicht gefunden" },
        { status: 404 }
      );
    }

    const rule = await prisma.documentRoutingRule.update({
      where: { id },
      data: {
        ...(data.fundId !== undefined && { fundId: data.fundId || null }),
        ...(data.invoiceType && { invoiceType: data.invoiceType }),
        ...(data.targetPath && { targetPath: data.targetPath }),
        ...(data.targetType && { targetType: data.targetType }),
        ...(data.description !== undefined && { description: data.description || null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: {
        fund: { select: { id: true, name: true, legalForm: true } },
      },
    });

    return NextResponse.json(rule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.issues },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating document routing rule");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Routing-Regel" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/document-routing/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existing = await prisma.documentRoutingRule.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Routing-Regel nicht gefunden" },
        { status: 404 }
      );
    }

    await prisma.documentRoutingRule.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting document routing rule");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Routing-Regel" },
      { status: 500 }
    );
  }
}
