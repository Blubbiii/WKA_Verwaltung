/**
 * Der Assistent muss nach denselben Daten fragen, mit denen gerechnet wird.
 *
 * ## Der Widerspruch, den das festhält
 *
 * Zwei Enden derselben Abrechnung, die sich nicht einig waren:
 *
 *  - `settlement-wizard.tsx` fragte `/api/energy/productions/for-settlement`
 *    **ohne** `status` ab. Der Endpunkt liefert dann **Entwürfe** (`DRAFT`).
 *    Davon hing die Freigabe von Schritt 1 ab.
 *  - `settlements/[id]/calculate` verwertet **ausschliesslich bestätigte**
 *    Daten und überspringt Entwürfe mit `UNCONFIRMED_PRODUCTION`.
 *
 * Daraus folgten zwei Fälle, und der zweite ist der schlimmere:
 *
 * | Datenlage | Schritt 1 | Berechnung |
 * |---|---|---|
 * | nur Entwürfe | öffnet | scheitert: „bitte zuerst bestätigen" |
 * | nur bestätigte | **bleibt gesperrt** | hätte funktioniert |
 *
 * Wer alles richtig gemacht und seine Produktionsdaten bestätigt hatte, kam
 * nicht weiter — und las „Keine Produktionsdaten, bitte zuerst importieren"
 * für Daten, die längst erfasst und bestätigt waren. Ein Nutzer, der dieser
 * Aufforderung folgt, importiert sie ein zweites Mal.
 *
 * ## Warum ein Quelltext-Test
 *
 * Der Widerspruch lebt zwischen zwei Dateien, die nichts voneinander wissen.
 * Genau wie bei der Beispieldatei des Netzbetreiber-Imports und beim
 * Aufräum-Präfix: zwei Stellen kodieren dieselbe Annahme, und niemand merkt,
 * wenn sie auseinanderlaufen. Ein Verhaltenstest bräuchte den vollen
 * Datenaufbau; diese Prüfung kostet nichts und greift sofort.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const WIZARD = "src/components/energy/settlement-wizard.tsx";
const CALCULATE = "src/app/api/energy/settlements/[id]/calculate/route.ts";
const ENDPOINT = "src/app/api/energy/productions/for-settlement/route.ts";

describe("Assistent und Berechnung meinen dieselben Produktionsdaten", () => {
  it("der Assistent fragt ausdruecklich nach bestaetigten Daten", () => {
    const quelle = readFileSync(WIZARD, "utf-8");
    expect(
      /set\("status",\s*"CONFIRMED"\)/.test(quelle),
      `${WIZARD} fragt den Produktionsstatus ohne "status=CONFIRMED" ab.\n\n` +
        `Der Endpunkt liefert dann Entwuerfe — die Berechnung verwertet aber ` +
        `nur bestaetigte Daten. Ein Park mit korrekt bestaetigten Daten kaeme ` +
        `damit nicht aus Schritt 1 heraus, mit der Meldung, es seien keine ` +
        `Daten vorhanden.`,
    ).toBe(true);
  });

  it("der Endpunkt liefert ohne Angabe weiterhin Entwuerfe", () => {
    // Die Gegenprobe zur Begruendung oben. Aendert jemand die Voreinstellung
    // auf CONFIRMED, ist der ausdrueckliche Parameter im Assistenten zwar
    // ueberfluessig, aber nicht falsch — die Begruendung in diesem Test
    // stimmte dann jedoch nicht mehr.
    const quelle = readFileSync(ENDPOINT, "utf-8");
    expect(
      /searchParams\.get\("status"\)\s*\|\|\s*"DRAFT"/.test(quelle),
      `${ENDPOINT} hat seine Voreinstellung geaendert. Dann gehoert dieser ` +
        `Test angepasst — und es lohnt sich zu pruefen, ob der ausdrueckliche ` +
        `Parameter im Assistenten noch stimmt.`,
    ).toBe(true);
  });

  it("die Berechnung ueberspringt Entwuerfe weiterhin", () => {
    // Der andere Pfeiler der Begruendung. Wuerde die Berechnung eines Tages
    // auch Entwuerfe verwerten, waere der ganze Widerspruch hinfaellig.
    const quelle = readFileSync(CALCULATE, "utf-8");
    expect(
      quelle.includes("UNCONFIRMED_PRODUCTION"),
      `${CALCULATE} kennt UNCONFIRMED_PRODUCTION nicht mehr. Verwertet die ` +
        `Berechnung jetzt auch Entwuerfe, darf der Assistent wieder danach ` +
        `fragen — dann gehoeren beide Stellen und dieser Test angepasst.`,
    ).toBe(true);
  });

  it("der Assistent unterscheidet 'keine Daten' von 'nicht bestaetigt'", () => {
    // Ohne diese Unterscheidung bekaeme ein Nutzer mit unbestaetigten Daten
    // die Aufforderung zu importieren — und importierte ein zweites Mal,
    // was nichts aendert.
    const quelle = readFileSync(WIZARD, "utf-8");
    expect(
      quelle.includes("turbinesWithDraftData"),
      `${WIZARD} unterscheidet nicht mehr zwischen "keine Produktionsdaten" ` +
        `und "Daten vorhanden, aber unbestaetigt". Das sind zwei Lagen mit ` +
        `zwei verschiedenen naechsten Schritten.`,
    ).toBe(true);
  });
});
