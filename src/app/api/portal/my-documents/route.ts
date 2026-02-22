import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentCategory } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

// GET /api/portal/my-documents - Get all documents accessible to the current user
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    // Find the shareholder linked to this user
    const shareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
    });

    if (!shareholder) {
      return NextResponse.json({ data: [], categories: [] });
    }

    // Find all shareholders for the same person
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
      return NextResponse.json({ data: [], categories: [] });
    }

    // Find documents that are:
    // 1. Linked to funds the user is invested in (fund-level documents)
    // 2. Directly linked to the user's shareholders (personal documents)
    // We only show documents in certain categories that make sense for shareholders
    const shareholderCategories = ["REPORT", "PROTOCOL", "CORRESPONDENCE", "OTHER"];

    // Portal only shows PUBLISHED documents
    const documents = await prisma.document.findMany({
      where: {
        approvalStatus: "PUBLISHED",
        OR: [
          // Fund-level documents in certain categories
          {
            fundId: { in: fundIds },
            category: { in: shareholderCategories as DocumentCategory[] },
            isArchived: false,
          },
          // Personal shareholder documents
          {
            shareholderId: { in: shareholderIds },
            isArchived: false,
          },
        ],
        ...(category && { category: category as DocumentCategory }),
      },
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
      orderBy: { createdAt: "desc" },
    });

    // Get distinct categories for filtering (portal: only PUBLISHED)
    const allDocs = await prisma.document.findMany({
      where: {
        approvalStatus: "PUBLISHED",
        OR: [
          {
            fundId: { in: fundIds },
            category: { in: shareholderCategories as DocumentCategory[] },
            isArchived: false,
          },
          {
            shareholderId: { in: shareholderIds },
            isArchived: false,
          },
        ],
      },
      select: { category: true },
      distinct: ["category"],
    });

    return NextResponse.json({
      data: documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        description: doc.description,
        category: doc.category,
        fileName: doc.fileName,
        fileSize: doc.fileSizeBytes ? Number(doc.fileSizeBytes) : 0,
        mimeType: doc.mimeType,
        fund: doc.fund,
        uploadedBy: doc.uploadedBy
          ? [doc.uploadedBy.firstName, doc.uploadedBy.lastName]
              .filter(Boolean)
              .join(" ")
          : null,
        createdAt: doc.createdAt.toISOString(),
      })),
      categories: allDocs.map((c) => c.category),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching documents");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
