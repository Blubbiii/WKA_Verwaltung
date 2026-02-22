import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const fundParkSchema = z.object({
  parkId: z.string().uuid("Ungültige Park-ID"),
  ownershipPercentage: z.number().min(0).max(100).optional().nullable(),
});

// GET /api/funds/[id]/parks - Get all parks linked to a fund
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.FUNDS_READ);
    if (!check.authorized) return check.error!;

    const { id: fundId } = await params;

    // Verify fund belongs to tenant
    const fund = await prisma.fund.findFirst({
      where: {
        id: fundId,
        tenantId: check.tenantId,
      },
    });

    if (!fund) {
      return NextResponse.json(
        { error: "Gesellschaft nicht gefunden" },
        { status: 404 }
      );
    }

    const fundParks = await prisma.fundPark.findMany({
      where: { fundId },
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
    });

    return NextResponse.json(fundParks);
  } catch (error) {
    logger.error({ err: error }, "Error fetching fund parks");
    return NextResponse.json(
      { error: "Fehler beim Laden der Parks" },
      { status: 500 }
    );
  }
}

// POST /api/funds/[id]/parks - Add a park to a fund
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.FUNDS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id: fundId } = await params;

    // Verify fund belongs to tenant
    const fund = await prisma.fund.findFirst({
      where: {
        id: fundId,
        tenantId: check.tenantId,
      },
    });

    if (!fund) {
      return NextResponse.json(
        { error: "Gesellschaft nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = fundParkSchema.parse(body);

    // Verify park belongs to tenant
    const park = await prisma.park.findFirst({
      where: {
        id: validatedData.parkId,
        tenantId: check.tenantId,
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Park nicht gefunden" },
        { status: 404 }
      );
    }

    // Check if already linked
    const existing = await prisma.fundPark.findUnique({
      where: {
        fundId_parkId: {
          fundId,
          parkId: validatedData.parkId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Park ist bereits dieser Gesellschaft zugeordnet" },
        { status: 400 }
      );
    }

    const fundPark = await prisma.fundPark.create({
      data: {
        fundId,
        parkId: validatedData.parkId,
        ownershipPercentage: validatedData.ownershipPercentage,
      },
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
    });

    return NextResponse.json(fundPark, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error adding park to fund");
    return NextResponse.json(
      { error: "Fehler beim Hinzufügen des Parks" },
      { status: 500 }
    );
  }
}

// DELETE /api/funds/[id]/parks - Remove a park from a fund
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.FUNDS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id: fundId } = await params;
    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");

    if (!parkId) {
      return NextResponse.json(
        { error: "Park-ID erforderlich" },
        { status: 400 }
      );
    }

    // Verify fund belongs to tenant
    const fund = await prisma.fund.findFirst({
      where: {
        id: fundId,
        tenantId: check.tenantId,
      },
    });

    if (!fund) {
      return NextResponse.json(
        { error: "Gesellschaft nicht gefunden" },
        { status: 404 }
      );
    }

    await prisma.fundPark.delete({
      where: {
        fundId_parkId: {
          fundId,
          parkId,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error removing park from fund");
    return NextResponse.json(
      { error: "Fehler beim Entfernen des Parks" },
      { status: 500 }
    );
  }
}
