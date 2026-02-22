import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

// DELETE /api/portal/my-proxies/[id] - Revoke a proxy
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id: proxyId } = await params;

    if (!proxyId) {
      return NextResponse.json(
        { error: "Vollmacht-ID erforderlich" },
        { status: 400 }
      );
    }

    // Find the shareholder linked to this user
    const shareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
    });

    if (!shareholder) {
      return NextResponse.json(
        { error: "Kein Gesellschafterprofil verknüpft" },
        { status: 400 }
      );
    }

    // Find all shareholders for the same person
    const shareholders = await prisma.shareholder.findMany({
      where: {
        personId: shareholder.personId,
        status: { not: "ARCHIVED" },
      },
      select: { id: true },
    });

    const shareholderIds = shareholders.map((sh) => sh.id);

    // Find the proxy
    const proxy = await prisma.voteProxy.findUnique({
      where: { id: proxyId },
    });

    if (!proxy) {
      return NextResponse.json(
        { error: "Vollmacht nicht gefunden" },
        { status: 404 }
      );
    }

    // Check if the user is the grantor (only grantor can revoke)
    if (!shareholderIds.includes(proxy.grantorId)) {
      return NextResponse.json(
        { error: "Sie können nur Ihre eigenen Vollmachten widerrufen" },
        { status: 403 }
      );
    }

    // Check if already revoked
    if (!proxy.isActive) {
      return NextResponse.json(
        { error: "Vollmacht ist bereits widerrufen" },
        { status: 400 }
      );
    }

    // Revoke the proxy by setting isActive to false
    // Since the schema doesn't have revokedAt, we use isActive and validUntil
    const revokedProxy = await prisma.voteProxy.update({
      where: { id: proxyId },
      data: {
        isActive: false,
        validUntil: new Date(), // Set validUntil to now to mark revocation time
      },
    });

    return NextResponse.json({
      success: true,
      message: "Vollmacht erfolgreich widerrufen",
      proxy: {
        id: revokedProxy.id,
        isActive: revokedProxy.isActive,
        revokedAt: revokedProxy.validUntil?.toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error revoking proxy");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// GET /api/portal/my-proxies/[id] - Get a single proxy by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id: proxyId } = await params;

    if (!proxyId) {
      return NextResponse.json(
        { error: "Vollmacht-ID erforderlich" },
        { status: 400 }
      );
    }

    // Find the shareholder linked to this user
    const shareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
    });

    if (!shareholder) {
      return NextResponse.json(
        { error: "Kein Gesellschafterprofil verknüpft" },
        { status: 400 }
      );
    }

    // Find all shareholders for the same person
    const shareholders = await prisma.shareholder.findMany({
      where: {
        personId: shareholder.personId,
        status: { not: "ARCHIVED" },
      },
      select: { id: true },
    });

    const shareholderIds = shareholders.map((sh) => sh.id);

    // Find the proxy
    const proxy = await prisma.voteProxy.findUnique({
      where: { id: proxyId },
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

    if (!proxy) {
      return NextResponse.json(
        { error: "Vollmacht nicht gefunden" },
        { status: 404 }
      );
    }

    // Check if user is grantor or grantee
    const isGrantor = shareholderIds.includes(proxy.grantorId);
    const isGrantee = shareholderIds.includes(proxy.granteeId);

    if (!isGrantor && !isGrantee) {
      return NextResponse.json(
        { error: "Sie haben keinen Zugriff auf diese Vollmacht" },
        { status: 403 }
      );
    }

    // Helper to get shareholder name
    const getShareholderName = (sh: typeof proxy.grantor): string => {
      const person = sh.person;
      if (person.personType === "legal" && person.companyName) {
        return person.companyName;
      }
      return `${person.firstName || ""} ${person.lastName || ""}`.trim() || "Unbekannt";
    };

    return NextResponse.json({
      proxy: {
        id: proxy.id,
        type: proxy.voteId ? "SINGLE" : "GENERAL",
        grantorName: getShareholderName(proxy.grantor),
        granteeName: getShareholderName(proxy.grantee),
        voteId: proxy.voteId,
        voteName: proxy.vote?.title || null,
        createdAt: proxy.createdAt.toISOString(),
        isActive: proxy.isActive && (!proxy.validUntil || new Date(proxy.validUntil) > new Date()),
        validFrom: proxy.validFrom.toISOString(),
        validUntil: proxy.validUntil?.toISOString() || null,
        canRevoke: isGrantor && proxy.isActive,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching proxy");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
