import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

// GET /api/crm/contacts — Persons with CRM fields
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;

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
