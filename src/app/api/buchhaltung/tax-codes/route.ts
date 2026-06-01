/**
 * Tax-Code Verwaltung (Phase 10).
 *
 * GET  /api/buchhaltung/tax-codes        — Alle Codes des Mandanten
 * POST /api/buchhaltung/tax-codes        — Neuen Code anlegen (Admin)
 *
 * System-Codes (isSystem=true) sind die 8 Default-TaxCodes aus dem Seed
 * — sie können editiert (z.B. Name umbenannt) aber nicht gelöscht werden.
 *
 * Custom-Codes (isSystem=false) sind tenant-spezifische Erweiterungen
 * (z.B. eigene Reverse-Charge-Codes für spezifische Subunternehmer-Konstellationen).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, TaxCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const createSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1).max(100),
  category: z.enum(TaxCategory),
  rate: z.number().min(0).max(1),
  vatReportBox: z.string().max(10).nullable().optional(),
  reverseCharge: z.boolean().optional(),
  taxAccountId: z.string().uuid().nullable().optional(),
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

    const codes = await prisma.taxCode.findMany({
      where: {
        tenantId: check.tenantId,
        ...(includeInactive ? {} : { active: true }),
      },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        rate: true,
        vatReportBox: true,
        reverseCharge: true,
        taxAccountId: true,
        taxAccount: { select: { accountNumber: true, name: true } },
        active: true,
        isSystem: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ category: "asc" }, { code: "asc" }],
    });

    return NextResponse.json({ data: serializePrisma(codes) });
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

    // Bei taxAccountId: muss dem gleichen Tenant gehören
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
          code: parsed.data.code,
          name: parsed.data.name,
          category: parsed.data.category,
          rate: parsed.data.rate,
          vatReportBox: parsed.data.vatReportBox ?? null,
          reverseCharge: parsed.data.reverseCharge ?? false,
          taxAccountId: parsed.data.taxAccountId ?? null,
          active: parsed.data.active ?? true,
          isSystem: false,
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
          message: `Steuerschlüssel "${parsed.data.code}" existiert bereits`,
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
