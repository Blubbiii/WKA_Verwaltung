/**
 * Super-Admin: Einzel-Operations auf Steuer-Kategorie-Templates (P10).
 *
 * PATCH  /api/superadmin/tax-category-templates/[id]
 * DELETE /api/superadmin/tax-category-templates/[id]
 *
 * DELETE wird abgelehnt sofern Tenant-TaxCodes auf das Template verweisen
 * (Schema: onDelete: Restrict). Empfohlene Alternative: active=false setzen.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, TaxCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const patchSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).optional().nullable(),
  category: z.enum(TaxCategory).optional(),
  defaultRate: z.number().min(0).max(1).optional(),
  defaultVatReportBox: z.string().max(10).optional().nullable(),
  reverseCharge: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existing = await prisma.taxCategoryTemplate.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, {
        message: "Template nicht gefunden",
      });
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabedaten",
      });
    }

    try {
      const updated = await prisma.taxCategoryTemplate.update({
        where: { id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description }
            : {}),
          ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
          ...(parsed.data.defaultRate !== undefined
            ? { defaultRate: parsed.data.defaultRate }
            : {}),
          ...(parsed.data.defaultVatReportBox !== undefined
            ? { defaultVatReportBox: parsed.data.defaultVatReportBox }
            : {}),
          ...(parsed.data.reverseCharge !== undefined
            ? { reverseCharge: parsed.data.reverseCharge }
            : {}),
          ...(parsed.data.sortOrder !== undefined
            ? { sortOrder: parsed.data.sortOrder }
            : {}),
          ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
        },
      });

      logger.info(
        { userId: check.userId, templateId: id },
        "Tax category template updated",
      );

      return NextResponse.json(serializePrisma(updated));
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return apiError("ALREADY_EXISTS", 409, {
          message: "Konflikt: Key oder Kategorie bereits anderweitig verwendet",
        });
      }
      throw err;
    }
  } catch (error) {
    logger.error({ err: error }, "Error updating tax category template");
    return apiError("UPDATE_FAILED", 500, {
      message: "Fehler beim Aktualisieren des Templates",
    });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existing = await prisma.taxCategoryTemplate.findUnique({
      where: { id },
      select: { id: true, key: true },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, {
        message: "Template nicht gefunden",
      });
    }

    const refs = await prisma.taxCode.count({ where: { templateId: id } });
    if (refs > 0) {
      return apiError("DEPENDENCY_EXISTS", 409, {
        message: `Template wird von ${refs} Tenant-Steuerschlüssel(n) verwendet. Bitte deaktivieren (active=false) statt löschen.`,
        details: { taxCodeRefs: refs },
      });
    }

    await prisma.taxCategoryTemplate.delete({ where: { id } });

    logger.info(
      { userId: check.userId, templateId: id, key: existing.key },
      "Tax category template deleted",
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting tax category template");
    return apiError("DELETE_FAILED", 500, {
      message: "Fehler beim Löschen des Templates",
    });
  }
}
