/**
 * Der Seed vergibt im Echtbetrieb kein voreingestelltes Passwort.
 *
 * ## Der Anlass
 *
 * `prisma/seed.ts` nahm `admin123` für den Superadmin, wenn keine
 * Umgebungsvariable gesetzt war — und zwar **stillschweigend**. Für
 * Entwicklungsdatenbanken ist das bequem. Beim ersten Aufsetzen einer
 * Produktivinstanz ist es ein öffentlich bekanntes Passwort für das Konto mit
 * den meisten Rechten, und niemand merkt es: der Seed läuft durch wie immer.
 *
 * Das ist besonders heikel bei einem geplanten Zurücksetzen vor dem
 * Echtbetrieb — genau dann wird der Seed erneut ausgeführt, und genau dann
 * landet die Vorgabe in der Produktion.
 *
 * ## Warum ein Quelltext-Test
 *
 * Den Seed auszuführen hiesse, eine Datenbank zu befüllen. Geprüft wird
 * deshalb die Zusage: es gibt eine gemeinsame Stelle, die entscheidet, und
 * sie bricht bei `NODE_ENV=production` ab.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SEED = readFileSync("prisma/seed.ts", "utf-8");

describe("Seed-Passwoerter", () => {
  it("es gibt eine gemeinsame Stelle fuer Startpasswoerter", () => {
    expect(
      SEED.includes("function startpasswort("),
      "Die Entscheidung, welches Startpasswort gilt, ist wieder ueber den Seed " +
        "verteilt. Dann laesst sich nicht mehr an einer Stelle sicherstellen, " +
        "dass im Echtbetrieb keine Vorgabe greift.",
    ).toBe(true);
  });

  it("im Echtbetrieb wird abgebrochen statt geraten", () => {
    const stelle = SEED.indexOf("function startpasswort(");
    const rumpf = SEED.slice(stelle, stelle + 1200);

    expect(
      /NODE_ENV\s*===\s*"production"/.test(rumpf),
      "startpasswort() prueft NODE_ENV nicht mehr — damit vergibt der Seed im " +
        "Echtbetrieb wieder ein bekanntes Passwort.",
    ).toBe(true);
    expect(
      /throw new Error/.test(rumpf),
      "startpasswort() bricht im Echtbetrieb nicht mehr ab. Ein Seed, der sich " +
        "weigert, ist ein kleines Aergernis; ein Superadmin mit einem " +
        "bekannten Passwort ist ein offenes Tor.",
    ).toBe(true);
  });

  it("kein Passwort steht mehr direkt im Aufruf", () => {
    // Die Gegenprobe: fruher stand `process.env.X || "admin123"` an drei
    // Stellen, eine davon ganz ohne Umgebungsvariable.
    expect(
      /process\.env\.SEED_\w+\s*\|\|\s*"/.test(SEED),
      "Ein Startpasswort wird wieder direkt im Aufruf voreingestellt, an " +
        "startpasswort() vorbei.",
    ).toBe(false);

    expect(
      /bcrypt\.hash\(\s*"/.test(SEED),
      "Ein Passwort steht wieder als Zeichenkette direkt im bcrypt-Aufruf.",
    ).toBe(false);
  });

  it("die Variablen sind dokumentiert", () => {
    const beispiel = readFileSync(".env.example", "utf-8");
    for (const v of [
      "SEED_SUPERADMIN_PASSWORD",
      "SEED_DEMO_ADMIN_PASSWORD",
      "SEED_DEMO_MANAGER_PASSWORD",
    ]) {
      expect(
        beispiel.includes(v),
        `${v} fehlt in .env.example — wer die Instanz aufsetzt, erfaehrt sonst ` +
          `erst beim Abbruch des Seeds davon.`,
      ).toBe(true);
    }
  });
});
