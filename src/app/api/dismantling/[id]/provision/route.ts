/**
 * POST /api/dismantling/[id]/provision — Jahresrückstellung fortschreiben
 *
 * A7 (Audit 2026-07): Es fehlte „keine automatische Jahresbuchung". Diese
 * Route rechnet Handels- und Steuerbilanz und schreibt beide fort.
 *
 * ## Warum ein Datensatz je Jahr und keine Neuberechnung
 *
 * Ein festgestellter Jahresabschluss darf sich nicht ändern, wenn jemand
 * später das Rückbaugutachten aktualisiert. Deshalb wird je Jahr genau ein
 * Datensatz geschrieben, der die angewandten Rechnungsgrundlagen mitführt —
 * und ein vorhandener wird nur auf ausdrücklichen Wunsch überschrieben.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { computeProvision } from "@/lib/dismantling/provision";

const bodySchema = z.object({
  year: z.number().int().min(2000).max(2200),
  /**
   * Handelsrechtlicher Abzinsungssatz (Bundesbank, laufzeitabhängig).
   * Ohne ihn wird nicht abgezinst — und das steht dann in den Hinweisen.
   */
  hgbDiscountRatePercent: z.number().min(0).max(20).nullable().optional(),
  /** Vorhandene Fortschreibung des Jahres ersetzen. */
  overwrite: z.boolean().default(false),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.DISMANTLING_PROVISION);
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Eingabe",
        details: parsed.error.issues,
      });
    }
    const data = parsed.data;

    const obligation = await prisma.dismantlingObligation.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        park: { select: { name: true, commissioningDate: true } },
        provisions: { where: { year: { in: [data.year, data.year - 1] } } },
      },
    });

    if (!obligation) {
      return apiError("NOT_FOUND", 404, { message: "Rückbauverpflichtung nicht gefunden" });
    }
    if (!obligation.park.commissioningDate) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Der Park hat kein Inbetriebnahmedatum",
      });
    }

    const existing = obligation.provisions.find((p) => p.year === data.year);
    if (existing && !data.overwrite) {
      // Nicht stillschweigend ersetzen: der Wert kann Grundlage eines
      // festgestellten Abschlusses sein.
      return apiError("ALREADY_EXISTS", 409, {
        message: `Für ${data.year} gibt es bereits eine Fortschreibung. Zum Ersetzen bitte ausdrücklich bestätigen.`,
        details: { provisionId: existing.id },
      });
    }

    const previous = obligation.provisions.find((p) => p.year === data.year - 1);

    const result = computeProvision({
      estimatedCostTodayEur: Number(obligation.estimatedCostTodayEur),
      balanceSheetYear: data.year,
      commissioningYear: obligation.park.commissioningDate.getFullYear(),
      dismantlingYear: obligation.dismantlingYear,
      costInflationPercent: Number(obligation.costInflationPercent),
      hgbDiscountRatePercent: data.hgbDiscountRatePercent ?? null,
      previousYearHgbEur: previous ? Number(previous.hgbProvisionEur) : null,
      previousYearTaxEur: previous ? Number(previous.taxProvisionEur) : null,
    });

    if (result.hgb === null) {
      // Nichts schreiben. Eine Rückstellung ohne Grundlage wäre eine
      // Bilanzgrösse, die niemand erklären kann.
      return NextResponse.json({ computed: false, reason: result.reason }, { status: 200 });
    }

    const payload = {
      obligationId: id,
      year: data.year,
      // Rechnungsgrundlagen mitspeichern: eine spätere Änderung des
      // Gutachtens darf einen festgestellten Abschluss nicht umrechnen.
      estimatedCostTodayEur: Number(obligation.estimatedCostTodayEur),
      costInflationPercent: Number(obligation.costInflationPercent),
      hgbDiscountRatePercent: data.hgbDiscountRatePercent ?? null,
      hgbSettlementAmountEur: result.hgb.settlementAmountEur,
      hgbProvisionEur: result.hgb.provisionEur,
      hgbAdditionEur: result.hgb.additionEur,
      taxSettlementAmountEur: result.tax.settlementAmountEur,
      taxProvisionEur: result.tax.provisionEur,
      taxAdditionEur: result.tax.additionEur,
      differenceEur: result.differenceEur,
      accrualRatio: result.hgb.accrualRatio,
      remainingYears: result.hgb.remainingYears,
      basis: {
        hgb: result.hgb,
        tax: result.tax,
        warnings: result.warnings,
        previousYear: previous ? previous.year : null,
      } as unknown as Prisma.InputJsonValue,
      computedAt: new Date(),
    };

    const stored = existing
      ? await prisma.dismantlingProvision.update({ where: { id: existing.id }, data: payload })
      : await prisma.dismantlingProvision.create({ data: payload });

    await createAuditLog({
      action: existing ? "UPDATE" : "CREATE",
      entityType: "Park",
      entityId: obligation.parkId,
      description: `Rückbaurückstellung ${data.year}: HGB ${result.hgb.provisionEur} EUR / StB ${result.tax.provisionEur} EUR`,
    });

    logger.info(
      {
        obligationId: id,
        year: data.year,
        hgbProvisionEur: result.hgb.provisionEur,
        taxProvisionEur: result.tax.provisionEur,
        differenceEur: result.differenceEur,
      },
      "[Dismantling] Rückstellung fortgeschrieben",
    );

    return NextResponse.json({
      computed: true,
      provision: stored,
      hgb: result.hgb,
      tax: result.tax,
      differenceEur: result.differenceEur,
      // Die Hinweise gehören vor die Augen des Bearbeiters — vor allem der
      // zum fehlenden Abzinsungssatz, weil der Betrag dann zu hoch ist.
      warnings: result.warnings,
      replaced: Boolean(existing),
    });
  } catch (error) {
    logger.error({ err: error }, "[Dismantling] Fortschreibung fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Fortschreibung fehlgeschlagen" });
  }
}
