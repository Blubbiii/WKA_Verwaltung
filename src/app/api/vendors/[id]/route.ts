import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  taxId: z.string().max(50).optional().nullable(),
  vatId: z.string().max(50).optional().nullable(),
  iban: z.string().max(34).optional().nullable(),
  bic: z.string().max(11).optional().nullable(),
  email: z.email().optional().nullable(),
  street: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional(),
  notes: z.string().optional().nullable(),
  personId: z.uuid().optional().nullable(),
});

async function checkInbox(tenantId: string) {
  if (!await getConfigBoolean("inbox.enabled", tenantId, false)) {
    return apiError("FEATURE_DISABLED", 404, { message: "Inbox nicht aktiviert" });
  }
  return null;
}

// GET /api/vendors/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("vendors:read");
    if (!check.authorized) return check.error;
    const guard = await checkInbox(check.tenantId!);
    if (guard) return guard;
    const { id } = await params;

    const vendor = await prisma.vendor.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
      include: {
        person: { select: { id: true, firstName: true, lastName: true, companyName: true } },
        invoices: { where: { deletedAt: null }, select: { id: true, status: true, grossAmount: true }, take: 10 },
      },
    });

    if (!vendor) {
      return apiError("NOT_FOUND", 404, { message: "Lieferant nicht gefunden" });
    }

    return NextResponse.json(serializePrisma(vendor));
  } catch (error) {
    logger.error({ err: error }, "Error fetching vendor");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden" });
  }
}

// PUT /api/vendors/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("vendors:write");
    if (!check.authorized) return check.error;
    const guard = await checkInbox(check.tenantId!);
    if (guard) return guard;
    const { id } = await params;

    const existing = await prisma.vendor.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Lieferant nicht gefunden" });
    }

    const raw = await request.json();
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, { message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" });
    }

    const d = parsed.data;
    const updated = await prisma.vendor.update({
      where: { id },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.taxId !== undefined && { taxId: d.taxId }),
        ...(d.vatId !== undefined && { vatId: d.vatId }),
        ...(d.iban !== undefined && { iban: d.iban }),
        ...(d.bic !== undefined && { bic: d.bic }),
        ...(d.email !== undefined && { email: d.email }),
        ...(d.street !== undefined && { street: d.street }),
        ...(d.postalCode !== undefined && { postalCode: d.postalCode }),
        ...(d.city !== undefined && { city: d.city }),
        ...(d.country !== undefined && { country: d.country }),
        ...(d.notes !== undefined && { notes: d.notes }),
        ...(d.personId !== undefined && { personId: d.personId }),
      },
      include: {
        person: { select: { id: true, firstName: true, lastName: true, companyName: true } },
      },
    });

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error updating vendor");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren" });
  }
}

// DELETE /api/vendors/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("vendors:write");
    if (!check.authorized) return check.error;
    const guard = await checkInbox(check.tenantId!);
    if (guard) return guard;
    const { id } = await params;

    const existing = await prisma.vendor.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Lieferant nicht gefunden" });
    }

    await prisma.vendor.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting vendor");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Löschen" });
  }
}
