import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

// Validation schema for creating a proxy
const createProxySchema = z.object({
  granteeId: z.string().uuid("Ungültige Vollmachtnehmer-ID"),
  type: z.enum(["GENERAL", "SINGLE"], {
    errorMap: () => ({ message: "Typ muss GENERAL oder SINGLE sein" }),
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
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
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
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// POST /api/portal/my-proxies - Create a new proxy
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const body = await request.json();

    // Validate input
    const parsed = createProxySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Kein Gesellschafterprofil verknüpft" },
        { status: 400 }
      );
    }

    // Validate: granteeId must be a different shareholder
    if (granteeId === grantorShareholder.id) {
      return NextResponse.json(
        { error: "Sie können sich keine Vollmacht selbst erteilen" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Vollmachtnehmer nicht gefunden" },
        { status: 404 }
      );
    }

    // Validate: grantee must be in the same fund as the grantor
    if (granteeShareholder.fundId !== grantorShareholder.fundId) {
      return NextResponse.json(
        { error: "Vollmachtnehmer muss in der gleichen Gesellschaft sein" },
        { status: 400 }
      );
    }

    // Validate: grantee must be active
    if (granteeShareholder.status === "ARCHIVED") {
      return NextResponse.json(
        { error: "Vollmachtnehmer ist nicht mehr aktiv" },
        { status: 400 }
      );
    }

    // Validate: grantee must be a different person (not just different shareholder record)
    if (granteeShareholder.personId === grantorShareholder.personId) {
      return NextResponse.json(
        { error: "Sie können sich keine Vollmacht selbst erteilen" },
        { status: 400 }
      );
    }

    // If SINGLE proxy, validate the vote
    let vote = null;
    if (type === "SINGLE" && voteId) {
      vote = await prisma.vote.findUnique({
        where: { id: voteId },
      });

      if (!vote) {
        return NextResponse.json(
          { error: "Abstimmung nicht gefunden" },
          { status: 404 }
        );
      }

      // Vote must be for the same fund
      if (vote.fundId !== grantorShareholder.fundId) {
        return NextResponse.json(
          { error: "Abstimmung gehört nicht zu Ihrer Gesellschaft" },
          { status: 400 }
        );
      }

      // Vote must be active
      if (vote.status !== "ACTIVE" || new Date(vote.endDate) <= new Date()) {
        return NextResponse.json(
          { error: "Abstimmung ist nicht mehr aktiv" },
          { status: 400 }
        );
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
      return NextResponse.json(
        { error: "Es existiert bereits eine aktive Vollmacht für diese Kombination" },
        { status: 400 }
      );
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
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
