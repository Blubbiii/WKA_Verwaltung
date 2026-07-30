/**
 * Vorgangsnummer für Störungsvorgänge.
 *
 * A1 (Audit 2026-07): Die Nummer wird in der Korrespondenz mit dem Hersteller
 * referenziert („zu unserem Vorgang ST-2026-0042"). Ohne sie lässt sich ein
 * Anspruch nicht sauber zuordnen.
 *
 * ## Warum das NICHT die Rechnungsnummern-Maschinerie benutzt
 *
 * `getNextInvoiceNumberInTx` hält eine eigene Sequenztabelle und ist auf
 * GoBD-Lückenlosigkeit ausgelegt — der Sequenzzähler wird bei einem Rollback
 * mit zurückgedreht, damit keine Lücke entsteht. Für einen Störungsvorgang
 * gibt es diese Pflicht nicht: eine Lücke in den Vorgangsnummern hat keinerlei
 * rechtliche Folge.
 *
 * Deshalb hier der einfachere Weg: höchste Nummer des Jahres suchen, eins
 * darauf. Der Unique-Index `(tenantId, caseNumber)` fängt den seltenen Fall ab,
 * dass zwei Anwender im selben Moment anlegen — dann schlägt der zweite fehl
 * und wird wiederholt. Das ist ehrlicher als eine Sequenztabelle, die eine
 * Garantie vorspiegelt, die hier niemand braucht.
 */

/**
 * Der Transaktionsclient wird aus dem Prisma-Singleton abgeleitet statt aus
 * `Prisma.TransactionClient`: der Client traegt Erweiterungen, und die beiden
 * Typen sind dadurch nicht deckungsgleich.
 */
import type { prisma } from "@/lib/prisma";

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const PREFIX = "ST";
const DIGITS = 4;

/** Wie oft bei einer Nummernkollision erneut versucht wird. */
export const CASE_NUMBER_RETRIES = 3;

/**
 * Nächste freie Nummer für das Jahr von `reference`.
 *
 * Läuft innerhalb der übergebenen Transaktion, damit Suche und Insert
 * zusammengehören.
 */
export async function nextCaseNumber(
  tx: TxClient,
  tenantId: string,
  reference: Date,
): Promise<string> {
  const year = reference.getFullYear();
  const prefix = `${PREFIX}-${year}-`;

  const latest = await tx.faultCase.findFirst({
    where: { tenantId, caseNumber: { startsWith: prefix } },
    orderBy: { caseNumber: "desc" },
    select: { caseNumber: true },
  });

  // Absteigend sortiert stimmt nur bei fester Stellenzahl — deshalb padStart
  // unten. Ohne das käme "ST-2026-9" vor "ST-2026-10".
  const lastNumber = latest ? Number.parseInt(latest.caseNumber.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;

  return `${prefix}${String(next).padStart(DIGITS, "0")}`;
}

/** Erkennt die Kollision am Unique-Index, damit der Aufrufer wiederholen kann. */
export function isCaseNumberConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
