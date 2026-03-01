import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  taxId: z.string().max(50).optional().nullable(),
  vatId: z.string().max(50).optional().nullable(),
  iban: z.string().max(34).optional().nullable(),
  bic: z.string().max(11).optional().nullable(),
  email: z.string().email().optional().nullable(),
  street: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().default("DE"),
  notes: z.string().optional().nullable(),
  personId: z.string().uuid().optional().nullable(),
});

async function checkInbox(tenantId: string) {
  if (!await getConfigBoolean("inbox.enabled", tenantId, false)) {
    return NextResponse.json({ error: "Inbox nicht aktiviert" }, { status: 404 });
  }
  return null;
}

// GET /api/vendors
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("vendors:read");
    if (!check.authorized) return check.error;
    const guard = await checkInbox(check.tenantId!);
    if (guard) return guard;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));

    const where = {
      tenantId: check.tenantId!,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [vendors, total] = await Promise.all([
      prisma.vendor.findMany({
        where,
        include: {
          person: { select: { id: true, firstName: true, lastName: true, companyName: true } },
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.vendor.count({ where }),
    ]);

    return NextResponse.json({ data: serializePrisma(vendors), total, page, limit });
  } catch (error) {
    logger.error({ err: error }, "Error fetching vendors");
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }
}

// POST /api/vendors
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("vendors:write");
    if (!check.authorized) return check.error;
    const guard = await checkInbox(check.tenantId!);
    if (guard) return guard;

    const raw = await request.json();
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const vendor = await prisma.vendor.create({
      data: {
        tenantId: check.tenantId!,
        name: d.name,
        taxId: d.taxId,
        vatId: d.vatId,
        iban: d.iban,
        bic: d.bic,
        email: d.email,
        street: d.street,
        postalCode: d.postalCode,
        city: d.city,
        country: d.country,
        notes: d.notes,
        personId: d.personId,
      },
      include: {
        person: { select: { id: true, firstName: true, lastName: true, companyName: true } },
      },
    });

    return NextResponse.json(serializePrisma(vendor), { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating vendor");
    return NextResponse.json({ error: "Fehler beim Erstellen" }, { status: 500 });
  }
}
