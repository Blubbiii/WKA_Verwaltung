/**
 * PF-2: Portal-API für Steuerunterlagen-Self-Service.
 *
 * Filtert Documents der Funds des aktuellen Shareholders über Tags:
 * - "tax", "steuer", "tax-certificate", "kapesta", "kapestbescheinigung",
 *   "steuerbescheinigung", "kapertragsteuer".
 *
 * Da die DocumentCategory-Enum kein TAX_CERTIFICATE-Value enthält, verwenden
 * wir das vorhandene `tags`-Array. Admins müssen Dokumente entsprechend taggen.
 *
 * Query-Params: ?year=YYYY (optional)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";

const TAX_TAGS = [
  "tax",
  "steuer",
  "steuerbescheinigung",
  "tax-certificate",
  "kapesta",
  "kapestbescheinigung",
  "kapertragsteuer",
  "kapitalertragsteuer",
];

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return apiError("FORBIDDEN", 401, { message: "Nicht autorisiert" });
    }
    const tenantId = session.user.tenantId;
    if (!tenantId) {
      return apiError("FORBIDDEN", 401, { message: "Mandant nicht gesetzt" });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : null;

    // Find shareholder + linked funds (tenant-scoped)
    const shareholder = await prisma.shareholder.findFirst({
      where: { userId: session.user.id, fund: { tenantId } },
    });
    if (!shareholder) {
      return NextResponse.json({ data: [], years: [] });
    }
    const shareholders = await prisma.shareholder.findMany({
      where: { personId: shareholder.personId, fund: { tenantId } },
      select: { id: true, fundId: true },
    });
    const fundIds = shareholders.map((s) => s.fundId);
    const shareholderIds = shareholders.map((s) => s.id);

    if (fundIds.length === 0) {
      return NextResponse.json({ data: [], years: [] });
    }

    // Year-Filter über createdAt (pragmatisch — keine separate "year"-Spalte)
    const yearFilter = year
      ? {
          createdAt: {
            gte: new Date(`${year}-01-01T00:00:00Z`),
            lt: new Date(`${year + 1}-01-01T00:00:00Z`),
          },
        }
      : {};

    const documents = await prisma.document.findMany({
      where: {
        tenantId,
        approvalStatus: "PUBLISHED",
        isArchived: false,
        // Tag-based filter (case-insensitive simulation via prisma hasSome)
        tags: { hasSome: TAX_TAGS },
        OR: [
          { fundId: { in: fundIds } },
          { shareholderId: { in: shareholderIds } },
        ],
        ...yearFilter,
      },
      include: {
        fund: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Determine available years (Distinct createdAt-Years für alle Tax-Docs)
    const yearDocs = await prisma.document.findMany({
      where: {
        tenantId,
        approvalStatus: "PUBLISHED",
        isArchived: false,
        tags: { hasSome: TAX_TAGS },
        OR: [
          { fundId: { in: fundIds } },
          { shareholderId: { in: shareholderIds } },
        ],
      },
      select: { createdAt: true },
    });
    const years = Array.from(new Set(yearDocs.map((d) => d.createdAt.getFullYear()))).sort(
      (a, b) => b - a
    );

    return NextResponse.json({
      data: documents.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        category: d.category,
        tags: d.tags,
        fileName: d.fileName,
        fileSize: d.fileSizeBytes ? Number(d.fileSizeBytes) : 0,
        mimeType: d.mimeType,
        fund: d.fund,
        year: d.createdAt.getFullYear(),
        createdAt: d.createdAt.toISOString(),
      })),
      years,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching tax documents");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden" });
  }
}
