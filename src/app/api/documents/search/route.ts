import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

/**
 * GET /api/documents/search
 *
 * Volltext-Suche über Dokumente mit Filtermoeglichkeiten.
 *
 * Query Parameters:
 * - q: Suchbegriff (required, min 2 chars)
 * - category: Dokumentkategorie (optional)
 * - parkId: Filter nach Park (optional)
 * - fundId: Filter nach Gesellschaft (optional)
 * - contractId: Filter nach Vertrag (optional)
 * - limit: Anzahl Ergebnisse (default: 20, max: 100)
 * - offset: Pagination Offset (default: 0)
 * - sortBy: Sortierung - "relevance" | "date" | "title" (default: relevance)
 * - sortOrder: "asc" | "desc" (default: desc)
 */
export async function GET(request: NextRequest) {
  try {
    // Berechtigungsprüfung
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return NextResponse.json(
        { error: "Kein Mandant zugeordnet" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const query = searchParams.get("q")?.trim() || "";
    const category = searchParams.get("category");
    const parkId = searchParams.get("parkId");
    const fundId = searchParams.get("fundId");
    const contractId = searchParams.get("contractId");
    const turbineId = searchParams.get("turbineId");
    const includeArchived = searchParams.get("includeArchived") === "true";

    // Pagination
    const limitParam = parseInt(searchParams.get("limit") || "20", 10);
    const limit = Math.min(Math.max(limitParam, 1), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Sorting
    const sortBy = searchParams.get("sortBy") || "relevance";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    // Validiere Suchbegriff
    if (query.length < 2) {
      return NextResponse.json(
        { error: "Suchbegriff muss mindestens 2 Zeichen haben" },
        { status: 400 }
      );
    }

    // Escape special characters for LIKE query
    const escapedQuery = query.replace(/[%_\\]/g, "\\$&");
    const searchPattern = `%${escapedQuery}%`;

    // Build where clause
    const whereConditions: Prisma.DocumentWhereInput = {
      tenantId: check.tenantId,
      parentId: null, // Only show latest versions
      ...(!includeArchived && { isArchived: false }),
      ...(category && { category: category as Prisma.EnumDocumentCategoryFilter }),
      ...(parkId && { parkId }),
      ...(fundId && { fundId }),
      ...(contractId && { contractId }),
      ...(turbineId && { turbineId }),
      // Fulltext search across title, description, tags, fileName
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { fileName: { contains: query, mode: "insensitive" } },
        { tags: { hasSome: [query] } },
      ],
    };

    // Determine order by
    let orderBy: Prisma.DocumentOrderByWithRelationInput | Prisma.DocumentOrderByWithRelationInput[];

    switch (sortBy) {
      case "date":
        orderBy = { createdAt: sortOrder };
        break;
      case "title":
        orderBy = { title: sortOrder };
        break;
      case "relevance":
      default:
        // For relevance, we prioritize title matches, then description, then fileName
        // Since Prisma doesn't support scoring, we use createdAt as secondary sort
        orderBy = [
          { createdAt: "desc" as const },
        ];
        break;
    }

    // Execute search query
    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where: whereConditions,
        include: {
          park: {
            select: { id: true, name: true, shortName: true },
          },
          fund: {
            select: { id: true, name: true },
          },
          turbine: {
            select: { id: true, designation: true },
          },
          contract: {
            select: { id: true, title: true },
          },
          uploadedBy: {
            select: { firstName: true, lastName: true },
          },
        },
        orderBy,
        skip: offset,
        take: limit,
      }),
      prisma.document.count({ where: whereConditions }),
    ]);

    // Calculate relevance scores and highlight matches
    const results = documents.map((doc) => {
      const queryLower = query.toLowerCase();
      let relevanceScore = 0;
      const highlights: { field: string; snippet: string }[] = [];

      // Score and highlight title matches (highest priority)
      if (doc.title.toLowerCase().includes(queryLower)) {
        relevanceScore += 100;
        highlights.push({
          field: "title",
          snippet: highlightMatch(doc.title, query),
        });
      }

      // Score and highlight description matches
      if (doc.description?.toLowerCase().includes(queryLower)) {
        relevanceScore += 50;
        highlights.push({
          field: "description",
          snippet: highlightMatch(doc.description, query, 150),
        });
      }

      // Score and highlight fileName matches
      if (doc.fileName.toLowerCase().includes(queryLower)) {
        relevanceScore += 30;
        highlights.push({
          field: "fileName",
          snippet: highlightMatch(doc.fileName, query),
        });
      }

      // Score tag matches
      const matchingTags = doc.tags.filter((tag) =>
        tag.toLowerCase().includes(queryLower)
      );
      if (matchingTags.length > 0) {
        relevanceScore += 20 * matchingTags.length;
        highlights.push({
          field: "tags",
          snippet: matchingTags.join(", "),
        });
      }

      return {
        id: doc.id,
        title: doc.title,
        description: doc.description,
        category: doc.category,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        fileSizeBytes: doc.fileSizeBytes ? Number(doc.fileSizeBytes) : null,
        mimeType: doc.mimeType,
        version: doc.version,
        tags: doc.tags,
        isArchived: doc.isArchived,
        park: doc.park,
        fund: doc.fund,
        turbine: doc.turbine,
        contract: doc.contract,
        uploadedBy: doc.uploadedBy
          ? [doc.uploadedBy.firstName, doc.uploadedBy.lastName]
              .filter(Boolean)
              .join(" ")
          : null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        // Search-specific fields
        relevanceScore,
        highlights,
      };
    });

    // Sort by relevance score if sortBy is "relevance"
    if (sortBy === "relevance") {
      results.sort((a, b) => {
        if (sortOrder === "desc") {
          return b.relevanceScore - a.relevanceScore;
        }
        return a.relevanceScore - b.relevanceScore;
      });
    }

    return NextResponse.json({
      data: results,
      query,
      pagination: {
        limit,
        offset,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
      },
      filters: {
        category,
        parkId,
        fundId,
        contractId,
        turbineId,
        includeArchived,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error searching documents");
    return NextResponse.json(
      { error: "Fehler bei der Dokumentensuche" },
      { status: 500 }
    );
  }
}

/**
 * Highlights matching text by wrapping it in <mark> tags
 * and truncates long text around the match
 */
function highlightMatch(
  text: string,
  query: string,
  maxLength?: number
): string {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const matchIndex = textLower.indexOf(queryLower);

  if (matchIndex === -1) return text;

  // If maxLength is specified and text is longer, truncate around match
  if (maxLength && text.length > maxLength) {
    const contextBefore = 30;
    const contextAfter = maxLength - query.length - contextBefore;

    let start = Math.max(0, matchIndex - contextBefore);
    let end = Math.min(text.length, matchIndex + query.length + contextAfter);

    let snippet = text.substring(start, end);

    // Add ellipsis if truncated
    if (start > 0) snippet = "..." + snippet;
    if (end < text.length) snippet = snippet + "...";

    // Re-find match in truncated text
    const truncatedMatchIndex = snippet.toLowerCase().indexOf(queryLower);
    if (truncatedMatchIndex !== -1) {
      return (
        snippet.substring(0, truncatedMatchIndex) +
        "<mark>" +
        snippet.substring(truncatedMatchIndex, truncatedMatchIndex + query.length) +
        "</mark>" +
        snippet.substring(truncatedMatchIndex + query.length)
      );
    }
    return snippet;
  }

  // Simple highlight without truncation
  return (
    text.substring(0, matchIndex) +
    "<mark>" +
    text.substring(matchIndex, matchIndex + query.length) +
    "</mark>" +
    text.substring(matchIndex + query.length)
  );
}
