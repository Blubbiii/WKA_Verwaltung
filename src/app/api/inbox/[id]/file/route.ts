/**
 * GET /api/inbox/[id]/file
 *
 * Liefert die hochgeladene Datei einer Eingangsrechnung aus dem Storage.
 *
 * Bedienaufwand #6 (Audit 2026-07): Die Detailseite hatte einen
 * "Öffnen"-Button auf `/api/documents/file?url=…` — DIESE ROUTE EXISTIERT
 * NICHT. Der Button lieferte also einen 404; aufgefallen beim Einbauen der
 * PDF-Vorschau, nicht im Auditbericht.
 *
 * Bewusst NICHT über die Document-Route gelöst: eine IncomingInvoice ist kein
 * Document, hat eine eigene Tenant-Bindung und ein eigenes Recht (inbox:read).
 * Die alte URL hätte zudem einen beliebigen Storage-Key als Query-Parameter
 * entgegengenommen — die ID-basierte Form kann nur Dateien ausliefern, die zum
 * Mandanten des Aufrufers gehören.
 *
 * `Content-Disposition: inline`, damit die Datei im <object> der Detailseite
 * angezeigt und nicht heruntergeladen wird.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { getFileBuffer } from "@/lib/storage";
import { CACHE_TTL } from "@/lib/cache/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("inbox:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const invoice = await prisma.incomingInvoice.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        fileUrl: true,
        fileName: true,
        mimeType: true,
      },
    });

    if (!invoice) {
      return apiError("NOT_FOUND", 404, { message: "Eingangsrechnung nicht gefunden" });
    }

    // Mandantenbindung: ohne diese Pruefung koennte jeder Nutzer mit
    // inbox:read die Belege fremder Mandanten lesen.
    if (invoice.tenantId !== check.tenantId) {
      return apiError("TENANT_MISMATCH", 403, { message: "Keine Berechtigung" });
    }

    if (!invoice.fileUrl) {
      return apiError("NOT_FOUND", 404, { message: "Keine Datei hinterlegt" });
    }

    let buffer: Buffer;
    try {
      buffer = await getFileBuffer(invoice.fileUrl);
    } catch (err) {
      logger.error(
        { err, invoiceId: id, key: invoice.fileUrl },
        "[Inbox] Datei konnte nicht aus dem Storage geladen werden",
      );
      return apiError("STORAGE_FAILED", 502, {
        message: "Datei konnte nicht geladen werden",
      });
    }

    const mimeType = invoice.mimeType || "application/octet-stream";

    // Gleiche Absicherung wie in /api/documents/[id]/content: ein inline
    // ausgeliefertes SVG kann Skripte in unserer Origin ausfuehren. Der Upload
    // akzeptiert Bilder, also ist der Fall erreichbar.
    const isSvg = mimeType.toLowerCase() === "image/svg+xml";
    const disposition = isSvg ? "attachment" : "inline";

    const headers = new Headers();
    headers.set("Content-Type", mimeType);
    headers.set("Content-Length", String(buffer.length));
    headers.set(
      "Content-Disposition",
      `${disposition}; filename="${encodeURIComponent(invoice.fileName)}"`,
    );
    // Private: der Beleg darf nicht in einem geteilten Proxy-Cache landen.
    headers.set("Cache-Control", `private, max-age=${CACHE_TTL.LONG}`);
    headers.set("X-Content-Type-Options", "nosniff");

    return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
  } catch (error) {
    logger.error({ err: error }, "[Inbox] Fehler beim Ausliefern der Datei");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Datei" });
  }
}
