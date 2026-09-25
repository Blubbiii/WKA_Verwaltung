/**
 * Kopfzeile aufgeräumt (UX-Durchsicht 2026-09, Punkt 17).
 *
 * Vorher: Mandantenname doppelt (Seitenleiste und Kopf) und fünf unbeschriftete
 * Symbole für Thema, Sprache, Dichte, Tastenkürzel. Jetzt stehen diese
 * Einstellungen beschriftet im Benutzermenü.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const header = readFileSync(join(process.cwd(), "src/components/layout/header.tsx"), "utf-8");
const menuStart = header.indexOf("<DropdownMenuContent");
const leiste = header.slice(0, menuStart);
const menue = header.slice(menuStart);

describe("Kopfzeile", () => {
  it("zeigt den Mandantennamen nicht noch einmal", () => {
    // Die Seitenleiste zeigt ihn schon; der Mandantenwechsler bleibt.
    expect(header).not.toContain("tenantName");
  });

  it("Thema, Sprache, Dichte und Tastenkürzel stehen nicht mehr als Symbole in der Leiste", () => {
    expect(leiste).not.toContain("<LanguageSwitcher");
    expect(leiste).not.toContain("<DensityToggle");
    expect(leiste).not.toContain("onClick={toggleTheme}");
    expect(leiste).not.toContain("onClick={openShortcutsDialog}");
  });

  it("sondern beschriftet im Benutzermenü", () => {
    expect(menue).toContain("onClick={toggleTheme}");
    expect(menue).toContain("<SpracheUntermenue");
    expect(menue).toContain("onClick={dichteUmschalten}");
    expect(menue).toContain("onClick={openShortcutsDialog}");
  });

  it("die gespeicherte Dichte greift auch, wenn das Menü nie geöffnet wird", () => {
    // Menüinhalte werden erst beim Öffnen eingehängt — der Hook läuft deshalb
    // in der Kopfzeile selbst.
    expect(leiste).toContain("useDichte()");
  });
});
