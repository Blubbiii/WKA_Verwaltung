import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const shareholderUpdateSchema = z.object({
  shareholderNumber: z.string().optional().nullable(),
  entryDate: z.string().optional().nullable(),
  exitDate: z.string().optional().nullable(),
  capitalContribution: z.number().optional().nullable(),
  liabilityAmount: z.number().optional().nullable(),
  ownershipPercentage: z.number().min(0).max(100).optional().nullable(),
  votingRightsPercentage: z.number().min(0).max(100).optional().nullable(),
  distributionPercentage: z.number().min(0).max(100).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  notes: z.string().optional().nullable(),
});

// Helper function to recalculate all ownership percentages in a fund
// Accepts optional transaction client for atomic operations
async function recalculateFundShares(fundId: string, txClient?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) {
  const db = txClient || prisma;
  // Get all active shareholders in this fund
  const shareholders = await db.shareholder.findMany({
    where: {
      fundId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      capitalContribution: true,
    },
  });

  // Calculate total capital
  const totalCapital = shareholders.reduce(
    (sum, sh) => sum + (Number(sh.capitalContribution) || 0),
    0
  );

  // Update each shareholder's ownership percentage
  if (totalCapital > 0) {
    for (const sh of shareholders) {
      const contribution = Number(sh.capitalContribution) || 0;
      const percentage = (contribution / totalCapital) * 100;
      const roundedPercentage = Math.round(percentage * 100) / 100;

      await db.shareholder.update({
        where: { id: sh.id },
        data: {
          ownershipPercentage: roundedPercentage,
          votingRightsPercentage: roundedPercentage,
          distributionPercentage: roundedPercentage,
        },
      });
    }
  }
}

// GET /api/shareholders/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const shareholder = await prisma.shareholder.findFirst({
      where: {
        id,
        fund: {
          tenantId: check.tenantId,
        },
      },
      include: {
        person: true,
        fund: {
          select: {
            id: true,
            name: true,
            legalForm: true,
            totalCapital: true,
          },
        },
        voteResponses: {
          include: {
            vote: {
              select: {
                id: true,
                title: true,
                status: true,
                startDate: true,
                endDate: true,
              },
            },
          },
          orderBy: { votedAt: "desc" },
          take: 10,
        },
        documents: {
          where: { isArchived: false },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        _count: {
          select: { voteResponses: true, documents: true },
        },
      },
    });

    if (!shareholder) {
      return NextResponse.json(
        { error: "Gesellschafter nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json(shareholder);
  } catch (error) {
    logger.error({ err: error }, "Error fetching shareholder");
    return NextResponse.json(
      { error: "Fehler beim Laden des Gesellschafters" },
      { status: 500 }
    );
  }
}

// PUT /api/shareholders/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const existingShareholder = await prisma.shareholder.findFirst({
      where: {
        id,
        fund: {
          tenantId: check.tenantId,
        },
      },
    });

    if (!existingShareholder) {
      return NextResponse.json(
        { error: "Gesellschafter nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = shareholderUpdateSchema.parse(body);

    // Update shareholder + recalculate fund shares atomar in einer Transaktion
    const updatedShareholder = await prisma.$transaction(async (tx) => {
      await tx.shareholder.update({
        where: { id },
        data: {
          ...validatedData,
          entryDate: validatedData.entryDate !== undefined
            ? validatedData.entryDate ? new Date(validatedData.entryDate) : null
            : undefined,
          exitDate: validatedData.exitDate !== undefined
            ? validatedData.exitDate ? new Date(validatedData.exitDate) : null
            : undefined,
        },
      });

      // Recalculate all ownership percentages in this fund
      await recalculateFundShares(existingShareholder.fundId, tx);

      // Fetch updated shareholder with new percentages
      return tx.shareholder.findUnique({
        where: { id },
        include: {
          person: true,
          fund: { select: { id: true, name: true } },
        },
      });
    });

    return NextResponse.json(updatedShareholder);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating shareholder");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Gesellschafters" },
      { status: 500 }
    );
  }
}

// DELETE /api/shareholders/[id] - Gesellschafter unwiderruflich löschen (Hard-Delete)
// Nur ADMIN und SUPERADMIN dürfen löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.SHAREHOLDERS_DELETE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const existingShareholder = await prisma.shareholder.findFirst({
      where: {
        id,
        fund: {
          tenantId: check.tenantId,
        },
      },
    });

    if (!existingShareholder) {
      return NextResponse.json(
        { error: "Gesellschafter nicht gefunden" },
        { status: 404 }
      );
    }

    // Hard-Delete + audit log + recalculate atomar in einer Transaktion
    await prisma.$transaction(async (tx) => {
      // 1. Hard-Delete: Unwiderruflich löschen
      await tx.shareholder.delete({
        where: { id },
      });

      // 2. Log the deletion for audit trail
      // Clean sensitive fields before logging
      const cleanedData = { ...existingShareholder } as Record<string, unknown>;
      delete cleanedData.passwordHash;
      delete cleanedData.password;

      await tx.auditLog.create({
        data: {
          action: "DELETE",
          entityType: "Shareholder",
          entityId: id,
          oldValues: cleanedData as unknown as Prisma.InputJsonValue,
          newValues: Prisma.JsonNull,
          tenantId: check.tenantId!,
          userId: check.userId!,
        },
      });

      // 3. Recalculate ownership percentages for remaining shareholders
      await recalculateFundShares(existingShareholder.fundId, tx);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting shareholder");
    return NextResponse.json(
      { error: "Fehler beim Löschen des Gesellschafters" },
      { status: 500 }
    );
  }
}
