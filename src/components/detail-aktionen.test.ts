/**
 * Ein Muster für Bearbeiten und Löschen auf Detailseiten (UX-Durchsicht, Punkt 1).
 *
 * Vorher löschte jede Detailseite anders: roter Knopf im Kopf (Pachtvertrag,
 * Vertrag, Kontakt), "…"-Menü (Service-Vorgang), gar nicht (Park,
 * Gesellschaft). Jetzt: "Bearbeiten" sichtbar, Löschen im "…"-Menü oben
 * rechts, immer mit Rückfrage — über <DetailAktionen>.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SEITEN = [
  "app/(dashboard)/parks/[id]/page.tsx",
  "app/(dashboard)/funds/[id]/page.tsx",
  "app/(dashboard)/leases/[id]/page.tsx",
  "app/(dashboard)/contracts/[id]/page.tsx",
  "app/(dashboard)/crm/contacts/[id]/page.tsx",
  "app/(dashboard)/service-events/[id]/page.tsx",
];

const lies = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

describe("Detailseiten: Bearbeiten und Löschen einheitlich", () => {
  for (const seite of SEITEN) {
    it(`${seite} nutzt DetailAktionen`, () => {
      expect(lies(seite)).toContain("<DetailAktionen");
    });

    it(`${seite} hat keinen roten Löschknopf im Kopf`, () => {
      const quelle = lies(seite);
      const kopf = quelle.slice(quelle.indexOf("<DetailAktionen") - 3000, quelle.indexOf("<DetailAktionen"));
      expect(kopf).not.toMatch(/<Button[^>]*variant="destructive"[\s\S]{0,200}<Trash2/);
    });
  }

  it("die Komponente fragt vor dem Löschen", () => {
    const komponente = lies("components/ui/detail-aktionen.tsx");
    expect(komponente).toContain("<DeleteConfirmDialog");
    expect(komponente).toContain("<DropdownMenuSeparator");
  });
});
