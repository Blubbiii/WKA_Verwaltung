/**
 * Wächter für `mitFrist` — die Antwort auf hängende Redis-Aufrufe.
 *
 * ## Der Fehler
 *
 * Bei abgeschaltetem Redis antworteten `/api/admin/jobs`,
 * `/api/admin/jobs/stats` und `/api/admin/system/status` überhaupt nicht mehr
 * — gemessen 45 bzw. 60 Sekunden ohne Ergebnis.
 *
 * Ursache: BullMQ verlangt `maxRetriesPerRequest: null`, und der
 * Reconnect-Versuch gibt nie auf. Ein Redis-Befehl bei getrennter Verbindung
 * wartet dann unbegrenzt — er wirft nicht. Jedes `try/catch` darum ist
 * wirkungslos, weil nichts zu fangen ist.
 *
 * Die einzige Abhilfe ist eine Frist von aussen. Weil `Promise.race` sich
 * leicht subtil falsch schreiben lässt, steht sie an einer Stelle und hier
 * steht, was sie leisten muss.
 */

import { describe, expect, it, vi } from "vitest";
import { mitFrist } from "./frist";

describe("mitFrist", () => {
  it("gibt den Wert zurueck, wenn er rechtzeitig kommt", async () => {
    await expect(mitFrist(Promise.resolve("da"), 1_000)).resolves.toBe("da");
  });

  it("gibt null zurueck, wenn die Frist verstreicht", async () => {
    // Genau der Fall aus der Praxis: ein Versprechen, das NIE erfuellt wird.
    const niemals = new Promise<string>(() => {});
    await expect(mitFrist(niemals, 30)).resolves.toBeNull();
  });

  it("ein haengendes Versprechen blockiert nicht laenger als die Frist", async () => {
    const niemals = new Promise<string>(() => {});
    const start = Date.now();
    await mitFrist(niemals, 50);
    const gebraucht = Date.now() - start;

    expect(
      gebraucht,
      `Die Frist von 50 ms wurde um ${gebraucht - 50} ms ueberschritten. ` +
        `Genau daran hingen die Admin-Seiten: ohne wirksame Frist wartet ein ` +
        `Redis-Aufruf bei getrennter Verbindung unbegrenzt.`,
    ).toBeLessThan(1_000);
  });

  it("nimmt einen eigenen Ersatzwert", async () => {
    const niemals = new Promise<number>(() => {});
    await expect(mitFrist(niemals, 20, -1)).resolves.toBe(-1);
  });

  it("laesst einen Fehlschlag durch — die Frist unterdrueckt ihn nicht", async () => {
    /*
      Wichtig: `mitFrist` regelt nur, wie LANGE gewartet wird. Wer scheitert,
      soll scheitern. Wuerde die Frist auch Fehler schlucken, saehe ein
      kaputter Aufruf aus wie ein langsamer — und niemand suchte weiter.
    */
    const kaputt = Promise.reject(new Error("Verbindung abgelehnt"));
    await expect(mitFrist(kaputt, 1_000)).rejects.toThrow("Verbindung abgelehnt");
  });

  it("raeumt den Timer weg, wenn das Versprechen rechtzeitig kommt", async () => {
    /*
      Der Punkt, den die erste Fassung verfehlt hat.

      Sie prueefte nur, dass der Timer `unref()` bekommt. Das verhindert, dass
      er den Prozess offenhaelt — es raeumt ihn aber nicht weg. Ohne
      `clearTimeout` lebt bei JEDEM rechtzeitigen Ergebnis ein Timer samt
      Closure bis zum Ablauf der Frist weiter. Bei einer Lebendpruefung im
      Sekundentakt mit einer Frist von einer Sekunde heisst das: dauerhaft
      Timer in der Luft, die niemand mehr braucht.

      Ein Test, der die halbe Sache prueeft, bescheinigt die ganze.
    */
    const geraeumt = vi.spyOn(global, "clearTimeout");
    const vorher = geraeumt.mock.calls.length;

    await mitFrist(Promise.resolve("da"), 10_000);

    expect(
      geraeumt.mock.calls.length,
      "clearTimeout wurde nicht gerufen — der Timer laeuft 10 Sekunden ins Leere",
    ).toBeGreaterThan(vorher);
    geraeumt.mockRestore();
  });

  it("raeumt den Timer auch nach einem Fehlschlag weg", async () => {
    const geraeumt = vi.spyOn(global, "clearTimeout");
    const vorher = geraeumt.mock.calls.length;

    await mitFrist(Promise.reject(new Error("kaputt")), 10_000).catch(() => null);

    expect(
      geraeumt.mock.calls.length,
      "Nach einem Fehlschlag bleibt der Timer stehen",
    ).toBeGreaterThan(vorher);
    geraeumt.mockRestore();
  });

  it("die Frist haelt den Prozess nicht offen", () => {
    // Ergaenzend zum Wegraeumen: solange der Timer laeuft, darf er das
    // Herunterfahren des Servers nicht um die volle Fristdauer verzoegern.
    const spion = vi.spyOn(global, "setTimeout");
    void mitFrist(new Promise<number>(() => {}), 10_000);
    const uhr = spion.mock.results[spion.mock.results.length - 1]?.value;
    expect(
      typeof uhr === "object" && uhr !== null && "unref" in uhr,
      "Der Timer kennt kein unref() — dann ist nicht pruefbar, ob er entwarnt wurde",
    ).toBe(true);
    spion.mockRestore();
  });
});
