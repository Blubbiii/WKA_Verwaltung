import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const proxyUpdateSchema = z.object({
  isActive: z.boolean().optional(),
  validUntil: z.string().datetime().optional().nullable(),
  documentUrl: z.string().url().optional().nullable(),
});

// GET /api/proxies/[id] - Einzelne Vollmacht
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.VOTES_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const proxy = await prisma.voteProxy.findFirst({
      where: {
        id,
        grantor: {
          fund: {
            tenantId: check.tenantId,
          },
        },
      },
      include: {
        grantor: {
          include: {
            person: true,
            fund: true,
          },
        },
        grantee: {
          include: {
            person: true,
          },
        },
        vote: true,
      },
    });

    if (!proxy) {
      return NextResponse.json(
        { error: "Vollmacht nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: proxy.id,
      grantor: {
        id: proxy.grantor.id,
        shareholderNumber: proxy.grantor.shareholderNumber,
        name:
          proxy.grantor.person.companyName ||
          [proxy.grantor.person.firstName, proxy.grantor.person.lastName]
            .filter(Boolean)
            .join(" "),
        person: proxy.grantor.person,
      },
      grantee: {
        id: proxy.grantee.id,
        shareholderNumber: proxy.grantee.shareholderNumber,
        name:
          proxy.grantee.person.companyName ||
          [proxy.grantee.person.firstName, proxy.grantee.person.lastName]
            .filter(Boolean)
            .join(" "),
        person: proxy.grantee.person,
      },
      vote: proxy.vote,
      fund: proxy.grantor.fund,
      isGeneralProxy: !proxy.voteId,
      validFrom: proxy.validFrom.toISOString(),
      validUntil: proxy.validUntil?.toISOString() || null,
      isActive: proxy.isActive,
      documentUrl: proxy.documentUrl,
      createdAt: proxy.createdAt.toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching proxy");
    return NextResponse.json(
      { error: "Fehler beim Laden der Vollmacht" },
      { status: 500 }
    );
  }
}

// PUT /api/proxies/[id] - Vollmacht aktualisieren (z.B. widerrufen)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.VOTES_MANAGE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const existingProxy = await prisma.voteProxy.findFirst({
      where: {
        id,
        grantor: {
          fund: {
            tenantId: check.tenantId,
          },
        },
      },
    });

    if (!existingProxy) {
      return NextResponse.json(
        { error: "Vollmacht nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = proxyUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungueltige Eingabedaten", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { isActive, validUntil, documentUrl } = parsed.data;

    const proxy = await prisma.voteProxy.update({
      where: { id },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(validUntil !== undefined && {
          validUntil: validUntil ? new Date(validUntil) : null,
        }),
        ...(documentUrl !== undefined && { documentUrl }),
      },
    });

    return NextResponse.json(proxy);
  } catch (error) {
    logger.error({ err: error }, "Error updating proxy");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Vollmacht" },
      { status: 500 }
    );
  }
}

// DELETE /api/proxies/[id] - Vollmacht löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.VOTES_MANAGE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const existingProxy = await prisma.voteProxy.findFirst({
      where: {
        id,
        grantor: {
          fund: {
            tenantId: check.tenantId,
          },
        },
      },
    });

    if (!existingProxy) {
      return NextResponse.json(
        { error: "Vollmacht nicht gefunden" },
        { status: 404 }
      );
    }

    await prisma.voteProxy.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting proxy");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Vollmacht" },
      { status: 500 }
    );
  }
}
