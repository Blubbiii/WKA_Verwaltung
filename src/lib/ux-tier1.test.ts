/**
 * Bedienaufwand Tier 1 (Audit 2026-07): fertiges Backend anschliessen.
 *
 * Die sechs Punkte dieses Tiers haben gemeinsam, dass die Funktionalität schon
 * gebaut war und nur nicht angebunden wurde. Genau deshalb sind sie auch
 * leicht wieder zu verlieren — diese Tests halten die Verdrahtung fest.
 *
 * #1 (Cmd+K an quick-search) ist bereits in Welle 3b erledigt und wird von
 * src/lib/compliance-ui-coverage.test.ts abgedeckt.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function read(relativePath: string): string {
  return readFileSync(join(SRC, relativePath), "utf-8");
}

// ---------------------------------------------------------------------------
// #4 · KPI-Karten
// ---------------------------------------------------------------------------

describe("StatsCards Klickbarkeit (#4)", () => {
  const component = read("components/ui/stats-cards.tsx");

  it("unterstützt href und onClick", () => {
    expect(component).toMatch(/href\?: string/);
    expect(component).toMatch(/onClick\?: \(\) => void/);
  });

  it("bleibt ohne Ziel nicht interaktiv", () => {
    // Sonst bekämen 15 Seiten auf einen Schlag eine Klickfläche ohne Wirkung —
    // genau der falsche Eindruck, den der Hover-Schatten schon erzeugt hat.
    expect(component).toContain("const interactive = !!(stat.href || stat.onClick)");
    expect(component).toMatch(/interactive && "cursor-pointer/);
  });

  it("ist per Tastatur bedienbar", () => {
    // Link bzw. echter Button statt onClick auf einem div.
    expect(component).toContain("<Link");
    expect(component).toContain('type="button"');
    expect(component).toContain("focus-visible:ring-2");
  });

  it("die Rechnungsliste nutzt es auch", () => {
    const page = read("app/(dashboard)/invoices/page.tsx");
    expect(page).toMatch(/onClick: \(\) => \{ setStatusFilter\("SENT"\)/);
  });
});

// ---------------------------------------------------------------------------
// #5 · Approval-Beleglink
// ---------------------------------------------------------------------------

describe("Approval verlinkt den Beleg (#5)", () => {
  const card = read("components/ui/approval-card.tsx");

  it("die Karte nimmt entityType und entityId entgegen", () => {
    expect(card).toMatch(/entityType\?: string/);
    expect(card).toMatch(/entityId\?: string/);
  });

  it("das Ziel kommt aus der gemeinsamen Entity-URL-Zuordnung", () => {
    // Dieselbe Map wie im Audit-Log — sie liefert nur Pfade, die im App-Router
    // existieren, und null statt eines 404.
    expect(card).toContain("getAuditEntityHref");
  });

  it("ohne erreichbares Ziel erscheint kein Link", () => {
    expect(card).toContain("{entityHref && (");
  });

  it("die Seite reicht die Felder durch", () => {
    // Sie lud entityType/entityId schon vorher und gab sie nicht weiter.
    const page = read("app/(dashboard)/approvals/page.tsx");
    expect(page).toContain("entityType={it.entityType}");
    expect(page).toContain("entityId={it.entityId}");
  });

  it("die Approval-Entitäten haben ein Ziel", () => {
    // Die vier Typen, die tatsächlich als Freigabe vorkommen.
    const urls = read("lib/audit-entity-urls.ts");
    for (const entity of [
      "JournalEntry",
      "IncomingInvoice",
      "LeaseSettlementPeriod",
      "SepaPaymentBatch",
    ]) {
      expect(urls, `${entity} fehlt in der Zuordnung`).toContain(`case "${entity}":`);
    }
  });
});

// ---------------------------------------------------------------------------
// #6 · Belegvorschau in der Inbox
// ---------------------------------------------------------------------------

describe("Belegvorschau Eingangsrechnung (#6)", () => {
  const page = read("app/(dashboard)/inbox/[id]/page.tsx");

  it("der tote Link auf /api/documents/file ist weg", () => {
    // Diese Route existiert nicht — der "Öffnen"-Button lieferte einen 404.
    // Auf die Verwendung prüfen, nicht auf das Wort: die Erklärung im
    // Kommentar nennt den alten Pfad absichtlich.
    const code = page
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(code).not.toMatch(/["'`]\/api\/documents\/file/);
  });

  it("die Datei kommt über die ID-basierte Route", () => {
    expect(page).toContain("`/api/inbox/${id}/file`");
  });

  it("PDFs werden eingebettet, mit Fallback im <object>", () => {
    expect(page).toContain("<object");
    expect(page).toContain("previewUnavailable");
  });

  it("SVG wird NICHT eingebettet", () => {
    // Inline ausgeliefertes SVG kann Skripte in unserer Origin ausführen.
    expect(page).toContain('mime !== "image/svg+xml"');
  });

  it("die Route prüft Recht und Mandant", () => {
    const route = read("app/api/inbox/[id]/file/route.ts");
    expect(route).toContain('requirePermission("inbox:read")');
    expect(route).toContain("invoice.tenantId !== check.tenantId");
  });

  it("die Route liefert inline aus, SVG aber als attachment", () => {
    const route = read("app/api/inbox/[id]/file/route.ts");
    expect(route).toContain('isSvg ? "attachment" : "inline"');
    expect(route).toContain("X-Content-Type-Options");
  });
});

// ---------------------------------------------------------------------------
// #3 · Rechnungsfilter
// ---------------------------------------------------------------------------

describe("Rechnungsfilter Fonds und Zeitraum (#3)", () => {
  it("die API filtert nach Zeitraum", () => {
    // Der Auditbericht ging davon aus, dass sie das schon kann — sie kannte nur
    // fundId/parkId/leaseId.
    const route = read("app/api/invoices/route.ts");
    expect(route).toContain('searchParams.get("from")');
    expect(route).toContain('searchParams.get("to")');
  });

  it("das Enddatum schliesst den ganzen Tag ein", () => {
    // Ohne Tagesende fielen alle Rechnungen des Endtages heraus.
    const route = read("app/api/invoices/route.ts");
    expect(route).toContain("T23:59:59.999");
  });

  it("ohne Zeitraum wird invoiceDate nicht gesetzt", () => {
    // Ein leeres invoiceDate-Objekt würde Rechnungen ohne Datum ausschliessen.
    const route = read("app/api/invoices/route.ts");
    expect(route).toMatch(/\.\.\.\(from \|\| to/);
  });

  it("die Liste bietet beide Filter an", () => {
    const page = read("app/(dashboard)/invoices/page.tsx");
    expect(page).toContain("fundId: fundFilter");
    expect(page).toContain("from: fromFilter");
  });

  it("alle Filter stehen im react-query-Key", () => {
    // Sonst liefert der Cache das Ergebnis des vorherigen Filters zurück.
    const page = read("app/(dashboard)/invoices/page.tsx");
    expect(page).toMatch(
      /\["invoices", statusFilter, typeFilter, fundFilter, fromFilter, toFilter\]/,
    );
  });

  it("die Filter überleben einen Seitenwechsel", () => {
    const page = read("app/(dashboard)/invoices/page.tsx");
    expect(page).toMatch(/usePersistedTableState\("invoices",[\s\S]{0,220}fund: "all"/);
  });
});

// ---------------------------------------------------------------------------
// #14 · Rechnung → Pachtvertrag
// ---------------------------------------------------------------------------

describe("Rechnung verlinkt den Pachtvertrag (#14)", () => {
  const page = read("app/(dashboard)/invoices/[id]/page.tsx");

  it("das geladene lease-Feld wird jetzt gerendert", () => {
    expect(page).toContain("{invoice.lease && (");
    expect(page).toContain("`/leases/${invoice.lease.id}`");
  });
});
