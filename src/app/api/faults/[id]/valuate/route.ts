/**
 * POST /api/faults/[id]/valuate — Ertragsausfall ermitteln und festschreiben
 *
 * A1 (Audit 2026-07): Der Ausfall wurde bisher geschätzt oder gar nicht
 * beziffert. Diese Route rechnet ihn aus den Referenzanlagen und schreibt
 * Menge, Herleitung, Satz und Betrag GEMEINSAM fort — halb aktualisierte
 * Felder wären schlimmer als gar keine.
 *
 * ## Warum eine eigene Route und kein PATCH-Feld
 *
 * Die Berechnung liest Zeitreihen mehrerer Anlagen und dauert entsprechend.
 * Sie an ein Formular-Speichern zu hängen hiesse, dass jedes Ändern einer Notiz
 * die Bewertung neu anstößt — und damit den festgeschriebenen Schaden
 * unbemerkt verschiebt, sobald sich Rohdaten nachträglich ändern.
 *
 * Ein bewusst ausgelöster Vorgang macht sichtbar, WANN bewertet wurde. Der
 * Zeitpunkt steht am Datensatz.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";
import { valuateFaultWindow } from "@/lib/faults/valuation-service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.FAULTS_VALUATE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const faultCase = await prisma.faultCase.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true, caseNumber: true, turbineId: true, startAt: true, endAt: true },
    });

    if (!faultCase) {
      return apiError("NOT_FOUND", 404, { message: "Störungsvorgang nicht gefunden" });
    }

    // Ohne Ende gibt es kein abgeschlossenes Fenster. Eine laufende Störung
    // „bis jetzt" zu bewerten wäre eine Momentaufnahme, die beim nächsten
    // Klick anders ausfällt — und die trotzdem als festgeschriebener Schaden
    // im Datensatz stünde.
    if (!faultCase.endAt) {
      return apiError("OPERATION_NOT_ALLOWED", 400, {
        message:
          "Der Vorgang hat kein Störungsende. Erst nach Eintrag des Endes lässt sich der Ausfall belastbar beziffern.",
      });
    }

    const outcome = await valuateFaultWindow({
      tenantId: check.tenantId!,
      turbineId: faultCase.turbineId,
      startAt: faultCase.startAt,
      endAt: faultCase.endAt,
    });

    if (outcome.energy.method === null) {
      // Nichts schreiben. Ein Vorgang ohne Bewertung ist ehrlicher als einer
      // mit einer erfundenen — und der Grund geht an die Oberfläche zurück,
      // damit der Bearbeiter weiss, ob er von Hand beziffern muss.
      return NextResponse.json(
        {
          computed: false,
          reason: outcome.energy.reason,
          ratePerKwh: outcome.ratePerKwh,
          rateSource: outcome.rateSource,
        },
        { status: 200 },
      );
    }

    const energy = outcome.energy;

    const updated = await prisma.faultCase.update({
      where: { id },
      data: {
        lostEnergyKwh: energy.lostKwh,
        lostEnergyMethod: "REFERENCE_TURBINE",
        lostEnergyBasis: {
          expectedKwh: energy.expectedKwh,
          actualKwh: energy.actualKwh,
          referenceTurbineIds: energy.referenceTurbineIds,
          intervalCount: energy.intervalCount,
          warnings: energy.warnings,
          windowStart: faultCase.startAt.toISOString(),
          windowEnd: faultCase.endAt.toISOString(),
        },
        lostEnergyComputedAt: new Date(),
        // Satz und Betrag nur setzen, wenn ein Satz gefunden wurde. Sonst
        // stünde ein Ausfall in kWh ohne Bewertung da — das ist ein
        // brauchbarer Zwischenstand, ein Betrag von 0 EUR wäre es nicht.
        ...(outcome.ratePerKwh !== null && {
          ratePerKwh: outcome.ratePerKwh,
          rateSource: outcome.rateSource,
          lostRevenueEur: outcome.lostRevenueEur,
        }),
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entityType: "FaultCase",
      entityId: id,
      description: `Ertragsausfall für ${faultCase.caseNumber} ermittelt: ${energy.lostKwh} kWh`,
    });

    logger.info(
      {
        faultCaseId: id,
        lostKwh: energy.lostKwh,
        references: energy.referenceTurbineIds.length,
        warnings: energy.warnings.length,
      },
      "[FaultCase] Ertragsausfall ermittelt",
    );

    return NextResponse.json({
      computed: true,
      faultCase: updated,
      // Die Hinweise gehören vor die Augen des Bearbeiters, bevor er die Zahl
      // an den Hersteller schickt — nicht nur in ein Json-Feld.
      warnings: energy.warnings,
      rateFound: outcome.ratePerKwh !== null,
    });
  } catch (error) {
    logger.error({ err: error }, "[FaultCase] Bewertung fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Ertragsausfall konnte nicht ermittelt werden" });
  }
}
