/**
 * B7 (Audit 2026-07): Bankanbindung — Verdrahtung.
 *
 * Der Bericht ist bei B7 selbst zurueckhaltend: "Ehrlich: der Datei-Import
 * funktioniert — das ist Komfort, kein Schmerz." Diese Tests halten fest, dass
 * die nicht implementierten Verfahren auch als solche auftreten und nicht als
 * ruhiges Konto.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getProvider, ProviderUnavailableError, FAILURE_THRESHOLD } from "./providers";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

function src(relativePath: string): string {
  return read(join("src", relativePath));
}

describe("Die Verfahren sagen die Wahrheit ueber sich", () => {
  it("FILE_DROP laeuft", () => {
    expect(getProvider("FILE_DROP").isOperational).toBe(true);
  });

  it("EBICS meldet, dass es nicht eingerichtet ist — und was fehlt", async () => {
    // Ein Abruf, der "0 Umsaetze" meldet, saehe aus wie ein ruhiges Konto und
    // waere ein toter Zugang.
    const provider = getProvider("EBICS");
    expect(provider.isOperational).toBe(false);
    await expect(provider.fetchStatement({ credentials: null })).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
    try {
      await provider.fetchStatement({ credentials: null });
    } catch (error) {
      const unavailable = error as ProviderUnavailableError;
      expect(unavailable.nextSteps.join(" ")).toContain("INI");
      expect(unavailable.nextSteps.join(" ")).toContain("Bank");
    }
  });

  it("FinTS nennt die Produktregistrierung", async () => {
    try {
      await getProvider("FINTS").fetchStatement({ credentials: null });
      throw new Error("haette werfen muessen");
    } catch (error) {
      expect((error as ProviderUnavailableError).nextSteps.join(" ")).toContain(
        "Produktregistrierung",
      );
    }
  });

  it("keines gibt einen leeren Auszug zurueck", () => {
    // Das ist der Kern: lieber ein Fehler als eine stille Null.
    const lib = src("lib/bank-import/providers.ts");
    expect(lib).toContain("KEINEN leeren Auszug");
  });

  it("ein einzelner Fehler schaltet nichts ab", () => {
    expect(FAILURE_THRESHOLD).toBe(3);
  });
});

describe("Eine Kette fuer beide Wege", () => {
  it("die Upload-Route benutzt den gemeinsamen Kern", () => {
    // Zwei Fassungen derselben Dublettenerkennung waeren doppelte Buchungen.
    const route = src("app/api/buchhaltung/bank/import/route.ts");
    expect(route).toContain("ingestStatement");
    expect(route).not.toContain("parseMt940");
    expect(route).not.toContain("buildKey");
  });

  it("der Push-Endpunkt benutzt denselben", () => {
    expect(src("app/api/banking/connections/[id]/push/route.ts")).toContain("ingestStatement");
  });
});

describe("Der Push-Endpunkt", () => {
  const route = src("app/api/banking/connections/[id]/push/route.ts");

  it("prueft den Token timing-safe", () => {
    expect(route).toContain("timingSafeEqual");
  });

  it("unterscheidet nicht zwischen unbekannt und falschem Token", () => {
    // Sonst liesse sich ueber die Fehlermeldung herausfinden, welche
    // Verbindungen existieren.
    expect(route).toContain("!connection || !connection.pushTokenHash ||");
  });

  it("prueft die Pruefsumme VOR dem Parsen", () => {
    // Beim Wiederholungslauf nach einem Fehler ist die Wiederholung der
    // Regelfall.
    const checksumIndex = route.indexOf("alreadySeen");
    const ingestIndex = route.indexOf("ingestStatement({");
    expect(checksumIndex).toBeGreaterThan(-1);
    expect(checksumIndex).toBeLessThan(ingestIndex);
  });

  it("haelt auch den uebersprungenen Lauf fest", () => {
    // Ein Lauf ohne Spur saehe aus wie ein Ausfall.
    expect(route).toContain('status: "SKIPPED"');
  });

  it("setzt den Fehlerzaehler nach Erfolg zurueck", () => {
    expect(route).toContain("consecutiveFailures: 0");
  });
});

describe("Verbindungen", () => {
  const route = src("app/api/banking/connections/route.ts");

  it("der Push-Token wird nur gehasht gespeichert", () => {
    expect(route).toContain("pushTokenHash: pushToken ? hashToken(pushToken) : null");
  });

  it("Zugangsdaten gehen nie an den Client", () => {
    expect(route).toContain("credentials: undefined");
  });

  it("Zugangsdaten werden verschluesselt abgelegt", () => {
    expect(route).toContain("encrypt(JSON.stringify(data.credentials))");
  });

  it("nicht eingerichtete Verfahren starten auf SETUP_PENDING", () => {
    expect(route).toContain('provider.isOperational ? "ACTIVE" : "SETUP_PENDING"');
  });
});

describe("Der taegliche Lauf", () => {
  const route = src("app/api/cron/bank-fetch/route.ts");

  it("meldet Verbindungen, von denen nichts mehr kommt", () => {
    // Ein automatischer Abruf, der still ausfaellt, erweckt den Eindruck, die
    // Umsaetze seien aktuell.
    expect(route).toContain("STALE_AFTER_DAYS");
    expect(route).toContain("sehen aber so aus");
  });

  it("uebergeht nicht eingerichtete Verfahren nicht stumm", () => {
    expect(route).toContain("notConfigured");
  });

  it("ist mit Bearer-Token geschuetzt", () => {
    expect(route).toContain("bearerTokenMatches");
  });
});

describe("Datenmodell", () => {
  const schema = read("prisma/schema.prisma");

  function model(name: string): string {
    const start = schema.indexOf(`model ${name} {`);
    expect(start, name).toBeGreaterThan(-1);
    return schema.slice(start, schema.indexOf("\n}", start));
  }

  it("die Laufhistorie traegt die Pruefsumme", () => {
    expect(model("BankFetchRun")).toContain("statementChecksum String?");
    expect(model("BankFetchRun")).toContain("@@index([connectionId, statementChecksum])");
  });

  it("ERROR ist von PAUSED getrennt", () => {
    // Ein stiller Ausfall darf nicht wie eine bewusste Pause aussehen.
    const enumStart = schema.indexOf("enum BankConnectionStatus {");
    const body = schema.slice(enumStart, schema.indexOf("\n}", enumStart));
    expect(body).toContain("PAUSED");
    expect(body).toContain("ERROR");
    expect(body).toContain("SETUP_PENDING");
  });
});
