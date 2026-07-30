/**
 * Bedienaufwand Tier 2 (Audit 2026-07): wiederholte Handarbeit abstellen.
 *
 * Die sechs Punkte dieses Tiers sparen Tipparbeit, und drei davon beheben
 * nebenbei stille Datenfehler — deshalb sind sie hier festgehalten und nicht
 * nur als "nice to have" abgehakt:
 *
 *  - #7  fuellte den Kontennamen bisher gar nicht, obwohl das Feld existiert
 *  - #10 meldete bisher keinen Teilfehlschlag
 *  - #11 zerlegte die Adresse per Regex wieder, nachdem sie zusammengeklebt war
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

/** Kommentarzeilen entfernen — sonst matchen Tests die eigenen Erklaerungen. */
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
// #7 · Kontenauswahl
// ---------------------------------------------------------------------------

describe("Buchungssatz: Konto suchen statt tippen (#7)", () => {
  const page = src("app/(dashboard)/journal-entries/page.tsx");

  it("die Kontenspalte nutzt die Combobox", () => {
    expect(page).toContain('import { Combobox } from "@/components/ui/combobox"');
    expect(page).toContain("<Combobox");
  });

  it("Kontonummer und Kontenname werden in EINEM setLines gesetzt", () => {
    // Zwei aufeinanderfolgende updateLine-Aufrufe arbeiten auf demselben
    // Snapshot — der zweite haette den ersten verworfen.
    expect(page).toContain("const applyAccount = (idx: number, accountNumber: string, accountName: string)");
    expect(page).toMatch(/applyAccount[\s\S]{0,260}account: accountNumber, accountName/);
  });

  it("Steuerschlüssel und Kostenstelle sind erfassbar", () => {
    // Beide Felder existierten in JournalLine, hatten aber kein Eingabefeld.
    expect(page).toContain("taxKey: string;");
    expect(page).toContain("costCenter: string;");
    expect(page).toContain('t("dialog.cols.taxKey")');
    expect(page).toContain('t("dialog.cols.costCenter")');
  });

  it("die Combobox filtert serverseitige Treffer nicht ein zweites Mal", () => {
    // Sonst verschwinden Treffer, die auf einem nicht angezeigten Feld matchen.
    const combobox = src("components/ui/combobox.tsx");
    expect(combobox).toContain("shouldFilter={!serverSide}");
  });
});

// ---------------------------------------------------------------------------
// #8 · Buchung duplizieren
// ---------------------------------------------------------------------------

describe("Buchung duplizieren (#8)", () => {
  const page = src("app/(dashboard)/journal-entries/page.tsx");

  it("der Dialog kennt eine Vorlage getrennt vom Bearbeiten-Fall", () => {
    expect(page).toContain("duplicateFrom?: JournalEntry | null");
    expect(page).toContain("const template = editing ?? duplicateFrom ?? null");
  });

  it("Neu-Anlegen setzt die Vorlage zurueck", () => {
    // Sonst zieht der naechste "Neue Buchung"-Klick die zuletzt duplizierte mit.
    expect(page).toContain("setEditingEntry(null); setDuplicateFrom(null); setDialogOpen(true);");
  });

  it("Schliessen und Speichern raeumen die Vorlage ebenfalls ab", () => {
    expect(page).toContain("setDialogOpen(false); setDuplicateFrom(null);");
  });
});

// ---------------------------------------------------------------------------
// #9 · Rechnung duplizieren
// ---------------------------------------------------------------------------

describe("Rechnung duplizieren (#9)", () => {
  const detail = src("app/(dashboard)/invoices/[id]/page.tsx");
  const newPage = src("app/(dashboard)/invoices/new/page.tsx");

  it("die Detailseite bietet den Einstieg an", () => {
    expect(detail).toContain("/invoices/new?duplicateFrom=");
  });

  it("die Neuanlage liest den Parameter", () => {
    expect(newPage).toContain('searchParams.get("duplicateFrom")');
  });

  it("Rechnungsnummer und Datumsfelder werden NICHT kopiert", () => {
    // Die Nummer vergibt der Server lueckenlos (GoBD); ein kopiertes
    // Rechnungsdatum waere schlicht falsch.
    const code = codeOnly(newPage);
    const duplicateBlock = code.slice(code.indexOf('searchParams.get("duplicateFrom")'));
    const assignments = duplicateBlock.slice(0, 2000);
    expect(assignments).not.toContain("invoiceNumber: src.invoiceNumber");
    expect(assignments).not.toContain("invoiceDate: src.invoiceDate");
  });
});

// ---------------------------------------------------------------------------
// #10 · Mehrere Dateien hochladen
// ---------------------------------------------------------------------------

describe("Dokument-Upload nimmt mehrere Dateien (#10)", () => {
  const page = src("app/(dashboard)/documents/upload/page.tsx");

  it("das Eingabefeld erlaubt Mehrfachauswahl", () => {
    expect(page).toMatch(/<input\s+type="file"\s+multiple/);
    expect(page).toContain("const [selectedFiles, setSelectedFiles] = useState<File[]>([])");
  });

  it("einzelne Dateien lassen sich wieder entfernen", () => {
    expect(page).toContain("removeFile(index)");
  });

  it("ein Teilfehlschlag wird NICHT als Erfolg gemeldet", () => {
    // Dieselbe Lehre wie aus dem Worker-Audit: "fertig" darf nicht heissen
    // "teilweise fertig".
    const code = codeOnly(page);
    expect(code).toContain("batchPartial");
    expect(code).toMatch(/failed\.length === 0[\s\S]{0,200}batchSuccess/);
  });

  it("nach einem Teilfehlschlag bleiben nur die gescheiterten Dateien stehen", () => {
    // Sonst erzeugt ein zweiter Versuch Duplikate der bereits hochgeladenen.
    expect(page).toContain("prev.filter((f) => failed.includes(f.name))");
  });

  it("im Stapelbetrieb erscheint nicht je Datei ein Fehler-Toast", () => {
    expect(page).toContain("batchModeRef");
    expect(page).toContain("if (!batchModeRef.current) toast.error(msg)");
  });

  it("der Fortschritt ueber alle Dateien ist sichtbar", () => {
    expect(page).toContain("batchProgress");
    expect(page).toContain('t("batchProgress", batchProgress)');
  });
});

// ---------------------------------------------------------------------------
// #11 · Rechnungsempfaenger ist ein CRM-Kontakt
// ---------------------------------------------------------------------------

describe("Rechnungsempfaenger verweist auf den CRM-Kontakt (#11)", () => {
  const dialog = src("components/invoices/RecipientSearchDialog.tsx");
  const newPage = src("app/(dashboard)/invoices/new/page.tsx");
  const schema = read("prisma/schema.prisma");

  it("das Schema kennt den Verweis", () => {
    expect(schema).toContain("recipientPersonId");
    expect(schema).toMatch(/recipientPerson\s+Person\?\s+@relation\("InvoiceRecipient"/);
  });

  it("der Verweis wird beim Loeschen des Kontakts genullt, nicht kaskadiert", () => {
    // Eine ausgestellte Rechnung darf sich nicht aendern (AO §147) — das
    // Loeschen eines Kontakts nimmt ihr nur den Ruecksprung.
    expect(schema).toMatch(/@relation\("InvoiceRecipient"[^)]*onDelete: SetNull/);
  });

  it("die Auswahl gibt die Person-ID weiter", () => {
    expect(dialog).toContain("personId: string;");
    expect(dialog).toContain("personId: person.id");
  });

  it("auch eine im Dialog neu angelegte Person wird verknuepft", () => {
    // Ihre ID wurde vorher in eine ungenutzte Variable geschrieben.
    expect(dialog).toContain("personId: createdId");
    expect(codeOnly(dialog)).not.toContain("const _created");
  });

  it("die Adresse kommt in Einzelfeldern und wird nicht mehr zerlegt", () => {
    expect(dialog).toContain("recipientHouseNumber: string;");
    expect(newPage).toContain("recipientStreet: recipient.recipientStreet");
    // Der alte Weg: Adresstext splitten und die Hausnummer per /^\d/ raten.
    const code = codeOnly(newPage);
    expect(code).not.toContain("looksLikeNumber");
    expect(code).not.toMatch(/recipientAddress \|\| ""\)\.split/);
  });

  it("der Server prueft den Mandanten des verknuepften Kontakts", () => {
    // Die ID kommt vom Client — ohne Pruefung liesse sich eine Rechnung an
    // einen fremden Kontakt haengen und taeuchte in dessen 360-Grad-Sicht auf.
    for (const route of ["app/api/invoices/route.ts", "app/api/invoices/[id]/route.ts"]) {
      const source = src(route);
      expect(source, route).toMatch(
        /recipientPersonId[\s\S]{0,400}prisma\.person\.findFirst[\s\S]{0,200}tenantId: check\.tenantId/,
      );
    }
  });

  it("die Rechnung verlinkt zurueck ins CRM", () => {
    const detail = src("app/(dashboard)/invoices/[id]/page.tsx");
    expect(detail).toContain("/crm/contacts/${invoice.recipientPersonId}");
  });

  it("die Kontaktakte zeigt direkt ausgestellte Rechnungen", () => {
    const contact360 = src("lib/crm/contact-360.ts");
    expect(contact360).toContain("recipientPersonId: personId");
    expect(contact360).toContain('linkedVia: "RECIPIENT"');
  });

  it("eine Rechnung erscheint dort nicht doppelt", () => {
    // Eine Pachtrechnung an den Verpaechter traegt jetzt leaseId UND
    // recipientPersonId — ohne Entdopplung zaehlte sie zweimal.
    const contact360 = src("lib/crm/contact-360.ts");
    expect(contact360).toContain("function dedupeById");
    expect(contact360).toContain("const invoiceItems: InvoiceItem[] = dedupeById([");
  });

  it("die Herkunft steht als Text da, nicht als rohes Enum", () => {
    const panel = src("components/crm/related-entities-panel.tsx");
    expect(panel).toContain("invoiceSourceLabel(inv.linkedVia)");
    expect(panel).toContain('t("invoiceSourceRecipient")');
  });
});

// ---------------------------------------------------------------------------
// #12 · Kontext beim Anlegen uebernehmen
// ---------------------------------------------------------------------------

describe("Neue Rechnung uebernimmt den Kontext (#12)", () => {
  const page = src("app/(dashboard)/invoices/new/page.tsx");

  it("parkId und fundId werden aus der URL vorbelegt", () => {
    expect(page).toContain('searchParams.get("parkId")');
    expect(page).toContain('searchParams.get("fundId")');
  });

  it("ohne Parameter wird nichts angefasst", () => {
    // Sonst ueberschreibt der Effekt die manuelle Auswahl bei jedem Render.
    expect(page).toContain("if (!parkId && !fundId) return;");
  });
});

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

describe("Uebersetzungen der Welle", () => {
  const locales = ["de", "en", "de-personal"] as const;

  function load(locale: string): Record<string, unknown> {
    return JSON.parse(read(join("src", "messages", `${locale}.json`)));
  }

  function get(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>(
      (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      obj,
    );
  }

  const required = [
    "documents.upload.batchProgress",
    "documents.upload.batchSuccess",
    "documents.upload.batchPartial",
    "documents.upload.batchTitleHint",
    "documents.upload.removeFile",
    "invoices.detail.openContact",
    "crm.relatedEntities.invoiceSourceRecipient",
    "crm.relatedEntities.invoiceSourceLease",
    "crm.relatedEntities.invoiceSourceShareholder",
  ];

  for (const locale of locales) {
    it(`${locale} hat alle neuen Schluessel`, () => {
      const messages = load(locale);
      for (const path of required) {
        expect(get(messages, path), `${path} fehlt in ${locale}`).toBeTypeOf("string");
      }
    });
  }
});
