import { NextRequest, NextResponse, after } from "next/server";
import { lizenzPruefen } from "@/lib/lizenz/lizenz-db";
import { zaehlerFuerFirma } from "@/lib/lizenz/lizenz";
import { requirePermission, requirePermissionWithResources } from "@/lib/auth/withPermission";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getConfigBoolean } from "@/lib/config";
import { mandantDb } from "@/lib/mandant/mandant-db";
import { Prisma } from "@prisma/client";
import { parsePaginationParams, handleApiError } from "@/lib/api-utils";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";
import { createAuditLog } from "@/lib/audit";
import { apiError } from "@/lib/api-errors";
import { getAllowedFundIds } from "@/lib/auth/fund-access";
import { erlaubteIds } from "@/lib/auth/erlaubte-ids";

const fundCreateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  legalForm: z.string().optional().nullable(),
  fundCategoryId: z.uuid().optional().nullable(),
  registrationNumber: z.string().optional().nullable(),
  registrationCourt: z.string().optional().nullable(),
  foundingDate: z.string().optional().nullable(),
  fiscalYearEnd: z.string().default("12-31"),
  // FIX 13: Union{number,string} → Prisma.Decimal an der Prisma-Grenze.
  totalCapital: z
    .union([z.number(), z.string()])
    .transform((v) => new Prisma.Decimal(typeof v === "number" ? v : v))
    .optional()
    .nullable(),
  managingDirector: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  houseNumber: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  bankDetails: z.object({
    iban: z.string().optional(),
    bic: z.string().optional(),
    bankName: z.string().optional(),
  }).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  /** Actively managed (counts towards the licence) or only a stake held. */
  verwaltung: z.enum(["AKTIV", "BETEILIGUNG"]).default("AKTIV"),
});

// GET /api/funds - Liste aller Gesellschaften
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermissionWithResources(PERMISSIONS.FUNDS_READ, "Fund");
    if (!check.authorized) return check.error;
    const db = mandantDb(check.tenantId!);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const { page, limit, skip } = parsePaginationParams(searchParams, {
      defaultLimit: 20,
            // 1000 statt der Vorgabe 100: die Oberflaeche laedt diese Liste vollstaendig
      // in Auswahlfelder und filtert clientseitig. Bei 100 fehlten Eintraege,
      // ohne dass es jemand bemerkt haette — die Suche daneben gibt vor,
      // den ganzen Bestand zu durchsuchen.
      maxLimit: 1000,
    });

    // Sprint 3 ABAC: User-spezifischer Fund-Whitelist (FundAccess).
    // Intersect mit Role-based resourceRestricted (UserRoleAssignment).
    const abacAllowed = check.userId
      ? await getAllowedFundIds(check.userId, check.tenantId ?? undefined)
      : null;
    const combinedAllowed = erlaubteIds(
      abacAllowed,
      check.resourceRestricted ? (check.allowedResourceIds ?? null) : null,
    );

    const where = {
      tenantId: check.tenantId!,
      ...(combinedAllowed && { id: { in: combinedAllowed } }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { legalForm: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(status && { status: status as "ACTIVE" | "INACTIVE" | "ARCHIVED" }),
    };

    // Latest note per company comes from the CRM (decision E2) — only for
    // users who may read CRM entries and with the CRM module switched on.
    const notizenSichtbar =
      (await getConfigBoolean("crm.enabled", check.tenantId, false)) &&
      (await hasPermission(check.userId!, "crm:read", check.tenantId!));

    const [funds, total, gesamtGesellschafter, gesamtKapital] = await Promise.all([
      db.fund.findMany({
        where,
        include: {
          fundCategory: {
            select: { id: true, name: true, code: true, color: true },
          },
          shareholders: {
            where: { status: "ACTIVE" },
            select: {
              id: true,
              capitalContribution: true,
              ownershipPercentage: true,
            },
          },
          fundParks: {
            include: {
              park: {
                select: { id: true, name: true, shortName: true },
              },
            },
          },
          crmActivities: notizenSichtbar
            ? {
                where: { type: "NOTE" },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { id: true, title: true, description: true, createdAt: true },
              }
            : false,
          _count: {
            select: {
              shareholders: true,
              votes: true,
              documents: { where: { deletedAt: null } },
            },
          },
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      db.fund.count({ where }),
      // Gesamtsummen ueber ALLE Gesellschaften des Filters, nicht ueber die
      // geladene Seite — siehe api/parks/route.ts, dort stand derselbe Fehler.
      db.shareholder.count({
        where: { fund: where, status: "ACTIVE" },
      }),
      db.shareholder.aggregate({
        where: { fund: where, status: "ACTIVE" },
        _sum: { capitalContribution: true },
      }),
    ]);

    // Berechne aggregierte Werte
    const fundsWithStats = funds.map((fund) => {
      const totalContributions = fund.shareholders.reduce(
        (sum, s) => sum + (Number(s.capitalContribution) || 0),
        0
      );

      const notizen = (fund as { crmActivities?: Array<{ id: string; title: string; description: string | null; createdAt: Date }> }).crmActivities;
      return {
        ...fund,
        shareholders: undefined,
        crmActivities: undefined,
        letzteNotiz: notizen?.[0] ?? null,
        notizenSichtbar,
        stats: {
          shareholderCount: fund._count.shareholders,
          activeShareholderCount: fund.shareholders.length,
          totalContributions,
          voteCount: fund._count.votes,
          documentCount: fund._count.documents,
          parkCount: fund.fundParks.length,
        },
      };
    });

    return NextResponse.json({
      data: fundsWithStats,
      /**
       * Summen ueber den gesamten Filter — Grundlage der Kennzahlen ueber der
       * Liste. Duerfen NICHT aus `data` gerechnet werden: das ist eine Seite,
       * kein Bestand.
       */
      totals: {
        funds: total,
        shareholders: gesamtGesellschafter,
        capital: Number(gesamtKapital._sum.capitalContribution ?? 0),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching funds");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Gesellschaften" });
  }
}

// POST /api/funds - Gesellschaft erstellen
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.FUNDS_CREATE);
    if (!check.authorized) return check.error;
    const db = mandantDb(check.tenantId!);

    const body = await request.json();
    const validatedData = fundCreateSchema.parse(body);

    // FIX 12 (SECURITY): fundCategoryId muss zum eigenen Tenant gehören —
    // sonst kann ein Nutzer einen Fund unter fremder Kategorie einreihen.
    let kategorieCode: string | null = null;
    if (validatedData.fundCategoryId) {
      const cat = await db.fundCategory.findFirst({
        where: {
          id: validatedData.fundCategoryId,
          tenantId: check.tenantId!,
        },
        select: { id: true, code: true },
      });
      if (!cat) {
        return apiError("VALIDATION_FAILED", 400, {
          message: "Fund-Category gehört nicht zu diesem Mandanten",
        });
      }
      kategorieCode = cat.code;
    }

    // Licence: an actively managed company counts as company or substation.
    const zaehler = zaehlerFuerFirma({
      verwaltung: validatedData.verwaltung,
      status: validatedData.status,
      kategorieCode,
    });
    if (zaehler) {
      const lizenz = await lizenzPruefen(check.tenantId!, zaehler);
      if (lizenz) return lizenz;
    }

    const fund = await db.fund.create({
      data: {
        ...validatedData,
        foundingDate: validatedData.foundingDate
          ? new Date(validatedData.foundingDate)
          : null,
        bankDetails: validatedData.bankDetails || {},
        tenantId: check.tenantId!,
      },
    });

    // Invalidate dashboard caches after fund creation
    invalidate.onFundChange(check.tenantId!, fund.id, 'create').catch((err) => {
      logger.warn({ err }, '[Funds] Cache invalidation error after create');
    });

    // FIX 11: Audit-Log für Fund-Create (Compliance).
    after(async () => {
      await createAuditLog({
        action: "CREATE",
        entityType: "Fund",
        entityId: fund.id,
        newValues: {
          name: fund.name,
          legalForm: fund.legalForm,
          fundCategoryId: fund.fundCategoryId,
          totalCapital: fund.totalCapital ? Number(fund.totalCapital) : null,
        },
      });
    });

    return NextResponse.json(fund, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Erstellen der Gesellschaft");
  }
}
