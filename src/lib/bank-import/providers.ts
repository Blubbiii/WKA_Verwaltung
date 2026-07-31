/**
 * Abrufverfahren für Kontoauszüge.
 *
 * B7 (Audit 2026-07): „Parser sind da, der Import ist datei-basiert.
 * Täglicher automatischer Kontoabruf würde Zahlungsabgleich und Mahnlauf
 * vollständig automatisieren. … Ehrlich: der Datei-Import funktioniert — das
 * ist Komfort, kein Schmerz."
 *
 * ## Was hier steht und was nicht
 *
 * **FILE_DROP funktioniert vollständig.** Bank oder Dienstleister schicken den
 * Auszug an einen Endpunkt; der Abruf läuft ohne Zutun. Für jede Bank mit
 * geplantem SFTP- oder E-Mail-Export ist das der automatische Kontoabruf, den
 * der Bericht meint.
 *
 * **EBICS und FinTS sind NICHT implementiert.** Das ist keine Nachlässigkeit,
 * sondern die Sachlage:
 *
 * - EBICS verlangt Schlüsselmaterial nach A006/E002/X002, unterschriebene
 *   INI- und HIA-Briefe an die Bank und deren Freischaltung. Ohne diese
 *   Schritte — die ausserhalb jeder Software stattfinden — gibt es keinen
 *   Abruf.
 * - FinTS/HBCI verlangt eine Produktregistrierungsnummer der Deutschen
 *   Kreditwirtschaft. Ohne sie weisen die Banken den Zugriff ab.
 *
 * Beide Adapter melden das mit einem konkreten Hinweis, was zu tun ist. Sie
 * geben ausdrücklich KEINEN leeren Auszug zurück: ein Abruf, der „0 Umsätze"
 * meldet, sähe aus wie ein ruhiges Konto und wäre ein toter Zugang.
 */

export type ProviderName = "FILE_DROP" | "EBICS" | "FINTS";

export interface FetchedStatement {
  /** Inhalt des Auszugs — MT940 oder CAMT. */
  content: string;
  fileName: string;
}

export interface FetchContext {
  /** Entschlüsselte Zugangsdaten der Verbindung. */
  credentials: Record<string, unknown> | null;
  /** Auszug, der mitgeliefert wurde (FILE_DROP). */
  pushedStatement?: FetchedStatement;
}

/** Fehler, der dem Anwender gezeigt wird — mit dem nächsten Schritt darin. */
export class ProviderUnavailableError extends Error {
  readonly provider: ProviderName;
  readonly nextSteps: string[];

  constructor(provider: ProviderName, message: string, nextSteps: string[]) {
    super(message);
    this.name = "ProviderUnavailableError";
    this.provider = provider;
    this.nextSteps = nextSteps;
  }
}

export interface BankProvider {
  name: ProviderName;
  /** Läuft der Abruf ohne weitere Voraussetzungen? */
  readonly isOperational: boolean;
  fetchStatement(context: FetchContext): Promise<FetchedStatement>;
}

const fileDrop: BankProvider = {
  name: "FILE_DROP",
  isOperational: true,
  async fetchStatement(context) {
    if (!context.pushedStatement) {
      // Kein Auszug übermittelt. Das ist kein Fehler des Verfahrens, sondern
      // schlicht nichts zu tun — der Aufrufer wertet das als SKIPPED.
      throw new ProviderUnavailableError(
        "FILE_DROP",
        "Kein Auszug übermittelt.",
        [
          "Dieses Verfahren wartet darauf, dass die Bank oder ein Dienstleister den Auszug an den Push-Endpunkt schickt.",
          "Der Abruf zieht selbst nichts — er nimmt entgegen.",
        ],
      );
    }
    return context.pushedStatement;
  },
};

const ebics: BankProvider = {
  name: "EBICS",
  isOperational: false,
  async fetchStatement() {
    throw new ProviderUnavailableError(
      "EBICS",
      "EBICS ist in dieser Installation nicht eingerichtet.",
      [
        "EBICS braucht eigenes Schlüsselmaterial (Signatur A006, Verschlüsselung E002, Authentifikation X002).",
        "Die INI- und HIA-Briefe müssen unterschrieben bei der Bank eingereicht und dort freigeschaltet werden.",
        "Bis dahin bleibt der datei-basierte Weg (FILE_DROP oder Upload von Hand) der funktionierende — er ist nicht schlechter, nur unbequemer.",
      ],
    );
  },
};

const fints: BankProvider = {
  name: "FINTS",
  isOperational: false,
  async fetchStatement() {
    throw new ProviderUnavailableError(
      "FINTS",
      "FinTS ist in dieser Installation nicht eingerichtet.",
      [
        "FinTS/HBCI verlangt eine Produktregistrierungsnummer der Deutschen Kreditwirtschaft; ohne sie weisen die Banken den Zugriff ab.",
        "Zusätzlich ist ein TAN-Verfahren zu hinterlegen und je Bank freizuschalten.",
        "Bis dahin bleibt der datei-basierte Weg (FILE_DROP oder Upload von Hand) der funktionierende.",
      ],
    );
  },
};

const PROVIDERS: Record<ProviderName, BankProvider> = {
  FILE_DROP: fileDrop,
  EBICS: ebics,
  FINTS: fints,
};

export function getProvider(name: ProviderName): BankProvider {
  return PROVIDERS[name];
}

/**
 * Ab wie vielen Fehlschlägen in Folge die Verbindung auf ERROR geht.
 *
 * Drei, nicht einer: ein einzelner Netzwerkfehler ist kein Grund, den
 * automatischen Abruf abzuschalten. Drei hintereinander sind kein Zufall mehr.
 */
export const FAILURE_THRESHOLD = 3;
