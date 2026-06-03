/**
 * PF-2: Portal-Download für Steuerunterlagen.
 * Wiederverwendet das Pattern von my-reports/[id]/download, aber filtert
 * über das Tags-Array statt Kategorie.
 */
import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/storage";
import { createAuditLog } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return apiError("FORBIDDEN", 401, { message: "Nicht autorisiert" });
    }
    const tenantId = session.user.tenantId;
    if (!tenantId) {
      return apiError("FORBIDDEN", 401, { message: "Mandant nicht gesetzt" });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const shouldRedirect = searchParams.get("redirect") === "true";
    const expiresInParam = searchParams.get("expiresIn");
    const expiresIn = expiresInParam ? parseInt(expiresInParam, 10) : 3600;
    const validExpiresIn = Math.min(Math.max(expiresIn, 60), 604800);

    const shareholder = await prisma.shareholder.findFirst({
      where: { userId: session.user.id, fund: { tenantId } },
    });
    if (!shareholder) {
      return apiError("FORBIDDEN", undefined, { message: "Kein Gesellschafter-Zugang" });
    }

    const shareholders = await prisma.shareholder.findMany({
      where: { personId: shareholder.personId, fund: { tenantId } },
      select: { id: true, fundId: true },
    });
    const fundIds = shareholders.map((s) => s.fundId);
    const shareholderIds = shareholders.map((s) => s.id);

    const document = await prisma.document.findFirst({
      where: {
        id,
        tenantId,
        isArchived: false,
        approvalStatus: "PUBLISHED",
        tags: { hasSome: TAX_TAGS },
        OR: [
          { fundId: { in: fundIds } },
          { shareholderId: { in: shareholderIds } },
        ],
      },
      select: {
        id: true,
        title: true,
        fileUrl: true,
        fileName: true,
        mimeType: true,
        fund: { select: { name: true } },
      },
    });
    if (!document || !document.fileUrl) {
      return apiError("NOT_FOUND", undefined, { message: "Dokument nicht gefunden" });
    }

    let signedUrl: string;
    try {
      signedUrl = await getSignedUrl(document.fileUrl, validExpiresIn);
    } catch (e) {
      logger.error({ err: e }, "tax-doc signed url failed");
      return apiError("INTERNAL_ERROR", undefined, { message: "Download nicht möglich" });
    }

    const docId = document.id;
    const docFileName = document.fileName;
    const docTitle = document.title;
    const fundName = document.fund?.name;
    after(async () => {
      await createAuditLog({
        action: "VIEW",
        entityType: "Document",
        entityId: docId,
        newValues: {
          action: "DOWNLOAD",
          portal: "shareholder",
          category: "TAX",
          fileName: docFileName,
          title: docTitle,
          fundName,
        },
      });
    });

    if (shouldRedirect) {
      return NextResponse.redirect(signedUrl);
    }
    return NextResponse.json({
      url: signedUrl,
      fileName: document.fileName,
      mimeType: document.mimeType,
      expiresIn: validExpiresIn,
    });
  } catch (error) {
    logger.error({ err: error }, "tax-doc download error");
    return apiError("CREATE_FAILED", undefined, { message: "Fehler beim Download" });
  }
}
