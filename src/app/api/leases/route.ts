import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const leaseCreateSchema = z.object({
  plotIds: z.array(z.string().uuid("Ungültige Flurstück-ID")).min(1, "Mindestens ein Flurstück erforderlich"),
  lessorId: z.string().uuid("Ungültige Verpächter-ID"),
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
  // Nutzungsarten
  usageTypes: z.array(z.string()).default([]),
  usageTypesWithSize: z.array(z.object({
    id: z.string(),
    sizeSqm: z.string(),
  })).optional(),
  // Abrechnungsintervall
  billingInterval: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "CUSTOM_CRON"]).default("ANNUAL"),
  linkedTurbineId: z.string().uuid().optional().nullable(),
  // Vertragspartner (Paechter-Gesellschaft)
  contractPartnerFundId: z.string().uuid().nullable().optional(),
  // Anhänge & Notizen
  contractDocumentUrl: z.string().url().optional(),
  notes: z.string().optional(),
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
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Build where clause - now using tenantId directly on lease
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const where: any = {
      tenantId: check.tenantId,
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
        skip: (page - 1) * limit,
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
    return NextResponse.json(
      { error: "Fehler beim Laden der Pachtverträge" },
      { status: 500 }
    );
  }
}

// POST /api/leases
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_CREATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = leaseCreateSchema.parse(body);

    // Prüfe ob alle Plots zum Tenant gehören
    const plots = await prisma.plot.findMany({
      where: {
        id: { in: validatedData.plotIds },
        tenantId: check.tenantId,
      },
    });

    if (plots.length !== validatedData.plotIds.length) {
      return NextResponse.json(
        { error: "Ein oder mehrere Flurstücke nicht gefunden" },
        { status: 404 }
      );
    }

    // Prüfe ob Lessor zum Tenant gehört
    const lessor = await prisma.person.findFirst({
      where: {
        id: validatedData.lessorId,
        tenantId: check.tenantId,
      },
    });

    if (!lessor) {
      return NextResponse.json({ error: "Verpächter nicht gefunden" }, { status: 404 });
    }

    // Create lease with plots in a transaction
    const lease = await prisma.$transaction(async (tx) => {
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
          usageTypes: validatedData.usageTypes,
          usageTypesWithSize: validatedData.usageTypesWithSize,
          billingInterval: validatedData.billingInterval,
          linkedTurbineId: validatedData.linkedTurbineId || null,
          contractDocumentUrl: validatedData.contractDocumentUrl,
          notes: validatedData.notes,
          lessorId: validatedData.lessorId,
          contractPartnerFundId: validatedData.contractPartnerFundId || null,
        },
      });

      // Create LeasePlot entries
      await tx.leasePlot.createMany({
        data: validatedData.plotIds.map((plotId) => ({
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating lease");
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Pachtvertrags" },
      { status: 500 }
    );
  }
}
