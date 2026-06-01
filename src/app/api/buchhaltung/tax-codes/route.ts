/**
 * Tenant-Steuerschlüssel-Verwaltung (P10, Schicht 2).
 *
 * GET  /api/buchhaltung/tax-codes
 *      Liefert alle TaxCodes des Mandanten inkl. aufgelöster Template-Daten.
 *      Wenn der Mandant noch keine TaxCodes hat (frischer Tenant), werden
 *      sie automatisch aus den globalen Templates materialisiert (idempotent).
 *
 * POST /api/buchhaltung/tax-codes
 *      Legt einen zusätzlichen TaxCode an (z.B. ein zweiter DATEV-Schlüssel
 *      für dieselbe Kategorie wenn der Mandant mit zwei Konten arbeitet).
 *      MUSS templateId angeben — wir lassen keine Codes ohne Template zu.
 *
 * Steuer-KATEGORIEN (TaxCategoryTemplate) sind read-only und werden im
 * Super-Admin-Bereich gepflegt (siehe /api/superadmin/tax-category-templates).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import {
  materializeTenantTaxCodes,
  resolveTaxCode,
} from "@/lib/accounting/tax-codes";

const createSchema = z.object({
  templateId: z.string().uuid(),
  code: z.string().min(1).max(10),
  nameOverride: z.string().max(150).optional().nullable(),
  rateOverride: z.number().min(0).max(1).optional().nullable(),
  vatReportBoxOverride: z.string().max(10).optional().nullable(),
  taxAccountId: z.string().uuid().optional().nullable(),
  active: z.boolean().optional(),
});

// ============================================================================
// GET /api/buchhaltung/tax-codes
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    // Auto-Materialize: wenn dieser Tenant noch keine Codes hat (frischer
    // Mandant), legen wir sie aus den globalen Templates an. Idempotent.
    const existingCount = await prisma.taxCode.count({
      where: { tenantId: check.tenantId },
    });
    if (existingCount === 0) {
      const created = await materializeTenantTaxCodes(prisma, check.tenantId);
      if (created > 0) {
        logger.info(
          { tenantId: check.tenantId, count: created },
          "Auto-materialized tax codes for fresh tenant",
        );
      }
    }

    const codes = await prisma.taxCode.findMany({
      where: {
        tenantId: check.tenantId,
        ...(includeInactive ? {} : { active: true }),
      },
      include: {
        template: {
          select: {
            id: true,
            key: true,
            category: true,
            name: true,
            description: true,
            defaultRate: true,
            defaultVatReportBox: true,
            reverseCharge: true,
            sortOrder: true,
            active: true,
          },
        },
        taxAccount: { select: { id: true, accountNumber: true, name: true } },
      },
      orderBy: { template: { sortOrder: "asc" } },
    });

    const resolved = codes.map((c) => ({
      id: c.id,
      code: c.code,
      templateId: c.templateId,
      template: c.template,
      nameOverride: c.nameOverride,
      rateOverride: c.rateOverride,
      vatReportBoxOverride: c.vatReportBoxOverride,
      taxAccount: c.taxAccount,
      taxAccountId: c.taxAccountId,
      active: c.active,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      // Berechnete Effektivwerte (aufgelöste Overrides):
      effective: resolveTaxCode(c),
    }));

    return NextResponse.json({ data: serializePrisma(resolved) });
  } catch (error) {
    logger.error({ err: error }, "Error fetching tax codes");
    return apiError("FETCH_FAILED", 500, {
      message: "Fehler beim Laden der Steuerschlüssel",
    });
  }
}

// ============================================================================
// POST /api/buchhaltung/tax-codes
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabedaten",
      });
    }

    // Template muss existieren UND aktiv sein.
    const template = await prisma.taxCategoryTemplate.findUnique({
      where: { id: parsed.data.templateId },
      select: { id: true, active: true },
    });
    if (!template) {
      return apiError("BAD_REQUEST", 400, {
        message: "Verknüpftes Steuer-Kategorie-Template existiert nicht",
      });
    }
    if (!template.active) {
      return apiError("OPERATION_NOT_ALLOWED", 409, {
        message: "Template ist deaktiviert — keine neuen Codes mehr erlaubt",
      });
    }

    if (parsed.data.taxAccountId) {
      const acct = await prisma.ledgerAccount.findFirst({
        where: { id: parsed.data.taxAccountId, tenantId: check.tenantId },
        select: { id: true },
      });
      if (!acct) {
        return apiError("BAD_REQUEST", 400, {
          message: "Verknüpftes USt-Konto gehört nicht zum aktiven Mandanten",
        });
      }
    }

    try {
      const created = await prisma.taxCode.create({
        data: {
          tenantId: check.tenantId,
          templateId: parsed.data.templateId,
          code: parsed.data.code,
          nameOverride: parsed.data.nameOverride ?? null,
          rateOverride: parsed.data.rateOverride ?? null,
          vatReportBoxOverride: parsed.data.vatReportBoxOverride ?? null,
          taxAccountId: parsed.data.taxAccountId ?? null,
          active: parsed.data.active ?? true,
        },
      });

      logger.info(
        { tenantId: check.tenantId, userId: check.userId, taxCodeId: created.id },
        "Tax code created",
      );

      return NextResponse.json(serializePrisma(created), { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return apiError("ALREADY_EXISTS", 409, {
          message: "Konflikt: DATEV-Schlüssel oder Template-Verknüpfung existiert bereits für diesen Mandanten",
        });
      }
      throw err;
    }
  } catch (error) {
    logger.error({ err: error }, "Error creating tax code");
    return apiError("CREATE_FAILED", 500, {
      message: "Fehler beim Anlegen des Steuerschlüssels",
    });
  }
}
