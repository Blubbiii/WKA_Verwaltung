/**
 * Wächter: die Berechtigungs-Matrix bildet den Superadmin-Bypass ab.
 *
 * ## Der Fehler
 *
 * Die exportierte Matrix vom 05.08.2026 zeigte beim Superadmin 61 von 188
 * Zeilen leer. Sie las nur die Zuweisungen aus der Datenbank — und dort hat
 * die Rolle diese Rechte tatsächlich nicht. Sie braucht sie auch nicht:
 * `requirePermission()` gibt bei Rangstufe >= 100 frei, ohne zu prüfen.
 *
 * Weil genau diese 61 auch sonst keiner Rolle zugewiesen sind, las sich jede
 * Zeile als „das darf niemand" — bei Buchungen festschreiben, Buchungen
 * stornieren, Periode sperren, Bilanz, Jahresabschluss, GoBD Z3-Export,
 * DATEV-Export, Audit-Logs anzeigen.
 *
 * ## Was dieser Test festhält
 *
 * Zweierlei, und der zweite Teil ist der wichtigere:
 *
 * 1. Eine Rolle mit Rangstufe 100 bekommt alle Rechte.
 * 2. Die Grenze hier ist **dieselbe** wie die in `withPermission.ts`.
 *
 * Ohne 2 wandert der Fehler nur: verschiebt jemand die Bypass-Grenze in der
 * Rechteprüfung, stimmt das Dokument wieder nicht — und wieder fällt es
 * niemandem auf, weil beide Stellen für sich genommen plausibel aussehen.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { effektiveRechte, umgehtRechtepruefung } from "./effektive-rechte";
import { ROLE_HIERARCHY } from "./hierarchy";

/*
  Erfundene Namen, mit Absicht.

  Hier standen zuerst echte („system:audit"). Das liess `permission-coverage`
  fehlschlagen: jener Waechter zaehlt jedes Vorkommen eines Rechtenamens in
  Anfuehrungszeichen als „wird geprueft" — und meine Testdaten sahen fuer ihn
  aus wie eine Route.

  Ein Test, der einen anderen Waechter blind macht, ist ein Eigentor. Diese
  Funktion braucht keine echten Namen; sie sortiert Zeichenketten.
*/
const ALLE = ["beispiel:lesen", "beispiel:buchen", "beispiel:pruefen", "beispiel:anlegen"];

describe("Effektive Rechte", () => {
  it("Superadmin darf alles, auch ohne Zuweisung", () => {
    const befund = effektiveRechte(
      { hierarchy: 100, zugewieseneRechte: ["beispiel:lesen"] },
      ALLE,
    );

    expect(
      befund.effektiv,
      "Die Superadmin-Rolle umgeht die Rechtepruefung — in der Matrix muss " +
        "das als Haken erscheinen, sonst behauptet sie das Gegenteil",
    ).toEqual(ALLE);
    expect(befund.umgehtPruefung).toBe(true);
    expect(
      befund.zugewiesen,
      "Die Zahl der ausdruecklichen Zuweisungen muss erhalten bleiben — sie " +
        "erklaert im Dokument, woher die uebrigen Haken kommen",
    ).toBe(1);
  });

  it("Administrator bekommt genau seine Zuweisungen", () => {
    const befund = effektiveRechte(
      { hierarchy: 80, zugewieseneRechte: ["beispiel:lesen", "beispiel:anlegen"] },
      ALLE,
    );

    expect(
      befund.effektiv,
      "Rangstufe 80 umgeht die Pruefung NICHT — sonst waere jede Zelle ein " +
        "Haken und die Matrix wertlos",
    ).toEqual(["beispiel:lesen", "beispiel:anlegen"]);
    expect(befund.umgehtPruefung).toBe(false);
  });

  it("eine Rolle ohne Rechte bekommt keine", () => {
    const befund = effektiveRechte({ hierarchy: 20, zugewieseneRechte: [] }, ALLE);
    expect(befund.effektiv).toEqual([]);
  });

  it("die Bypass-Grenze ist dieselbe wie in der Rechtepruefung", () => {
    /*
      Der eigentliche Zweck dieser Datei.

      `withPermission.ts` entscheidet mit `rawHierarchy >= 100`. Steht dort
      eines Tages 90 oder 120, muss der Export mitziehen — sonst zeigt das
      Dokument wieder etwas anderes, als das System tut.

      Geprueft wird am Quelltext und nicht an einer Nachbildung: eine
      nachgebaute Pruefung koennte dieselbe Annahme enthalten wie der Fehler.
    */
    const quelle = readFileSync(
      join(__dirname, "withPermission.ts"),
      "utf-8",
    );

    const treffer = /rawHierarchy\s*>=\s*(\d+)/.exec(quelle);

    expect(
      treffer,
      "In withPermission.ts ist die Bypass-Pruefung `rawHierarchy >= <Zahl>` " +
        "nicht mehr zu finden. Wurde sie umgebaut, muss dieser Waechter " +
        "nachgezogen werden — sonst prueft er nichts mehr.",
    ).not.toBeNull();

    const grenze = Number(treffer![1]);

    expect(
      grenze,
      `Die Rechtepruefung laesst ab Rangstufe ${grenze} alles durch, die ` +
        `Matrix rechnet mit ${ROLE_HIERARCHY.SUPERADMIN}. Solange die beiden ` +
        `auseinanderliegen, zeigt die exportierte Berechtigungs-Matrix etwas ` +
        `anderes als das, was das System tatsaechlich erlaubt.`,
    ).toBe(ROLE_HIERARCHY.SUPERADMIN);

    // Und die abgeleitete Funktion muss sich an genau dieser Grenze drehen.
    expect(umgehtRechtepruefung(grenze - 1)).toBe(false);
    expect(umgehtRechtepruefung(grenze)).toBe(true);
  });
});
