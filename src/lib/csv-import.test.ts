/**
 * Bedienaufwand #22 (Audit 2026-07): CSV-Import für Stammdaten.
 *
 * Die Zerlegungsregeln stehen in csv.test.ts. Hier geht es um die Verdrahtung
 * und um die Entscheidungen, die ein Import falsch machen kann: stiller
 * Teilerfolg, Dubletten, umgangene Rechte.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IMPORT_SPECS, PERSON_IMPORT, VENDOR_IMPORT, aliasMap } from "./import/csv-import-spec";
import { autoDetectMapping, parseCsv } from "./csv";

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
// Zusammenspiel Zerlegung → Zuordnung
// ---------------------------------------------------------------------------

describe("Ein Outlook-Export laesst sich ohne Handarbeit zuordnen", () => {
  const outlookCsv = [
    "Vorname;Nachname;E-Mail-Adresse;Straße;PLZ;Ort",
    "Anna;Meier;anna@example.de;Am Hang 12a;24103;Kiel",
    "Bernd;Schulz;bernd@example.de;Dorfstraße 1;24105;Kiel",
  ].join("\n");

  it("die Spalten werden automatisch erkannt", () => {
    const { headers, rows } = parseCsv(outlookCsv);
    const mapping = autoDetectMapping(headers, aliasMap(PERSON_IMPORT));
    expect(mapping.firstName).toBe("Vorname");
    expect(mapping.lastName).toBe("Nachname");
    expect(mapping.email).toBe("E-Mail-Adresse");
    expect(mapping.postalCode).toBe("PLZ");
    expect(mapping.city).toBe("Ort");
    expect(rows).toHaveLength(2);
  });

  it("die Hausnummer bleibt an der Strasse, wenn es keine eigene Spalte gibt", () => {
    // "Am Hang 12a" ueberlebt — anders als beim Adress-Zerlegen per Regex,
    // das in #11 auffiel.
    const { headers, rows } = parseCsv(outlookCsv);
    const mapping = autoDetectMapping(headers, aliasMap(PERSON_IMPORT));
    expect(rows[0][mapping.street]).toBe("Am Hang 12a");
  });
});

// ---------------------------------------------------------------------------
// Die Beschreibung der Zielobjekte
// ---------------------------------------------------------------------------

describe("Import-Beschreibung", () => {
  it("Client und Server teilen sich dieselbe Feldliste", () => {
    // Zwei getrennte Listen liefen auseinander, und der Import schriebe dann
    // Felder, die die Maske nicht anbietet.
    const route = src("app/api/import/csv/route.ts");
    const dialog = src("components/import/csv-import-dialog.tsx");
    expect(route).toContain('from "@/lib/import/csv-import-spec"');
    expect(dialog).toContain('from "@/lib/import/csv-import-spec"');
  });

  it("Lieferanten brauchen zwingend einen Namen", () => {
    const nameField = VENDOR_IMPORT.fields.find((f) => f.key === "name");
    expect(nameField?.required).toBe(true);
  });

  it("Feldlaengen aus dem Schema sind hinterlegt", () => {
    // Vendor.name ist VarChar(200), iban VarChar(34), bic VarChar(11).
    expect(VENDOR_IMPORT.fields.find((f) => f.key === "name")?.maxLength).toBe(200);
    expect(VENDOR_IMPORT.fields.find((f) => f.key === "iban")?.maxLength).toBe(34);
    expect(VENDOR_IMPORT.fields.find((f) => f.key === "bic")?.maxLength).toBe(11);
  });

  it("personType nimmt nur die beiden Werte an, die das Schema kennt", () => {
    const field = PERSON_IMPORT.fields.find((f) => f.key === "personType");
    expect(field?.enumValues).toEqual(["natural", "legal"]);
  });

  it("es gibt genau die zwei Zielobjekte", () => {
    // Vertraege und Buchungssaetze sind bewusst NICHT dabei: ein
    // Buchungsimport muss Konten aufloesen und in die Nummernkreise greifen.
    expect(Object.keys(IMPORT_SPECS).sort()).toEqual(["persons", "vendors"]);
  });

  it("die Auslassung ist begruendet, nicht vergessen", () => {
    const spec = src("lib/import/csv-import-spec.ts");
    expect(spec).toContain("Verträge und Buchungssätze");
  });
});

// ---------------------------------------------------------------------------
// Die Route
// ---------------------------------------------------------------------------

describe("Import-Route", () => {
  const route = src("app/api/import/csv/route.ts");

  it("es gibt einen Probelauf, der nichts schreibt", () => {
    expect(route).toContain("dryRun");
    expect(route).toMatch(/if \(dryRun\) \{[\s\S]{0,300}return NextResponse\.json/);
  });

  it("der Probelauf laeuft durch DIESELBEN Pruefungen wie der Import", () => {
    // Eine clientseitige Vorschau kennt weder Feldlaengen noch vorhandene
    // Dubletten — sie saehe gruen aus und der Import scheiterte danach.
    const dryRunPos = route.indexOf("if (dryRun)");
    const validatePos = route.indexOf("validateRow(row, spec");
    const dedupePos = route.indexOf("await findExisting(");
    expect(validatePos).toBeGreaterThan(-1);
    expect(validatePos).toBeLessThan(dryRunPos);
    expect(dedupePos).toBeLessThan(dryRunPos);
  });

  it("ein Teilerfolg wird nicht als Erfolg gemeldet", () => {
    expect(route).toContain("failed: problems.length");
    const dialog = src("components/import/csv-import-dialog.tsx");
    expect(dialog).toContain('toast.warning(t("result.partial"');
  });

  it("Fehler werden zeilengenau gemeldet", () => {
    // Ohne Zeilennummer laesst sich der Fehler in der Ursprungsdatei nicht
    // wiederfinden.
    expect(route).toContain("row: rowNumber");
    expect(route).toContain("validateRow(row, spec, index + 1)");
  });

  it("Dubletten im Bestand werden uebersprungen, nicht als Fehler gewertet", () => {
    // So laesst sich eine korrigierte Datei erneut einspielen, ohne die
    // bereits uebernommenen Zeilen zu verdoppeln.
    expect(route).toContain("Bereits vorhanden — übersprungen");
  });

  it("Dubletten INNERHALB der Datei werden auch erkannt", () => {
    // Die Bestandspruefung sieht die zweite Zeile nicht, weil die erste noch
    // nicht geschrieben ist.
    expect(route).toContain("Dublette innerhalb der Datei — übersprungen");
    expect(route).toContain("const seen = new Set<string>()");
  });

  it("die Dublettenpruefung ignoriert Gross-/Kleinschreibung", () => {
    // "Meier GmbH" und "MEIER GMBH" sind derselbe Kontakt.
    expect(route).toMatch(/equals: data\[field\]\.trim\(\), mode: "insensitive"/);
  });

  it("geloeschte Lieferanten zaehlen nicht als Dublette", () => {
    expect(route).toContain("deletedAt: null");
  });

  it("jedes Zielobjekt verlangt sein eigenes Anlege-Recht", () => {
    expect(route).toContain("PERMISSION_BY_TARGET");
    expect(route).toContain("persons: PERMISSIONS.LEASES_CREATE");
    expect(route).toContain("vendors: PERMISSIONS.VENDORS_CREATE");
  });

  it("die Zeilenzahl je Lauf ist begrenzt", () => {
    expect(route).toContain("const MAX_ROWS");
    expect(route).toContain(".max(MAX_ROWS)");
  });

  it("der Import wird protokolliert", () => {
    expect(route).toContain("createAuditLog(");
  });

  it("eine Person ohne jeden Namen wird abgewiesen", () => {
    // Sonst entstehen Datensaetze, die in jeder Liste als "-" erscheinen.
    expect(route).toContain("Weder Name noch Firma angegeben");
  });

  it("die Personenart wird aus dem Firmennamen abgeleitet, nicht geraten", () => {
    expect(route).toContain('clean.personType = clean.companyName ? "legal" : "natural"');
  });
});

// ---------------------------------------------------------------------------
// Der Dialog
// ---------------------------------------------------------------------------

describe("Import-Dialog", () => {
  const dialog = src("components/import/csv-import-dialog.tsx");

  it("die Pruefung ruft die Route, nicht eine eigene Logik", () => {
    expect(dialog).toContain('fetch("/api/import/csv"');
    expect(dialog).toContain("send(true)");
    expect(dialog).toContain("send(false)");
  });

  it("die automatische Zuordnung ist ein Vorschlag, kein Zwang", () => {
    expect(dialog).toContain("autoDetectMapping(");
    expect(dialog).toContain("setMapping((prev) => ({ ...prev, [field.key]: value }))");
  });

  it("ohne zugeordnete Pflichtfelder geht es nicht weiter", () => {
    expect(dialog).toContain("requiredMissing");
    expect(dialog).toContain("disabled={requiredMissing.length > 0 || busy}");
  });

  it("dieselbe Datei laesst sich erneut waehlen", () => {
    // Ohne Zuruecksetzen feuert change beim zweiten Mal nicht — der Nutzer
    // klickt und nichts passiert.
    expect(dialog).toContain('e.target.value = "";');
  });

  it("die Liste wird erst nach einem echten Import neu geladen", () => {
    expect(codeOnly(dialog)).toContain("if (data.imported > 0) onImported();");
  });
});

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

describe("Uebersetzungen", () => {
  function get(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>(
      (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      obj,
    );
  }

  for (const locale of ["de", "en", "de-personal"] as const) {
    it(`${locale}: jedes Feld beider Zielobjekte hat eine Beschriftung`, () => {
      const messages = JSON.parse(read(join("src", "messages", `${locale}.json`)));
      for (const spec of Object.values(IMPORT_SPECS)) {
        for (const field of spec.fields) {
          expect(
            get(messages, `csvImport.fields.${field.labelKey}`),
            `csvImport.fields.${field.labelKey} fehlt in ${locale}`,
          ).toBeTypeOf("string");
        }
      }
    });

    it(`${locale}: beide Zielobjekte haben eine Ueberschrift`, () => {
      const messages = JSON.parse(read(join("src", "messages", `${locale}.json`)));
      for (const target of Object.keys(IMPORT_SPECS)) {
        expect(get(messages, `csvImport.title.${target}`)).toBeTypeOf("string");
      }
    });
  }
});
