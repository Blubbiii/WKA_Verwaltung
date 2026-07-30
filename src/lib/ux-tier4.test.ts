/**
 * Bedienaufwand Tier 4 (Audit 2026-07), erster Teil: #2 und #17.
 *
 * Beide Punkte sind keine Bequemlichkeitsfragen, sondern falsche Ergebnisse:
 *
 *  #2  Die Listensuche lief über die geladenen 100 Zeilen. Für den 101. Beleg
 *      meldete sie „nichts gefunden" — für einen Beleg, den es gibt.
 *  #17 Ein `type="number"`-Feld liefert für „1.234,56" einen leeren Wert. Die
 *      Rechnungsposition wurde still 0,00 €.
 *
 * Die Regeln von `parseAmount` selbst stehen in parse-amount.test.ts; hier geht
 * es um die Verdrahtung.
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
// #2 · Suche und Blättern
// ---------------------------------------------------------------------------

const LISTS = [
  { name: "invoices", page: "app/(dashboard)/invoices/page.tsx", route: "app/api/invoices/route.ts", param: "search" },
  { name: "contracts", page: "app/(dashboard)/contracts/page.tsx", route: "app/api/contracts/route.ts", param: "search" },
  { name: "leases", page: "app/(dashboard)/leases/page.tsx", route: "app/api/leases/route.ts", param: "search" },
  { name: "vendors", page: "app/(dashboard)/vendors/page.tsx", route: "app/api/vendors/route.ts", param: "q" },
] as const;

describe("Listen suchen serverseitig (#2)", () => {
  for (const list of LISTS) {
    it(`${list.name}: die Route kennt den Suchparameter`, () => {
      expect(src(list.route)).toContain(`searchParams.get("${list.param}")`);
    });

    it(`${list.name}: die Seite reicht die Suche an die API weiter`, () => {
      const page = src(list.page);
      expect(page).toMatch(new RegExp(`(${list.param}|search)[^\\n]*(debouncedSearch|search)`));
    });

    it(`${list.name}: keine clientseitige Nachfilterung mehr`, () => {
      // Genau die war der Fehler: sie filterte den bereits abgeschnittenen
      // Ausschnitt und meldete den Rest als nicht vorhanden.
      const code = codeOnly(src(list.page));
      expect(code).not.toContain("if (!debouncedSearch) return true;");
    });

    it(`${list.name}: die Blaetterleiste ist eingebunden`, () => {
      expect(src(list.page)).toContain("<PaginationBar");
    });
  }

  it("keine der vier Listen fordert mehr 200 Zeilen an", () => {
    // PAGE_SIZE_BULK_LIST ist 200, die API gibt hoechstens 100 heraus —
    // 100 Zeilen fielen also still unter den Tisch.
    for (const list of LISTS) {
      expect(src(list.page), list.name).not.toContain("PAGE_SIZE_BULK_LIST");
    }
  });

  it("kein offener Pagination-TODO mehr", () => {
    for (const list of LISTS) {
      expect(src(list.page), list.name).not.toContain("TODO: Pagination");
    }
  });
});

describe("Serverseitige Suche ist nicht enger als die frühere (#2)", () => {
  it("Rechnungen: auch der Gesellschafter wird durchsucht", () => {
    // Die Liste faellt bei leerem recipientName auf den Gesellschafter zurueck.
    // Ohne diesen Zweig waere die Suche nach der Umstellung ENGER gewesen.
    const route = src("app/api/invoices/route.ts");
    expect(route).toMatch(/shareholder:[\s\S]{0,200}companyName/);
  });

  it("Vertraege: Park und Vertragspartner kommen dazu", () => {
    const route = src("app/api/contracts/route.ts");
    expect(route).toMatch(/park: \{ name: \{ contains: search/);
    expect(route).toMatch(/partner: \{[\s\S]{0,220}lastName/);
  });

  it("Pachtvertraege: Verpaechter, Flurstueck und Park", () => {
    const route = src("app/api/leases/route.ts");
    expect(route).toMatch(/lessor:[\s\S]{0,240}companyName/);
    expect(route).toMatch(/cadastralDistrict: \{ contains: search/);
  });

  it("Pachtvertraege: NICHT nach contractNumber — das Feld gibt es nicht", () => {
    // Lease hat keine Spalte dieses Namens. Die Liste durchsuchte sie
    // trotzdem (und fand nie etwas); serverseitig haette Prisma geworfen.
    const route = src("app/api/leases/route.ts");
    expect(codeOnly(route)).not.toContain("contractNumber: { contains");
    const schema = read("prisma/schema.prisma");
    const leaseModel = schema.slice(schema.indexOf("model Lease {"));
    expect(leaseModel.slice(0, leaseModel.indexOf("\n}"))).not.toContain("contractNumber");
  });
});

describe("Sortierung folgt der Blaetterung (#2)", () => {
  it("die Rechnungs-API sortiert serverseitig", () => {
    // Eine clientseitige Sortierung wuerde ab jetzt nur die sichtbare Seite
    // ordnen — das sieht richtig aus und ist es nicht.
    const route = src("app/api/invoices/route.ts");
    expect(route).toContain('searchParams.get("sortField")');
    expect(route).toContain("const orderBy = (ORDER_BY[sortField] ?? ORDER_BY.invoiceDate)(sortDir)");
  });

  it("nur bekannte Sortierfelder werden durchgereicht", () => {
    // Ein roher Client-String im orderBy laesst Prisma zur Laufzeit werfen.
    const route = src("app/api/invoices/route.ts");
    expect(route).toContain("const ORDER_BY: Record<string,");
  });

  it("ein Sortierwechsel springt auf Seite 1", () => {
    const page = src("app/(dashboard)/invoices/page.tsx");
    expect(page).toMatch(/function handleSort[\s\S]{0,220}setCurrentPage\(1\)/);
  });
});

describe("Mehrfachauswahl ueberlebt das Blaettern nicht stillschweigend (#2)", () => {
  // Die Sammelaktionen arbeiten auf der aktuellen Seite. Eine auf Seite 1
  // markierte Zeile waere auf Seite 2 aus der Aktion gefallen, ohne Hinweis.
  for (const list of ["invoices", "contracts", "leases", "vendors"] as const) {
    it(`${list}: die Auswahl wird beim Seitenwechsel geleert`, () => {
      const page = src(`app/(dashboard)/${list}/page.tsx`);
      expect(page).toMatch(/clearSelection\(\);[\s\S]{0,160}currentPage, clearSelection\]/);
    });
  }
});

// ---------------------------------------------------------------------------
// #17 · Betragseingaben
// ---------------------------------------------------------------------------

describe("Betragsfelder nehmen deutsche Schreibweise an (#17)", () => {
  const input = src("components/ui/amount-input.tsx");

  it("das Feld ist KEIN type=number", () => {
    // Ein Number-Input liefert fuer "1.234,56" einen leeren Wert.
    expect(input).toContain('type="text"');
    expect(input).toContain('inputMode="decimal"');
  });

  it("unlesbare Eingabe wird gemeldet, nicht zu 0 gemacht", () => {
    expect(input).toContain("aria-invalid");
    expect(input).toContain("border-destructive");
  });

  it("waehrend der Eingabe schreibt nichts von aussen dazwischen", () => {
    // Sonst laesst sich "1," nicht tippen: die 1 kaeme als "1,00" zurueck.
    expect(input).toContain("if (focused) return;");
  });

  it("Unlesbares bleibt beim Verlassen stehen", () => {
    // Ein stillschweigend geleertes Feld verbirgt den Fehler.
    expect(input).toContain("if (final !== null) setText(");
  });

  it("die Rechnungspositionen nutzen es", () => {
    const page = src("app/(dashboard)/invoices/new/page.tsx");
    expect(page).toContain("<AmountInput");
    const code = codeOnly(page);
    expect(code).not.toContain('handleItemChange(item.id, "unitPrice", parseFloat(');
    expect(code).not.toContain('handleItemChange(item.id, "quantity", parseFloat(');
  });
});

describe("Es gibt nur noch EINE Zahlenerkennung (#17)", () => {
  it("der Buchungsdialog nutzt die gemeinsame", () => {
    const page = src("app/(dashboard)/journal-entries/page.tsx");
    expect(page).toContain('from "@/lib/parse-amount"');
    // Der lokale Parser las "1.234,56" als 1.234 — aus 1.234,56 EUR wurde 1,23.
    expect(codeOnly(page)).not.toContain('parseFloat(s.replace(",", "."))');
  });

  it("der Produktionsimport nutzt die gemeinsame", () => {
    const sheet = src("components/energy/production-import-sheet.tsx");
    expect(sheet).toContain("from '@/lib/parse-amount'");
    expect(codeOnly(sheet)).not.toContain("/^\\d{1,3}(\\.\\d{3})*(,\\d+)?$/");
  });

  it("die OCR-Erkennung nutzt die gemeinsame", () => {
    const ocr = src("lib/ocr/invoice-extractor.ts");
    expect(ocr).toContain('from "@/lib/parse-amount"');
    // Sie entfernte ALLE Punkte: "1234.56" wurde 123456, Faktor 100.
    expect(codeOnly(ocr)).not.toContain('raw.replace(/\\./g, "")');
  });

  it("die OCR-Rundung auf zwei Stellen bleibt", () => {
    // OCR liefert aus Bildfehlern gelegentlich eine dritte Nachkommastelle.
    const ocr = src("lib/ocr/invoice-extractor.ts");
    expect(ocr).toContain("Math.round(value * 100) / 100");
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
    "common.pagination.range",
    "common.pagination.previous",
    "common.pagination.next",
    "common.pagination.pageOf",
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
