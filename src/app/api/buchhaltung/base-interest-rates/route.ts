/**
 * GET  /api/buchhaltung/base-interest-rates  — Liste (Auto-Seed bei leerer Tabelle)
 * POST /api/buchhaltung/base-interest-rates  — Neuen Satz anlegen (Admin)
 *
 * Tabelle ist mandantenunabhängig (§247 BGB Basiszinssatz wird zentral
 * von der Bundesbank festgelegt). Pflege wird vom Admin durchgeführt
 * sobald die Bundesbank halbjährlich aktualisiert.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  requirePermission,
} from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { seedBundesbankRates } from "@/lib/accounting/base-interest-rate";

const createSchema = z.object({
  validFrom: z.string().min(1),
  validTo: z.string().optional().nullable(),
  ratePercent: z.number().min(-5).max(15),
  source: z.string().min(1).max(200),
});

export async function GET() {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    // Auto-Seed beim ersten Aufruf.
    const count = await prisma.baseInterestRate.count();
    if (count === 0) {
      const seeded = await seedBundesbankRates();
      logger.info({ seeded }, "Auto-seeded base interest rates (Bundesbank)");
    }

    const rates = await prisma.baseInterestRate.findMany({
      orderBy: { validFrom: "desc" },
    });

    return NextResponse.json({ data: serializePrisma(rates) });
  } catch (error) {
    logger.error({ err: error }, "Error loading base interest rates");
    return apiError("FETCH_FAILED", 500, {
      message: "Fehler beim Laden der Basiszinssätze",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabe",
      });
    }

    try {
      const created = await prisma.baseInterestRate.create({
        data: {
          validFrom: new Date(parsed.data.validFrom),
          validTo: parsed.data.validTo ? new Date(parsed.data.validTo) : null,
          ratePercent: parsed.data.ratePercent,
          source: parsed.data.source,
        },
      });

      logger.info(
        { userId: check.userId, rateId: created.id, validFrom: created.validFrom },
        "Base interest rate created",
      );

      return NextResponse.json(serializePrisma(created), { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return apiError("ALREADY_EXISTS", 409, {
          message: `Basiszinssatz mit validFrom ${parsed.data.validFrom} existiert bereits`,
        });
      }
      throw err;
    }
  } catch (error) {
    logger.error({ err: error }, "Error creating base interest rate");
    return apiError("CREATE_FAILED", 500, {
      message: "Fehler beim Anlegen des Basiszinssatzes",
    });
  }
}
