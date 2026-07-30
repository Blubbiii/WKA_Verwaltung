/**
 * Bedienaufwand Tier 4 (Audit 2026-07), zweiter Teil: #18 und #19.
 *
 *  #18 87 rohe `<Input type="date">`, kein einziges Preset, keine
 *      DateRangePicker-Komponente. In der Buchhaltung ist der Zeitraum der
 *      Haupteinstieg jeder Auswertung.
 *  #19 159 Dateien nutzen Radix-`Select` — nur Erst-Buchstaben-Typeahead,
 *      kein Suchfeld. Bei 200 Flurstücken heisst das scrollen.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

function src(relativePath: string): string {
  return read(join("src", relativePath));
}

function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// #18 · Zeitraum-Schnellauswahl
// ---------------------------------------------------------------------------

describe("Zeitraum mit Schnellauswahl (#18)", () => {
  const picker = src("components/ui/date-range-picker.tsx");

  it("es gibt die sechs gebraeuchlichen Zeitraeume", () => {
    for (const preset of [
      "thisMonth",
      "lastMonth",
      "thisQuarter",
      "lastQuarter",
      "thisYear",
      "lastYear",
    ]) {
      expect(picker, preset).toContain(`"${preset}"`);
    }
  });

  it("die Zeitraeume werden beim Klick berechnet, nicht beim Laden", () => {
    // Sonst zeigt eine ueber Mitternacht offene Seite den Vortag an.
    expect(picker).toContain("rangeFor(key, new Date())");
  });

  it("das ISO-Datum entsteht lokal, nicht ueber toISOString", () => {
    // toISOString rechnet nach UTC um — in Europe/Berlin waere der 1. eines
    // Monats dann der 31. des Vormonats.
    expect(codeOnly(picker)).not.toContain("toISOString()");
    expect(picker).toContain("date.getFullYear()");
  });

  it("ein umgedrehter Zeitraum laesst sich nicht eingeben", () => {
    // "von 2026 bis 2025" liefert stumm eine leere Auswertung.
    expect(picker).toContain("max={value.to || undefined}");
    expect(picker).toContain("min={value.from || undefined}");
  });

  it("das erste Quartal rollt korrekt ins Vorjahr", () => {
    // new Date(jahr, -3, 1) ist gueltig — keine Sonderbehandlung noetig,
    // aber der Test haelt fest, dass darauf gebaut wird.
    expect(picker).toContain("Math.floor(month / 3) * 3 - 3");
  });

  it("kein Preset unterstellt stillschweigend ein Kalender-Geschaeftsjahr", () => {
    // fiscalYearEnd haengt am Fonds, nicht am Mandanten. Ein Preset
    // "laufendes Geschaeftsjahr" waere bei abweichendem Geschaeftsjahr
    // unsichtbar falsch.
    expect(codeOnly(picker)).not.toContain("fiscalYear");
    expect(picker).toContain("laufendes Geschäftsjahr");
  });

  const ROLLED_OUT = [
    "app/(dashboard)/buchhaltung/kontoblatt/page.tsx",
    "app/(dashboard)/buchhaltung/abschluss/tabs/datev.tsx",
    "app/(dashboard)/buchhaltung/berichte/tabs/bwa.tsx",
    "app/(dashboard)/buchhaltung/berichte/tabs/euer.tsx",
    "app/(dashboard)/buchhaltung/berichte/tabs/guv.tsx",
    "app/(dashboard)/buchhaltung/berichte/tabs/susa.tsx",
    "app/(dashboard)/buchhaltung/datev-export/page.tsx",
    "app/(dashboard)/buchhaltung/gobd-export/page.tsx",
    "app/(dashboard)/buchhaltung/planung/tabs/kostenstellen.tsx",
    "app/(dashboard)/buchhaltung/steuern/tabs/ustva.tsx",
  ];

  for (const path of ROLLED_OUT) {
    it(`${path.split("/").slice(-2).join("/")} nutzt den Picker`, () => {
      const page = src(path);
      expect(page).toContain("<DateRangePicker");
      // Die beiden rohen Von/Bis-Felder sind weg.
      expect(page).not.toMatch(/type="date"\s+value=\{from\}/);
      expect(page).not.toMatch(/type="date"\s+value=\{to\}/);
    });
  }
});

// ---------------------------------------------------------------------------
// #19 · Auswahllisten mit Suchfeld
// ---------------------------------------------------------------------------

describe("Lange Auswahllisten sind durchsuchbar (#19)", () => {
  it("der Pacht-Assistent waehlt den Verpaechter ueber die Combobox", () => {
    // persons wird mit limit=500 geladen.
    const page = src("app/(dashboard)/leases/new/page.tsx");
    expect(page).toContain("<Combobox");
    // Der alte Select ist weg — auf die SelectItem-Zeile pruefen, nicht auf
    // "persons.map": das steht jetzt in den Combobox-Optionen.
    expect(codeOnly(page)).not.toContain("<SelectItem key={person.id}");
  });

  it("der Vertrags-Assistent ebenso", () => {
    const wizard = src("components/contracts/contract-wizard.tsx");
    expect(wizard).toContain("<Combobox");
    expect(codeOnly(wizard)).not.toContain("<SelectItem key={person.id}");
  });

  it("die Personenart bleibt sichtbar", () => {
    // Das Symbol je Zeile faellt weg — dafuer traegt die Beschreibung die
    // Angabe und wird zusaetzlich durchsucht.
    const page = src("app/(dashboard)/leases/new/page.tsx");
    expect(page).toMatch(/description:[\s\S]{0,140}typeCompany/);
  });

  it("die Flurstueckliste hat ein Suchfeld", () => {
    // Eine Combobox passt dort nicht: Mehrfachauswahl mit Zusatzangaben je
    // Zeile. Ein Suchfeld schon.
    const page = src("app/(dashboard)/leases/new/page.tsx");
    expect(page).toContain("plotSearch");
    expect(page).toContain('t("plots.searchPlaceholder")');
  });

  it("die Flurstuecksuche laeuft ueber die Rohfelder", () => {
    // Getippt wird eine Gemarkung oder eine Nummer, nicht das Wort "Flur".
    const page = src("app/(dashboard)/leases/new/page.tsx");
    expect(page).toMatch(/plot\.cadastralDistrict, plot\.fieldNumber, plot\.plotNumber/);
  });

  it("die Verfuegbarkeitsfilterung bleibt erhalten", () => {
    // Suche und Schalter muessen zusammen wirken, nicht einander ersetzen.
    const page = src("app/(dashboard)/leases/new/page.tsx");
    expect(page).toContain("const byAvailability = showOnlyAvailable ? availablePlots : existingPlots");
    expect(page).toContain("byAvailability.filter((plot)");
  });
});

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

describe("Uebersetzungen der Welle", () => {
  function get(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>(
      (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      obj,
    );
  }

  const required = [
    "common.dateRange.label",
    "common.dateRange.from",
    "common.dateRange.to",
    "common.dateRange.clear",
    "common.dateRange.presets.thisMonth",
    "common.dateRange.presets.lastQuarter",
    "common.dateRange.presets.lastYear",
    "leases.new.lessor.typeCompany",
    "leases.new.plots.searchPlaceholder",
  ];

  for (const locale of ["de", "en", "de-personal"] as const) {
    it(`${locale} hat alle neuen Schluessel`, () => {
      const messages = JSON.parse(read(join("src", "messages", `${locale}.json`)));
      for (const path of required) {
        expect(get(messages, path), `${path} fehlt in ${locale}`).toBeTypeOf("string");
      }
    });
  }
});
