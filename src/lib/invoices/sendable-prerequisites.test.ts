/**
 * Was der Rechnungsversand verlangt, muss sich auch eintragen lassen.
 *
 * ## Der Fehler, den das festhält
 *
 * `assertSendable()` verlangt nach § 14 UStG die eigene Steuernummer oder
 * USt-IdNr. des Mandanten. Beide Felder wurden im Programm an sieben Stellen
 * **gelesen** — Rechnungsversand, XRechnung, e-Bilanz, ZM-Meldung,
 * Eingangsrechnungs-Freigabe, Einrichtungsstand, Datenexport — und an
 * **keiner einzigen geschrieben**.
 *
 * Die Ersteinrichtung fragte sie ab. Sie fragte auch nach Bank, IBAN und BIC.
 * Alle fünf Felder wurden eingesammelt, in keiner Anfrage mitgeschickt und
 * mit „Firmendaten gespeichert" quittiert.
 *
 * Die Folge war ein Sackgassen-Zustand, aus dem die Oberfläche keinen Ausweg
 * bot: jeder Rechnungsversand scheiterte mit „Eigene Steuernummer oder
 * USt-IdNr. fehlt" — für eine Angabe, die der Nutzer gemacht und deren
 * Speicherung ihm bestätigt worden war. **Kein einziger Rechnungsversand war
 * möglich.**
 *
 * Im Assistenten stand als Begründung, das erfordere Superadmin-Rechte. Das
 * stimmte nicht: die Route lässt einen Admin ausdrücklich den eigenen
 * Mandanten ändern. Es fehlten schlicht die Felder im Schema.
 *
 * Gefunden am 02.08.2026 beim Schreiben von `sepa-wizard.spec.ts` — der Test
 * wollte das Naheliegendste tun, was dieses Programm kann: eine Rechnung
 * versenden.
 *
 * ## Warum ein Quelltext-Test
 *
 * Ein Verhaltenstest bräuchte einen Mandanten ohne Steuernummer und würde
 * damit genau den Zustand herstellen, der hier nie wieder entstehen soll.
 * Diese Prüfung greift sofort und kostet nichts.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ROUTE = "src/app/api/admin/tenants/[id]/route.ts";
const WIZARD = "src/components/admin/tenant-onboarding-wizard.tsx";
const VALIDATOR = "src/lib/invoices/assert-sendable.ts";

/** Felder, die die Ersteinrichtung abfragt und die ankommen müssen. */
const FELDER = ["taxId", "vatId", "bankName", "iban", "bic"] as const;

describe("Mandanten-Stammdaten lassen sich speichern", () => {
  it("der Versand verlangt weiterhin Steuernummer oder USt-IdNr.", () => {
    // Der Grund fuer alles Folgende. Faellt die Pflicht weg, ist dieser Test
    // nicht falsch, aber seine Begruendung stimmt nicht mehr.
    const quelle = readFileSync(VALIDATOR, "utf-8");
    expect(
      quelle.includes("taxId") && quelle.includes("vatId"),
      `${VALIDATOR} prueft die eigene Steuernummer nicht mehr. Dann gehoert ` +
        `dieser Test angepasst.`,
    ).toBe(true);
  });

  for (const feld of FELDER) {
    it(`die Route nimmt "${feld}" entgegen`, () => {
      const quelle = readFileSync(ROUTE, "utf-8");

      // Zweierlei: im Schema erlaubt UND beim Schreiben beruecksichtigt. Nur
      // eines von beidem ist die schlimmere Variante — die Anfrage wird
      // angenommen und der Wert trotzdem verworfen.
      expect(
        new RegExp(`${feld}:\\s*z\\.`).test(quelle),
        `${ROUTE}: "${feld}" fehlt im Schema. Die Ersteinrichtung fragt es ab.`,
      ).toBe(true);
      expect(
        new RegExp(`validatedData\\.${feld}`).test(quelle),
        `${ROUTE}: "${feld}" steht im Schema, wird aber nicht geschrieben. ` +
          `Die Anfrage wird angenommen und der Wert stillschweigend verworfen.`,
      ).toBe(true);
    });

    it(`die Ersteinrichtung schickt "${feld}" mit`, () => {
      const quelle = readFileSync(WIZARD, "utf-8");
      expect(
        new RegExp(`${feld}:\\s*company\\.${feld}`).test(quelle),
        `${WIZARD}: "${feld}" wird abgefragt, aber nicht mitgeschickt.\n\n` +
          `Genau so ist der Fehler entstanden: fuenf Felder eingesammelt, ` +
          `keines verschickt, und trotzdem "gespeichert" gemeldet. Wer die ` +
          `Steuernummer eintraegt und die Bestaetigung liest, kann danach ` +
          `keine einzige Rechnung versenden — und hat keinen Grund, den ` +
          `Fehler bei sich zu suchen.`,
      ).toBe(true);
    });
  }

  it("die Erfolgsmeldung kommt nicht vor dem Speichern", () => {
    // Die eigentliche Lehre. Eine Erfolgsmeldung, die auch dann erscheint,
    // wenn nichts uebertragen wurde, ist schlimmer als gar keine: sie nimmt
    // dem Nutzer den Anlass nachzusehen.
    const quelle = readFileSync(WIZARD, "utf-8");
    const speichern = quelle.indexOf("handleSaveCompany");
    const abschnitt = quelle.slice(speichern, speichern + 2500);

    const anfrage = abschnitt.indexOf("await fetch(");
    const meldung = abschnitt.indexOf('toast.success(t("companySaved")');

    expect(anfrage, "In handleSaveCompany steht keine Anfrage mehr").toBeGreaterThan(-1);
    expect(meldung, "Die Erfolgsmeldung ist verschwunden").toBeGreaterThan(-1);
    expect(
      anfrage < meldung,
      `${WIZARD}: "Firmendaten gespeichert" wird gemeldet, bevor gespeichert ` +
        `wurde.`,
    ).toBe(true);
  });
});
