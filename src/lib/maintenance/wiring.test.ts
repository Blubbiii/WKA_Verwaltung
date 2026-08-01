/**
 * Wartungslaeufe: Zeitplan, Verarbeiter und Endpunkt haengen zusammen.
 *
 * Der Befund, der zu dieser Welle fuehrte, war kein Absturz und keine falsche
 * Zahl: Fristenpruefung, Basiszinssatz und Bankabruf lagen als
 * `/api/cron/*`-Endpunkte bereit, mit Bearer-Token davor und dem Hinweis "kann
 * von einem externen Scheduler aufgerufen werden" — und niemand rief sie auf.
 * Kein Fehler, kein Log, drei Laeufe fanden schlicht nie statt.
 *
 * Diese Tests halten die Kette fest, an der es gehangen hat. Sie pruefen
 * bewusst die VERDRAHTUNG, nicht die Fachlogik: die Fachlogik war die ganze
 * Zeit richtig, sie wurde nur nie angestossen.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MAINTENANCE_JOBS,
  MAINTENANCE_QUEUE_NAME,
} from "@/lib/queue/queues/maintenance.queue";
import { CRON_SCHEDULES, CRON_TIMEZONE } from "@/lib/config/cron-schedules";

const SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf-8");

const WORKER_SOURCE = read("lib/queue/workers/maintenance.worker.ts");
const QUEUE_SOURCE = read("lib/queue/queues/maintenance.queue.ts");
const REGISTRY_SOURCE = read("lib/queue/workers/index.ts");
const ENTRYPOINT_SOURCE = read("workers/index.ts");

// ---------------------------------------------------------------------------
// Jeder geplante Job hat einen Verarbeiter
// ---------------------------------------------------------------------------

describe("Zeitplan und Verarbeiter decken sich", () => {
  it("fuer jeden Job-Namen gibt es einen Zweig im Worker", () => {
    // Genau die Luecke, die den Befund ausmachte: etwas ist eingeplant, aber
    // niemand arbeitet es ab.
    for (const jobName of Object.values(MAINTENANCE_JOBS)) {
      const constantName = Object.keys(MAINTENANCE_JOBS).find(
        (k) => MAINTENANCE_JOBS[k as keyof typeof MAINTENANCE_JOBS] === jobName,
      );
      expect(
        WORKER_SOURCE.includes(`MAINTENANCE_JOBS.${constantName}`),
        `Job "${jobName}" ist geplant, hat aber keinen Zweig im Worker`,
      ).toBe(true);
    }
  });

  it("jeder Job-Name wird auch tatsaechlich eingeplant", () => {
    for (const jobName of Object.values(MAINTENANCE_JOBS)) {
      const constantName = Object.keys(MAINTENANCE_JOBS).find(
        (k) => MAINTENANCE_JOBS[k as keyof typeof MAINTENANCE_JOBS] === jobName,
      );
      expect(
        QUEUE_SOURCE.includes(`MAINTENANCE_JOBS.${constantName}`),
        `Job "${jobName}" hat einen Verarbeiter, wird aber nie eingeplant`,
      ).toBe(true);
    }
  });

  it("ein unbekannter Job-Name scheitert laut, statt still zu gelingen", () => {
    // Ohne `throw` im default-Zweig saehe ein Tippfehler im Zeitplan aus wie
    // ein erfolgreich gelaufener Job — dieselbe Klasse Fehler wie der Befund.
    const defaultBranch = WORKER_SOURCE.split("default:")[1] ?? "";
    expect(defaultBranch).toContain("throw new Error");
  });
});

// ---------------------------------------------------------------------------
// Der Worker muss in der Registry stehen
// ---------------------------------------------------------------------------

describe("Registrierung", () => {
  it("der Maintenance-Worker steht in der Worker-Registry", () => {
    // F17: Ohne Registry-Eintrag erreicht SIGTERM ihn nicht, er taucht nicht im
    // Health-Status auf und bekommt keinen Dead-Letter-Hook.
    expect(REGISTRY_SOURCE).toContain("WORKER_NAMES.MAINTENANCE");
    expect(REGISTRY_SOURCE).toContain("startMaintenanceWorker");
    expect(REGISTRY_SOURCE).toContain("stopMaintenanceWorker");
  });

  it("der Worker-Einstiegspunkt plant die Wartungslaeufe ein", () => {
    // Ein Worker ohne Zeitplan waere derselbe Zustand wie vorher: alles da,
    // nichts laeuft.
    expect(ENTRYPOINT_SOURCE).toContain("scheduleMaintenanceJobs");
  });

  it("die Queue heisst so, wie die Registry sie nennt", () => {
    expect(MAINTENANCE_QUEUE_NAME).toBe("maintenance");
    expect(REGISTRY_SOURCE).toContain('MAINTENANCE: "maintenance"');
  });
});

// ---------------------------------------------------------------------------
// Zeitplaene
// ---------------------------------------------------------------------------

describe("Zeitplaene", () => {
  it("alle drei Muster sind gueltige Cron-Ausdruecke", () => {
    const patterns = [
      CRON_SCHEDULES.DEADLINE_CHECK,
      CRON_SCHEDULES.BUNDESBANK_RATES,
      CRON_SCHEDULES.BANK_CONNECTION_CHECK,
    ];
    for (const pattern of patterns) {
      expect(pattern.trim().split(/\s+/).length).toBe(5);
    }
  });

  it("die Fristenpruefung laeuft VOR Mahnlauf und Tagesbericht", () => {
    // Sonst stehen die Benachrichtigungen erst im Bericht des Folgetags.
    const hour = (pattern: string) => Number(pattern.trim().split(/\s+/)[1]);
    expect(hour(CRON_SCHEDULES.DEADLINE_CHECK)).toBeLessThan(
      hour(CRON_SCHEDULES.DAILY_DIGEST),
    );
    expect(hour(CRON_SCHEDULES.DEADLINE_CHECK)).toBeLessThan(
      hour(CRON_SCHEDULES.REMINDER),
    );
  });

  it("die Bankpruefung laeuft VOR dem Mahnlauf", () => {
    // Sonst wird auf Basis veralteter Umsaetze gemahnt, ohne dass jemand weiss,
    // dass sie veraltet sind.
    const hour = (pattern: string) => Number(pattern.trim().split(/\s+/)[1]);
    expect(hour(CRON_SCHEDULES.BANK_CONNECTION_CHECK)).toBeLessThan(
      hour(CRON_SCHEDULES.REMINDER),
    );
  });

  it("die Repeats tragen eine Zeitzone", () => {
    // F24: ohne `tz` wertet BullMQ in UTC aus — "taeglich 07:00" liefe real um
    // 08:00 bzw. 09:00 und verschoebe sich zweimal im Jahr.
    expect(QUEUE_SOURCE).toContain("tz: CRON_TIMEZONE");
    expect(CRON_TIMEZONE).toBe("Europe/Berlin");
  });

  it("die Repeat-IDs sind stabil, nicht zeitabhaengig", () => {
    // Eine ID mit Date.now() erzeugt bei jedem Neustart einen zusaetzlichen
    // Repeat — nach zehn Neustarts liefe die Fristenpruefung zehnmal.
    const scheduleBlock = QUEUE_SOURCE.split("scheduleMaintenanceJobs")[1] ?? "";
    const repeatSection = scheduleBlock.split("enqueueMaintenanceNow")[0] ?? "";
    expect(repeatSection).not.toContain("Date.now()");
    expect(repeatSection).toContain("jobId: entry.name");
  });
});

// ---------------------------------------------------------------------------
// Endpunkt und Worker teilen sich die Fachlogik
// ---------------------------------------------------------------------------

describe("Keine zweite Kopie der Fachlogik", () => {
  const ROUTES = [
    "app/api/cron/check-deadlines/route.ts",
    "app/api/cron/bundesbank-rate-fetch/route.ts",
    "app/api/cron/bank-fetch/route.ts",
  ];

  it("die Routen rufen die gemeinsame Umsetzung auf", () => {
    for (const route of ROUTES) {
      expect(read(route), `${route} nutzt die gemeinsame Logik nicht`).toContain(
        "@/lib/maintenance/tasks",
      );
    }
  });

  it("keine Route greift noch selbst auf die Datenbank zu", () => {
    // Solange die Route ihre eigene Abfrage hielt, konnten Endpunkt und Worker
    // auseinanderlaufen — genau die Falle, die B7 beim Bankimport schon hatte.
    for (const route of ROUTES) {
      const source = read(route);
      const code = source
        .split("\n")
        .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
        .join("\n");
      expect(code, `${route} fragt noch selbst ab`).not.toContain("prisma.");
    }
  });

  it("die Endpunkte bleiben fuer den Handbetrieb erhalten und bleiben geschuetzt", () => {
    // Sie abzuschaffen waere bequem gewesen, nimmt aber die Moeglichkeit, einen
    // versaeumten Lauf nachzuziehen. Ungeschuetzt duerfen sie deshalb nicht sein.
    for (const route of ROUTES) {
      const source = read(route);
      expect(source, `${route} prueft nicht mehr auf Berechtigung`).toMatch(
        /bearerTokenMatches\(/,
      );
    }
  });
});
