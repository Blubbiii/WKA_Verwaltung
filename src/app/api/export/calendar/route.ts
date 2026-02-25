/**
 * ICS Calendar Export API
 *
 * GET /api/export/calendar?type=contracts|leases|all&status=ACTIVE&fundId=X&parkId=Y
 *
 * Returns .ics file with contract deadlines and lease end dates.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { generateIcsCalendar, type IcsEvent } from "@/lib/export/ics";
import { apiLogger as logger } from "@/lib/logger";

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  LEASE: "Pachtvertrag",
  SERVICE: "Wartungsvertrag",
  INSURANCE: "Versicherung",
  GRID_CONNECTION: "Netzanschluss",
  MARKETING: "Direktvermarktung",
  OTHER: "Sonstiger Vertrag",
};

export async function GET(request: NextRequest) {
  try {
    // Permission check - contracts:read covers contract deadlines
    const check = await requirePermission("contracts:read");
    if (!check.authorized) return check.error;
    const tenantId = check.tenantId!;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all";
    const status = searchParams.get("status");
    const fundId = searchParams.get("fundId");
    const parkId = searchParams.get("parkId");

    const events: IcsEvent[] = [];

    // Fetch contracts
    if (type === "contracts" || type === "all") {
      const contracts = await prisma.contract.findMany({
        where: {
          tenantId,
          ...(status && {
            status: status as
              | "DRAFT"
              | "ACTIVE"
              | "EXPIRING"
              | "EXPIRED"
              | "TERMINATED",
          }),
          ...(!status && { status: { in: ["ACTIVE", "EXPIRING"] } }),
          ...(fundId && { fundId }),
          ...(parkId && { parkId }),
          endDate: { not: null },
        },
        select: {
          id: true,
          title: true,
          contractType: true,
          startDate: true,
          endDate: true,
          noticeDeadline: true,
          reminderDays: true,
          park: { select: { name: true } },
          fund: { select: { name: true } },
        },
        orderBy: { endDate: "asc" },
      });

      for (const contract of contracts) {
        if (!contract.endDate) continue;

        const typeLabel =
          CONTRACT_TYPE_LABELS[contract.contractType] || contract.contractType;
        const parkName = contract.park?.name;
        const fundName = contract.fund?.name;
        const contextParts = [typeLabel, parkName, fundName].filter(Boolean);
        const context = contextParts.join(" | ");

        // Contract end date event
        events.push({
          uid: `contract-${contract.id}-end@windparkmanager`,
          summary: `Vertrag "${contract.title}" laeuft aus`,
          description: `${context}\nVertragsende: ${contract.endDate.toLocaleDateString("de-DE")}`,
          dtstart: contract.endDate,
          alarmDaysBefore:
            contract.reminderDays.length > 0
              ? contract.reminderDays
              : [90, 30],
          categories: ["Vertrag", typeLabel],
        });

        // Notice deadline event (if present)
        if (contract.noticeDeadline) {
          events.push({
            uid: `contract-${contract.id}-notice@windparkmanager`,
            summary: `Kuendigungsfrist "${contract.title}"`,
            description: `${context}\nKuendigungsfrist endet am ${contract.noticeDeadline.toLocaleDateString("de-DE")}`,
            dtstart: contract.noticeDeadline,
            alarmDaysBefore: [14, 7],
            categories: ["Kuendigungsfrist", typeLabel],
          });
        }
      }
    }

    // Fetch leases
    if (type === "leases" || type === "all") {
      // Check lease permission if specifically requesting leases
      if (type === "leases") {
        const leaseCheck = await requirePermission("leases:read");
        if (!leaseCheck.authorized) return leaseCheck.error;
      }

      const leases = await prisma.lease.findMany({
        where: {
          tenantId,
          ...(status && {
            status: status as
              | "DRAFT"
              | "ACTIVE"
              | "EXPIRING"
              | "EXPIRED"
              | "TERMINATED",
          }),
          ...(!status && { status: { in: ["ACTIVE", "EXPIRING"] } }),
          ...(parkId && { plots: { some: { parkId } } }),
          endDate: { not: null },
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          lessor: { select: { firstName: true, lastName: true } },
          leasePlots: {
            select: { plot: { select: { park: { select: { name: true } } } } },
            take: 1,
          },
        },
        orderBy: { endDate: "asc" },
      });

      for (const lease of leases) {
        if (!lease.endDate) continue;

        const lessorName = lease.lessor
          ? `${lease.lessor.firstName || ""} ${lease.lessor.lastName || ""}`.trim()
          : "Unbekannt";
        const parkName = lease.leasePlots[0]?.plot?.park?.name;

        events.push({
          uid: `lease-${lease.id}-end@windparkmanager`,
          summary: `Pachtvertrag "${lessorName}" laeuft aus`,
          description: `Verpaecher: ${lessorName}${parkName ? `\nPark: ${parkName}` : ""}\nPachtende: ${lease.endDate.toLocaleDateString("de-DE")}`,
          dtstart: lease.endDate,
          alarmDaysBefore: [90, 30],
          categories: ["Pachtvertrag"],
        });
      }
    }

    if (events.length === 0) {
      return NextResponse.json(
        { error: "Keine Termine zum Exportieren gefunden" },
        { status: 404 }
      );
    }

    // Generate ICS
    const icsContent = generateIcsCalendar(events);
    const filename = `WPM_Termine_${new Date().toISOString().split("T")[0]}.ics`;

    logger.info(
      { tenantId, type, eventCount: events.length },
      "[Calendar Export] Generated ICS"
    );

    return new NextResponse(icsContent, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Export-Event-Count": String(events.length),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Calendar Export] Error");
    return NextResponse.json(
      { error: "Fehler beim Kalenderexport" },
      { status: 500 }
    );
  }
}
