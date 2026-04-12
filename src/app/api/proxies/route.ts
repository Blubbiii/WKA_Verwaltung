import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const proxyCreateSchema = z.object({
  grantorId: z.string().min(1, "Vollmachtgeber ist erforderlich"),
  granteeId: z.string().min(1, "Vollmachtnehmer ist erforderlich"),
  voteId: z.string().optional().nullable(), // null = Generalvollmacht
  validFrom: z.string(),
  validUntil: z.string().optional().nullable(),
  documentUrl: z.string().optional().nullable(),
});

// GET /api/proxies - Liste aller Vollmachten
export async function GET(request: NextRequest) {
  try {
const check = await requirePermission(PERMISSIONS.VOTES_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const fundId = searchParams.get("fundId");
    const voteId = searchParams.get("voteId");
    const isActive = searchParams.get("isActive");

    // Build where clause - proxies are linked to shareholders which are linked to funds
    const proxies = await prisma.voteProxy.findMany({
      where: {
        ...(voteId && { voteId }),
        ...(isActive === "true" && { isActive: true }),
        ...(isActive === "false" && { isActive: false }),
        grantor: {
          fund: {
            tenantId: check.tenantId,
            ...(fundId && { id: fundId }),
          },
        },
      },
      include: {
        grantor: {
          include: {
            person: {
              select: {
                firstName: true,
                lastName: true,
                companyName: true,
              },
            },
            fund: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        grantee: {
          include: {
            person: {
              select: {
                firstName: true,
                lastName: true,
                companyName: true,
              },
            },
          },
        },
        vote: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      data: proxies.map((proxy) => ({
        id: proxy.id,
        grantor: {
          id: proxy.grantor.id,
          shareholderNumber: proxy.grantor.shareholderNumber,
          name:
            proxy.grantor.person.companyName ||
            [proxy.grantor.person.firstName, proxy.grantor.person.lastName]
              .filter(Boolean)
              .join(" "),
        },
        grantee: {
          id: proxy.grantee.id,
          shareholderNumber: proxy.grantee.shareholderNumber,
          name:
            proxy.grantee.person.companyName ||
            [proxy.grantee.person.firstName, proxy.grantee.person.lastName]
              .filter(Boolean)
              .join(" "),
        },
        vote: proxy.vote
          ? {
              id: proxy.vote.id,
              title: proxy.vote.title,
              status: proxy.vote.status,
            }
          : null,
        fund: proxy.grantor.fund,
        isGeneralProxy: !proxy.voteId,
        validFrom: proxy.validFrom.toISOString(),
        validUntil: proxy.validUntil?.toISOString() || null,
        isActive: proxy.isActive,
        documentUrl: proxy.documentUrl,
        createdAt: proxy.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching proxies");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Vollmachten" });
  }
}

// POST /api/proxies - Vollmacht erstellen
export async function POST(request: NextRequest) {
  try {
const check = await requirePermission(PERMISSIONS.VOTES_MANAGE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const validatedData = proxyCreateSchema.parse(body);

    // Verify grantor and grantee exist and belong to same fund in tenant
    const grantor = await prisma.shareholder.findFirst({
      where: {
        id: validatedData.grantorId,
        fund: { tenantId: check.tenantId },
      },
    });

    if (!grantor) {
      return apiError("NOT_FOUND", 404, { message: "Vollmachtgeber nicht gefunden" });
    }

    const grantee = await prisma.shareholder.findFirst({
      where: {
        id: validatedData.granteeId,
        fundId: grantor.fundId, // Must be same fund
      },
    });

    if (!grantee) {
      return apiError("NOT_FOUND", 404, { message: "Vollmachtnehmer nicht gefunden oder nicht in derselben Gesellschaft" });
    }

    if (validatedData.grantorId === validatedData.granteeId) {
      return apiError("OPERATION_NOT_ALLOWED", 400, { message: "Vollmachtgeber und -nehmer dürfen nicht identisch sein" });
    }

    // If vote-specific, verify vote exists
    if (validatedData.voteId) {
      const vote = await prisma.vote.findFirst({
        where: {
          id: validatedData.voteId,
          fundId: grantor.fundId,
          tenantId: check.tenantId,
        },
      });

      if (!vote) {
        return apiError("NOT_FOUND", 404, { message: "Abstimmung nicht gefunden" });
      }
    }

    // Check if there's already an active proxy for this grantor (for same vote or general)
    const existingProxy = await prisma.voteProxy.findFirst({
      where: {
        grantorId: validatedData.grantorId,
        isActive: true,
        ...(validatedData.voteId
          ? { voteId: validatedData.voteId }
          : { voteId: null }), // General proxy
      },
    });

    if (existingProxy) {
      return apiError("BAD_REQUEST", 400, { message: validatedData.voteId
            ? "Es existiert bereits eine aktive Vollmacht für diese Abstimmung"
            : "Es existiert bereits eine aktive Generalvollmacht" });
    }

    const proxy = await prisma.voteProxy.create({
      data: {
        grantorId: validatedData.grantorId,
        granteeId: validatedData.granteeId,
        voteId: validatedData.voteId || null,
        validFrom: new Date(validatedData.validFrom),
        validUntil: validatedData.validUntil
          ? new Date(validatedData.validUntil)
          : null,
        documentUrl: validatedData.documentUrl,
        isActive: true,
      },
      include: {
        grantor: {
          include: {
            person: true,
          },
        },
        grantee: {
          include: {
            person: true,
          },
        },
      },
    });

    return NextResponse.json(proxy, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_FAILED", 400, { message: "Validierungsfehler", details: error.issues });
    }
    logger.error({ err: error }, "Error creating proxy");
    return apiError("CREATE_FAILED", 500, { message: "Fehler beim Erstellen der Vollmacht" });
  }
}
