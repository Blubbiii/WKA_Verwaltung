import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { generateVoteResultPdf } from "@/lib/pdf/generators/voteResultPdf";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// GET /api/votes/[id]/export - PDF-Export für Abstimmungsergebnis
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.VOTES_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Vote laden und prüfen
    const vote = await prisma.vote.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (!vote) {
      return apiError("NOT_FOUND", undefined, { message: "Abstimmung nicht gefunden" });
    }

    // Nur CLOSED Abstimmungen können exportiert werden
    if (vote.status !== "CLOSED") {
      return apiError("BAD_REQUEST", undefined, { message: "PDF-Export ist nur für beendete Abstimmungen verfügbar" });
    }

    // Optional: showSignatureLine aus Query-Parameter
    const url = new URL(request.url);
    const showSignatureLine = url.searchParams.get("signature") !== "false";

    // PDF generieren
    const pdfBuffer = await generateVoteResultPdf(id, { showSignatureLine });

    // Dateiname generieren (sanitize title)
    const safeTitle = vote.title
      .replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 50);
    const filename = `Abstimmungsergebnis_${safeTitle}_${new Date().toISOString().split("T")[0]}.pdf`;

    // PDF als Download zurückgeben (Buffer zu Uint8Array konvertieren)
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
        // Cache-Control: Kein Caching für dynamische Dokumente
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating vote PDF");

    // Spezifische Fehlermeldungen
    if (error instanceof Error) {
      if (error.message.includes("nicht gefunden")) {
        return apiError("NOT_FOUND", undefined, { message: error.message });
      }
      if (error.message.includes("nur für abgeschlossene")) {
        return apiError("BAD_REQUEST", undefined, { message: error.message });
      }
    }

    return apiError("CREATE_FAILED", undefined, { message: "Fehler beim Generieren des PDFs" });
  }
}
