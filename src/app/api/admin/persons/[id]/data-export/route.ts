/**
 * DSGVO Art. 15 Auskunfts-Endpoint für Personen (Pächter, CRM, Mitarbeiter).
 *
 * GET /api/admin/persons/[id]/data-export
 *   -> JSON mit ALLEN gespeicherten Daten zur Person
 *
 * Permission: admin:audit (nur Admins / DSB)
 *
 * Liefert: Person-Stammdaten + Leases + Contracts + Invoices + CrmActivities
 *          + AuditLog-Einträge wo Person als Subjekt erscheint.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { handleApiError } from "@/lib/api-utils";
import { apiError } from "@/lib/api-errors";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, ctx: RouteParams) {
  try {
    const check = await requirePermission("admin:audit");
    if (!check.authorized) return check.error;

    const { id: personId } = await ctx.params;
    if (!personId) {
      return apiError("MISSING_FIELD", 400, {
        message: "Person-ID fehlt im Pfad.",
      });
    }

    // 1. Person inkl. Beziehungen (Tenant-scoped)
    const person = await prisma.person.findFirst({
      where: {
        id: personId,
        ...(check.tenantId ? { tenantId: check.tenantId } : {}),
      },
      include: {
        tags: { select: { id: true, name: true } },
        shareholders: {
          select: {
            id: true,
            shareholderNumber: true,
            fundId: true,
            ownershipPercentage: true,
            entryDate: true,
            exitDate: true,
            status: true,
          },
        },
      },
    });

    if (!person) {
      return apiError("NOT_FOUND", 404, {
        message: "Person nicht gefunden.",
      });
    }

    // 2. Verträge / Pacht / Rechnungen / CRM in einem Roundtrip
    const [leases, contracts, invoices, crmActivities, auditTrail] =
      await Promise.all([
        prisma.lease.findMany({
          where: { lessorId: personId },
          orderBy: { startDate: "desc" },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
            signedDate: true,
            hasExtensionOption: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.contract.findMany({
          where: { partnerId: personId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            startDate: true,
            endDate: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        // Invoices: per Shareholder verknüpft → über shareholderId
        prisma.invoice.findMany({
          where: {
            shareholder: { personId },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            dueDate: true,
            grossAmount: true,
            netAmount: true,
            status: true,
            createdAt: true,
          },
        }),
        prisma.crmActivity.findMany({
          where: { personId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            title: true,
            description: true,
            status: true,
            direction: true,
            startTime: true,
            dueDate: true,
            createdAt: true,
          },
        }),
        // AuditLog: alle Einträge wo Person als entity erscheint
        prisma.auditLog.findMany({
          where: {
            entityType: "Person",
            entityId: personId,
            ...(check.tenantId ? { tenantId: check.tenantId } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 500,
          select: {
            id: true,
            action: true,
            createdAt: true,
            userId: true,
            ipAddress: true,
            oldValues: true,
            newValues: true,
          },
        }),
      ]);

    const generatedAt = new Date().toISOString();

    return NextResponse.json(
      {
        meta: {
          generatedAt,
          legalBasis: "DSGVO Art. 15 (Auskunftsrecht)",
          personId,
          tenantScope: check.tenantId ?? "global",
          recordCounts: {
            leases: leases.length,
            contracts: contracts.length,
            invoices: invoices.length,
            crmActivities: crmActivities.length,
            auditTrail: auditTrail.length,
          },
        },
        person,
        leases,
        contracts,
        invoices,
        crmActivities,
        auditTrail,
      },
      {
        headers: {
          "Content-Disposition": `attachment; filename="dsgvo-auskunft-person-${personId}-${generatedAt.slice(0, 10)}.json"`,
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return handleApiError(error, "Fehler beim Erstellen der DSGVO-Auskunft");
  }
}
