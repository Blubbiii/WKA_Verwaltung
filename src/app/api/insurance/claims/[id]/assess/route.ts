/**
 * POST /api/insurance/claims/[id]/assess — Erwartete Entschädigung ermitteln
 *
 * A6 (Audit 2026-07): Es fehlte die Verknüpfung Schaden→Police mit
 * Selbstbehaltsabzug. Bei Betriebsunterbrechung ist der Schaden der entgangene
 * Ertrag — ohne A1 gar nicht bezifferbar; diese Route holt ihn von dort.
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
import { computeReimbursement, type PolicyTerms } from "@/lib/insurance/reimbursement";

const bodySchema = z.object({
  /**
   * Schadenhöhe. Fehlt sie, wird sie aus dem Schadenfall abgeleitet:
   * bei Betriebsunterbrechung aus dem verknüpften Störungsvorgang, sonst aus
   * actualCost bzw. estimatedCost.
   */
  lossEur: z.number().nonnegative().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.INSURANCE_MANAGE);
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Eingabe",
        details: parsed.error.issues,
      });
    }

    const claim = await prisma.insuranceClaim.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        policy: { include: { insuredObjects: true } },
        coverage: true,
        faultCase: { select: { id: true, caseNumber: true, lostRevenueEur: true } },
      },
    });

    if (!claim) {
      return apiError("NOT_FOUND", 404, { message: "Schadenfall nicht gefunden" });
    }
    if (!claim.policy) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Dem Schadenfall ist keine Police zugeordnet",
      });
    }

    // Schadenhöhe bestimmen. Reihenfolge mit Absicht: eine ausdrücklich
    // angegebene Zahl schlägt alles, danach der bewertete Ertragsausfall bei
    // Betriebsunterbrechung, dann die tatsächlichen, zuletzt die geschätzten
    // Kosten.
    let lossEur: number | null = parsed.data.lossEur ?? null;
    let lossSource = "manuell";

    if (lossEur === null && claim.coverage?.coverageType === "BUSINESS_INTERRUPTION") {
      const lost = toNumber(claim.faultCase?.lostRevenueEur);
      if (lost !== null) {
        lossEur = lost;
        lossSource = `Störungsvorgang ${claim.faultCase?.caseNumber ?? ""}`.trim();
      }
    }
    if (lossEur === null) {
      const actual = toNumber(claim.actualCostEur);
      const estimated = toNumber(claim.estimatedCostEur);
      if (actual !== null) {
        lossEur = actual;
        lossSource = "tatsächliche Kosten";
      } else if (estimated !== null) {
        lossEur = estimated;
        lossSource = "geschätzte Kosten";
      }
    }

    if (lossEur === null) {
      // Ohne Schadenhöhe gibt es nichts zu bewerten. Eine 0 anzunehmen würde
      // „kein Schaden" behaupten.
      return NextResponse.json(
        {
          assessed: false,
          reason:
            claim.coverage?.coverageType === "BUSINESS_INTERRUPTION"
              ? "Keine Schadenhöhe: Bei Betriebsunterbrechung muss der Störungsvorgang bewertet sein oder die Höhe manuell angegeben werden."
              : "Keine Schadenhöhe hinterlegt — bitte Kosten erfassen oder Betrag angeben.",
        },
        { status: 200 },
      );
    }

    // Deckungsspezifische Werte schlagen die der Police. Fehlt an der Deckung
    // etwas, gilt der Wert der Police — so lassen sich Policen mit einer
    // Gesamtsumme und solche mit Einzelsummen gleich behandeln.
    const policy = claim.policy;
    const coverage = claim.coverage;

    const sumInsured =
      toNumber(coverage?.sumInsuredEur) ?? toNumber(policy.sumInsuredEur);
    if (sumInsured === null) {
      return NextResponse.json(
        {
          assessed: false,
          reason: "Keine Versicherungssumme hinterlegt — ohne sie ist keine Entschädigung berechenbar.",
        },
        { status: 200 },
      );
    }

    // Versicherungswert: die Summe der versicherten Objekte ist belastbarer
    // als ein pauschaler Wert, weil sie je Objekt gepflegt ist.
    const objectValue = policy.insuredObjects.reduce(
      (sum, object) => sum + (toNumber(object.insuredValueEur) ?? 0),
      0,
    );
    const insuredValue =
      toNumber(coverage?.insuredValueEur) ??
      (objectValue > 0 ? objectValue : toNumber(policy.insuredValueEur));

    const terms: PolicyTerms = {
      sumInsuredEur: sumInsured,
      insuredValueEur: insuredValue,
      waivesUnderinsurance: policy.waivesUnderinsurance,
      deductibleType: (coverage?.deductibleType ?? policy.deductibleType) as PolicyTerms["deductibleType"],
      deductibleValue: toNumber(coverage?.deductibleValue) ?? toNumber(policy.deductibleValue) ?? 0,
      deductibleMinEur: toNumber(policy.deductibleMinEur),
      deductibleMaxEur: toNumber(policy.deductibleMaxEur),
    };

    const result = computeReimbursement({ lossEur, terms });

    const updated = await prisma.insuranceClaim.update({
      where: { id },
      data: {
        deductibleAppliedEur: result.deductibleEur,
        expectedReimbursementEur: result.expectedReimbursementEur,
        reimbursementBasis: {
          lossEur: result.lossEur,
          lossSource,
          afterUnderinsuranceEur: result.afterUnderinsuranceEur,
          underinsuranceFactor: result.underinsuranceFactor,
          cappedAtSumInsured: result.cappedAtSumInsured,
          ownShareEur: result.ownShareEur,
          // Die angewandten Konditionen mitspeichern: eine spätere Änderung
          // der Police darf einen abgeschlossenen Schadenfall nicht
          // umrechnen.
          terms,
          warnings: result.warnings,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entityType: "Contract",
      entityId: id,
      description: `Schadenbewertung: ${result.expectedReimbursementEur} EUR erwartet`,
    });

    logger.info(
      {
        claimId: id,
        lossEur: result.lossEur,
        expectedReimbursementEur: result.expectedReimbursementEur,
        underinsuranceFactor: result.underinsuranceFactor,
      },
      "[Insurance] Schaden bewertet",
    );

    return NextResponse.json({
      assessed: true,
      claim: updated,
      result,
      lossSource,
      // Die Hinweise gehören vor die Augen des Bearbeiters — vor allem der zur
      // ungeprüften Unterversicherung.
      warnings: result.warnings,
    });
  } catch (error) {
    logger.error({ err: error }, "[Insurance] Bewertung fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Bewertung fehlgeschlagen" });
  }
}

function toNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
