/**
 * Fehlschlag-Semantik der Worker (Audit 2026-07: F6, F10, F11, F16).
 *
 * Gemeinsames Muster aller vier Befunde: ein Fehlschlag wurde als Erfolg
 * verbucht oder falsch klassifiziert. Die Tests halten die Regeln fest, weil
 * genau hier ein Fehler Geld kostet — ein faelschlich wiederholter Billing-Job
 * legt Rechnungen doppelt an, ein faelschlich NICHT wiederholter verliert sie.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isRetryableHttpStatus } from "./workers/webhook.worker";

const SRC = join(process.cwd(), "src");

function read(relativePath: string): string {
  return readFileSync(join(SRC, relativePath), "utf-8");
}

// ---------------------------------------------------------------------------
// F16 · Fehlerklassifikation
// ---------------------------------------------------------------------------

describe("isRetryableHttpStatus (F16)", () => {
  it.each([500, 502, 503, 504, 408, 429])(
    "%i ist transient und wird wiederholt",
    (status) => {
      expect(isRetryableHttpStatus(status)).toBe(true);
    },
  );

  it.each([400, 401, 403, 404, 410, 422])(
    "%i ist permanent und wird NICHT wiederholt",
    (status) => {
      expect(isRetryableHttpStatus(status)).toBe(false);
    },
  );

  it("der Webhook-Worker verwirft permanente Fehlschlaege statt zu retryen", () => {
    const source = read("lib/queue/workers/webhook.worker.ts");
    expect(source).toContain("isRetryableHttpStatus(response.status)");
    expect(source).toContain("job.discard()");
  });
});

describe("inbox-ocr Fehlerklassifikation (F16)", () => {
  const source = read("lib/queue/workers/inbox-ocr.worker.ts");

  it("ein Ladefehler wird geworfen, damit BullMQ wiederholt", () => {
    // Vorher: jeder Fehler — auch ein S3-Timeout — endete in
    // `return { success: false }`, also ohne Retry und mit ocrStatus FAILED.
    expect(source).toMatch(/getFileBuffer\(fileUrl\);[\s\S]*?throw err instanceof Error/);
  });

  it("Laden und Parsen liegen in getrennten try-Bloecken", () => {
    const tryCount = (source.match(/\btry \{/g) ?? []).length;
    expect(tryCount).toBeGreaterThanOrEqual(2);
  });

  it("der Datensatz wird erst beim letzten Versuch festgeschrieben", () => {
    // Sonst haengt die Rechnung dauerhaft auf PROCESSING, wenn alle
    // Ladeversuche scheitern.
    expect(source).toContain("isFinalAttempt");
  });

  it("ein Parse-Fehler bleibt permanent (kein Retry derselben Bytes)", () => {
    expect(source).toMatch(/Text extraction failed[\s\S]*?return \{ success: false/);
  });
});

// ---------------------------------------------------------------------------
// F11 · Fachliche Fehlschlaege muessen als gescheitert sichtbar werden
// ---------------------------------------------------------------------------

describe("billing job failure gate (F11)", () => {
  const source = read("lib/queue/workers/billing.worker.ts");

  it("ein result.success === false wird geworfen statt zurueckgegeben", () => {
    // Vorher wurde `result` unveraendert zurueckgegeben: BullMQ zaehlte den Job
    // als completed, der failed-Handler und damit die DLQ griffen nie.
    expect(source).toContain("if (!result.success)");
    expect(source).toContain("throw new Error(failureMessage)");
  });

  it("ohne retryable-Flag wird der Job verworfen, nicht wiederholt", () => {
    // Ein Retry wuerde bei einem Teil-Lauf die bereits erzeugten Rechnungen
    // ein zweites Mal anlegen.
    expect(source).toMatch(/if \(!result\.retryable\)\s*\{\s*[\s\S]*?job\.discard\(\);/);
  });

  it("gutartige Uebersprungen melden Erfolg, nicht Fehlschlag", () => {
    // PAID, CANCELLED, DRAFT und "noch nicht faellig" sind keine Fehler —
    // sonst fluten sie mit dem neuen Gate die Dead-Letter-Queue.
    const skipBlocks = source.match(/skipped: true/g) ?? [];
    expect(skipBlocks.length).toBeGreaterThanOrEqual(4);
  });

  it("der execute-rule-Handler meldet einen partial-Lauf nicht als Erfolg", () => {
    expect(source).toContain('result.status === "success"');
  });
});

// ---------------------------------------------------------------------------
// F10 · Mahnung darf keinen Erfolg melden, wenn nichts rausging
// ---------------------------------------------------------------------------

describe("Mahnversand (F10)", () => {
  const source = read("lib/queue/workers/billing.worker.ts");

  it("ohne tatsaechlichen Versand gibt es kein success: true", () => {
    expect(source).toContain("if (!emailSent)");
  });

  it("ein Enqueue-Fehler wird nicht mehr geschluckt", () => {
    expect(source).not.toContain("Email sending is non-critical");
    expect(source).toContain("emailFailure");
  });

  it("ein Enqueue-Fehler gilt als transient, eine fehlende Adresse nicht", () => {
    expect(source).toMatch(/retryable: true/);
    expect(source).toMatch(/retryable: false/);
  });

  it("die Mahnnotiz wird erst nach dem Versand geschrieben", () => {
    // Vorher stand "... versendet" VOR dem Versandversuch in invoice.notes —
    // die Rechnung behauptete dauerhaft, gemahnt worden zu sein.
    // Auf das Notiz-Literal pruefen, nicht auf den Wortlaut allein: derselbe
    // Text kommt auch in der Fehlermeldung vor, und zwar weiter oben.
    const noteIndex = source.indexOf("${reminderLabel} in den Versand gegeben");
    const guardIndex = source.indexOf("if (!emailSent)");
    expect(noteIndex, "Notiz-Literal nicht gefunden").toBeGreaterThan(-1);
    expect(guardIndex, "emailSent-Guard nicht gefunden").toBeGreaterThan(-1);
    expect(noteIndex).toBeGreaterThan(guardIndex);
  });

  it("das invoice.update fuer die Notiz liegt hinter dem Guard", () => {
    const guardIndex = source.indexOf("if (!emailSent)");
    const updateIndex = source.indexOf("notes: (invoice.notes || \"\") + reminderNote");
    expect(updateIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(guardIndex);
  });
});

// ---------------------------------------------------------------------------
// F6 · Reconciler darf einen Fehlschlag nicht als erledigt abhaken
// ---------------------------------------------------------------------------

describe("approvals reconcile (F6)", () => {
  const source = read("lib/queue/workers/approvals-reconcile.worker.ts");

  it("executedAt wird bei einem Fehlschlag nicht gesetzt, solange Versuche offen sind", () => {
    expect(source).toContain("executedAt: giveUp ? new Date() : null");
  });

  it("es gibt eine Versuchsobergrenze statt Aufgabe beim ersten Fehler", () => {
    expect(source).toContain("MAX_RECONCILE_ATTEMPTS");
    expect(source).toContain("readAttempts");
  });

  it("es gibt keinen Pfad mehr, der executedAt bedingungslos setzt", () => {
    // Der Kern von F6: beide Fehlerpfade setzten `executedAt: new Date()`.
    // Erlaubt ist das jetzt nur im Erfolgsfall und beim endgueltigen Aufgeben.
    const unconditional = source.match(/executedAt: new Date\(\)/g) ?? [];
    expect(
      unconditional.length,
      "executedAt: new Date() darf nur noch im Erfolgspfad stehen",
    ).toBe(1);
  });

  it("ein endgueltig gescheitertes Approval benachrichtigt Admins", () => {
    // Eine genehmigte, geldrelevante Aktion darf nicht still verschwinden.
    expect(source).toContain("notifyAdmins");
    expect(source).toContain("gaveUpCount");
  });
});
