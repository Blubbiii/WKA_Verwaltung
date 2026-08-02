import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { handleApiError, parsePaginationParams } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

/**
 * Bedienaufwand #21 (Audit 2026-07): Der Pacht-Assistent legte Verpaechter,
 * Flurstuecke und Vertrag in DREI aufeinanderfolgenden Requests an. Schlug der
 * letzte fehl, existierten Person und Flurstuecke bereits — die Fehlermeldung
 * sagte das nicht, und wer erneut speicherte, legte die Person ein zweites Mal
 * an. Stammdaten-Dubletten tauchen spaeter in Abrechnungen wieder auf.
 *
 * Deshalb nimmt diese Route die neu anzulegenden Stammdaten optional gleich
 * mit entgegen und schreibt alles in EINER Transaktion. Faellt irgendetwas um,
 * faellt alles um — nichts bleibt halb angelegt zurueck.
 */
const newLessorSchema = z.object({
  personType: z.enum(["natural", "legal"]),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  companyName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  street: z.string().optional(),
  houseNumber: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  bankIban: z.string().optional(),
  bankBic: z.string().optional(),
  bankName: z.string().optional(),
});

const newPlotSchema = z.object({
  cadastralDistrict: z.string().min(1, "Gemarkung ist erforderlich"),
  fieldNumber: z.string().default("0"),
  plotNumber: z.string().min(1, "Flurstücknummer ist erforderlich"),
  areaSqm: z.number().optional(),
  county: z.string().optional(),
  municipality: z.string().optional(),
  parkId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const leaseCreateSchema = z.object({
  // Bestehende Flurstuecke bzw. Verpaechter. Mindestens eine der beiden
  // Quellen muss etwas liefern — geprueft im superRefine unten.
  plotIds: z.array(z.string().uuid("Ungültige Flurstück-ID")).default([]),
  lessorId: z.string().uuid("Ungültige Verpächter-ID").optional(),
  newLessor: newLessorSchema.optional(),
  newPlots: z.array(newPlotSchema).default([]),
  signedDate: z.string().optional(), // Vertragsabschluss (Unterschrift)
  startDate: z.string(), // Vertragsbeginn (Baubeginn)
  endDate: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "EXPIRING", "EXPIRED", "TERMINATED"]).default("ACTIVE"),
  // Verlängerungsoption
  hasExtensionOption: z.boolean().default(false),
  extensionDetails: z.string().optional(),
  // Wartegeld
  hasWaitingMoney: z.boolean().default(false),
  waitingMoneyAmount: z.number().optional(),
  waitingMoneyUnit: z.enum(["pauschal", "ha"]).optional(),
  waitingMoneySchedule: z.enum(["monthly", "yearly", "once"]).optional(),
  // Abrechnungsintervall
  billingInterval: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "CUSTOM_CRON"]).default("ANNUAL"),
  linkedTurbineId: z.uuid().optional().nullable(),
  // Vertragspartner (Paechter-Gesellschaft)
  contractPartnerFundId: z.uuid().nullable().optional(),
  // Anhänge & Notizen
  contractDocumentUrl: z.url().optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.lessorId && !data.newLessor) {
    ctx.addIssue({
      code: "custom",
      path: ["lessorId"],
      message: "Verpächter erforderlich: entweder lessorId oder newLessor",
    });
  }
  if (data.lessorId && data.newLessor) {
    // Beides gleichzeitig ist keine sinnvolle Absicht — und stillschweigend
    // eines zu bevorzugen wuerde den Fehler verstecken.
    ctx.addIssue({
      code: "custom",
      path: ["lessorId"],
      message: "Entweder lessorId ODER newLessor angeben, nicht beides",
    });
  }
  if (data.plotIds.length === 0 && data.newPlots.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["plotIds"],
      message: "Mindestens ein Flurstück erforderlich",
    });
  }
});

// GET /api/leases
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const plotId = searchParams.get("plotId");
    const parkId = searchParams.get("parkId");
    const status = searchParams.get("status");
    // Bedienaufwand #2 (Audit 2026-07): Diese Route kannte keine Suche. Die
    // Liste holte bis zu 200 Zeilen an, bekam hoechstens 100 und durchsuchte
    // nur diesen Ausschnitt — der 101. Pachtvertrag war nicht auffindbar.
    const search = (searchParams.get("search") || "").trim();
    const { page, limit, skip } = parsePaginationParams(searchParams, { defaultLimit: 50,
      // 1000 statt der Vorgabe 100: die Oberflaeche laedt diese Liste vollstaendig
      // in Auswahlfelder und filtert clientseitig. Bei 100 fehlten Eintraege,
      // ohne dass es jemand bemerkt haette — die Suche daneben gibt vor,
      // den ganzen Bestand zu durchsuchen.
      maxLimit: 1000,
    });

    // Build where clause - now using tenantId directly on lease
    // F4-Compliance: soft-deleted Pachtverträge nicht listen (Aufbewahrungspflicht §147 AO
    // greift via deletedAt-Filter — Datensätze bleiben in der DB).
    const where: Prisma.LeaseWhereInput = {
      tenantId: check.tenantId,
      deletedAt: null,
      ...(status && { status: status as "DRAFT" | "ACTIVE" | "EXPIRING" | "EXPIRED" | "TERMINATED" }),
      ...(plotId && {
        leasePlots: {
          some: { plotId },
        },
      }),
      ...(parkId && {
        leasePlots: {
          some: {
            plot: { parkId },
          },
        },
      }),
      // Dieselben Angaben, die die Liste bisher clientseitig durchsucht hat:
      // Verpaechter, Flurstueck, Park.
      //
      // NICHT dabei: `contractNumber`. Die Liste durchsucht dieses Feld, aber
      // `Lease` HAT KEINE Spalte dieses Namens (siehe schema.prisma) — es wird
      // nirgends geschrieben und kommt aus keiner Route zurueck. Die Spalte
      // "Vertragsnummer" in der Tabelle zeigt deshalb immer "-". Hier
      // nachzubauen, was es nicht gibt, wuerde Prisma zur Laufzeit werfen
      // lassen; die Suche darauf konnte ohnehin nie etwas finden.
      //
      // Die Liste suchte im ZUSAMMENGESETZTEN Flurstueck-Label ("Gemarkung,
      // Flur 3, Flurstueck 12/4"), also auch in den uebersetzten Woertern
      // "Flur" und "Flurstueck". Hier stehen die Rohfelder — was jemand
      // tatsaechlich eintippt, ist eine Gemarkung oder eine Nummer, nicht das
      // Wort "Flur".
      ...(search
        ? {
            OR: [
              {
                lessor: {
                  OR: [
                    { companyName: { contains: search, mode: "insensitive" as const } },
                    { firstName: { contains: search, mode: "insensitive" as const } },
                    { lastName: { contains: search, mode: "insensitive" as const } },
                  ],
                },
              },
              {
                leasePlots: {
                  some: {
                    plot: {
                      OR: [
                        { cadastralDistrict: { contains: search, mode: "insensitive" as const } },
                        { plotNumber: { contains: search, mode: "insensitive" as const } },
                        { fieldNumber: { contains: search, mode: "insensitive" as const } },
                        { park: { name: { contains: search, mode: "insensitive" as const } } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [leases, total] = await Promise.all([
      prisma.lease.findMany({
        where,
        include: {
          leasePlots: {
            include: {
              plot: {
                select: {
                  id: true,
                  county: true,
                  municipality: true,
                  cadastralDistrict: true,
                  fieldNumber: true,
                  plotNumber: true,
                  areaSqm: true,
                  park: {
                    select: { id: true, name: true, shortName: true },
                  },
                },
              },
            },
          },
          lessor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              companyName: true,
              personType: true,
            },
          },
          contractPartnerFund: {
            select: {
              id: true,
              name: true,
              legalForm: true,
            },
          },
        },
        orderBy: { endDate: "asc" },
        skip,
        take: limit,
      }),
      prisma.lease.count({ where }),
    ]);

    // Transform to include plots array for easier frontend consumption
    const transformedLeases = leases.map((lease) => ({
      ...lease,
      plots: lease.leasePlots.map((lp) => lp.plot),
    }));

    return NextResponse.json({
      data: transformedLeases,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching leases");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Pachtverträge" });
  }
}

// POST /api/leases
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_CREATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = leaseCreateSchema.parse(body);

    // Neue Flurstuecke anzulegen ist ein eigenes Recht. Ohne diese Pruefung
    // koennte jemand mit leases:create ueber den Umweg dieser Route Flurstuecke
    // erzeugen, obwohl ihm plots:create fehlt — die Plot-Route prueft es.
    if (validatedData.newPlots.length > 0) {
      const plotCheck = await requirePermission(PERMISSIONS.PLOTS_CREATE);
      if (!plotCheck.authorized) return plotCheck.error!;
    }

    // Prüfe ob alle Plots zum Tenant gehören
    const plots = await prisma.plot.findMany({
      where: {
        id: { in: validatedData.plotIds },
        tenantId: check.tenantId,
      },
    });

    if (plots.length !== validatedData.plotIds.length) {
      return apiError("NOT_FOUND", undefined, { message: "Ein oder mehrere Flurstücke nicht gefunden" });
    }

    // Prüfe ob Lessor zum Tenant gehört — nur wenn ein bestehender referenziert
    // wird. Ein neu anzulegender existiert naturgemaess noch nicht.
    if (validatedData.lessorId) {
      const lessor = await prisma.person.findFirst({
        where: {
          id: validatedData.lessorId,
          tenantId: check.tenantId,
        },
      });

      if (!lessor) {
        return apiError("NOT_FOUND", undefined, { message: "Verpächter nicht gefunden" });
      }
    }

    // Park-Zugehoerigkeit der neuen Flurstuecke pruefen, bevor die Transaktion
    // startet — dieselbe Pruefung macht die Plot-Route.
    const newPlotParkIds = [...new Set(validatedData.newPlots.map((p) => p.parkId).filter(Boolean))] as string[];
    if (newPlotParkIds.length > 0) {
      const parks = await prisma.park.findMany({
        where: { id: { in: newPlotParkIds }, tenantId: check.tenantId },
        select: { id: true },
      });
      if (parks.length !== newPlotParkIds.length) {
        return apiError("NOT_FOUND", undefined, { message: "Park nicht gefunden" });
      }
    }

    // Alles in EINER Transaktion: Verpaechter, Flurstuecke, Vertrag. Faellt
    // etwas um, faellt alles um — genau das fehlte in #21.
    const lease = await prisma.$transaction(async (tx) => {
      let lessorId = validatedData.lessorId;

      if (validatedData.newLessor) {
        const created = await tx.person.create({
          data: {
            ...validatedData.newLessor,
            tenantId: check.tenantId!,
          },
          select: { id: true },
        });
        lessorId = created.id;
      }

      const plotIds = [...validatedData.plotIds];

      for (const newPlot of validatedData.newPlots) {
        const fieldNumber = newPlot.fieldNumber || "0";

        // Vorhandenes Flurstueck wiederverwenden statt am Unique-Index
        // aufzulaufen. Gemarkung + Flur + Flurstuecknummer identifizieren es
        // eindeutig; wer dieselbe Kombination noch einmal eintippt, meint
        // dasselbe Grundstueck und nicht ein zweites daneben.
        const existing = await tx.plot.findFirst({
          where: {
            tenantId: check.tenantId!,
            cadastralDistrict: newPlot.cadastralDistrict,
            fieldNumber,
            plotNumber: newPlot.plotNumber,
          },
          select: { id: true },
        });

        if (existing) {
          plotIds.push(existing.id);
          continue;
        }

        const createdPlot = await tx.plot.create({
          data: { ...newPlot, fieldNumber, tenantId: check.tenantId! },
          select: { id: true },
        });
        plotIds.push(createdPlot.id);
      }

      // Dasselbe Flurstueck zweimal zu verknuepfen bricht am Unique-Index von
      // LeasePlot — bei Auswahl UND Neuanlage derselben Parzelle erreichbar.
      const uniquePlotIds = [...new Set(plotIds)];

      // Create the lease
      const newLease = await tx.lease.create({
        data: {
          tenantId: check.tenantId!,
          signedDate: validatedData.signedDate ? new Date(validatedData.signedDate) : null,
          startDate: new Date(validatedData.startDate),
          endDate: validatedData.endDate ? new Date(validatedData.endDate) : null,
          status: validatedData.status,
          hasExtensionOption: validatedData.hasExtensionOption,
          extensionDetails: validatedData.extensionDetails,
          hasWaitingMoney: validatedData.hasWaitingMoney,
          waitingMoneyAmount: validatedData.waitingMoneyAmount,
          waitingMoneyUnit: validatedData.waitingMoneyUnit,
          waitingMoneySchedule: validatedData.waitingMoneySchedule,
          billingInterval: validatedData.billingInterval,
          linkedTurbineId: validatedData.linkedTurbineId || null,
          contractDocumentUrl: validatedData.contractDocumentUrl,
          notes: validatedData.notes,
          lessorId: lessorId!,
          contractPartnerFundId: validatedData.contractPartnerFundId || null,
        },
      });

      // Create LeasePlot entries
      await tx.leasePlot.createMany({
        data: uniquePlotIds.map((plotId) => ({
          leaseId: newLease.id,
          plotId,
        })),
      });

      // Return with relations
      return tx.lease.findUnique({
        where: { id: newLease.id },
        include: {
          leasePlots: {
            include: {
              plot: true,
            },
          },
          lessor: true,
        },
      });
    });

    return NextResponse.json(lease, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Erstellen des Pachtvertrags");
  }
}
