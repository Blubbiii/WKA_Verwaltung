import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { parsePaginationParams } from "@/lib/api-utils";
import {
  labelFilterToWhere,
  loadLabelsForPersons,
} from "@/lib/crm/derived-labels";
import {
  findMatchingPerson,
  type PersonDedupInput,
} from "@/lib/crm/person-dedup";
import { apiError } from "@/lib/api-errors";

const createSchema = z
  .object({
    personType: z.enum(["natural", "legal"]).default("natural"),
    salutation: z.string().optional().nullable(),
    firstName: z.string().optional().nullable(),
    lastName: z.string().optional().nullable(),
    companyName: z.string().optional().nullable(),
    email: z.email().optional().nullable(),
    phone: z.string().optional().nullable(),
    mobile: z.string().optional().nullable(),
    street: z.string().optional().nullable(),
    houseNumber: z.string().optional().nullable(),
    postalCode: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    contactType: z.string().max(50).optional().nullable(),
    notes: z.string().optional().nullable(),
    /** If true, skip dedup check and create regardless. */
    force: z.boolean().optional(),
  })
  .refine((d) => d.firstName || d.lastName || d.companyName, {
    message: "Vor-/Nachname oder Firmenname erforderlich",
  });

// GET /api/crm/contacts — Persons with CRM fields + derived labels
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;
    if (!(await getConfigBoolean("crm.enabled", check.tenantId, false)))
      return apiError("FEATURE_DISABLED", 404, { message: "CRM nicht aktiviert" });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    // Multiple labels are AND-combined — a person must match all of them.
    const labelParam = searchParams.get("labels");
    const labels = labelParam
      ? labelParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const { page, limit, skip } = parsePaginationParams(searchParams, {
      defaultLimit: 50,
      maxLimit: 200,
    });

    const labelClauses = labelFilterToWhere(labels);

    const where: Prisma.PersonWhereInput = {
      tenantId: check.tenantId!,
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { companyName: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(labelClauses.length > 0 && { AND: labelClauses }),
    };

    const [persons, total] = await Promise.all([
      prisma.person.findMany({
        where,
        select: {
          id: true,
          personType: true,
          firstName: true,
          lastName: true,
          companyName: true,
          email: true,
          phone: true,
          mobile: true,
          street: true,
          houseNumber: true,
          postalCode: true,
          city: true,
          contactType: true,
          status: true,
          lastActivityAt: true,
          _count: {
            select: { crmActivities: { where: { deletedAt: null } } },
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip,
        take: limit,
      }),
      prisma.person.count({ where }),
    ]);

    // Enrich with label bundle (derived + custom + context numbers)
    const bundleMap = await loadLabelsForPersons(
      check.tenantId!,
      persons.map((p) => p.id),
    );

    const enriched = persons.map((p) => {
      const bundle = bundleMap.get(p.id);
      return {
        ...p,
        labels: bundle?.labels ?? [],
        context: bundle?.context ?? {
          activeLeaseCount: 0,
          activeShareholderCount: 0,
          totalYearlyRentEur: null,
          totalCapitalContributionEur: null,
        },
      };
    });

    return NextResponse.json(
      serializePrisma({
        data: enriched,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }),
    );
  } catch (error) {
    logger.error({ err: error }, "Error fetching CRM contacts");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Kontakte" });
  }
}

// POST /api/crm/contacts — Create new Person with dedup check
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("crm:create");
    if (!check.authorized) return check.error;
    if (!(await getConfigBoolean("crm.enabled", check.tenantId, false)))
      return apiError("FEATURE_DISABLED", 404, { message: "CRM nicht aktiviert" });

    const raw = await request.json();
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", undefined, { message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" });
    }

    const d = parsed.data;

    // Dedup check unless caller explicitly forces creation
    if (!d.force) {
      const dedupInput: PersonDedupInput = {
        personType: d.personType,
        firstName: d.firstName,
        lastName: d.lastName,
        companyName: d.companyName,
        street: d.street,
        houseNumber: d.houseNumber,
        postalCode: d.postalCode,
      };
      const existing = await findMatchingPerson(check.tenantId!, dedupInput);
      if (existing) {
        return apiError("ALREADY_EXISTS", 409, {
          message: "Ein Kontakt mit identischem Namen und Adresse existiert bereits",
          details: { existing },
        });
      }
    }

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
        street: d.street ?? null,
        houseNumber: d.houseNumber ?? null,
        postalCode: d.postalCode ?? null,
        city: d.city ?? null,
        contactType: d.contactType ?? null,
        notes: d.notes ?? null,
      },
    });

    logger.info(
      { tenantId: check.tenantId, personId: person.id },
      "CRM contact created",
    );
    return NextResponse.json(serializePrisma(person), { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error creating CRM contact");
    return apiError("CREATE_FAILED", undefined, { message: "Fehler beim Erstellen des Kontakts" });
  }
}
