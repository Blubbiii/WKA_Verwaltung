import { NextRequest, NextResponse } from "next/server";
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
  email: z.string().email().optional().nullable(),
  street: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional(),
  notes: z.string().optional().nullable(),
  personId: z.string().uuid().optional().nullable(),
});

async function checkInbox(tenantId: string) {
  if (!await getConfigBoolean("inbox.enabled", tenantId, false)) {
    return NextResponse.json({ error: "Inbox nicht aktiviert" }, { status: 404 });
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
      return NextResponse.json({ error: "Lieferant nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json(serializePrisma(vendor));
  } catch (error) {
    logger.error({ err: error }, "Error fetching vendor");
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
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
      return NextResponse.json({ error: "Lieferant nicht gefunden" }, { status: 404 });
    }

    const raw = await request.json();
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 }
      );
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
    return NextResponse.json({ error: "Fehler beim Aktualisieren" }, { status: 500 });
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
      return NextResponse.json({ error: "Lieferant nicht gefunden" }, { status: 404 });
    }

    await prisma.vendor.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting vendor");
    return NextResponse.json({ error: "Fehler beim Löschen" }, { status: 500 });
  }
}
