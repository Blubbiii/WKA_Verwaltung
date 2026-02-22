import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const createDistributionSchema = z.object({
  totalAmount: z.number().positive("Betrag muss positiv sein"),
  distributionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/funds/[id]/distributions - Liste aller Ausschuettungen
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("funds:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Pruefen ob Gesellschaft existiert und zum Mandanten gehoert
    const fund = await prisma.fund.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true },
    });

    if (!fund) {
      return NextResponse.json(
        { error: "Gesellschaft nicht gefunden" },
        { status: 404 }
      );
    }

    const distributions = await prisma.distribution.findMany({
      where: { fundId: id },
      include: {
        items: {
          include: {
            shareholder: {
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
            },
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                status: true,
              },
            },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { items: true },
        },
      },
      orderBy: { distributionDate: "desc" },
    });

    return NextResponse.json(distributions);
  } catch (error) {
    logger.error({ err: error }, "Error fetching distributions");
    return NextResponse.json(
      { error: "Fehler beim Laden der Ausschuettungen" },
      { status: 500 }
    );
  }
}

// POST /api/funds/[id]/distributions - Neue Ausschuettung erstellen (Entwurf)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:create");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const data = createDistributionSchema.parse(body);

    // Gesellschaft mit aktiven Gesellschaftern laden
    const fund = await prisma.fund.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        shareholders: {
          where: { status: "ACTIVE" },
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
        },
      },
    });

    if (!fund) {
      return NextResponse.json(
        { error: "Gesellschaft nicht gefunden" },
        { status: 404 }
      );
    }

    if (fund.shareholders.length === 0) {
      return NextResponse.json(
        { error: "Keine aktiven Gesellschafter vorhanden" },
        { status: 400 }
      );
    }

    // Pruefen ob alle Gesellschafter eine gueltige Beteiligungsquote haben
    const totalPercentage = fund.shareholders.reduce(
      (sum, s) => sum + (Number(s.distributionPercentage) || Number(s.ownershipPercentage) || 0),
      0
    );

    if (totalPercentage === 0) {
      return NextResponse.json(
        { error: "Keine Beteiligungsquoten definiert" },
        { status: 400 }
      );
    }

    // Eindeutige Ausschuettungsnummer generieren
    const year = new Date(data.distributionDate).getFullYear();
    const existingCount = await prisma.distribution.count({
      where: {
        tenantId: check.tenantId!,
        distributionNumber: { startsWith: `AS-${year}-` },
      },
    });
    const distributionNumber = `AS-${year}-${String(existingCount + 1).padStart(3, "0")}`;

    // Distribution mit Items erstellen (in Transaction)
    const distribution = await prisma.$transaction(async (tx) => {
      // Distribution erstellen
      const dist = await tx.distribution.create({
        data: {
          distributionNumber,
          description: data.description,
          totalAmount: data.totalAmount,
          distributionDate: new Date(data.distributionDate),
          notes: data.notes,
          status: "DRAFT",
          fundId: id,
          tenantId: check.tenantId!,
          createdById: check.userId,
        },
      });

      // Items fuer jeden Gesellschafter erstellen
      const items = fund.shareholders.map((shareholder) => {
        // Verwende distributionPercentage falls vorhanden, sonst ownershipPercentage
        const percentage = Number(shareholder.distributionPercentage) ||
                          Number(shareholder.ownershipPercentage) || 0;
        // Normalisiere auf 100% (falls Summe nicht genau 100 ist)
        const normalizedPercentage = (percentage / totalPercentage) * 100;
        const amount = Math.round((data.totalAmount * normalizedPercentage / 100) * 100) / 100;

        return {
          distributionId: dist.id,
          shareholderId: shareholder.id,
          percentage: normalizedPercentage,
          amount,
        };
      });

      await tx.distributionItem.createMany({ data: items });

      return dist;
    });

    // Distribution mit Items laden
    const result = await prisma.distribution.findUnique({
      where: { id: distribution.id },
      include: {
        items: {
          include: {
            shareholder: {
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
            },
          },
        },
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating distribution");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Ausschuettung" },
      { status: 500 }
    );
  }
}
