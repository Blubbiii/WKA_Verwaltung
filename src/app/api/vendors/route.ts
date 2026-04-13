import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { parsePaginationParams } from "@/lib/api-utils";
import { serializePrisma } from "@/lib/serialize";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  taxId: z.string().max(50).optional().nullable(),
  vatId: z.string().max(50).optional().nullable(),
  iban: z.string().max(34).optional().nullable(),
  bic: z.string().max(11).optional().nullable(),
  email: z.email().optional().nullable(),
  street: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().default("DE"),
  notes: z.string().optional().nullable(),
  personId: z.uuid().optional().nullable(),
});

async function checkInbox(tenantId: string) {
  if (!await getConfigBoolean("inbox.enabled", tenantId, false)) {
    return apiError("FEATURE_DISABLED", 404, { message: "Inbox nicht aktiviert" });
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
    const { page, limit, skip } = parsePaginationParams(searchParams, { defaultLimit: 50 });

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
        skip,
        take: limit,
      }),
      prisma.vendor.count({ where }),
    ]);

    return NextResponse.json({
      data: serializePrisma(vendors),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching vendors");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden" });
  }
}

// POST /api/vendors
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("vendors:create");
    if (!check.authorized) return check.error;
    const guard = await checkInbox(check.tenantId!);
    if (guard) return guard;

    const raw = await request.json();
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, { message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" });
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
    return apiError("CREATE_FAILED", 500, { message: "Fehler beim Erstellen" });
  }
}
