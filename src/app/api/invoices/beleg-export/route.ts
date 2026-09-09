/**
 * Belegexport für den Steuerberater.
 *
 * GET /api/invoices/beleg-export?von=YYYY-MM-DD&bis=YYYY-MM-DD
 *
 * Liefert ein ZIP mit den PDFs aller versendeten Ausgangsrechnungen und
 * Gutschriften des Zeitraums plus einem Verzeichnis im CSV-Format.
 *
 * Ersetzt das Hochladen von Hand in DATEV Unternehmen online. Warum das so
 * gebaut ist und was bewusst NICHT passiert, steht in
 * `lib/invoices/beleg-export.ts`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import {
  erzeugeBelegExport,
  KeineBelegeError,
  ZuVieleBelegeError,
} from "@/lib/invoices/beleg-export";

/**
 * Obergrenze des Zeitraums.
 *
 * Der Export erzeugt je Beleg ein PDF, und das dauert. Ein Jahr auf einmal
 * liefe in die Zeitüberschreitung der Antwort — und der Nutzer säße vor einer
 * Seite, die sich dreht, ohne zu wissen warum. Ein Quartal deckt den üblichen
 * Fall (monatliche Übergabe) mit Reserve ab.
 */
const MAX_TAGE = 100;

/**
 * Ein Kalendertag, der es auch wirklich gibt.
 *
 * Die blosse Schreibweise zu pruefen genuegt nicht: `2026-02-31` passt auf das
 * Muster, und JavaScript rechnet es klaglos in den 3. Maerz um. Der Nutzer
 * bekaeme dann einen anderen Zeitraum als den angeforderten — ohne Hinweis.
 * Deshalb wird zurueckgerechnet und verglichen.
 */
const kalendertag = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format muss YYYY-MM-DD sein")
  .refine((v) => new Date(`${v}T00:00:00.000Z`).toISOString().slice(0, 10) === v, {
    message: "Diesen Tag gibt es nicht",
  });

const abfrage = z.object({ von: kalendertag, bis: kalendertag });

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const geprueft = abfrage.safeParse({
      von: searchParams.get("von"),
      bis: searchParams.get("bis"),
    });
    if (!geprueft.success) {
      return apiError("VALIDATION_FAILED", undefined, {
        message: "Zeitraum fehlt oder ist unvollständig",
        details: geprueft.error.flatten(),
      });
    }

    const { von, bis } = geprueft.data;

    if (von > bis) {
      return apiError("VALIDATION_FAILED", undefined, {
        message: "Der Zeitraum beginnt nach seinem Ende",
      });
    }

    const tage =
      Math.round(
        (Date.parse(`${bis}T00:00:00.000Z`) - Date.parse(`${von}T00:00:00.000Z`)) /
          86_400_000,
      ) + 1;
    if (tage > MAX_TAGE) {
      return apiError("VALIDATION_FAILED", undefined, {
        message:
          `Der Zeitraum umfasst ${tage} Tage. Möglich sind ${MAX_TAGE} — ` +
          `bitte monats- oder quartalsweise exportieren.`,
      });
    }

    if (!check.tenantId) {
      // Das `!` waere hier nur eine Behauptung. Ohne Mandanten duerfte der
      // Filter fehlen — und dann lieferte der Export fremde Belege aus.
      return apiError("BAD_REQUEST", undefined, { message: "Kein Mandant zugeordnet" });
    }

    const ergebnis = await erzeugeBelegExport({
      tenantId: check.tenantId,
      von,
      bis,
    });

    logger.info(
      {
        tenantId: check.tenantId,
        userId: check.userId,
        von,
        bis,
        gesamt: ergebnis.gesamt,
        mitPdf: ergebnis.mitPdf,
        fehlgeschlagen: ergebnis.fehlgeschlagen.length,
      },
      "Belegexport erstellt",
    );

    return new NextResponse(ergebnis.zip as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${ergebnis.dateiname}"`,
        "Content-Length": String(ergebnis.zip.length),
        /*
          Zwei Zahlen, nicht eine: "Gesamt" sind die Zeilen im Verzeichnis,
          "MitPdf" die tatsaechlich beigelegten Dateien. Eine einzelne Zahl
          liesse offen, welche von beiden gemeint ist — und genau daran
          scheitert die Frage "ist die Lieferung vollstaendig".
        */
        "X-Belege-Gesamt": String(ergebnis.gesamt),
        "X-Belege-MitPdf": String(ergebnis.mitPdf),
        "X-Belege-Fehlgeschlagen": String(ergebnis.fehlgeschlagen.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof KeineBelegeError) {
      return apiError("NOT_FOUND", undefined, { message: error.message });
    }
    if (error instanceof ZuVieleBelegeError) {
      return apiError("VALIDATION_FAILED", undefined, { message: error.message });
    }
    return handleApiError(error, "Fehler beim Erstellen des Belegexports");
  }
}
