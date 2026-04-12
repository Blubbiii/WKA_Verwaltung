import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { loadContact360 } from "@/lib/crm/contact-360";
import { loadLabelsForPersons } from "@/lib/crm/derived-labels";

import { apiError } from "@/lib/api-errors";
const updateSchema = z.object({
  salutation: z.string().max(20).optional().nullable(),
  firstName: z.string().max(100).optional().nullable(),
  lastName: z.string().max(100).optional().nullable(),
  companyName: z.string().max(200).optional().nullable(),
  email: z.email().max(200).optional().nullable().or(z.literal("")),
  phone: z.string().max(50).optional().nullable(),
  mobile: z.string().max(50).optional().nullable(),
  street: z.string().max(200).optional().nullable(),
  houseNumber: z.string().max(20).optional().nullable(),
  postalCode: z.string().max(10).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional(),
  contactType: z.string().max(50).optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /api/crm/contacts/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;
    if (!await getConfigBoolean("crm.enabled", check.tenantId, false))
      return apiError("INTERNAL_ERROR", undefined, { message: "CRM nicht aktiviert" });
    const { id } = await params;

    const person = await prisma.person.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        crmActivities: {
          where: { deletedAt: null },
          include: {
            createdBy: { select: { id: true, firstName: true, lastName: true } },
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        },
        tags: {
          select: { id: true, name: true, color: true },
        },
      },
    });

    if (!person) {
      return apiError("NOT_FOUND", undefined, { message: "Kontakt nicht gefunden" });
    }

    const [contact360, labelBundleMap] = await Promise.all([
      loadContact360(id, check.tenantId!),
      loadLabelsForPersons(check.tenantId!, [id]),
    ]);
    const bundle = labelBundleMap.get(id);

    return NextResponse.json(
      serializePrisma({
        ...person,
        contact360,
        labels: bundle?.labels ?? [],
      }),
    );
  } catch (error) {
    logger.error({ err: error }, "Error fetching CRM contact");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden" });
  }
}

// PUT /api/crm/contacts/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("crm:update");
    if (!check.authorized) return check.error;
    if (!await getConfigBoolean("crm.enabled", check.tenantId, false))
      return apiError("INTERNAL_ERROR", undefined, { message: "CRM nicht aktiviert" });
    const { id } = await params;

    const existing = await prisma.person.findFirst({
      where: { id, tenantId: check.tenantId! },
    });
    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Kontakt nicht gefunden" });
    }

    const raw = await request.json();
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("INTERNAL_ERROR", undefined, { message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" });
    }

    // Build update data from all provided fields
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) {
        // Treat empty string email as null
        updateData[key] = key === "email" && value === "" ? null : value;
      }
    }

    const updated = await prisma.person.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error updating CRM contact");
    return apiError("UPDATE_FAILED", undefined, { message: "Fehler beim Aktualisieren" });
  }
}
