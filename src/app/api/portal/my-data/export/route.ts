import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// GET /api/portal/my-data/export — DSGVO Art. 15 Datenauskunft
// Returns all personal data associated with the authenticated user as JSON download
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError("FORBIDDEN", 401, { message: "Nicht autorisiert" });
    }

    const userId = session.user.id;

    // Fetch user account data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return apiError("NOT_FOUND", undefined, { message: "Benutzer nicht gefunden" });
    }

    // Fetch shareholder + person data
    const shareholder = await prisma.shareholder.findUnique({
      where: { userId },
      include: {
        person: {
          select: {
            id: true,
            personType: true,
            salutation: true,
            firstName: true,
            lastName: true,
            companyName: true,
            email: true,
            phone: true,
            street: true,
            postalCode: true,
            city: true,
            country: true,
            bankName: true,
            bankIban: true,
            bankBic: true,
            taxId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    // Fetch distribution items for this shareholder
    const distributionItems = shareholder
      ? await prisma.distributionItem.findMany({
          where: { shareholderId: shareholder.id },
          select: {
            id: true,
            amount: true,
            percentage: true,
            createdAt: true,
            distribution: {
              select: {
                id: true,
                distributionNumber: true,
                totalAmount: true,
                distributionDate: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    // Fetch votes cast by this shareholder
    const votes = shareholder
      ? await prisma.voteResponse.findMany({
          where: { shareholderId: shareholder.id },
          select: {
            id: true,
            selectedOption: true,
            votedAt: true,
            vote: {
              select: {
                id: true,
                title: true,
                status: true,
              },
            },
          },
          orderBy: { votedAt: "desc" },
        })
      : [];

    // Fetch documents shared with user
    const documents = shareholder
      ? await prisma.document.findMany({
          where: {
            OR: [
              { uploadedById: userId },
              { shareholderId: shareholder.id },
            ],
          },
          select: {
            id: true,
            title: true,
            category: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    // Fetch audit log entries for this user
    const auditLogs = await prisma.auditLog.findMany({
      where: { userId },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500, // Limit to prevent massive exports
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      requestedBy: user.email,
      note: "Datenauskunft gemaess Art. 15 DSGVO",
      account: user,
      person: shareholder?.person ?? null,
      shareholder: shareholder
        ? {
            id: shareholder.id,
            shareholderNumber: shareholder.shareholderNumber,
            ownershipPercentage: shareholder.ownershipPercentage,
            status: shareholder.status,
            entryDate: shareholder.entryDate,
          }
        : null,
      distributionItems,
      votes,
      documents,
      auditLogs,
    };

    // Return as downloadable JSON
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="datenauskunft-${user.id}-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error exporting user data (Art. 15)");
    return apiError("INTERNAL_ERROR", undefined, { message: "Interner Serverfehler" });
  }
}
