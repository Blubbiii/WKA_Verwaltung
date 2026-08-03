/**
 * Bewirtschafter eines Flurstücks — lesen und anlegen.
 *
 * Wer die Fläche tatsächlich bestellt: der Eigentümer selbst oder ein
 * Landwirt, der von ihm gepachtet hat. Ihn treffen Bauarbeiten, Zuwegung und
 * Flurschäden — bis jetzt kam er im Datenmodell nicht vor.
 *
 * **Keine Quoten.** Eine Fläche bestellt zu einem Zeitpunkt einer. Teilflächen
 * liegen in `PlotArea`; wer sie braucht, gehört dorthin und nicht in eine
 * Quote, die man dann doch wieder auf 100 addieren müsste. Begründung des
 * Modells in `src/lib/plots/parties.ts`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { isNotInFuture } from "@/lib/validation/not-in-future";

const bewirtschafterSchema = z.object({
  personId: z.uuid("Ungültige Personen-Kennung"),
  /**
   * `.nullish()`: darf fehlen ODER null sein. `.optional()` allein hätte
   * bedeutet, dass das Feld zwar weggelassen, aber nicht ausdrücklich
   * geleert werden kann — genau daran waren die Import-Assistenten
   * gescheitert.
   */
  validFrom: z.iso.date().nullish(),
  validTo: z.iso.date().nullish(),
  notes: z.string().max(2000).nullish(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Ueber das Flurstueck mandantengeprueft — plot_owners traegt selbst
    // keine tenantId, sie haengt am Flurstueck.
    const plot = await prisma.plot.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true },
    });
    if (!plot) {
      return apiError("NOT_FOUND", undefined, { message: "Flurstück nicht gefunden" });
    }

    const bewirtschafter = await prisma.plotFarmer.findMany({
      where: { plotId: id },
      include: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            personType: true,
          },
        },
      },
      orderBy: { validFrom: "desc" },
    });

    return NextResponse.json({
      data: bewirtschafter.map((e) => ({
        id: e.id,
        personId: e.personId,
        person: e.person,
        validFrom: e.validFrom?.toISOString() ?? null,
        validTo: e.validTo?.toISOString() ?? null,
        notes: e.notes,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching plot farmers");
    return apiError("FETCH_FAILED", undefined, {
      message: "Fehler beim Laden der Bewirtschafter",
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;
    const parsed = bewirtschafterSchema.safeParse(await request.json());
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

    // Ein Eigentumsbeginn in der Zukunft ist ein Vertrag, kein Grundbuch.
    // Eintragen laesst er sich trotzdem — aber ein VERSEHEN (Jahreszahl
    // vertippt) faellt hier auf, statt spaeter in einer Abrechnung.
    if (daten.validFrom && !isNotInFuture(daten.validFrom)) {
      logger.warn(
        { plotId: id, validFrom: daten.validFrom },
        "Bewirtschafter mit Beginn in der Zukunft eingetragen",
      );
    }

    const plot = await prisma.plot.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true },
    });
    if (!plot) {
      return apiError("NOT_FOUND", undefined, { message: "Flurstück nicht gefunden" });
    }

    // Die Person muss demselben Mandanten gehoeren. Ohne diese Pruefung
    // liesse sich ueber eine fremde Kennung eine Person eines anderen
    // Mandanten an das eigene Flurstueck haengen.
    const person = await prisma.person.findFirst({
      where: { id: daten.personId, tenantId: check.tenantId! },
      select: { id: true },
    });
    if (!person) {
      return apiError("NOT_FOUND", undefined, { message: "Person nicht gefunden" });
    }

    const angelegt = await prisma.plotFarmer.create({
      data: {
        plotId: id,
        personId: daten.personId,
        validFrom: daten.validFrom ? new Date(daten.validFrom) : null,
        validTo: daten.validTo ? new Date(daten.validTo) : null,
        notes: daten.notes ?? null,
      },
    });

    return NextResponse.json({ data: { id: angelegt.id } }, { status: 201 });
  } catch (error) {
    // Doppelerfassung: dieselbe Person zweimal mit demselben Beginn.
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return apiError("CONFLICT", undefined, {
        message:
          "Diese Person ist an diesem Flurstück bereits mit demselben Beginn " +
          "als Bewirtschafter eingetragen. Ein Wechsel wird abgebildet, indem " +
          "der alte Eintrag ein Ende bekommt und der neue am Folgetag beginnt.",
      });
    }
    logger.error({ err: error }, "Error creating plot farmer");
    return apiError("CREATE_FAILED", undefined, {
      message: "Bewirtschafter konnte nicht angelegt werden",
    });
  }
}
