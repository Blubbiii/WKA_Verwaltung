import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS, getUserHighestHierarchy, ROLE_HIERARCHY } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logDeletion } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";

const fundUpdateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").optional(),
  legalForm: z.string().optional().nullable(),
  fundCategoryId: z.string().uuid().optional().nullable(),
  registrationNumber: z.string().optional().nullable(),
  registrationCourt: z.string().optional().nullable(),
  foundingDate: z.string().optional().nullable(),
  fiscalYearEnd: z.string().optional(),
  totalCapital: z.number().optional().nullable(),
  managingDirector: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  houseNumber: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  bankDetails: z.object({
    iban: z.string().optional(),
    bic: z.string().optional(),
    bankName: z.string().optional(),
  }).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

// GET /api/funds/[id] - Einzelne Gesellschaft laden
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.FUNDS_READ);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const fund = await prisma.fund.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      include: {
        fundCategory: {
          select: { id: true, name: true, code: true, color: true },
        },
        shareholders: {
          include: {
            person: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                companyName: true,
                personType: true,
                email: true,
                phone: true,
              },
            },
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
          orderBy: [
            { status: "asc" },
            { ownershipPercentage: "desc" },
          ],
        },
        fundParks: {
          include: {
            park: {
              select: {
                id: true,
                name: true,
                shortName: true,
                status: true,
                _count: { select: { turbines: true } },
              },
            },
          },
        },
        // Fund hierarchy: relations are named counterintuitively in Prisma:
        // parentHierarchies = entries where THIS fund is the CHILD (childFundId = fund.id)
        // childHierarchies = entries where THIS fund is the PARENT (parentFundId = fund.id)
        parentHierarchies: {
          where: { validTo: null },
          include: {
            parentFund: {
              select: {
                id: true,
                name: true,
                legalForm: true,
                fundCategory: { select: { id: true, name: true, code: true, color: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        childHierarchies: {
          where: { validTo: null },
          include: {
            childFund: {
              select: {
                id: true,
                name: true,
                legalForm: true,
                fundCategory: { select: { id: true, name: true, code: true, color: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        // Operated turbines via TurbineOperator
        operatedTurbines: {
          where: { status: "ACTIVE" },
          include: {
            turbine: {
              select: {
                id: true,
                designation: true,
                manufacturer: true,
                model: true,
                ratedPowerKw: true,
                status: true,
                park: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { validFrom: "desc" },
        },
        votes: {
          where: { status: { not: "DRAFT" } },
          orderBy: { startDate: "desc" },
          take: 5,
        },
        documents: {
          where: { isArchived: false },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        _count: {
          select: {
            shareholders: true,
            votes: true,
            documents: true,
            invoices: true,
          },
        },
      },
    });

    if (!fund) {
      return NextResponse.json(
        { error: "Gesellschaft nicht gefunden" },
        { status: 404 }
      );
    }

    // Berechne Statistiken
    const activeShareholders = fund.shareholders.filter(
      (s) => s.status === "ACTIVE"
    );
    const totalContributions = activeShareholders.reduce(
      (sum, s) => sum + (Number(s.capitalContribution) || 0),
      0
    );
    const totalOwnership = activeShareholders.reduce(
      (sum, s) => sum + (Number(s.ownershipPercentage) || 0),
      0
    );

    const stats = {
      shareholderCount: fund._count.shareholders,
      activeShareholderCount: activeShareholders.length,
      totalContributions,
      totalOwnership,
      voteCount: fund._count.votes,
      documentCount: fund._count.documents,
      invoiceCount: fund._count.invoices,
      parkCount: fund.fundParks.length,
      hierarchyCount: fund.parentHierarchies.length + fund.childHierarchies.length,
      operatedTurbineCount: fund.operatedTurbines.length,
    };

    return NextResponse.json({ ...fund, stats });
  } catch (error) {
    logger.error({ err: error }, "Error fetching fund");
    return NextResponse.json(
      { error: "Fehler beim Laden der Gesellschaft" },
      { status: 500 }
    );
  }
}

// PUT /api/funds/[id] - Gesellschaft aktualisieren
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.FUNDS_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existingFund = await prisma.fund.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existingFund) {
      return NextResponse.json(
        { error: "Gesellschaft nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = fundUpdateSchema.parse(body);

    const fund = await prisma.fund.update({
      where: { id },
      data: {
        ...validatedData,
        foundingDate: validatedData.foundingDate
          ? new Date(validatedData.foundingDate)
          : validatedData.foundingDate === null
            ? null
            : undefined,
      },
    });

    // Invalidate dashboard caches after fund update
    invalidate.onFundChange(check.tenantId!, id, 'update').catch((err) => {
      logger.warn({ err }, '[Funds] Cache invalidation error after update');
    });

    return NextResponse.json(fund);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating fund");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Gesellschaft" },
      { status: 500 }
    );
  }
}

// DELETE /api/funds/[id] - Gesellschaft unwiderruflich löschen (Hard-Delete)
// Nur ADMIN und SUPERADMIN dürfen löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.FUNDS_DELETE);
    if (!check.authorized) return check.error;

    // Additional role check: Only Admin or higher (hierarchy >= 80)
    const hierarchy = await getUserHighestHierarchy(check.userId!);
    const session = await import("@/lib/auth").then((m) => m.auth());
    const isAdmin = hierarchy >= ROLE_HIERARCHY.ADMIN ||
      (session?.user?.role && ["ADMIN", "SUPERADMIN"].includes(session.user.role));
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Nur Administratoren dürfen Gesellschaften löschen" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existingFund = await prisma.fund.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existingFund) {
      return NextResponse.json(
        { error: "Gesellschaft nicht gefunden" },
        { status: 404 }
      );
    }

    // Hard-Delete: Unwiderruflich löschen
    await prisma.fund.delete({
      where: { id },
    });

    // Log the deletion for audit trail
    await logDeletion("Fund", id, existingFund as Record<string, unknown>);

    // Invalidate dashboard caches after fund deletion
    invalidate.onFundChange(check.tenantId!, id, 'delete').catch((err) => {
      logger.warn({ err }, '[Funds] Cache invalidation error after delete');
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting fund");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Gesellschaft" },
      { status: 500 }
    );
  }
}
