import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// Validation schema for creating a proxy
const createProxySchema = z.object({
  granteeId: z.string().uuid("Ungültige Vollmachtnehmer-ID"),
  type: z.enum(["GENERAL", "SINGLE"], {
    error: "Typ muss GENERAL oder SINGLE sein",
  }),
  voteId: z.string().uuid("Ungültige Abstimmungs-ID").optional(),
}).refine(
  (data) => {
    // If type is SINGLE, voteId must be provided
    if (data.type === "SINGLE" && !data.voteId) {
      return false;
    }
    return true;
  },
  {
    message: "Bei Einzelvollmacht muss eine Abstimmung angegeben werden",
    path: ["voteId"],
  }
);

// Helper to get shareholder name
function getShareholderName(shareholder: {
  person: {
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    personType: string;
  };
}): string {
  const person = shareholder.person;
  if (person.personType === "legal" && person.companyName) {
    return person.companyName;
  }
  return `${person.firstName || ""} ${person.lastName || ""}`.trim() || "Unbekannt";
}

// GET /api/portal/my-proxies - Get all proxies for the current user
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError("FORBIDDEN", 401, { message: "Nicht autorisiert" });
    }

    // Find the shareholder linked to this user
    const shareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
    });

    if (!shareholder) {
      return NextResponse.json({
        grantedProxies: [],
        receivedProxies: [],
        message: "Kein Gesellschafterprofil verknüpft",
      });
    }

    // Find all shareholders for the same person (user might have multiple fund participations)
    const shareholders = await prisma.shareholder.findMany({
      where: {
        personId: shareholder.personId,
        status: { not: "ARCHIVED" },
      },
      select: { id: true },
    });

    const shareholderIds = shareholders.map((sh) => sh.id);

    // Fetch proxies granted by the user (where user is grantor)
    const grantedProxies = await prisma.voteProxy.findMany({
      where: {
        grantorId: { in: shareholderIds },
      },
      include: {
        grantor: {
          include: {
            person: {
              select: {
                firstName: true,
                lastName: true,
                companyName: true,
                personType: true,
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
                personType: true,
              },
            },
          },
        },
        vote: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch proxies received by the user (where user is grantee)
    const receivedProxies = await prisma.voteProxy.findMany({
      where: {
        granteeId: { in: shareholderIds },
      },
      include: {
        grantor: {
          include: {
            person: {
              select: {
                firstName: true,
                lastName: true,
                companyName: true,
                personType: true,
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
                personType: true,
              },
            },
          },
        },
        vote: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Transform proxies to response format
    const transformProxy = (proxy: typeof grantedProxies[0]) => ({
      id: proxy.id,
      type: proxy.voteId ? "SINGLE" : "GENERAL",
      status: proxy.isActive && (!proxy.validUntil || new Date(proxy.validUntil) > new Date())
        ? "ACTIVE"
        : "REVOKED",
      grantor: {
        id: proxy.grantor.id,
        name: getShareholderName(proxy.grantor),
        email: "", // Email not exposed in portal for privacy
      },
      grantee: {
        id: proxy.grantee.id,
        name: getShareholderName(proxy.grantee),
        email: "", // Email not exposed in portal for privacy
      },
      vote: proxy.vote ? {
        id: proxy.vote.id,
        title: proxy.vote.title,
      } : null,
      fund: {
        id: proxy.grantor.fund.id,
        name: proxy.grantor.fund.name,
      },
      documentUrl: proxy.documentUrl,
      createdAt: proxy.createdAt.toISOString(),
      revokedAt: !proxy.isActive ? proxy.createdAt.toISOString() : null, // Use createdAt as fallback
      validFrom: proxy.validFrom.toISOString(),
      validUntil: proxy.validUntil?.toISOString() || null,
    });

    return NextResponse.json({
      granted: grantedProxies.map(transformProxy),
      received: receivedProxies.map(transformProxy),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching proxies");
    return apiError("INTERNAL_ERROR", undefined, { message: "Interner Serverfehler" });
  }
}

// POST /api/portal/my-proxies - Create a new proxy
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return apiError("FORBIDDEN", 401, { message: "Nicht autorisiert" });
    }

    const body = await request.json();

    // Validate input
    const parsed = createProxySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", undefined, { message: parsed.error.issues[0].message });
    }

    const { granteeId, type, voteId } = parsed.data;

    // Find the shareholder linked to this user (grantor)
    const grantorShareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
      include: {
        fund: true,
      },
    });

    if (!grantorShareholder) {
      return apiError("BAD_REQUEST", undefined, { message: "Kein Gesellschafterprofil verknüpft" });
    }

    // Validate: granteeId must be a different shareholder
    if (granteeId === grantorShareholder.id) {
      return apiError("BAD_REQUEST", undefined, { message: "Sie können sich keine Vollmacht selbst erteilen" });
    }

    // Find the grantee shareholder
    const granteeShareholder = await prisma.shareholder.findUnique({
      where: { id: granteeId },
      include: {
        fund: true,
        person: true,
      },
    });

    if (!granteeShareholder) {
      return apiError("NOT_FOUND", undefined, { message: "Vollmachtnehmer nicht gefunden" });
    }

    // Validate: grantee must be in the same fund as the grantor
    if (granteeShareholder.fundId !== grantorShareholder.fundId) {
      return apiError("BAD_REQUEST", undefined, { message: "Vollmachtnehmer muss in der gleichen Gesellschaft sein" });
    }

    // Validate: grantee must be active
    if (granteeShareholder.status === "ARCHIVED") {
      return apiError("BAD_REQUEST", undefined, { message: "Vollmachtnehmer ist nicht mehr aktiv" });
    }

    // Validate: grantee must be a different person (not just different shareholder record)
    if (granteeShareholder.personId === grantorShareholder.personId) {
      return apiError("BAD_REQUEST", undefined, { message: "Sie können sich keine Vollmacht selbst erteilen" });
    }

    // If SINGLE proxy, validate the vote
    let vote = null;
    if (type === "SINGLE" && voteId) {
      vote = await prisma.vote.findUnique({
        where: { id: voteId },
      });

      if (!vote) {
        return apiError("NOT_FOUND", undefined, { message: "Abstimmung nicht gefunden" });
      }

      // Vote must be for the same fund
      if (vote.fundId !== grantorShareholder.fundId) {
        return apiError("BAD_REQUEST", undefined, { message: "Abstimmung gehört nicht zu Ihrer Gesellschaft" });
      }

      // Vote must be active
      if (vote.status !== "ACTIVE" || new Date(vote.endDate) <= new Date()) {
        return apiError("BAD_REQUEST", undefined, { message: "Abstimmung ist nicht mehr aktiv" });
      }
    }

    // Check for existing active proxy (same grantor -> grantee, same type)
    const existingProxy = await prisma.voteProxy.findFirst({
      where: {
        grantorId: grantorShareholder.id,
        granteeId: granteeId,
        isActive: true,
        ...(type === "SINGLE" ? { voteId: voteId } : { voteId: null }),
        OR: [
          { validUntil: null },
          { validUntil: { gt: new Date() } },
        ],
      },
    });

    if (existingProxy) {
      return apiError("ALREADY_EXISTS", 400, { message: "Es existiert bereits eine aktive Vollmacht für diese Kombination" });
    }

    // Create the proxy
    const proxy = await prisma.voteProxy.create({
      data: {
        grantorId: grantorShareholder.id,
        granteeId: granteeId,
        voteId: type === "SINGLE" ? voteId : null,
        validFrom: new Date(),
        validUntil: type === "SINGLE" && vote ? vote.endDate : null,
        isActive: true,
      },
      include: {
        grantor: {
          include: {
            person: {
              select: {
                firstName: true,
                lastName: true,
                companyName: true,
                personType: true,
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
                personType: true,
              },
            },
          },
        },
        vote: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        proxy: {
          id: proxy.id,
          type: proxy.voteId ? "SINGLE" : "GENERAL",
          grantorName: getShareholderName(proxy.grantor),
          granteeName: getShareholderName(proxy.grantee),
          voteId: proxy.voteId,
          voteName: proxy.vote?.title || null,
          createdAt: proxy.createdAt.toISOString(),
          isActive: proxy.isActive,
          validFrom: proxy.validFrom.toISOString(),
          validUntil: proxy.validUntil?.toISOString() || null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ err: error }, "Error creating proxy");
    return apiError("INTERNAL_ERROR", undefined, { message: "Interner Serverfehler" });
  }
}
