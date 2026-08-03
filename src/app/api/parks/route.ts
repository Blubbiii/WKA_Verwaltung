import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requirePermissionWithResources } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { parsePaginationParams, parseSortParams, handleApiError } from "@/lib/api-utils";
import { z } from "zod";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";
import { apiError } from "@/lib/api-errors";

const PARKS_SORT_FIELDS = [
  "name",
  "shortName",
  "city",
  "status",
  "createdAt",
  "updatedAt",
  "commissioningDate",
] as const;

const parkCreateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  shortName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  houseNumber: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().default("Deutschland"),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  commissioningDate: z.string().optional().nullable(),
  totalCapacityKw: z.number().optional().nullable(),
  operatorFundId: z.uuid().optional().nullable(),
  technischeBetriebsfuehrung: z.string().optional().nullable(),
  kaufmaennischeBetriebsfuehrung: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),

  // Billing configuration (Pacht-Konfiguration)
  minimumRentPerTurbine: z.number().optional().nullable(),
  weaSharePercentage: z.number().min(0).max(100).optional().nullable(),
  poolSharePercentage: z.number().min(0).max(100).optional().nullable(),
  wegCompensationPerSqm: z.number().optional().nullable(),
  ausgleichCompensationPerSqm: z.number().optional().nullable(),
  kabelCompensationPerM: z.number().optional().nullable(),

  // Energy settlement configuration (Stromabrechnung-Konfiguration)
  defaultDistributionMode: z.enum(["PROPORTIONAL", "SMOOTHED", "TOLERATED"]).optional(),
  defaultTolerancePercent: z.number().min(0).max(100).optional().nullable(),
  billingEntityFundId: z.uuid().optional().nullable(),

  // Lease settlement mode (Nutzungsentgelt-Abrechnungsmodus)
  leaseSettlementMode: z.enum(["NETWORK_COMPANY", "OPERATOR_DIRECT"]).optional(),
});

// GET /api/parks - Liste aller Parks
async function getHandler(request: NextRequest) {
  try {
    const check = await requirePermissionWithResources(PERMISSIONS.PARKS_READ, "Park");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const { sortBy, sortOrder } = parseSortParams(
      searchParams,
      [...PARKS_SORT_FIELDS],
      { defaultField: "name", defaultOrder: "asc" },
    );
    const { page, limit, skip } = parsePaginationParams(searchParams, {
      defaultLimit: 20,
            // 1000 statt der Vorgabe 100: die Oberflaeche laedt diese Liste vollstaendig
      // in Auswahlfelder und filtert clientseitig. Bei 100 fehlten Eintraege,
      // ohne dass es jemand bemerkt haette — die Suche daneben gibt vor,
      // den ganzen Bestand zu durchsuchen.
      maxLimit: 1000,
    });

    const where = {
      tenantId: check.tenantId!,
      // Resource-level filtering: only show parks the user has access to
      ...(check.resourceRestricted && check.allowedResourceIds?.length && {
        id: { in: check.allowedResourceIds },
      }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { shortName: { contains: search, mode: "insensitive" as const } },
          { city: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(status && { status: status as "ACTIVE" | "INACTIVE" | "ARCHIVED" }),
    };

    // Gesamtsummen ueber ALLE Parks des Filters, nicht ueber die geladene
    // Seite.
    //
    // Die Kennzahlen ueber der Liste summierten bisher im Client die geladenen
    // Zeilen. Bei zwanzig Zeilen je Seite stand dort "Windparks 20", waehrend
    // es 93 waren — die Zahl war exakt die Seitengroesse. Wer die Kennzahl
    // liest, glaubt seinen Bestand zu sehen; er sieht seine Seitengroesse.
    const [parks, total, gesamtAnlagen, gesamtLeistung, gesamtAktiv] = await Promise.all([
      prisma.park.findMany({
        where,
        include: {
          turbines: {
            select: { id: true, ratedPowerKw: true, status: true, deviceType: true },
          },
          _count: {
            select: {
              // Nur echte Anlagen zaehlen. Ohne den Filter erschien ein Park
              // mit zwei WEA und einem virtuellen Geraet als "3 Anlagen" —
              // dieselbe Verwechslung, die schon die Mindestpacht verdoppelt
              // hatte (lib/turbines/real-turbines.ts).
              turbines: { where: { deviceType: "WEA" } },
              documents: { where: { deletedAt: null } },
              contracts: { where: { deletedAt: null } },
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      prisma.park.count({ where }),
      // Nur echte Anlagen (WEA). Virtuelle Geraete sind Geraete, keine
      // Anlagen — siehe lib/turbines/real-turbines.ts.
      prisma.turbine.count({
        where: { park: where, deviceType: "WEA" },
      }),
      prisma.turbine.aggregate({
        where: { park: where, deviceType: "WEA", status: "ACTIVE" },
        _sum: { ratedPowerKw: true },
      }),
      prisma.park.count({ where: { ...where, status: "ACTIVE" } }),
    ]);

    // Berechne aggregierte Werte
    const parksWithStats = parks.map((park) => {
      // Auch hier nur Anlagen — die Leistungsangabe je Park darf kein
      // virtuelles Geraet mitrechnen.
      const anlagen = park.turbines.filter((t) => t.deviceType === "WEA");
      const activeTurbines = anlagen.filter((t) => t.status === "ACTIVE");
      const totalCapacity = activeTurbines.reduce(
        (sum, t) => sum + (Number(t.ratedPowerKw) || 0),
        0
      );

      return {
        ...park,
        turbines: undefined,
        stats: {
          turbineCount: park._count.turbines,
          activeTurbineCount: activeTurbines.length,
          totalCapacityKw: totalCapacity,
          documentCount: park._count.documents,
          contractCount: park._count.contracts,
        },
      };
    });

    return NextResponse.json({
      data: parksWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      /**
       * Summen ueber den gesamten Filter — die Grundlage der Kennzahlen ueber
       * der Liste. Sie duerfen NICHT aus `data` gerechnet werden: das ist eine
       * Seite, kein Bestand.
       */
      totals: {
        parks: total,
        activeParks: gesamtAktiv,
        turbines: gesamtAnlagen,
        capacityKw: Number(gesamtLeistung._sum.ratedPowerKw ?? 0),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching parks");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Parks" });
  }
}

export const GET = withMonitoring(getHandler);

// POST /api/parks - Park erstellen
async function postHandler(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.PARKS_CREATE);
    if (!check.authorized) return check.error;

    const body = await request.json();
    const validatedData = parkCreateSchema.parse(body);

    // FIX: cross-tenant Fund-IDs verhindern — verweisende Fund-IDs müssen zum
    // gleichen Mandanten gehören, sonst könnte ein Angreifer beliebige Fund-UUIDs
    // referenzieren.
    const fundIdsToVerify: Array<[string, string | null | undefined]> = [
      ["operatorFundId", validatedData.operatorFundId],
      ["billingEntityFundId", validatedData.billingEntityFundId],
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

    // Create park and virtual infrastructure turbines atomically
    const park = await prisma.$transaction(async (tx) => {
      const newPark = await tx.park.create({
        data: {
          ...validatedData,
          commissioningDate: validatedData.commissioningDate
            ? new Date(validatedData.commissioningDate)
            : null,
          tenantId: check.tenantId!,
        },
      });

      // Auto-create virtual infrastructure turbines (NVP + Parkrechner)
      await tx.turbine.createMany({
        data: [
          {
            designation: "Netzverknuepfungspunkt",
            deviceType: "NVP",
            parkId: newPark.id,
            status: "ACTIVE",
          },
          {
            designation: "Parkrechner",
            deviceType: "PARKRECHNER",
            parkId: newPark.id,
            status: "ACTIVE",
          },
        ],
      });

      return newPark;
    });

    // Invalidate dashboard caches after park creation
    invalidate.onParkChange(check.tenantId!, park.id, 'create').catch((err) => {
      logger.warn({ err }, '[Parks] Cache invalidation error after create');
    });

    return NextResponse.json(park, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Erstellen des Parks");
  }
}

export const POST = withMonitoring(postHandler);
