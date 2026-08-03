/**
 * „Das braucht Ihre Aufmerksamkeit" — was heute zu tun ist.
 *
 * ## Warum es das gibt
 *
 * Das Dashboard zeigte elf Bestandszahlen: 93 Windparks, 237 Anlagen, ein
 * Gesellschafter, 250.000 € Fondskapital. Alles richtig, und nichts davon
 * beantwortet die Frage, mit der jemand morgens die Anwendung öffnet.
 *
 * Bestandszahlen ändern sich selten. Wer sie einmal kennt, öffnet die
 * Anwendung nicht ihretwegen. Was sich täglich ändert — eine Rechnung wird
 * überfällig, ein Vertrag läuft aus, ein Import ist gescheitert — stand
 * entweder gar nicht da oder gleichwertig zwischen den Beständen.
 *
 * ## Was hier NICHT hineingehört
 *
 * Alles, was nur ein Zustand ist. „93 Windparks" ist kein Handlungsbedarf.
 * Die Liste hier ist nur so lange etwas wert, wie jeder Eintrag darauf eine
 * Handlung nach sich zieht — sobald Selbstverständliches darin auftaucht,
 * liest sie niemand mehr.
 *
 * Deshalb gilt für jeden Punkt: **leer heisst, es ist nichts zu tun.** Ein
 * Eintrag „0 überfällige Rechnungen" wäre eine Zeile, die immer da ist und
 * nie etwas bedeutet.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";

/** Wie weit voraus ein auslaufender Vertrag als dringend gilt. */
const VORLAUF_TAGE = 90;

export interface Aufmerksamkeit {
  /** Kurzer Schlüssel — die Oberfläche wählt darüber ihr Symbol. */
  art: "invoices-overdue" | "contracts-expiring" | "imports-failed" | "votes-ending";
  /** Anzahl der betroffenen Vorgänge. */
  anzahl: number;
  /** Eine Zeile Klartext. Kein Fachbegriff, keine Abkürzung. */
  text: string;
  /** Wohin, um es zu erledigen. Führt bereits gefiltert auf die Liste. */
  href: string;
  /** `true` färbt den Eintrag als dringend. */
  dringend: boolean;
}

export async function GET(_request: NextRequest) {
  try {
    // Wie /api/dashboard/stats: nur Anmeldung, kein eigenes Recht. Wer das
    // Dashboard sehen darf, darf auch sehen, was darauf zu tun ist.
    const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const tenantId = check.tenantId;
    if (!tenantId) {
      return apiError("BAD_REQUEST", 400, { message: "Kein Mandant zugeordnet" });
    }
    const jetzt = new Date();
    const inVorlauf = new Date(jetzt.getTime() + VORLAUF_TAGE * 86_400_000);

    const [ueberfaellig, auslaufend, gescheiterteImporte, endendeAbstimmungen] =
      await Promise.all([
        // Versendet, faellig, nicht bezahlt.
        prisma.invoice.count({
          where: {
            tenantId,
            deletedAt: null,
            status: { in: ["SENT", "PARTIALLY_PAID"] },
            dueDate: { lt: jetzt },
          },
        }),

        // Laeuft in den naechsten 90 Tagen aus und ist noch aktiv.
        prisma.contract.count({
          where: {
            tenantId,
            deletedAt: null,
            status: "ACTIVE",
            endDate: { gte: jetzt, lte: inVorlauf },
          },
        }),

        // Gescheiterte SCADA-Importe der letzten Woche.
        //
        // Bewusst befristet: ein Fehlschlag von vor einem halben Jahr ist
        // Geschichte, kein Handlungsbedarf. Stuende er hier, waere die Liste
        // nach kurzer Zeit dauerhaft rot — und damit wertlos.
        prisma.scadaImportLog.count({
          where: {
            tenantId,
            status: "FAILED",
            startedAt: { gte: new Date(jetzt.getTime() - 7 * 86_400_000) },
          },
        }),

        // Laufende Abstimmungen, die in einer Woche enden.
        prisma.vote.count({
          where: {
            tenantId,
            status: "ACTIVE",
            endDate: { gte: jetzt, lte: new Date(jetzt.getTime() + 7 * 86_400_000) },
          },
        }),
      ]);

    const punkte: Aufmerksamkeit[] = [];

    if (ueberfaellig > 0) {
      punkte.push({
        art: "invoices-overdue",
        anzahl: ueberfaellig,
        text:
          ueberfaellig === 1
            ? "Eine Rechnung ist überfällig"
            : `${ueberfaellig} Rechnungen sind überfällig`,
        href: "/invoices?status=OVERDUE",
        dringend: true,
      });
    }

    if (gescheiterteImporte > 0) {
      punkte.push({
        art: "imports-failed",
        anzahl: gescheiterteImporte,
        text:
          gescheiterteImporte === 1
            ? "Ein SCADA-Import ist in den letzten sieben Tagen gescheitert"
            : `${gescheiterteImporte} SCADA-Importe sind in den letzten sieben Tagen gescheitert`,
        href: "/energy/scada-import",
        dringend: true,
      });
    }

    if (endendeAbstimmungen > 0) {
      punkte.push({
        art: "votes-ending",
        anzahl: endendeAbstimmungen,
        text:
          endendeAbstimmungen === 1
            ? "Eine Abstimmung endet in den nächsten sieben Tagen"
            : `${endendeAbstimmungen} Abstimmungen enden in den nächsten sieben Tagen`,
        href: "/votes",
        dringend: false,
      });
    }

    if (auslaufend > 0) {
      punkte.push({
        art: "contracts-expiring",
        anzahl: auslaufend,
        text:
          auslaufend === 1
            ? `Ein Vertrag läuft in den nächsten ${VORLAUF_TAGE} Tagen aus`
            : `${auslaufend} Verträge laufen in den nächsten ${VORLAUF_TAGE} Tagen aus`,
        href: "/contracts?expiring=90",
        dringend: false,
      });
    }

    return NextResponse.json({ data: punkte });
  } catch (error) {
    logger.error({ err: error }, "Error building attention list");
    return apiError("FETCH_FAILED", undefined, {
      message: "Die Übersicht konnte nicht geladen werden",
    });
  }
}
