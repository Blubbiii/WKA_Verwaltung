/**
 * Super-Admin: Globale Steuer-Kategorie-Templates (P10).
 *
 * GET  /api/superadmin/tax-category-templates  — Liste aller Templates
 * POST /api/superadmin/tax-category-templates  — Neues Template anlegen
 *
 * Templates sind die globale Quelle der Wahrheit für gesetzliche Steuer-
 * Kategorien (§12 UStG, §13b, §4, IGE/IGL, etc.). Sie werden vom Super-
 * Admin gepflegt; Tenants sehen sie nur read-only.
 *
 * Pro Tenant existiert für jedes aktive Template ein materialisierter
 * TaxCode (siehe `materializeTenantTaxCodes`). Änderungen an einem
 * Template wirken sich erst auf neu angelegte Tenants aus — bestehende
 * Tenant-TaxCodes lesen aktuelle Template-Felder via Relation, behalten
 * aber ihre eigenen Overrides.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, TaxCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const createSchema = z.object({
  key: z.string().min(1).max(50),
  category: z.enum(TaxCategory),
  name: z.string().min(1).max(150),
  description: z.string().max(500).optional().nullable(),
  defaultRate: z.number().min(0).max(1),
  defaultVatReportBox: z.string().max(10).optional().nullable(),
  reverseCharge: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

// ============================================================================
// GET /api/superadmin/tax-category-templates
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const templates = await prisma.taxCategoryTemplate.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    });

    return NextResponse.json({ data: serializePrisma(templates) });
  } catch (error) {
    logger.error({ err: error }, "Error fetching tax category templates");
    return apiError("FETCH_FAILED", 500, {
      message: "Fehler beim Laden der Steuer-Kategorie-Templates",
    });
  }
}

// ============================================================================
// POST /api/superadmin/tax-category-templates
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabedaten",
      });
    }

    try {
      const created = await prisma.taxCategoryTemplate.create({
        data: {
          key: parsed.data.key,
          category: parsed.data.category,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          defaultRate: parsed.data.defaultRate,
          defaultVatReportBox: parsed.data.defaultVatReportBox ?? null,
          reverseCharge: parsed.data.reverseCharge ?? false,
          sortOrder: parsed.data.sortOrder ?? 0,
          active: parsed.data.active ?? true,
        },
      });

      logger.info(
        { userId: check.userId, templateId: created.id, key: created.key },
        "Tax category template created",
      );

      return NextResponse.json(serializePrisma(created), { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return apiError("ALREADY_EXISTS", 409, {
          message: `Template mit Key "${parsed.data.key}" oder Kategorie "${parsed.data.category}" existiert bereits`,
        });
      }
      throw err;
    }
  } catch (error) {
    logger.error({ err: error }, "Error creating tax category template");
    return apiError("CREATE_FAILED", 500, {
      message: "Fehler beim Anlegen des Templates",
    });
  }
}
