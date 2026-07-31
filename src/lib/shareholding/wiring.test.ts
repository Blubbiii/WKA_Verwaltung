/**
 * A8 (Audit 2026-07): Anteilsübertragung — Verdrahtung.
 *
 * Die Rechenregel steht in distribution-split.test.ts. Hier geht es um die
 * Stellen, an denen Geld falsch fliessen oder eine Historie verloren gehen
 * würde.
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

describe("Finding 4.1 ist in der Route selbst behoben", () => {
  const route = src("app/api/funds/[id]/distributions/route.ts");

  it("die Normalisierung auf 100 Prozent ist WEG", () => {
    // Das war die Zeile, die A's Jahresanteil an die uebrigen verschenkt hat.
    expect(route).not.toContain("normalizedPercentage");
    expect(route).not.toContain("/ totalPercentage");
  });

  it("der Filter auf ACTIVE ist WEG", () => {
    // Wer im Zeitraum ausgetreten ist, steht auf INACTIVE und hat trotzdem
    // Anspruch auf seinen Zeitanteil.
    expect(route).not.toContain('where: { status: "ACTIVE" }');
  });

  it("verteilt wird ueber die geteilte Rechnung", () => {
    expect(route).toContain("splitDistribution({");
    expect(route).toContain("resolveShareholderSharesFrom");
  });

  it("der Zeitraum wird NICHT geraten", () => {
    // Ein erfundenes Geschaeftsjahr waere schlimmer als gar keins: die
    // Verteilung saehe stichtagsgenau aus und waere es nicht.
    expect(route).toContain("Kein Ausschüttungszeitraum angegeben");
    expect(route).toContain('basis: proRata ? "PRO_RATA_TEMPORIS" : "REGISTER_AT_DATE"');
  });

  it("Beginn ohne Ende wird abgewiesen", () => {
    expect(route).toContain("müssen zusammen angegeben werden");
  });

  it("die Hinweise gehen an den Bearbeiter zurueck", () => {
    expect(route).toContain("warnings }, { status: 201 }");
  });
});

describe("Datenmodell", () => {
  const schema = read("prisma/schema.prisma");

  function model(name: string): string {
    const start = schema.indexOf(`model ${name} {`);
    expect(start, name).toBeGreaterThan(-1);
    return schema.slice(start, schema.indexOf("\n}", start));
  }

  it("der Anteilsverlauf hat Gueltigkeitsgrenzen", () => {
    const body = model("ShareholderShare");
    expect(body).toContain("validFrom DateTime?");
    expect(body).toContain("validTo DateTime?");
  });

  it("die Ausschuettung haelt ihren Zeitraum fest", () => {
    // Ohne ihn ist spaeter nicht mehr erkennbar, wofuer ausgeschuettet wurde.
    const body = model("Distribution");
    expect(body).toContain("periodStart        DateTime?");
    expect(body).toContain("periodEnd          DateTime?");
    expect(body).toContain("basis              DistributionBasis");
  });

  it("der nicht verteilte Rest steht im Datensatz", () => {
    // Eingezogene Anteile. Ihn nicht auszuweisen hiesse, die Differenz
    // zwischen Beschluss und Auszahlung zu verschweigen.
    expect(model("Distribution")).toContain("undistributedAmount");
  });

  it("die Zeile traegt ihre eigene Herleitung", () => {
    // Die Stammdaten aendern sich beim naechsten Anteilsuebergang.
    const body = model("DistributionItem");
    expect(body).toContain("days           Int?");
    expect(body).toContain("nominalPercentage Decimal?");
  });

  it("die Uebertragung kennt Zustimmung und Vollzug getrennt", () => {
    const body = model("ShareTransfer");
    expect(body).toContain("consentRequired  Boolean");
    expect(body).toContain("consentGrantedAt DateTime?");
    expect(body).toContain("executedAt  DateTime?");
  });

  it("die Beteiligten sind gegen Loeschen geschuetzt", () => {
    // Ein Gesellschafter, der an einer vollzogenen Uebertragung beteiligt war,
    // darf nicht spurlos verschwinden.
    const body = model("ShareTransfer");
    expect(body).toContain('@relation("ShareTransferFrom", fields: [fromShareholderId], references: [id], onDelete: Restrict)');
    expect(body).toContain('@relation("ShareTransferTo", fields: [toShareholderId], references: [id], onDelete: Restrict)');
  });

  it("die Uebertragungsnummer ist je Mandant eindeutig", () => {
    expect(model("ShareTransfer")).toContain("@@unique([tenantId, transferNumber])");
  });
});

describe("Vollzug", () => {
  const route = src("app/api/share-transfers/[id]/execute/route.ts");

  it("ist ein eigenes Recht", () => {
    expect(route).toContain("PERMISSIONS.SHAREHOLDERS_TRANSFER");
  });

  it("ohne Zustimmung wird NICHT vollzogen", () => {
    // Schwebend unwirksam — ein Hinweis waere zu wenig.
    const lib = src("lib/shareholding/transfer-service.ts");
    expect(lib).toContain("schwebend unwirksam");
    expect(lib).toContain("problems.push(");
  });

  it("eine rueckwirkende Uebertragung wird abgewiesen", () => {
    // Sie wuerde die Fortschreibung der bereits vollzogenen falsch machen.
    expect(route).toContain("in der Reihenfolge ihrer Stichtage");
  });

  it("doppelter Vollzug wird abgewiesen", () => {
    expect(route).toContain("bereits vollzogen");
  });

  it("Anlegen und Vollzug sind getrennt", () => {
    const create = src("app/api/share-transfers/route.ts");
    expect(create).not.toContain("executeTransfer");
  });
});

describe("Der Anteilsverlauf verliert nichts", () => {
  const lib = src("lib/shareholding/transfer-service.ts");

  it("alte Zeilen werden abgeschlossen, nicht geloescht", () => {
    expect(lib).toContain("validTo: lastDayBefore");
    expect(lib).not.toContain("shareholderShare.delete");
    expect(lib).not.toContain("deleteMany");
  });

  it("der Stichtag gehoert dem NEUEN Stand", () => {
    // Dieselbe Konvention wie in splitIntoSegments — sonst zaehlt ein Tag
    // doppelt oder gar nicht.
    expect(lib).toContain("addDays(effective, -1)");
  });

  it("der Stand VOR der ersten Uebertragung wird festgehalten", () => {
    // Sonst faellt der Verlauf vor dem Stichtag auf den dann bereits
    // geaenderten Stammsatz zurueck.
    expect(lib).toContain("Stand vor der ersten erfassten Übertragung");
  });

  it("eine Quote von 0 erzeugt KEINE Zeile", () => {
    expect(lib).toContain("if (nextPercent > 0)");
  });
});

describe("Der Rueckfall auf die Stammdaten", () => {
  const lib = src("lib/shareholding/resolve-shares.ts");

  it("liest entryDate und exitDate", () => {
    // Sie waren immer da — die Ausschuettung hat sie nur nie gelesen. Genau
    // das behebt 4.1 ohne jede Nachpflege.
    expect(lib).toContain("validFrom: shareholder.entryDate");
    expect(lib).toContain("validTo: shareholder.exitDate");
  });

  it("filtert NICHT auf ACTIVE", () => {
    expect(lib).not.toContain('status: "ACTIVE"');
  });

  it("eine fehlende Quote wird gemeldet, nicht als 0 verrechnet", () => {
    expect(lib).toContain("keine Beteiligungsquote hinterlegt");
  });
});

describe("Rechte", () => {
  it("das neue Recht steht im Katalog und in den Konstanten", () => {
    expect(src("lib/auth/permissions.catalog.ts")).toContain('name: "shareholders:transfer"');
    expect(src("lib/auth/permissions.ts")).toContain('SHAREHOLDERS_TRANSFER: "shareholders:transfer"');
  });
});

describe("Migration", () => {
  const sql = read("prisma/migrations/manual/share_transfers.sql");

  it("Bestandsausschuettungen bekommen REGISTER_AT_DATE", () => {
    // Sie WURDEN nicht zeitanteilig gerechnet. Ihnen die andere Grundlage
    // anzuschreiben waere eine falsche Behauptung ueber bereits ausgezahltes
    // Geld.
    expect(sql).toContain("DEFAULT 'REGISTER_AT_DATE'");
    expect(sql).not.toContain("DEFAULT 'PRO_RATA_TEMPORIS'");
  });

  it("es wird kein Bestand umgeschrieben", () => {
    expect(sql).not.toMatch(/UPDATE\s+"?(distributions|distribution_items|shareholders)"?/i);
  });

  it("laeuft in einer Transaktion", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });
});
