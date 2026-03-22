import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

export async function GET() {
  const check = await requireAuth();
  if (!check.authorized) return check.error;

  try {
    const now = new Date();
    const horizon = addDays(now, 180);

    const leases = await prisma.lease.findMany({
      where: {
        tenantId: check.tenantId,
        status: "ACTIVE",
        endDate: { gte: now, lte: horizon },
      },
      include: {
        leasePlots: {
          include: {
            plot: {
              include: {
                park: { select: { name: true } },
              },
            },
          },
          take: 1,
        },
      },
      orderBy: { endDate: "asc" },
      take: 10,
    });

    const contracts = leases.map((lease) => {
      const endDate = lease.endDate!;
      const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / 86400000);

      // Build title from first linked plot/park
      const firstLeasePlot = lease.leasePlots[0];
      const plot = firstLeasePlot?.plot;
      const parkName = plot?.park?.name;
      const plotLabel = plot ? `${plot.cadastralDistrict} ${plot.plotNumber}` : null;

      let title: string;
      if (parkName && plotLabel) {
        title = `${parkName} – Flurstück ${plotLabel}`;
      } else if (parkName) {
        title = `${parkName} – Pachtvertrag`;
      } else if (plotLabel) {
        title = `Flurstück ${plotLabel}`;
      } else {
        title = `Pachtvertrag #${lease.id.slice(0, 8)}`;
      }

      const status: "critical" | "warning" | "normal" =
        daysUntilExpiry <= 30 ? "critical" : daysUntilExpiry <= 60 ? "warning" : "normal";

      return {
        id: lease.id,
        title,
        type: "Pacht",
        expiryDate: formatDate(endDate),
        daysUntilExpiry,
        status,
      };
    });

    return NextResponse.json(contracts);
  } catch (error) {
    console.error("[expiring-contracts] Error:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
