import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { getExpiringItems } from "@/lib/crm/expiring-items";

function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

function statusFor(days: number): "critical" | "warning" | "normal" {
  if (days <= 30) return "critical";
  if (days <= 60) return "warning";
  return "normal";
}

export async function GET() {
  const check = await requireAuth();
  if (!check.authorized) return check.error;

  try {
    const items = await getExpiringItems(check.tenantId!, 180);

    const leaseRows = items.leases.map((l) => {
      const title = l.parkName
        ? `${l.parkName} – Pachtvertrag`
        : `Pachtvertrag (${l.lessorName})`;
      return {
        id: l.id,
        title,
        type: "Pacht",
        expiryDate: formatDate(l.endDate),
        daysUntilExpiry: l.daysUntilExpiry,
        status: statusFor(l.daysUntilExpiry),
        href: `/leases/${l.id}`,
      };
    });

    const contractRows = items.contracts.map((c) => {
      const title = c.contractNumber ? `${c.contractNumber} – ${c.title}` : c.title;
      return {
        id: c.id,
        title,
        type: c.contractType,
        expiryDate: formatDate(c.endDate),
        daysUntilExpiry: c.daysUntilExpiry,
        status: statusFor(c.daysUntilExpiry),
        href: `/contracts/${c.id}`,
      };
    });

    const all = [...leaseRows, ...contractRows]
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
      .slice(0, 15);

    return NextResponse.json(all);
  } catch (error) {
    logger.error({ error }, "[expiring-contracts] Error");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
