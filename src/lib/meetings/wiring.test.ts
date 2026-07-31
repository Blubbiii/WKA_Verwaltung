/**
 * B4 (Audit 2026-07): Gesellschafterversammlung — Verdrahtung.
 *
 * Die Rechenregeln stehen in resolution.test.ts. Hier geht es um die Stellen,
 * an denen ein Beschluss seine Grundlage verlieren wuerde.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

function src(relativePath: string): string {
  return read(join("src", relativePath));
}

describe("Datenmodell", () => {
  const schema = read("prisma/schema.prisma");

  function model(name: string): string {
    const start = schema.indexOf(`model ${name} {`);
    expect(start, name).toBeGreaterThan(-1);
    return schema.slice(start, schema.indexOf("\n}", start));
  }

  it("die Ladungsfrist ist ein FELD, keine Konstante", () => {
    // Die gesetzliche Wochenfrist der GmbH wird regelmaessig vertraglich
    // verlaengert und gilt bei Personengesellschaften gar nicht.
    expect(model("ShareholderMeeting")).toContain("noticePeriodDays Int");
  });

  it("das Versanddatum der Einladung steht am Datensatz", () => {
    // Ohne es ist die Einhaltung der Frist nicht nachweisbar.
    expect(model("ShareholderMeeting")).toContain("invitationSentAt DateTime?");
  });

  it("die Vollversammlung ist abbildbar", () => {
    // § 51 Abs. 3 GmbHG heilt den Ladungsmangel.
    expect(model("ShareholderMeeting")).toContain("noticeWaivedByAll Boolean");
  });

  it("die Mehrheitsbasis haengt am Tagesordnungspunkt", () => {
    // Nicht an der Versammlung: ein einfacher Beschluss und eine
    // Satzungsaenderung stehen auf derselben Tagesordnung.
    expect(model("MeetingAgendaItem")).toContain("majorityBase            MajorityBase");
  });

  it("das Ergebnis wird MITGESPEICHERT", () => {
    // Sonst rechnete eine spaetere Korrektur der Anwesenheitsliste ein
    // unterzeichnetes Protokoll rueckwirkend um.
    const body = model("MeetingAgendaItem");
    expect(body).toContain("achievedPercent Decimal?");
    expect(body).toContain("resultStatement String?");
  });

  it("der Kapitalanteil in der Anwesenheitsliste ist ein Snapshot", () => {
    const body = model("MeetingAttendance");
    expect(body).toContain("sharePercent Decimal");
    expect(body).toContain("ZUM VERSAMMLUNGSTAG");
  });

  it("ein Gesellschafter steht genau einmal auf der Liste", () => {
    expect(model("MeetingAttendance")).toContain("@@unique([meetingId, shareholderId])");
  });
});

describe("Anlegen", () => {
  const route = src("app/api/meetings/route.ts");

  it("die Anwesenheitsliste kommt aus dem Anteilsverlauf ZUM VERSAMMLUNGSTAG", () => {
    // Nicht "heute": bis zum Protokollieren kann ein Anteil uebergegangen sein.
    expect(route).toContain("shareRegisterAt(resolved.shares, scheduledAt)");
  });

  it("alle Beteiligten werden als ABWESEND vorbelegt", () => {
    // So fehlt niemand in der Liste, und der Anteil ist festgehalten, bevor er
    // sich aendern kann.
    expect(route).toContain('presence: "ABSENT" as const');
  });

  it("eine unvollstaendige Anteilssumme wird gemeldet", () => {
    expect(route).toContain("statt 100 %");
  });

  it("Fristen- und Quorumspruefung kommen mit der Liste", () => {
    expect(route).toContain("checkNoticePeriod({");
    expect(route).toContain("checkQuorum(");
  });
});

describe("Fortschreiben", () => {
  const route = src("app/api/meetings/[id]/route.ts");

  it("ein abgeschlossenes Protokoll wird nicht mehr geaendert", () => {
    // Eine Aenderung wuerde die Nachweiskette entwerten.
    expect(route).toContain("Nachweiskette entwerten");
    expect(route).toContain('meeting.status === "MINUTED"');
  });

  it("wer nicht auf der Liste steht, wird nicht aufgenommen", () => {
    // Das wuerde die Basis der Beschlussfaehigkeit verfaelschen.
    expect(route).toContain("nicht auf der Liste zum Versammlungstag");
  });

  it("kein Ergebnis bleibt null statt REJECTED", () => {
    expect(route).toContain(
      'outcome: result.adopted === null ? null : result.adopted ? "ADOPTED" : "REJECTED"',
    );
  });

  it("der Protokollsatz wird gespeichert", () => {
    expect(route).toContain("resultStatement: result.statement");
  });

  it("beim Protokollieren wird die Ladungsfrist noch einmal gemeldet", () => {
    // Sonst stuende im Beschlussbuch ein anfechtbarer Beschluss ohne Vermerk.
    expect(route).toContain('data.status === "MINUTED" && !notice.compliant');
  });

  it("die Einladung setzt den Status auf INVITED", () => {
    expect(route).toContain('{ status: "INVITED" as const }');
  });
});

describe("Migration", () => {
  const sql = read("prisma/migrations/manual/shareholder_meetings.sql");

  it("deutet bestehende Abstimmungen NICHT zu Versammlungen um", () => {
    // Einer elektronischen Abstimmung eine Ladungsfrist und eine
    // Anwesenheitsliste anzudichten waere die falsche Art von Vollstaendigkeit.
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"?shareholder_meetings"?/i);
    expect(sql).toContain("Kein Backfill");
  });

  it("laeuft in einer Transaktion", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });
});
