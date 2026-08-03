import { NextRequest, NextResponse, after } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { logDeletion } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";
import { findeAbweichungen, gueltigeAm, pruefeQuoten } from "@/lib/plots/parties";

const plotUpdateSchema = z.object({
  parkId: z.uuid().optional().nullable(),
  county: z.string().optional().nullable(),
  municipality: z.string().optional().nullable(),
  cadastralDistrict: z.string().min(1).optional(),
  fieldNumber: z.string().optional(),
  plotNumber: z.string().min(1).optional(),
  areaSqm: z.number().optional().nullable(),
  usageType: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  mapImageUrl: z.url().optional().nullable(),
  mapDocumentUrl: z.url().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

// GET /api/plots/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.PLOTS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const plot = await prisma.plot.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      include: {
        park: {
          select: {
            id: true,
            name: true,
            shortName: true,
            minimumRentPerTurbine: true,
            weaSharePercentage: true,
            poolSharePercentage: true,
          },
        },
        plotAreas: {
          orderBy: { areaType: "asc" },
        },
        owners: {
          include: {
            person: {
              select: {
                id: true, firstName: true, lastName: true,
                companyName: true, personType: true,
              },
            },
          },
          orderBy: [{ validFrom: "desc" }, { sharePercent: "desc" }],
        },
        farmers: {
          include: {
            person: {
              select: {
                id: true, firstName: true, lastName: true,
                companyName: true, personType: true,
              },
            },
          },
          orderBy: { validFrom: "desc" },
        },
        leasePlots: {
          include: {
            lease: {
              include: {
                lessor: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    companyName: true,
                    personType: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!plot) {
      return apiError("NOT_FOUND", undefined, { message: "Flurstück nicht gefunden" });
    }

    const name = (p: {
      companyName: string | null;
      firstName: string | null;
      lastName: string | null;
    }) =>
      p.companyName?.trim() ||
      [p.firstName, p.lastName].filter(Boolean).join(" ") ||
      "Ohne Namen";

    // Nur die HEUTE gueltigen Eintraege gehen in den Abgleich. Waehrend eines
    // Eigentuemerwechsels stehen alter und neuer Eintrag nebeneinander in der
    // Tabelle; wer beide vergleicht, meldet eine Abweichung, wo keine ist.
    const heute = new Date();
    const aktuelleEigentuemer = gueltigeAm(
      plot.owners.map((o) => ({
        personId: o.personId,
        name: name(o.person),
        sharePercent: o.sharePercent.toNumber(),
        validFrom: o.validFrom,
        validTo: o.validTo,
      })),
      heute,
    );
    const aktuelleBewirtschafter = gueltigeAm(
      plot.farmers.map((f) => ({
        personId: f.personId,
        name: name(f.person),
        validFrom: f.validFrom,
        validTo: f.validTo,
      })),
      heute,
    );

    // Verpaechter aus den Vertraegen, die dieses Flurstueck umfassen.
    const verpaechter = plot.leasePlots
      .map((lp) => lp.lease?.lessor)
      .filter((l): l is NonNullable<typeof l> => Boolean(l))
      .map((l) => ({ personId: l.id, name: name(l) }));

    // Nach personId entdoppeln: derselbe Verpaechter kann ueber mehrere
    // Vertraege an demselben Flurstueck haengen.
    const verpaechterEindeutig = [
      ...new Map(verpaechter.map((v) => [v.personId, v])).values(),
    ];

    const transformedPlot = {
      ...plot,
      leases: plot.leasePlots.map((lp) => lp.lease),
      owners: plot.owners.map((o) => ({
        id: o.id,
        personId: o.personId,
        person: o.person,
        name: name(o.person),
        sharePercent: o.sharePercent.toNumber(),
        validFrom: o.validFrom?.toISOString() ?? null,
        validTo: o.validTo?.toISOString() ?? null,
        notes: o.notes,
        istAktuell: aktuelleEigentuemer.some((a) => a.personId === o.personId
          && a.validFrom?.getTime() === o.validFrom?.getTime()),
      })),
      farmers: plot.farmers.map((f) => ({
        id: f.id,
        personId: f.personId,
        person: f.person,
        name: name(f.person),
        validFrom: f.validFrom?.toISOString() ?? null,
        validTo: f.validTo?.toISOString() ?? null,
        notes: f.notes,
        istAktuell: aktuelleBewirtschafter.some((a) => a.personId === f.personId
          && a.validFrom?.getTime() === f.validFrom?.getTime()),
      })),
      /**
       * Hinweise, keine Fehler. Eigentum und Verpachtung sind zwei
       * verschiedene Tatsachen — sie duerfen auseinanderfallen (Niessbraucher,
       * Verkauf bei laufendem Vertrag). Weichen sie ab, gehoert das einem
       * Menschen vorgelegt und nicht still aufgeloest.
       */
      hinweise: {
        quoten: pruefeQuoten(
          plot.owners.map((o) => ({
            personId: o.personId,
            sharePercent: o.sharePercent.toNumber(),
            validFrom: o.validFrom,
            validTo: o.validTo,
          })),
          heute,
        ),
        abweichungen: findeAbweichungen(
          aktuelleEigentuemer.map((e) => ({ personId: e.personId, name: e.name })),
          verpaechterEindeutig,
        ),
      },
    };

    return NextResponse.json(transformedPlot);
  } catch (error) {
    logger.error({ err: error }, "Error fetching plot");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden des Flurstücks" });
  }
}

// PATCH /api/plots/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.PLOTS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Verify plot exists and belongs to tenant
    const existingPlot = await prisma.plot.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!existingPlot) {
      return apiError("NOT_FOUND", undefined, { message: "Flurstück nicht gefunden" });
    }

    const body = await request.json();
    const validatedData = plotUpdateSchema.parse(body);

    // Verify park belongs to tenant if changing parkId
    if (validatedData.parkId) {
      const park = await prisma.park.findFirst({
        where: {
          id: validatedData.parkId,
          tenantId: check.tenantId,
        },
      });

      if (!park) {
        return apiError("NOT_FOUND", undefined, { message: "Park nicht gefunden" });
      }
    }

    // Check for duplicate if changing cadastralDistrict, fieldNumber, or plotNumber
    if (validatedData.cadastralDistrict || validatedData.fieldNumber || validatedData.plotNumber) {
      const newCadastralDistrict = validatedData.cadastralDistrict ?? existingPlot.cadastralDistrict;
      const newFieldNumber = validatedData.fieldNumber ?? existingPlot.fieldNumber;
      const newPlotNumber = validatedData.plotNumber ?? existingPlot.plotNumber;

      const duplicate = await prisma.plot.findFirst({
        where: {
          tenantId: check.tenantId,
          cadastralDistrict: newCadastralDistrict,
          fieldNumber: newFieldNumber,
          plotNumber: newPlotNumber,
          id: { not: id },
        },
      });

      if (duplicate) {
        return apiError("ALREADY_EXISTS", undefined, { message: "Ein Flurstück mit dieser Kombination (Gemarkung, Flur, Flurstück) existiert bereits" });
      }
    }

    // Build update data, excluding undefined values
     

    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(validatedData)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    const plot = await prisma.plot.update({
      where: { id },
      data: updateData as Prisma.PlotUpdateInput,
      include: {
        park: {
          select: { id: true, name: true, shortName: true },
        },
        plotAreas: true,
      },
    });

    return NextResponse.json(plot);
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren des Flurstücks");
  }
}

// DELETE /api/plots/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.PLOTS_DELETE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Before delete, get the full data for audit log
    const plotToDelete = await prisma.plot.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      include: {
        _count: {
          select: {
            // BEWUSST OHNE Filter auf deletedAt. Nicht "vergessen" — ich hatte
            // hier schon einmal `where: { lease: { deletedAt: null } }` stehen
            // und musste es zuruecknehmen.
            //
            // Der Gedanke war: ein geloeschter Pachtvertrag darf das
            // Flurstueck nicht mehr sperren. Der Fehler daran ist LeasePlot.plot
            // mit onDelete: Cascade — das Hart-Loeschen des Flurstuecks
            // entfernt die Verknuepfungszeile MIT, und der weich geloeschte
            // Pachtvertrag verliert stillschweigend seine Flaechen.
            //
            // Weich geloescht heisst aufbewahrt (§ 147 AO), nicht weg. Was ein
            // aufbewahrter Beleg referenziert, muss aufloesbar bleiben, sonst
            // ist die Aufbewahrung wertlos. Die Sperre gehoert also hierhin —
            // nur ihre Meldung war falsch und sagt jetzt die Wahrheit.
            leasePlots: true,
          },
        },
      },
    });

    if (!plotToDelete) {
      return apiError("NOT_FOUND", undefined, { message: "Flurstück nicht gefunden" });
    }

    if (plotToDelete._count.leasePlots > 0) {
      return apiError("RETENTION_BLOCKED", undefined, {
        message:
          `Das Flurstück ist mit ${plotToDelete._count.leasePlots} Pachtvertrag/` +
          `Pachtverträgen verknüpft — gelöschte eingeschlossen. Gelöschte ` +
          `Pachtverträge werden aufbewahrt (§ 147 AO) und müssen ihre Flächen ` +
          `weiter benennen können. Das Flurstück lässt sich deshalb nicht ` +
          `entfernen; setzen Sie es stattdessen auf "inaktiv".`,
      });
    }

    // Perform the deletion
    await prisma.plot.delete({
      where: { id },
    });

    // Log the deletion (deferred: runs after response is sent)
    const plotSnapshot = plotToDelete as Record<string, unknown>;
    after(async () => {
      await logDeletion("Plot", id, plotSnapshot);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting plot");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen des Flurstücks" });
  }
}
