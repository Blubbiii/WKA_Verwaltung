/**
 * Einzelner Bewirtschafter-Eintrag eines Flurstücks — ändern und entfernen.
 *
 * ## Ändern heisst nicht überschreiben
 *
 * Ein Wechsel wird abgebildet, indem der alte Eintrag ein `validTo` bekommt
 * und ein neuer am Folgetag beginnt. `PATCH` ist für **Korrekturen** da —
 * ein Tippfehler in der Quote, ein falsches Datum.
 *
 * `DELETE` entfernt einen Eintrag wirklich. Das ist für Fehleingaben richtig,
 * für einen Wechsel falsch: wer den Vorbesitzer löscht, nimmt einer bereits
 * abgerechneten Periode die Grundlage und weiss nach einem Flurschaden nicht
 * mehr, wer damals auf der Fläche war. Die Oberfläche bietet deshalb „beenden"
 * an prominenter Stelle an und „löschen" nur im Zusatzmenü.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";

const patchSchema = z.object({
  validFrom: z.iso.date().nullish(),
  validTo: z.iso.date().nullish(),
  notes: z.string().max(2000).nullish(),
});

/** Gehört der Eintrag zu einem Flurstück dieses Mandanten? */
async function gehoertZumMandanten(
  eintragId: string,
  plotId: string,
  tenantId: string,
): Promise<boolean> {
  const eintrag = await prisma.plotFarmer.findFirst({
    where: { id: eintragId, plotId, plot: { tenantId } },
    select: { id: true },
  });
  return eintrag !== null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; eintragId: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id, eintragId } = await params;

    if (!(await gehoertZumMandanten(eintragId, id, check.tenantId!))) {
      return apiError("NOT_FOUND", undefined, { message: "Eintrag nicht gefunden" });
    }

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, {
        message: "Ungültige Eingabe",
        details: parsed.error.issues,
      });
    }
    const daten = parsed.data;

    if (daten.validFrom && daten.validTo && daten.validTo < daten.validFrom) {
      return apiError("VALIDATION_FAILED", undefined, {
        message: "Das Ende liegt vor dem Beginn",
      });
    }

    // Nur ausdruecklich mitgeschickte Felder anfassen. Ein fehlendes Feld
    // heisst "nicht aendern", ein null heisst "leeren" — deshalb `.nullish()`
    // im Schema und hier die Unterscheidung ueber `undefined`.
    await prisma.plotFarmer.update({
      where: { id: eintragId },
      data: {
        ...(daten.validFrom !== undefined && {
          validFrom: daten.validFrom ? new Date(daten.validFrom) : null,
        }),
        ...(daten.validTo !== undefined && {
          validTo: daten.validTo ? new Date(daten.validTo) : null,
        }),
        ...(daten.notes !== undefined && { notes: daten.notes }),
      },
    });

    return NextResponse.json({ data: { id: eintragId } });
  } catch (error) {
    logger.error({ err: error }, "Error updating plot farmer");
    return apiError("UPDATE_FAILED", undefined, {
      message: "Eintrag konnte nicht geändert werden",
    });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; eintragId: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id, eintragId } = await params;

    if (!(await gehoertZumMandanten(eintragId, id, check.tenantId!))) {
      return apiError("NOT_FOUND", undefined, { message: "Eintrag nicht gefunden" });
    }

    await prisma.plotFarmer.delete({ where: { id: eintragId } });

    return NextResponse.json({ data: { id: eintragId } });
  } catch (error) {
    logger.error({ err: error }, "Error deleting plot farmer");
    return apiError("DELETE_FAILED", undefined, {
      message: "Eintrag konnte nicht entfernt werden",
    });
  }
}
