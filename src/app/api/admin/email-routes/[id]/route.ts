/**
 * API Route: /api/admin/email-routes/[id]
 * PATCH:  Update an email route
 * DELETE: Delete an email route
 *
 * Permission: admin:manage
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// ---------------------------------------------------------------------------
// Schema (partial for PATCH)
// ---------------------------------------------------------------------------

const emailRouteUpdateSchema = z
  .object({
    address: z
      .string()
      .min(1)
      .max(100)
      .regex(
        /^[a-z0-9._-]+$/,
        "Nur Kleinbuchstaben, Zahlen, Punkt, Bindestrich, Unterstrich",
      ),
    targetType: z.enum(["PARK", "FUND", "TENANT", "INBOX"]),
    targetId: z.string().uuid(),
    description: z.string().max(255).nullish(),
    isActive: z.boolean(),
    autoAction: z.enum(["INBOX", "DOCUMENT", "IGNORE"]),
  })
  .partial();

// ---------------------------------------------------------------------------
// PATCH /api/admin/email-routes/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;
    const tenantId = check.tenantId!;

    const { id } = await params;

    const existing = await prisma.emailRoute.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Nicht gefunden" });
    }

    const body = await request.json();
    const result = emailRouteUpdateSchema.safeParse(body);
    if (!result.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: result.error.flatten().fieldErrors });
    }

    // If address is being changed, check for duplicates
    if (result.data.address && result.data.address !== existing.address) {
      const duplicate = await prisma.emailRoute.findFirst({
        where: {
          address: result.data.address,
          tenantId,
          id: { not: id },
        },
      });
      if (duplicate) {
        return apiError("CONFLICT", undefined, { message: "Diese Adresse ist bereits vergeben" });
      }
    }

    const route = await prisma.emailRoute.update({
      where: { id },
      data: result.data,
    });

    return NextResponse.json({ route });
  } catch (error) {
    logger.error({ err: error }, "Failed to update email route");
    return apiError("UPDATE_FAILED", undefined, { message: "Fehler beim Aktualisieren" });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/email-routes/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;
    const tenantId = check.tenantId!;

    const { id } = await params;

    const existing = await prisma.emailRoute.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Nicht gefunden" });
    }

    await prisma.emailRoute.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error({ err: error }, "Failed to delete email route");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen" });
  }
}
