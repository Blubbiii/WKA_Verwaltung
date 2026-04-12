import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { SEARCH_LIMIT } from "@/lib/config/pagination";

// GET /api/vendors/search?q=...
// Returns combined results: existing vendors + persons (for new vendor creation from person)
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("vendors:read");
    if (!check.authorized) return check.error;
    if (!await getConfigBoolean("inbox.enabled", check.tenantId!, false)) {
      return apiError("FEATURE_DISABLED", 404, { message: "Inbox nicht aktiviert" });
    }

    const q = new URL(request.url).searchParams.get("q") ?? "";
    const limit = SEARCH_LIMIT;

    const [vendors, persons] = await Promise.all([
      prisma.vendor.findMany({
        where: {
          tenantId: check.tenantId!,
          deletedAt: null,
          name: { contains: q, mode: "insensitive" },
        },
        select: { id: true, name: true, iban: true, bic: true, email: true },
        orderBy: { name: "asc" },
        take: limit,
      }),
      prisma.person.findMany({
        where: {
          tenantId: check.tenantId!,
          status: "ACTIVE",
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { companyName: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyName: true,
          bankIban: true,
          bankBic: true,
          email: true,
          vendorProfiles: { where: { deletedAt: null }, select: { id: true } },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: limit,
      }),
    ]);

    const vendorResults = vendors.map((v) => ({
      type: "vendor" as const,
      id: v.id,
      name: v.name,
      iban: v.iban,
      bic: v.bic,
      email: v.email,
    }));

    const personResults = persons.map((p) => ({
      type: "person" as const,
      id: p.id,
      name: [p.companyName, p.firstName, p.lastName].filter(Boolean).join(" "),
      iban: p.bankIban,
      bic: p.bankBic,
      email: p.email,
      existingVendorId: p.vendorProfiles[0]?.id ?? null,
    }));

    return NextResponse.json(serializePrisma({ vendors: vendorResults, persons: personResults }));
  } catch (error) {
    logger.error({ err: error }, "Error searching vendors");
    return apiError("INTERNAL_ERROR", 500, { message: "Fehler bei der Suche" });
  }
}
