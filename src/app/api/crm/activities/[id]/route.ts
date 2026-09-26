import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mandantDb } from "@/lib/mandant/mandant-db";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

import { apiError } from "@/lib/api-errors";

import { zodMeldung } from "@/lib/validation/zod-meldung";
const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(["DONE", "PENDING", "CANCELLED"]).optional(),
  direction: z.enum(["INBOUND", "OUTBOUND"]).optional().nullable(),
  duration: z.number().int().positive().optional().nullable(),
  startTime: z.iso.datetime().optional().nullable(),
  dueDate: z.iso.datetime().optional().nullable(),
  assignedToId: z.uuid().optional().nullable(),
  emailFrom: z.string().max(320).optional().nullable(),
  emailTo: z.array(z.string().max(320)).optional(),
  emailCc: z.array(z.string().max(320)).optional(),
  emailSubject: z.string().max(500).optional().nullable(),
});

// GET /api/crm/activities/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;
    const db = mandantDb(check.tenantId!);
    if (!await getConfigBoolean("crm.enabled", check.tenantId, false))
      return apiError("INTERNAL_ERROR", undefined, { message: "CRM nicht aktiviert" });
    const { id } = await params;

    const activity = await db.crmActivity.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        person: { select: { id: true, firstName: true, lastName: true } },
        fund: { select: { id: true, name: true } },
        lease: { select: { id: true, lessor: { select: { firstName: true, lastName: true } } } },
        park: { select: { id: true, name: true } },
      },
    });

    if (!activity) {
      return apiError("NOT_FOUND", undefined, { message: "Aktivität nicht gefunden" });
    }

    return NextResponse.json(serializePrisma(activity));
  } catch (error) {
    logger.error({ err: error }, "Error fetching CRM activity");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden" });
  }
}

// PUT /api/crm/activities/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("crm:update");
    if (!check.authorized) return check.error;
    const db = mandantDb(check.tenantId!);
    if (!await getConfigBoolean("crm.enabled", check.tenantId, false))
      return apiError("INTERNAL_ERROR", undefined, { message: "CRM nicht aktiviert" });
    const { id } = await params;

    const existing = await db.crmActivity.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });
    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Aktivität nicht gefunden" });
    }

    const raw = await request.json();
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: zodMeldung(parsed.error, "Ungültige Eingabe") });
    }

    const d = parsed.data;
    const updated = await db.crmActivity.update({
      where: { id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.description !== undefined && { description: d.description }),
        ...(d.status !== undefined && { status: d.status }),
        ...(d.direction !== undefined && { direction: d.direction }),
        ...(d.duration !== undefined && { duration: d.duration }),
        ...(d.startTime !== undefined && { startTime: d.startTime ? new Date(d.startTime) : null }),
        ...(d.dueDate !== undefined && { dueDate: d.dueDate ? new Date(d.dueDate) : null }),
        ...(d.assignedToId !== undefined && { assignedToId: d.assignedToId }),
        ...(d.emailFrom !== undefined && { emailFrom: d.emailFrom }),
        ...(d.emailTo !== undefined && { emailTo: d.emailTo }),
        ...(d.emailCc !== undefined && { emailCc: d.emailCc }),
        ...(d.emailSubject !== undefined && { emailSubject: d.emailSubject }),
      },
    });

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error updating CRM activity");
    return apiError("UPDATE_FAILED", undefined, { message: "Fehler beim Aktualisieren" });
  }
}

// DELETE /api/crm/activities/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("crm:delete");
    if (!check.authorized) return check.error;
    const db = mandantDb(check.tenantId!);
    if (!await getConfigBoolean("crm.enabled", check.tenantId, false))
      return apiError("INTERNAL_ERROR", undefined, { message: "CRM nicht aktiviert" });
    const { id } = await params;

    const existing = await db.crmActivity.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });
    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Aktivität nicht gefunden" });
    }

    await db.crmActivity.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // lastActivityAt auf verknüpfter Entität neu berechnen — sonst zeigt
    // der Kontakt-Header nach dem Löschen der jüngsten Aktivität weiter das
    // alte Datum bis zum nächsten harten Reload.
    const recomputeLastActivity = async (
      field: "personId" | "fundId" | "leaseId",
      value: string,
    ) => {
      const latest = await db.crmActivity.findFirst({
        where: { [field]: value, tenantId: check.tenantId!, deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      const lastActivityAt = latest?.createdAt ?? null;
      if (field === "personId") {
        await db.person.update({
          where: { id: value },
          data: { lastActivityAt },
        });
      } else if (field === "fundId") {
        await db.fund.update({
          where: { id: value },
          data: { lastActivityAt },
        });
      } else if (field === "leaseId") {
        await db.lease.update({
          where: { id: value },
          data: { lastActivityAt },
        });
      }
    };

    if (existing.personId) await recomputeLastActivity("personId", existing.personId);
    if (existing.fundId) await recomputeLastActivity("fundId", existing.fundId);
    if (existing.leaseId) await recomputeLastActivity("leaseId", existing.leaseId);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting CRM activity");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen" });
  }
}
