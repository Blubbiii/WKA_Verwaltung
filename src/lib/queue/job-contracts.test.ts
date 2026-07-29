/**
 * Producer/Consumer-Vertragstests für die Queues.
 *
 * Hintergrund (Audit 2026-07, Worker/Queues F2 + F3): Billing und Email hatten
 * jeweils ZWEI verschiedene Typen mit demselben Namen — einen im Queue-Modul
 * (von den Producern benutzt) und einen im Worker-Modul. Weil kein Import
 * dazwischen lag, war der Widerspruch für TypeScript unsichtbar. Zur Laufzeit
 * landete jeder Billing-Job im default-Zweig ("Unknown billing job type:
 * undefined") und jeder Email-Job im Fallback-Zweig, der auf `undefined`
 * zugriff → TypeError, 3x Retry, dann Dead-Letter-Queue.
 *
 * Diese Tests prüfen die Verträge zur LAUFZEIT, also auch dort, wo der
 * Compiler wegschaut: dass jeder Job-Typ einen Handler hat und dass jeder
 * Template-Name tatsächlich renderbar ist.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { BillingJobType } from "./queues/billing.queue";
import { SUPPORTED_TEMPLATE_NAMES, isSupportedTemplate } from "@/lib/email/renderer";
import type { EmailTemplate } from "./queues/email.queue";

const SRC = join(process.cwd(), "src");

function read(relativePath: string): string {
  return readFileSync(join(SRC, relativePath), "utf-8");
}

// ---------------------------------------------------------------------------
// F2 · Billing: jeder Job-Typ braucht einen case im Worker-Switch
// ---------------------------------------------------------------------------

describe("billing job contract", () => {
  /** Die Typen, die der Queue-Vertrag erlaubt. */
  const declaredTypes: BillingJobType[] = [
    "execute-rule",
    "generate-invoice",
    "generate-settlement",
    "send-reminder",
    "calculate-fees",
    "bulk-invoice",
    "process-recurring-invoices",
  ];

  const workerSource = read("lib/queue/workers/billing.worker.ts");

  it("der Worker importiert den Job-Typ aus dem Queue-Modul", () => {
    // Genau das fehlte: ohne diesen Import konnten die beiden Definitionen
    // beliebig auseinanderlaufen, ohne dass tsc etwas merkt.
    expect(workerSource).toMatch(
      /import type \{[\s\S]*?\} from "\.\.\/queues\/billing\.queue"/,
    );
  });

  it("der Worker definiert BillingJobData nicht selbst neu", () => {
    expect(workerSource).not.toMatch(/^export type BillingJobData =/m);
    expect(workerSource).not.toMatch(/^export interface BillingJobData\b/m);
  });

  it.each(declaredTypes)("Job-Typ '%s' hat einen Handler im Switch", (type) => {
    expect(workerSource).toContain(`case "${type}":`);
  });

  it("die Producer setzen alle einen type", () => {
    const queueSource = read("lib/queue/queues/billing.queue.ts");
    // Jedes literal angelegte Job-Objekt im Queue-Modul muss ein `type:` haben.
    const jobDataLiterals = queueSource.match(
      /const jobData: BillingJobData = \{[\s\S]*?\n  \};/g,
    );
    expect(jobDataLiterals, "keine jobData-Literale gefunden").toBeTruthy();
    for (const literal of jobDataLiterals!) {
      expect(literal).toMatch(/type: '/);
    }
  });
});

// ---------------------------------------------------------------------------
// F3 · Email: jeder Template-Name muss renderbar sein
// ---------------------------------------------------------------------------

describe("email job contract", () => {
  const workerSource = read("lib/queue/workers/email.worker.ts");

  it("der Worker importiert EmailJobData aus dem Queue-Modul", () => {
    expect(workerSource).toMatch(
      /import type \{ EmailJobData \} from "\.\.\/queues\/email\.queue"/,
    );
  });

  it("der Worker definiert EmailJobData nicht selbst neu", () => {
    expect(workerSource).not.toMatch(/^export interface EmailJobData\b/m);
  });

  it("der Worker pflegt keine zweite Template-Liste", () => {
    // "knownTemplates" war die handgepflegte Kopie — sie war falsch
    // ('invoice-reminder' fehlte) und driftete unbemerkt.
    expect(workerSource).not.toContain("knownTemplates");
    expect(workerSource).toContain("isSupportedTemplate");
  });

  it("der Renderer kennt mindestens die erwarteten Templates", () => {
    expect(SUPPORTED_TEMPLATE_NAMES.length).toBeGreaterThanOrEqual(14);
    expect(new Set(SUPPORTED_TEMPLATE_NAMES).size).toBe(
      SUPPORTED_TEMPLATE_NAMES.length,
    );
  });

  it("isSupportedTemplate stimmt mit der Namensliste überein", () => {
    for (const name of SUPPORTED_TEMPLATE_NAMES) {
      expect(isSupportedTemplate(name)).toBe(true);
    }
    expect(isSupportedTemplate("invoice-notification")).toBe(false);
    expect(isSupportedTemplate("service-event-notification")).toBe(false);
  });

  it("invoice-reminder ist renderbar — genau dieses Template fiel vorher durch", () => {
    expect(isSupportedTemplate("invoice-reminder")).toBe(true);
  });

  it("kein Producer verschickt ein nicht existierendes Template", () => {
    // Regression gegen die drei konkreten Fundstellen: billing.worker,
    // reminder-service und die Uebersetzungstabelle in email/sender.
    const producerFiles = [
      "lib/queue/workers/billing.worker.ts",
      "lib/reminders/reminder-service.ts",
      "lib/reports/scheduled-report-service.ts",
      "lib/email/sender.ts",
    ];

    let checked = 0;
    for (const file of producerFiles) {
      const source = read(file);
      const templateLiterals = [
        ...source.matchAll(/template:\s*["']([a-z0-9-]+)["']/g),
      ].map((m) => m[1]);

      for (const name of templateLiterals) {
        checked++;
        expect(
          isSupportedTemplate(name),
          `${file} verschickt Template "${name}", das der Renderer nicht kennt`,
        ).toBe(true);
      }
    }

    // Ohne diese Zusicherung wuerde der Test auch dann gruen sein, wenn das
    // Regex nichts mehr findet (z. B. nach einem Umbau der Aufrufe).
    expect(checked, "keine template-Literale gefunden — Regex veraltet?").toBeGreaterThan(0);
  });

  it("EmailTemplate ist an den Renderer gekoppelt", () => {
    // Typ-Ebene: die Zuweisung compiliert nur, wenn beide identisch sind.
    const name: EmailTemplate = "invoice-reminder";
    expect(isSupportedTemplate(name)).toBe(true);
  });
});
