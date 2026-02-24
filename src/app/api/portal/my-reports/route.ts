import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

/**
 * GET /api/portal/my-reports
 *
 * Gibt alle Berichte zurück, auf die der angemeldete Gesellschafter Zugriff hat.
 * Berichte können dem Gesellschafter direkt zugeordnet sein (shareholderId)
 * oder zu einer Gesellschaft gehoeren, an der der Gesellschafter beteiligt ist (fundId).
 *
 * Query Parameters:
 * - year: Filter nach Berichtsjahr (z.B. 2026)
 * - type: Filter nach Berichtstyp (MONTHLY, QUARTERLY, ANNUAL, STATEMENT)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const typeParam = searchParams.get("type");

    // Find the shareholder linked to this user
    const shareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
    });

    if (!shareholder) {
      return NextResponse.json({ data: [], years: [], types: [] });
    }

    // Find all shareholders for the same person (user might have multiple participations)
    const shareholders = await prisma.shareholder.findMany({
      where: {
        personId: shareholder.personId,
      },
      include: {
        fund: {
          select: { id: true, name: true },
        },
      },
    });

    const fundIds = shareholders.map((sh) => sh.fund.id);
    const shareholderIds = shareholders.map((sh) => sh.id);

    if (fundIds.length === 0) {
      return NextResponse.json({ data: [], years: [], types: [] });
    }

    // Report-relevant document categories
    const reportCategories = ["REPORT"];

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const whereClause: any = {
      OR: [
        // Fund-level reports
        {
          fundId: { in: fundIds },
          category: { in: reportCategories },
          isArchived: false,
        },
        // Personal shareholder reports/statements
        {
          shareholderId: { in: shareholderIds },
          category: { in: reportCategories },
          isArchived: false,
        },
      ],
    };

    // Apply year filter if provided
    // We filter by the createdAt year since we don't have a dedicated reportYear field
    // In a production system, you might want to add reportYear/reportMonth fields to Document
    if (yearParam) {
      const year = parseInt(yearParam, 10);
      if (!isNaN(year)) {
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year + 1, 0, 1);
        whereClause.createdAt = {
          gte: startOfYear,
          lt: endOfYear,
        };
      }
    }

    // Fetch reports
    const documents = await prisma.document.findMany({
      where: whereClause,
      include: {
        fund: {
          select: {
            id: true,
            name: true,
          },
        },
        uploadedBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    // Parse report type and period from title or tags
    // In a production system, these would be dedicated fields
    function parseReportType(doc: typeof documents[0]): string | null {
      const title = doc.title.toLowerCase();
      const tags = doc.tags || [];

      if (
        tags.includes("MONTHLY") ||
        title.includes("monatsbericht") ||
        title.includes("monthly")
      ) {
        return "MONTHLY";
      }
      if (
        tags.includes("QUARTERLY") ||
        title.includes("quartalsbericht") ||
        title.includes("quarterly")
      ) {
        return "QUARTERLY";
      }
      if (
        tags.includes("ANNUAL") ||
        title.includes("jahresbericht") ||
        title.includes("annual")
      ) {
        return "ANNUAL";
      }
      if (
        tags.includes("STATEMENT") ||
        title.includes("kontoauszug") ||
        title.includes("statement") ||
        title.includes("abrechnung")
      ) {
        return "STATEMENT";
      }
      return null;
    }

    function parseReportPeriod(
      doc: typeof documents[0]
    ): { month: number | null; year: number } {
      const createdAt = new Date(doc.createdAt);
      const title = doc.title.toLowerCase();

      // Try to extract month from title (e.g., "Monatsbericht Januar 2026")
      const monthNames = [
        "januar",
        "februar",
        "maerz",
        "april",
        "mai",
        "juni",
        "juli",
        "august",
        "september",
        "oktober",
        "november",
        "dezember",
      ];

      for (let i = 0; i < monthNames.length; i++) {
        if (title.includes(monthNames[i])) {
          return { month: i + 1, year: createdAt.getFullYear() };
        }
      }

      // Try numeric month pattern (e.g., "01/2026" or "2026-01")
      const monthYearMatch = title.match(/(\d{1,2})[\/-](\d{4})/);
      if (monthYearMatch) {
        const month = parseInt(monthYearMatch[1], 10);
        const year = parseInt(monthYearMatch[2], 10);
        if (month >= 1 && month <= 12) {
          return { month, year };
        }
      }

      // Try year-month pattern (e.g., "2026-01")
      const yearMonthMatch = title.match(/(\d{4})[\/-](\d{1,2})/);
      if (yearMonthMatch) {
        const year = parseInt(yearMonthMatch[1], 10);
        const month = parseInt(yearMonthMatch[2], 10);
        if (month >= 1 && month <= 12) {
          return { month, year };
        }
      }

      // Fallback to createdAt
      return { month: createdAt.getMonth() + 1, year: createdAt.getFullYear() };
    }

    // Filter by type if provided
    let filteredDocuments = documents;
    if (typeParam) {
      filteredDocuments = documents.filter((doc) => {
        const reportType = parseReportType(doc);
        return reportType === typeParam;
      });
    }

    // Transform to response format
    const data = filteredDocuments.map((doc) => {
      const reportType = parseReportType(doc);
      const period = parseReportPeriod(doc);

      return {
        id: doc.id,
        title: doc.title,
        description: doc.description,
        category: doc.category,
        reportType,
        reportMonth: period.month,
        reportYear: period.year,
        fileName: doc.fileName,
        fileSize: doc.fileSizeBytes ? Number(doc.fileSizeBytes) : 0,
        mimeType: doc.mimeType,
        fund: doc.fund,
        createdAt: doc.createdAt.toISOString(),
      };
    });

    // Get available years for filter dropdown
    const allYears = new Set<number>();
    documents.forEach((doc) => {
      allYears.add(new Date(doc.createdAt).getFullYear());
    });

    // Get available report types
    const allTypes = new Set<string>();
    documents.forEach((doc) => {
      const type = parseReportType(doc);
      if (type) allTypes.add(type);
    });

    return NextResponse.json({
      data,
      years: Array.from(allYears).sort((a, b) => b - a),
      types: Array.from(allTypes),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching reports");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
