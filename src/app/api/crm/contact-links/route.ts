import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, ContactRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { apiError } from "@/lib/api-errors";

const ENTITY_TYPES = ["PARK", "FUND", "LEASE", "CONTRACT"] as const;

const contactLinkSchema = z.object({
  personId: z.uuid(),
  role: z.enum([
    "VERPAECHTER",
    "NETZBETREIBER",
    "GUTACHTER",
    "BETRIEBSFUEHRER",
    "VERSICHERUNG",
    "RECHTSANWALT",
    "STEUERBERATER",
    "DIENSTLEISTER",
    "BEHOERDE",
    "SONSTIGES",
  ]),
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.uuid(),
  notes: z.string().max(1000).optional().nullable(),
  isPrimary: z.boolean().optional().default(false),
  validFrom: z.iso.datetime().optional().nullable(),
  validTo: z.iso.datetime().optional().nullable(),
});

// GET /api/crm/contact-links?personId=...&entityType=...&entityId=...
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;
    if (!(await getConfigBoolean("crm.enabled", check.tenantId, false)))
      return apiError("FEATURE_DISABLED", 404, { message: "CRM nicht aktiviert" });

    const { searchParams } = new URL(request.url);
    const personId = searchParams.get("personId");
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");

    const where: Prisma.ContactLinkWhereInput = { tenantId: check.tenantId! };
    if (personId) where.personId = personId;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const links = await prisma.contactLink.findMany({
      where,
      include: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            email: true,
          },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(serializePrisma(links));
  } catch (error) {
    logger.error({ err: error }, "Error fetching contact links");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Verknüpfungen" });
  }
}

// POST /api/crm/contact-links
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("crm:create");
    if (!check.authorized) return check.error;
    if (!(await getConfigBoolean("crm.enabled", check.tenantId, false)))
      return apiError("FEATURE_DISABLED", 404, { message: "CRM nicht aktiviert" });

    const raw = await request.json();
    const parsed = contactLinkSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", undefined, { message: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" });
    }
    const d = parsed.data;

    // Verify person belongs to tenant
    const person = await prisma.person.findFirst({
      where: { id: d.personId, tenantId: check.tenantId! },
      select: { id: true },
    });
    if (!person) {
      return apiError("NOT_FOUND", undefined, { message: "Person nicht gefunden" });
    }

    // Verify target entity belongs to tenant (tenant-scoping for ContactLinks
    // is manual because the relation is polymorphic)
    const entityExists = await verifyEntity(
      d.entityType,
      d.entityId,
      check.tenantId!,
    );
    if (!entityExists) {
      return apiError("NOT_FOUND", undefined, { message: `${d.entityType} nicht gefunden` });
    }

    try {
      const link = await prisma.contactLink.create({
        data: {
          tenantId: check.tenantId!,
          personId: d.personId,
          role: d.role as ContactRole,
          entityType: d.entityType,
          entityId: d.entityId,
          notes: d.notes ?? null,
          isPrimary: d.isPrimary ?? false,
          validFrom: d.validFrom ? new Date(d.validFrom) : null,
          validTo: d.validTo ? new Date(d.validTo) : null,
        },
      });
      logger.info(
        { tenantId: check.tenantId, linkId: link.id },
        "ContactLink created",
      );
      return NextResponse.json(serializePrisma(link), { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return apiError("ALREADY_EXISTS", undefined, { message: "Diese Verknüpfung existiert bereits" });
      }
      throw err;
    }
  } catch (error) {
    logger.error({ err: error }, "Error creating contact link");
    return apiError("CREATE_FAILED", undefined, { message: "Fehler beim Erstellen der Verknüpfung" });
  }
}

async function verifyEntity(
  entityType: string,
  entityId: string,
  tenantId: string,
): Promise<boolean> {
  switch (entityType) {
    case "PARK": {
      const r = await prisma.park.findFirst({
        where: { id: entityId, tenantId },
        select: { id: true },
      });
      return !!r;
    }
    case "FUND": {
      const r = await prisma.fund.findFirst({
        where: { id: entityId, tenantId },
        select: { id: true },
      });
      return !!r;
    }
    case "LEASE": {
      const r = await prisma.lease.findFirst({
        where: { id: entityId, tenantId, deletedAt: null },
        select: { id: true },
      });
      return !!r;
    }
    case "CONTRACT": {
      const r = await prisma.contract.findFirst({
        where: { id: entityId, tenantId, deletedAt: null },
        select: { id: true },
      });
      return !!r;
    }
    default:
      return false;
  }
}
