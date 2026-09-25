/**
 * Störung: Speichern mit Knopf statt beim Verlassen jedes Felds
 * (UX-Durchsicht, Punkt 1 / Entscheidung E1).
 *
 * Die Detailseite schrieb bei jedem Feldwechsel sofort in die Datenbank — als
 * einzige Seite. Wer sich vertippte, hatte schon gespeichert. Jetzt sammelt
 * sie Änderungen in einem Entwurf, zeigt eine Leiste mit "Verwerfen" und
 * "Speichern" und warnt beim Verlassen.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const seite = readFileSync(join(process.cwd(), "src/app/(dashboard)/faults/[id]/page.tsx"), "utf8");

describe("Störung bearbeiten", () => {
  it("kein Feld speichert beim Verlassen oder bei der Auswahl", () => {
    expect(seite).not.toMatch(/onBlur=\{[^}]*patch\(/);
    expect(seite).not.toMatch(/onBlur=\{\(e\) => \{[\s\S]{0,300}?void patch\(/);
    expect(seite).not.toMatch(/onValueChange=\{\(value\) => void patch\(/);
  });

  it("Änderungen landen im Entwurf und werden mit einem Knopf gespeichert", () => {
    expect(seite).toContain("merke(");
    expect(seite).toContain("onClick={speichern}");
    expect(seite).toContain("onClick={verwerfen}");
  });

  it("warnt beim Verlassen mit ungespeicherten Änderungen", () => {
    expect(seite).toContain("useUnsavedChanges");
  });

  it("Löschen sitzt wie überall im Kopf-Menü", () => {
    expect(seite).toContain("<DetailAktionen");
  });
});
