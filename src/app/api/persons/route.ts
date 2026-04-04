import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { handleApiError, parsePaginationParams } from "@/lib/api-utils";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const personCreateSchema = z.object({
  personType: z.enum(["natural", "legal"]).default("natural"),
  salutation: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  email: z.union([z.email(), z.literal(""), z.null()]).optional().nullable(),
  phone: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  houseNumber: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().default("Deutschland"),
  taxId: z.string().optional().nullable(),
  bankIban: z.string().optional().nullable(),
  bankBic: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

// GET /api/persons
export async function GET(request: NextRequest) {
  try {
const check = await requirePermission(PERMISSIONS.LEASES_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const personType = searchParams.get("personType");
    const status = searchParams.get("status") || "";
    const { page, limit, skip } = parsePaginationParams(searchParams, { defaultLimit: 50 });

    const where = {
      tenantId: check.tenantId,
      ...(personType && { personType }),
      ...(status && { status: status as "ACTIVE" | "INACTIVE" | "ARCHIVED" }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { companyName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [persons, total] = await Promise.all([
      prisma.person.findMany({
        where,
        include: {
          _count: {
            select: { shareholders: true, leases: true },
          },
        },
        orderBy: [
          { lastName: "asc" },
          { firstName: "asc" },
          { companyName: "asc" },
        ],
        skip,
        take: limit,
      }),
      prisma.person.count({ where }),
    ]);

    return NextResponse.json({
      data: persons,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching persons");
    return NextResponse.json(
      { error: "Fehler beim Laden der Personen" },
      { status: 500 }
    );
  }
}

// POST /api/persons
export async function POST(request: NextRequest) {
  try {
const check = await requirePermission(PERMISSIONS.LEASES_CREATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = personCreateSchema.parse(body);

    // Validierung: Name erforderlich
    if (validatedData.personType === "natural") {
      if (!validatedData.lastName) {
        return NextResponse.json(
          { error: "Nachname ist erforderlich" },
          { status: 400 }
        );
      }
    } else {
      if (!validatedData.companyName) {
        return NextResponse.json(
          { error: "Firmenname ist erforderlich" },
          { status: 400 }
        );
      }
    }

    const person = await prisma.person.create({
      data: {
        ...validatedData,
        email: validatedData.email || null,
        tenantId: check.tenantId!,
      },
    });

    return NextResponse.json(person, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Erstellen der Person");
  }
}
