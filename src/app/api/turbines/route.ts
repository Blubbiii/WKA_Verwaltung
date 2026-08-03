import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { parsePaginationParams } from "@/lib/api-utils";
import { enumParam } from "@/lib/validation/query-params";

const TURBINE_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;

const turbineCreateSchema = z.object({
  parkId: z.string().uuid("Ungültige Park-ID"),
  designation: z.string().min(1, "Bezeichnung ist erforderlich"),
  serialNumber: z.string().optional().nullable(),
  mastrNumber: z.string().optional().nullable(),
  // A5: Standortgemeinde. Nicht ueber den Park ableitbar — ein Park
  // liegt regelmaessig in mehreren Gemeinden, und genau deshalb wird der
  // Gewerbesteuermessbetrag nach § 29 GewStG zerlegt.
  municipalityId: z.string().uuid().optional().nullable(),
  netzgesellschaftFundId: z.uuid().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  ratedPowerKw: z.number().optional().nullable(),
  hubHeightM: z.number().optional().nullable(),
  rotorDiameterM: z.number().optional().nullable(),
  commissioningDate: z.string().optional().nullable(),
  warrantyEndDate: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  // Freier Schlüssel-Wert-Speicher für "Sonstiges" (Gutachten-Nr., Zusatz-Notizen etc.).
  // Bewusst nur Primitive: Nested-Objects würden UI-Rendering unklar machen.
  technicalData: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
  technischeBetriebsfuehrung: z.string().optional().nullable(),
  kaufmaennischeBetriebsfuehrung: z.string().optional().nullable(),
  operatorFundId: z.uuid().optional().nullable(),

  // Notes
  notes: z.string().optional().nullable(),

  // Per-turbine lease overrides
  minimumRent: z.number().optional().nullable(),
  weaSharePercentage: z.number().min(0).max(100).optional().nullable(),
  poolSharePercentage: z.number().min(0).max(100).optional().nullable(),
});

// GET /api/turbines - Liste aller Anlagen
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_READ);
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const search = searchParams.get("search") || "";
    const status = enumParam(searchParams.get("status"), TURBINE_STATUSES);
    /**
     * Gerätetyp-Filter — standardmässig AUS.
     *
     * Diese Liste liefert bewusst alle Geräte: die SCADA-Zuordnung braucht
     * auch die virtuellen (siehe lib/regulatory/virtual-devices.test.ts, das
     * genau diese Route als "darf nicht filtern" führt).
     *
     * Wer aber ANLAGEN ZÄHLT, meint echte Anlagen. Die Energie-Übersicht las
     * hier `pagination.total` und zeigte "237 Aktive Turbinen", während
     * Dashboard und Parkliste 51 sagten — dieselbe Frage, drei Antworten.
     * Statt die Route zu ändern (was die SCADA-Zuordnung bräche), bekommt
     * sie einen Filter, den der Zähler setzt.
     */
    const deviceType = searchParams.get("deviceType");
    const { page, limit, skip } = parsePaginationParams(searchParams, { defaultLimit: 50,
      // 1000 statt der Vorgabe 100: die Oberflaeche laedt diese Liste vollstaendig
      // in Auswahlfelder und filtert clientseitig. Bei 100 fehlten Eintraege,
      // ohne dass es jemand bemerkt haette — die Suche daneben gibt vor,
      // den ganzen Bestand zu durchsuchen.
      maxLimit: 1000,
    });

    const where = {
      park: {
        tenantId: check.tenantId!,
      },
      ...(parkId && { parkId }),
      ...(deviceType && { deviceType }),
      ...(search && {
        OR: [
          { designation: { contains: search, mode: "insensitive" as const } },
          { manufacturer: { contains: search, mode: "insensitive" as const } },
          { model: { contains: search, mode: "insensitive" as const } },
          { serialNumber: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(status && { status }),
    };

    const [turbines, total] = await Promise.all([
      prisma.turbine.findMany({
        where,
        include: {
          park: {
            select: { id: true, name: true, shortName: true },
          },
          netzgesellschaftFund: {
            select: {
              id: true,
              name: true,
              legalForm: true,
              fundCategory: { select: { id: true, name: true, code: true, color: true } },
            },
          },
          _count: {
            select: { serviceEvents: true, documents: { where: { deletedAt: null } } },
          },
        },
        orderBy: [{ park: { name: "asc" } }, { designation: "asc" }],
        skip,
        take: limit,
      }),
      prisma.turbine.count({ where }),
    ]);

    return NextResponse.json({
      data: turbines,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching turbines");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Anlagen" });
  }
}

// POST /api/turbines - Anlage erstellen
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_CREATE);
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = turbineCreateSchema.parse(body);

    // Extract operatorFundId before passing to prisma (not a Turbine field)
    const { operatorFundId, ...turbineData } = validatedData;

    // Prüfe ob Park zum Tenant gehört
    const park = await prisma.park.findFirst({
      where: {
        id: turbineData.parkId,
        tenantId: check.tenantId!,
      },
    });

    if (!park) {
      return apiError("NOT_FOUND", 404, { message: "Park nicht gefunden" });
    }

    // FIX: cross-tenant Fund-IDs verhindern — netzgesellschaftFundId und operatorFundId
    // müssen zum gleichen Mandanten wie der Park gehören.
    const fundIdsToVerify: Array<[string, string | null | undefined]> = [
      ["netzgesellschaftFundId", turbineData.netzgesellschaftFundId],
      ["operatorFundId", operatorFundId],
    ];
    for (const [field, fundId] of fundIdsToVerify) {
      if (!fundId) continue;
      const fund = await prisma.fund.findFirst({
        where: { id: fundId, tenantId: check.tenantId! },
        select: { id: true },
      });
      if (!fund) {
        return apiError("VALIDATION_FAILED", 400, {
          message: `${field}: Fund nicht im Mandanten gefunden`,
        });
      }
    }

    const commissioningDate = turbineData.commissioningDate
      ? new Date(turbineData.commissioningDate)
      : null;

    // FIX: Turbine + TurbineOperator atomar per Transaction erstellen — vorher
    // konnte die Turbine ohne Operator-Record existieren, wenn der zweite
    // create fehlschlug.
    const turbine = await prisma.$transaction(async (tx) => {
      const created = await tx.turbine.create({
        data: {
          ...turbineData,
          commissioningDate,
          warrantyEndDate: turbineData.warrantyEndDate
            ? new Date(turbineData.warrantyEndDate)
            : null,
          technicalData: turbineData.technicalData || {},
        },
      });

      if (operatorFundId) {
        await tx.turbineOperator.create({
          data: {
            turbineId: created.id,
            operatorFundId,
            validFrom: commissioningDate || new Date(),
            status: "ACTIVE",
            ownershipPercentage: 100.00,
          },
        });
      }

      return created;
    });

    return NextResponse.json(turbine, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_FAILED", 400, { message: "Validierungsfehler", details: error.issues });
    }
    logger.error({ err: error }, "Error creating turbine");
    return apiError("CREATE_FAILED", 500, { message: "Fehler beim Erstellen der Anlage" });
  }
}
