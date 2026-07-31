/**
 * B4: Gesellschafterversammlung.
 *
 * Der Bericht nennt B4 „rechtlich heikel wenn schlecht dokumentiert". Die
 * Tests hier bilden genau die Stellen ab, an denen ein Beschluss kippt: die
 * Ladungsfrist, die Beschlussfaehigkeit und die Mehrheitsbasis.
 */

import { describe, it, expect } from "vitest";
import {
  summarizeAttendance,
  checkQuorum,
  checkNoticePeriod,
  evaluateResolution,
  STATUTORY_NOTICE_DAYS_GMBH,
  type AttendanceRow,
} from "./resolution";

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const ROWS: AttendanceRow[] = [
  { shareholderId: "A", presence: "PRESENT", sharePercent: 40 },
  { shareholderId: "B", presence: "REPRESENTED", sharePercent: 25 },
  { shareholderId: "C", presence: "ABSENT", sharePercent: 35 },
];

describe("Anwesenheitsliste", () => {
  it("vertretenes Kapital ist anwesend PLUS vertreten", () => {
    const summary = summarizeAttendance(ROWS);
    expect(summary.presentPercent).toBe(40);
    expect(summary.proxyPercent).toBe(25);
    expect(summary.representedPercent).toBe(65);
  });

  it("zaehlt Koepfe getrennt vom Kapital", () => {
    // Bei einer Kopfmehrheit im Gesellschaftsvertrag ist das die massgebliche
    // Zahl.
    const summary = summarizeAttendance(ROWS);
    expect(summary.headsPresent).toBe(1);
    expect(summary.headsRepresented).toBe(1);
    expect(summary.headsTotal).toBe(3);
  });

  it("meldet eine unvollstaendige Liste", () => {
    // Der fehlende Teil koennte die Mehrheit tragen.
    const summary = summarizeAttendance(ROWS.slice(0, 2));
    expect(summary.registeredPercent).toBe(65);
    expect(summary.warnings.some((w) => w.includes("statt 100"))).toBe(true);
  });
});

describe("Beschlussfaehigkeit", () => {
  const summary = summarizeAttendance(ROWS);

  it("erreicht wird erreicht", () => {
    const result = checkQuorum(summary, 50);
    expect(result.isQuorate).toBe(true);
    expect(result.statement).toContain("ist beschlussfähig");
  });

  it("verfehlt wird verfehlt", () => {
    const result = checkQuorum(summary, 75);
    expect(result.isQuorate).toBe(false);
    expect(result.statement).toContain("NICHT beschlussfähig");
  });

  it("ohne Quorum wird Beschlussfaehigkeit angenommen — aber gesagt", () => {
    // Sieht der Gesellschaftsvertrag eines vor und niemand hat es erfasst,
    // ist die Aussage falsch. Deshalb steht sie als Hinweis da.
    const result = checkQuorum(summary, null);
    expect(result.isQuorate).toBe(true);
    expect(result.warnings.some((w) => w.includes("nicht notwendig dem Gesellschaftsvertrag"))).toBe(
      true,
    );
  });
});

describe("Ladungsfrist", () => {
  it("eingehalten", () => {
    const result = checkNoticePeriod({
      invitationSentAt: d("2026-05-01"),
      scheduledAt: d("2026-05-29"),
      requiredDays: 28,
      waivedByAll: false,
    });
    expect(result.compliant).toBe(true);
    expect(result.actualDays).toBe(28);
  });

  it("verfehlt — und die Folge steht dabei", () => {
    // Ein Beschluss aus einer zu kurz geladenen Versammlung ist anfechtbar.
    // Das faellt sonst erst auf, wenn ihn jemand angreift.
    const result = checkNoticePeriod({
      invitationSentAt: d("2026-05-20"),
      scheduledAt: d("2026-05-29"),
      requiredDays: 28,
      waivedByAll: false,
    });
    expect(result.compliant).toBe(false);
    expect(result.statement).toContain("anfechtbar");
  });

  it("ohne Versanddatum ist sie NICHT eingehalten", () => {
    // Nicht nachweisbar ist nicht dasselbe wie eingehalten.
    const result = checkNoticePeriod({
      invitationSentAt: null,
      scheduledAt: d("2026-05-29"),
      requiredDays: 28,
      waivedByAll: false,
    });
    expect(result.compliant).toBe(false);
    expect(result.statement).toContain("nicht nachweisbar");
  });

  it("die Vollversammlung heilt den Mangel", () => {
    // § 51 Abs. 3 GmbHG.
    const result = checkNoticePeriod({
      invitationSentAt: d("2026-05-28"),
      scheduledAt: d("2026-05-29"),
      requiredDays: 28,
      waivedByAll: true,
    });
    expect(result.compliant).toBe(true);
    expect(result.statement).toContain("§ 51 Abs. 3 GmbHG");
  });

  it("eine zu kurze vertragliche Frist wird benannt, nicht abgewiesen", () => {
    // Bei Personengesellschaften gilt allein der Vertrag — aber bei einer GmbH
    // waere es ein Fehler.
    const result = checkNoticePeriod({
      invitationSentAt: d("2026-05-25"),
      scheduledAt: d("2026-05-29"),
      requiredDays: 3,
      waivedByAll: false,
    });
    expect(result.compliant).toBe(true);
    expect(result.warnings.some((w) => w.includes("§ 51 Abs. 1 S. 2 GmbHG"))).toBe(true);
    expect(STATUTORY_NOTICE_DAYS_GMBH).toBe(7);
  });
});

describe("Die Mehrheitsbasis entscheidet ueber das Ergebnis", () => {
  // Derselbe Beschluss, drei Basen. 45 Ja, 15 Nein, 5 Enthaltung; vertreten
  // sind 65 % des Kapitals.
  const votes = { inFavor: 45, against: 15, abstain: 5 };

  it("abgegebene Stimmen: 75 % — angenommen", () => {
    const result = evaluateResolution({
      votes,
      base: "VOTES_CAST",
      requiredPercent: 75,
      representedPercent: 65,
      isQuorate: true,
    });
    expect(result.achievedPercent).toBe(75);
    expect(result.adopted).toBe(true);
  });

  it("vertretenes Kapital: 69,23 % — abgelehnt", () => {
    const result = evaluateResolution({
      votes,
      base: "CAPITAL_PRESENT",
      requiredPercent: 75,
      representedPercent: 65,
      isQuorate: true,
    });
    expect(result.achievedPercent).toBeCloseTo(69.23, 2);
    expect(result.adopted).toBe(false);
  });

  it("gesamtes Kapital: 45 % — abgelehnt", () => {
    const result = evaluateResolution({
      votes,
      base: "CAPITAL_TOTAL",
      requiredPercent: 75,
      representedPercent: 65,
      isQuorate: true,
    });
    expect(result.achievedPercent).toBe(45);
    expect(result.adopted).toBe(false);
  });
});

describe("Enthaltungen", () => {
  it("zaehlen bei abgegebenen Stimmen NICHT mit", () => {
    // Sonst wirkte eine Enthaltung wie eine Nein-Stimme (§ 47 Abs. 1 GmbHG).
    const result = evaluateResolution({
      votes: { inFavor: 60, against: 40, abstain: 100 },
      base: "VOTES_CAST",
      requiredPercent: 50,
      representedPercent: 100,
      isQuorate: true,
    });
    expect(result.achievedPercent).toBe(60);
    expect(result.adopted).toBe(true);
  });

  it("werden im Protokolltext trotzdem ausgewiesen", () => {
    const result = evaluateResolution({
      votes: { inFavor: 60, against: 40, abstain: 100 },
      base: "VOTES_CAST",
      requiredPercent: 50,
      representedPercent: 100,
      isQuorate: true,
    });
    expect(result.statement).toContain("Enthaltung 100");
    expect(result.warnings.some((w) => w.includes("nicht enthalten"))).toBe(true);
  });
});

describe("Kein Ergebnis ist nicht dasselbe wie Ablehnung", () => {
  it("ohne Beschlussfaehigkeit gibt es KEIN Ergebnis", () => {
    // Ein gerechnetes "angenommen" aus einer beschlussunfaehigen Versammlung
    // waere die gefaehrlichste Zahl hier.
    const result = evaluateResolution({
      votes: { inFavor: 100, against: 0, abstain: 0 },
      base: "VOTES_CAST",
      requiredPercent: 50,
      representedPercent: 30,
      isQuorate: false,
    });
    expect(result.adopted).toBeNull();
    expect(result.achievedPercent).toBeNull();
    expect(result.statement).toContain("nicht beschlussfähig");
  });

  it("ohne abgegebene Stimmen gibt es KEIN Ergebnis", () => {
    const result = evaluateResolution({
      votes: { inFavor: 0, against: 0, abstain: 50 },
      base: "VOTES_CAST",
      requiredPercent: 50,
      representedPercent: 100,
      isQuorate: true,
    });
    expect(result.adopted).toBeNull();
    expect(result.statement).toContain("keine Stimmen abgegeben");
  });
});

describe("Der Protokolltext traegt die Herleitung", () => {
  it("nennt Stimmen, Anteil, Basis und Erfordernis", () => {
    const result = evaluateResolution({
      votes: { inFavor: 45, against: 15, abstain: 5 },
      base: "CAPITAL_PRESENT",
      requiredPercent: 75,
      representedPercent: 65,
      isQuorate: true,
    });
    expect(result.statement).toContain("Ja 45");
    expect(result.statement).toContain("des vertretenen Kapitals");
    expect(result.statement).toContain("erforderlich sind 75 %");
    expect(result.statement).toContain("abgelehnt");
  });
});
