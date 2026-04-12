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
import { handleApiError } from "@/lib/api-utils";
import { apiError } from "@/lib/api-errors";

const updateRuleSchema = z.object({
  fundId: z.uuid().optional().nullable(),
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
      return apiError("NOT_FOUND", undefined, { message: "Routing-Regel nicht gefunden" });
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
    return handleApiError(error, "Fehler beim Aktualisieren der Routing-Regel");
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
      return apiError("NOT_FOUND", undefined, { message: "Routing-Regel nicht gefunden" });
    }

    await prisma.documentRoutingRule.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting document routing rule");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der Routing-Regel" });
  }
}
