/**
 * GET  /api/municipality-benefits — Vereinbarungen nach § 6 EEG
 * POST /api/municipality-benefits — Vereinbarung erfassen
 *
 * Eine Vereinbarung verbindet EINE Anlage mit EINER Gemeinde und trägt den
 * Anteil der 2.500-m-Kreisfläche sowie den vereinbarten Satz.
 *
 * ## Warum der Satz über 0,2 ct/kWh nicht abgelehnt wird
 *
 * § 6 Abs. 1 EEG nennt 0,2 ct/kWh als Höchstsatz für die Förderfähigkeit.
 * Zivilrechtlich kann mehr vereinbart worden sein; die Anwendung soll einen
 * bestehenden Vertrag nicht unspeicherbar machen. Sie weist ihn aus — in der
 * Antwort und in der Auswertung — statt ihn zu verweigern.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { serializePrisma } from "@/lib/serialize";
import { MAX_RATE_CT_PER_KWH } from "@/lib/regulatory/municipality-benefit";

const createSchema = z.object({
  turbineId: z.string().uuid(),
  municipalityId: z.string().uuid(),
  /**
   * Anteil der Kreisfläche als Dezimalbruch. Die Obergrenze von 1 fängt die
   * naheliegende Verwechslung ab: „70" statt „0,7" wäre sonst das
   * Siebzigfache der Zahlung.
   */
  areaShare: z.number().gt(0).max(1),
  rateCtPerKwh: z.number().gt(0).max(1),
  validFrom: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  reference: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

export async function GET() {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_READ);
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const benefits = await prisma.municipalityBenefit.findMany({
      where: { tenantId: check.tenantId },
      include: {
        municipality: { select: { id: true, name: true } },
        turbine: {
          select: { id: true, designation: true, park: { select: { name: true } } },
        },
      },
      orderBy: [{ turbine: { designation: "asc" } }],
    });

    return NextResponse.json({ data: serializePrisma(benefits) });
  } catch (error) {
    logger.error({ err: error }, "Vereinbarungen konnten nicht geladen werden");
    return apiError("PROCESS_FAILED", 500, {
      message: "Vereinbarungen konnten nicht geladen werden",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_UPDATE);
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
      });
    }
    const input = parsed.data;

    // Beide Enden gegen den Mandanten prüfen. Ohne das liesse sich eine
    // fremde Anlage an die eigene Gemeinde hängen.
    const [turbine, municipality] = await Promise.all([
      prisma.turbine.findFirst({
        where: { id: input.turbineId, park: { tenantId: check.tenantId } },
        select: { id: true, designation: true },
      }),
      prisma.municipality.findFirst({
        where: { id: input.municipalityId, tenantId: check.tenantId },
        select: { id: true, name: true },
      }),
    ]);
    if (!turbine) {
      return apiError("NOT_FOUND", 404, { message: "Anlage nicht gefunden" });
    }
    if (!municipality) {
      return apiError("NOT_FOUND", 404, { message: "Gemeinde nicht gefunden" });
    }

    const created = await prisma.municipalityBenefit.create({
      data: {
        tenantId: check.tenantId,
        turbineId: input.turbineId,
        municipalityId: input.municipalityId,
        areaShare: new Prisma.Decimal(input.areaShare),
        rateCtPerKwh: new Prisma.Decimal(input.rateCtPerKwh),
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        reference: input.reference || null,
        notes: input.notes || null,
      },
    });

    await createAuditLog({
      action: "CREATE",
      entityType: "Municipality",
      entityId: created.id,
      newValues: {
        turbine: turbine.designation,
        municipality: municipality.name,
        areaShare: input.areaShare,
        rateCtPerKwh: input.rateCtPerKwh,
      },
      description: `§ 6 EEG: ${turbine.designation} → ${municipality.name}`,
    });

    return NextResponse.json(
      {
        data: serializePrisma(created),
        // Der Hinweis gehoert in die Antwort und nicht nur in die Auswertung —
        // wer den Satz gerade eintippt, soll es sofort erfahren.
        warning:
          input.rateCtPerKwh > MAX_RATE_CT_PER_KWH
            ? `Der Satz liegt über dem Höchstsatz von ${MAX_RATE_CT_PER_KWH} ct/kWh (§ 6 Abs. 1 EEG). Der übersteigende Teil ist nicht förderfähig.`
            : undefined,
      },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return apiError("VALIDATION_FAILED", 409, {
        message:
          "Für diese Anlage und Gemeinde besteht bereits eine Vereinbarung mit diesem Beginn. Die bestehende befristen, statt eine zweite anzulegen.",
      });
    }
    logger.error({ err: error }, "Vereinbarung konnte nicht angelegt werden");
    return apiError("PROCESS_FAILED", 500, {
      message: "Vereinbarung konnte nicht angelegt werden",
    });
  }
}
