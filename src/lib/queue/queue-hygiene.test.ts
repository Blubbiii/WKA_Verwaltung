/**
 * Queue-Hygiene (F8, F14, F20, F21, F22, F23, F25, F26, F27).
 *
 * Diese Welle hat vor allem Fallen entschaerft, die erst im Betrieb sichtbar
 * werden: Crons, die sich nicht abschalten lassen, Jobs, die eine
 * Neuerzeugung blockieren, Secrets in Redis. Die Tests halten die Regeln fest,
 * damit sie nicht zurueckfallen.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { timingSafeEquals, bearerTokenMatches } from "@/lib/auth/timing-safe";
import { WORKER_LOCK_MS } from "@/lib/config/queue-config";

const SRC = join(process.cwd(), "src");
const QUEUES_DIR = join(SRC, "lib/queue/queues");
const WORKERS_DIR = join(SRC, "lib/queue/workers");

function read(relativePath: string): string {
  return readFileSync(join(SRC, relativePath), "utf-8");
}

// ---------------------------------------------------------------------------
// F20 · Repeatable-Keys
// ---------------------------------------------------------------------------

describe("Repeatable-Entfernung (F20)", () => {
  const queueFiles = readdirSync(QUEUES_DIR).filter((f) => f.endsWith(".queue.ts"));

  it("keine Queue baut einen Repeatable-Key mehr von Hand", () => {
    // Das Key-Format ist `name:jobId:endDate:tz:suffix`. Handgebaute Keys mit
    // `:::` waren schon vorher teils falsch (Suffix statt Pattern, Literal `*`)
    // und wurden mit der Einfuehrung von `tz` restlos ungueltig.
    const offenders: string[] = [];
    for (const file of queueFiles) {
      const source = readFileSync(join(QUEUES_DIR, file), "utf-8");
      // Kommentarzeilen ausblenden — die Erklaerungen zu F20 nennen das alte
      // Key-Format absichtlich und sind keine Fundstelle.
      const code = source
        .split("\n")
        .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
        .join("\n");

      if (/removeRepeatableByKey\(\s*[`'"]/.test(code)) offenders.push(`${file} (Literal-Key)`);
      if (/:::/.test(code)) offenders.push(`${file} (handgebauter Key)`);
    }
    expect(offenders).toEqual([]);
  });

  it("jede Queue mit einem Cron kann ihn auch wieder entfernen", () => {
    const withRepeat = queueFiles.filter((f) =>
      /repeat:\s*\{/.test(readFileSync(join(QUEUES_DIR, f), "utf-8")),
    );
    expect(withRepeat.length).toBeGreaterThan(0);

    for (const file of withRepeat) {
      const source = readFileSync(join(QUEUES_DIR, file), "utf-8");
      expect(
        /removeRepeatableJobs\(|removeRepeatableByKey\(/.test(source),
        `${file} plant einen Cron, kann ihn aber nicht entfernen`,
      ).toBe(true);
    }
  });

  it("jedes repeat setzt eine Zeitzone (F24)", () => {
    for (const file of queueFiles) {
      const source = readFileSync(join(QUEUES_DIR, file), "utf-8");
      // `every`-basierte Repeatables brauchen keine tz — Intervalle sind absolut.
      const patternBlocks = source.match(/repeat:\s*\{[^}]*pattern:[^}]*\}/g) ?? [];
      for (const block of patternBlocks) {
        expect(block, `${file}: repeat ohne tz`).toContain("tz:");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// F14 · Dedup darf keine Neuerzeugung blockieren
// ---------------------------------------------------------------------------

describe("Deduplizierung (F14)", () => {
  it("PDF- und OCR-Queue raeumen abgeschlossene Vorlaeufer weg", () => {
    for (const file of ["lib/queue/queues/pdf.queue.ts", "lib/queue/queues/inbox-ocr.queue.ts"]) {
      expect(read(file), `${file} ohne clearFinishedJob`).toContain("clearFinishedJob");
    }
  });

  it("laufende Jobs werden respektiert, abgeschlossene entfernt", () => {
    const helper = read("lib/queue/deduped-add.ts");
    expect(helper).toContain('state === "completed" || state === "failed"');
    // Und eben NICHT bei waiting/active/delayed — ein Doppelklick soll nicht
    // zweimal rendern.
    expect(helper).toContain("return false");
  });
});

// ---------------------------------------------------------------------------
// F26 · Kein Secret im Job-Payload
// ---------------------------------------------------------------------------

describe("Webhook-Secret (F26)", () => {
  it("der Job-Vertrag transportiert kein secret und keine url", () => {
    const source = read("lib/queue/queues/webhook.queue.ts");
    const iface = source.slice(
      source.indexOf("export interface WebhookJobData"),
      source.indexOf("export interface WebhookJobResult"),
    );
    expect(iface).not.toMatch(/^\s*secret:/m);
    expect(iface).not.toMatch(/^\s*url:/m);
    expect(iface).toMatch(/webhookId: string/);
  });

  it("der Worker laedt url und secret aus dem Datensatz", () => {
    const source = read("lib/queue/workers/webhook.worker.ts");
    expect(source).toContain("prisma.webhook.findUnique");
    expect(source).toContain("secret: true");
  });

  it("ein deaktivierter Webhook stellt nicht zu", () => {
    expect(read("lib/queue/workers/webhook.worker.ts")).toContain("!webhook.isActive");
  });
});

// ---------------------------------------------------------------------------
// F27 · Kein PDF-Base64 im Job-Result
// ---------------------------------------------------------------------------

describe("PDF-Result (F27)", () => {
  it("das Result traegt kein base64-PDF mehr", () => {
    const source = read("lib/queue/workers/pdf.worker.ts");
    const iface = source.slice(
      source.indexOf("export interface PdfJobResult"),
      source.indexOf("// ====", source.indexOf("export interface PdfJobResult")),
    );
    expect(iface).not.toContain("pdfBase64");
  });

  it("es wird immer in den Storage geschrieben", () => {
    const source = read("lib/queue/workers/pdf.worker.ts");
    expect(source).not.toContain('pdfBuffer.toString("base64")');
    expect(source).toContain("result.storageKey = storageKey");
  });
});

// ---------------------------------------------------------------------------
// F25 / F15 · Lock-Dauern
// ---------------------------------------------------------------------------

describe("Worker-Locks (F25)", () => {
  /** Worker, deren Jobs realistisch laenger als 30 s laufen. */
  const LONG_RUNNING = [
    "scada-auto-import",
    "retention-cron",
    "report",
    "daily-digest",
    "paperless",
    "approvals-reconcile",
    "weather",
    "billing",
    "inbox-ocr",
    "pdf",
    "reminder",
  ];

  it.each(LONG_RUNNING)("%s setzt eine lockDuration", (name) => {
    const source = readFileSync(join(WORKERS_DIR, `${name}.worker.ts`), "utf-8");
    expect(source).toMatch(/lockDuration:/);
  });

  it("die Lock-Dauern liegen alle ueber dem BullMQ-Default von 30s", () => {
    for (const [key, value] of Object.entries(WORKER_LOCK_MS)) {
      expect(value, `${key} ist nicht groesser als 30s`).toBeGreaterThan(30_000);
    }
  });

  it("Doppellaeufe mit Geld- oder Datenbezug fuehren zum Fehlschlag statt zur Neuzustellung", () => {
    for (const name of ["scada-auto-import", "approvals-reconcile", "report", "billing", "inbox-ocr"]) {
      const source = readFileSync(join(WORKERS_DIR, `${name}.worker.ts`), "utf-8");
      expect(source, `${name} ohne maxStalledCount`).toContain("maxStalledCount: 1");
    }
  });
});

// ---------------------------------------------------------------------------
// F22 · Timing-sicherer Token-Vergleich
// ---------------------------------------------------------------------------

describe("timingSafeEquals (F22)", () => {
  it("erkennt Gleichheit", () => {
    expect(timingSafeEquals("s3cret-token", "s3cret-token")).toBe(true);
  });

  it("erkennt Ungleichheit gleicher Laenge", () => {
    expect(timingSafeEquals("s3cret-token", "s3cret-tokeX")).toBe(false);
  });

  it("wirft nicht bei unterschiedlicher Laenge", () => {
    // Ohne Laengen-Check wuerde timingSafeEqual einen RangeError werfen und aus
    // einem 401 ein 500 machen.
    expect(() => timingSafeEquals("kurz", "deutlich laenger")).not.toThrow();
    expect(timingSafeEquals("kurz", "deutlich laenger")).toBe(false);
  });

  it("behandelt Mehrbyte-Zeichen ueber die Byte-Laenge", () => {
    expect(timingSafeEquals("äöü", "äöü")).toBe(true);
    expect(timingSafeEquals("äöü", "abc")).toBe(false);
  });

  it("lehnt leere und fehlende Werte ab", () => {
    expect(timingSafeEquals(null, "x")).toBe(false);
    expect(timingSafeEquals("x", null)).toBe(false);
    expect(timingSafeEquals("", "")).toBe(false);
    expect(timingSafeEquals(undefined, undefined)).toBe(false);
  });

  it("bearerTokenMatches verlangt das Bearer-Praefix", () => {
    expect(bearerTokenMatches("Bearer abc", "abc")).toBe(true);
    expect(bearerTokenMatches("abc", "abc")).toBe(false);
    expect(bearerTokenMatches("Basic abc", "abc")).toBe(false);
    expect(bearerTokenMatches(null, "abc")).toBe(false);
  });

  it("die Cron- und Metrics-Routen vergleichen nicht mehr mit !==", () => {
    for (const file of [
      "app/api/cron/check-deadlines/route.ts",
      "app/api/cron/bundesbank-rate-fetch/route.ts",
      "app/api/metrics/route.ts",
    ]) {
      const source = read(file);
      expect(
        /bearerTokenMatches\(|timingSafeEquals\(/.test(source),
        `${file} vergleicht noch direkt`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// F23 · Sichtbarkeit
// ---------------------------------------------------------------------------

describe("Queue-Observability (F23)", () => {
  it("getQueueHealth prueft, ob ein Consumer existiert", () => {
    const source = read("lib/queue/index.ts");
    expect(source).toContain("getWorkersCount");
    expect(source).toContain("stalledQueues");
  });

  it("eine wachsende Queue ohne Consumer gilt als nicht gesund", () => {
    const source = read("lib/queue/index.ts");
    expect(source).toContain("consumers === 0 && waiting > 0");
    expect(source).toContain("healthy: redisHealthy && stalledQueues.length === 0");
  });

  it("die Gauges werden gesetzt, nicht nur definiert", () => {
    const source = read("lib/queue/index.ts");
    expect(source).toContain("queueJobsActive.set");
    expect(source).toContain("queueConsumers.set");
  });

  it("der Queue-Zustand haengt am Systemstatus, nicht an der Readiness", () => {
    // Readiness gated das Load-Balancer-Routing — ein fehlender Worker darf die
    // Web-App nicht aus der Rotation nehmen.
    expect(read("app/api/admin/system/status/route.ts")).toContain("getQueueHealth");
    expect(read("app/api/health/ready/route.ts")).not.toContain("getQueueHealth");
  });
});

// ---------------------------------------------------------------------------
// F8 / F21 · Bestaetigung nur fuer real Passiertes
// ---------------------------------------------------------------------------

describe("Auto-Import und Inbox-Upload (F8, F21)", () => {
  it("das Aktivieren des Auto-Imports registriert den Cron", () => {
    const source = read("lib/scada/auto-import-service.ts");
    expect(source).toContain("scheduleScadaAutoImport");
    expect(source).toContain("removeScadaAutoImportSchedule");
  });

  it("der Cron wird nur entfernt, wenn keine Zuordnung mehr aktiv ist", () => {
    expect(read("lib/scada/auto-import-service.ts")).toContain("stillEnabled === 0");
  });

  it("ein gescheitertes OCR-Enqueue laesst den Upload nicht scheitern", () => {
    const source = read("app/api/inbox/route.ts");
    expect(source).toContain("ocrQueued");
    // Der Datensatz steht bereits — ein 500 wuerde den Nutzer in ein 409
    // beim erneuten Versuch laufen lassen.
    expect(source).toMatch(/catch \(enqueueError\)/);
  });
});
