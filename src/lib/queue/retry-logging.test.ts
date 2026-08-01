/**
 * Ein Wiederholungsversuch ist kein endgültiger Fehlschlag.
 *
 * Aufgefallen im Produktionslog am 01.08.2026:
 *
 *     attempt: 1, maxAttempts: 3   "Weather sync failed"
 *     attempts: 1                  "Job failed permanently"     ← level: error
 *     …fünf Sekunden später:       "Job completed"
 *
 * Der Abruf ist beim zweiten Versuch geglückt. Trotzdem stand zweimal
 * „failed permanently" auf Fehlerstufe im Log — wegen einer Störung bei
 * Open-Meteo, die sich von selbst erledigt hat. Wer auf diesen Text
 * alarmiert, bekommt Fehlalarme; wer sie eine Weile bekommt, sieht nicht
 * mehr hin.
 *
 * Ursache: BullMQ feuert `failed` bei JEDEM fehlgeschlagenen Versuch. Ein
 * separates „endgültig gescheitert"-Ereignis gibt es nicht.
 *
 * Es ist derselbe Befund wie im übrigen Audit, nur umgekehrt: dort sah ein
 * nicht stattgefundener Vorgang aus wie ein unauffälliger, hier sieht ein
 * geglückter aus wie ein gescheiterter.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isFinalAttempt } from "./dead-letter";
import type { Job } from "bullmq";

const WORKERS_DIR = join(process.cwd(), "src/lib/queue/workers");

function job(attemptsMade: number, attempts: number): Job {
  return { attemptsMade, opts: { attempts } } as unknown as Job;
}

describe("isFinalAttempt", () => {
  it("der erste von drei Versuchen ist nicht der letzte", () => {
    expect(isFinalAttempt(job(1, 3))).toBe(false);
  });

  it("der dritte von drei ist es", () => {
    expect(isFinalAttempt(job(3, 3))).toBe(true);
  });

  it("ohne Wiederholungen ist der erste Versuch bereits der letzte", () => {
    expect(isFinalAttempt(job(1, 1))).toBe(true);
  });

  it("mehr Versuche als vorgesehen gelten als endgueltig", () => {
    // Sicherheitsnetz: laege der Zaehler je hoeher, waere „noch nicht
    // endgueltig" die falsche Antwort — der Fehlschlag verschwaende ganz.
    expect(isFinalAttempt(job(5, 3))).toBe(true);
  });
});

describe("Die Fehlerbehandlung der Worker", () => {
  const files = readdirSync(WORKERS_DIR).filter((f) => f.endsWith(".worker.ts"));

  it("kein Worker meldet mehr pauschal „failed permanently\"", () => {
    const offenders = files.filter((f) =>
      readFileSync(join(WORKERS_DIR, f), "utf-8").includes("Job failed permanently"),
    );
    expect(
      offenders.join(", "),
      "Ein Wiederholungsversuch darf nicht als endgueltiger Fehlschlag protokolliert werden — isFinalAttempt(job) aus ../dead-letter unterscheidet das.",
    ).toBe("");
  });

  it("wer zwischen den Stufen unterscheidet, nutzt isFinalAttempt", () => {
    // Die Unterscheidung selbst nachzubauen waere die naechste Kopie, die
    // auseinanderlaeuft — siehe SCADA-Intervall und Anteilstoleranz.
    const withLevels = files.filter((f) => {
      const s = readFileSync(join(WORKERS_DIR, f), "utf-8");
      return s.includes("endgueltig gescheitert");
    });
    expect(withLevels.length).toBeGreaterThan(0);
    for (const f of withLevels) {
      const s = readFileSync(join(WORKERS_DIR, f), "utf-8");
      expect(s, `${f} baut die Unterscheidung selbst`).toContain("isFinalAttempt");
    }
  });
});
