import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const createSchema = z.object({
  personType: z.enum(["natural", "legal"]).default("natural"),
  salutation: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  contactType: z.string().max(50).optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine(
  (d) => d.firstName || d.lastName || d.companyName,
  { message: "Vor-/Nachname oder Firmenname erforderlich" }
);

// GET /api/crm/contacts — Persons with CRM fields
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;
    if (!await getConfigBoolean("crm.enabled", check.tenantId, false))
      return NextResponse.json({ error: "CRM nicht aktiviert" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const contactType = searchParams.get("contactType");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
    const skip = (page - 1) * limit;

    const where = {
      tenantId: check.tenantId!,
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { companyName: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(contactType && { contactType }),
    };

    const [persons, total] = await Promise.all([
      prisma.person.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyName: true,
          email: true,
          phone: true,
          mobile: true,
          contactType: true,
          status: true,
          lastActivityAt: true,
          _count: { select: { crmActivities: { where: { deletedAt: null } } } },
          shareholders: {
            select: { fund: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip,
        take: limit,
      }),
      prisma.person.count({ where }),
    ]);

    return NextResponse.json(
      serializePrisma({
        data: persons,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      })
    );
  } catch (error) {
    logger.error({ err: error }, "Error fetching CRM contacts");
    return NextResponse.json({ error: "Fehler beim Laden der Kontakte" }, { status: 500 });
  }
}

// POST /api/crm/contacts — Create new Person
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("crm:create");
    if (!check.authorized) return check.error;
    if (!await getConfigBoolean("crm.enabled", check.tenantId, false))
      return NextResponse.json({ error: "CRM nicht aktiviert" }, { status: 404 });

    const raw = await request.json();
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const person = await prisma.person.create({
      data: {
        tenantId: check.tenantId!,
        personType: d.personType,
        salutation: d.salutation ?? null,
        firstName: d.firstName ?? null,
        lastName: d.lastName ?? null,
        companyName: d.companyName ?? null,
        email: d.email ?? null,
        phone: d.phone ?? null,
        mobile: d.mobile ?? null,
        contactType: d.contactType ?? null,
        notes: d.notes ?? null,
      },
    });

    logger.info({ tenantId: check.tenantId, personId: person.id }, "CRM contact created");
    return NextResponse.json(serializePrisma(person), { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating CRM contact");
    return NextResponse.json({ error: "Fehler beim Erstellen des Kontakts" }, { status: 500 });
  }
}
