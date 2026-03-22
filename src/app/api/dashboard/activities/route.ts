import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";

const ACTION_LABELS: Record<string, string> = {
  CREATE: "erstellt",
  UPDATE: "aktualisiert",
  DELETE: "gelöscht",
};

const ENTITY_LABELS: Record<string, string> = {
  Park: "Windpark",
  Lease: "Pachtvertrag",
  Invoice: "Rechnung",
  User: "Benutzer",
  Plot: "Flurstück",
  Fund: "Fonds",
};

function relativeTimeGerman(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 60) {
    return `vor ${diffMinutes} Minute${diffMinutes !== 1 ? "n" : ""}`;
  }
  if (diffHours < 24) {
    return `vor ${diffHours} Stunde${diffHours !== 1 ? "n" : ""}`;
  }
  if (diffDays === 1) {
    return "gestern";
  }
  return `vor ${diffDays} Tagen`;
}

export async function GET() {
  const check = await requireAuth();
  if (!check.authorized) return check.error;

  try {
    const logs = await prisma.auditLog.findMany({
      where: { tenantId: check.tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    const activities = logs.map((log) => {
      const actionLabel = ACTION_LABELS[log.action] ?? log.action.toLowerCase();
      const entityLabel = ENTITY_LABELS[log.entityType] ?? log.entityType;
      const shortId = log.entityId ? `#${log.entityId.slice(0, 8)}` : "";
      const detail = `${entityLabel}${shortId ? " " + shortId : ""}`;

      const userName = log.user
        ? [log.user.firstName, log.user.lastName].filter(Boolean).join(" ") || null
        : null;
      const action = userName
        ? `${userName} hat ${entityLabel} ${actionLabel}`
        : `${entityLabel} ${actionLabel}`;

      return {
        id: log.id,
        action,
        detail,
        time: relativeTimeGerman(log.createdAt),
      };
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error("[activities] Error:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
