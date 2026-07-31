/**
 * B6: Zeichnungsschein, Einzahlung, GwG.
 *
 * Der wichtigste Test ist der, in dem NICHTS geht: ohne abgeschlossene
 * Legitimation darf eine Zeichnung nicht angenommen werden. Das ist keine
 * Warnung, das ist der Verstoss selbst.
 */

import { describe, it, expect } from "vitest";
import {
  computeWithdrawal,
  checkPayment,
  checkAml,
  checkAcceptance,
  DEFAULT_WITHDRAWAL_DAYS,
  AML_RETENTION_YEARS,
  AML_REVIEW_WARN_DAYS,
  type AmlInput,
} from "./subscription";

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const TODAY = d("2026-07-31");

const VALID_AML: AmlInput = {
  status: "VERIFIED",
  identifiedAt: d("2026-07-01"),
  documentValidUntil: d("2030-01-01"),
  nextReviewAt: d("2029-07-01"),
  beneficialOwnerVerified: true,
  isPep: false,
};

describe("Widerrufsfrist", () => {
  it("laeuft ab dem spaeteren von Zeichnung und Belehrung", () => {
    const result = computeWithdrawal(
      { signedAt: d("2026-07-20"), instructionGivenAt: d("2026-07-25"), periodDays: 14 },
      TODAY,
    );
    expect(result.deadline).toEqual(d("2026-08-08"));
    expect(result.isRunning).toBe(true);
    expect(result.daysLeft).toBe(8);
  });

  it("OHNE Belehrung gibt es KEIN Fristende", () => {
    // Ein ausgerechnetes Fristende waere die gefaehrlichere Antwort: es
    // spiegelte eine Sicherheit vor, die nicht besteht (§ 356 Abs. 3 S. 1 BGB).
    const result = computeWithdrawal(
      { signedAt: d("2026-01-01"), instructionGivenAt: null, periodDays: 14 },
      TODAY,
    );
    expect(result.deadline).toBeNull();
    expect(result.isRunning).toBe(true);
    expect(result.statement).toContain("läuft damit nicht an");
  });

  it("abgelaufen wird als abgelaufen gefuehrt", () => {
    const result = computeWithdrawal(
      { signedAt: d("2026-06-01"), instructionGivenAt: d("2026-06-01"), periodDays: 14 },
      TODAY,
    );
    expect(result.isRunning).toBe(false);
    expect(result.statement).toContain("abgelaufen");
  });

  it("ohne Zeichnung laeuft gar nichts", () => {
    const result = computeWithdrawal(
      { signedAt: null, instructionGivenAt: d("2026-07-01"), periodDays: 14 },
      TODAY,
    );
    expect(result.isRunning).toBeNull();
  });

  it("die Regelfrist sind 14 Tage", () => {
    expect(DEFAULT_WITHDRAWAL_DAYS).toBe(14);
  });
});

describe("Einzahlung", () => {
  it("das Agio gehoert zum Soll", () => {
    // Es wegzulassen ergaebe eine Einzahlung, die vollstaendig aussieht und es
    // nicht ist.
    const result = checkPayment(
      { amountEur: 100_000, agioPercent: 5, paidEur: 100_000, dueDate: null },
      TODAY,
    );
    expect(result.dueEur).toBe(105_000);
    expect(result.openEur).toBe(5_000);
    expect(result.isSettled).toBe(false);
  });

  it("vollstaendig gezahlt ist erledigt", () => {
    const result = checkPayment(
      { amountEur: 100_000, agioPercent: 5, paidEur: 105_000, dueDate: null },
      TODAY,
    );
    expect(result.isSettled).toBe(true);
    expect(result.openEur).toBe(0);
  });

  it("eine Teilzahlung erfuellt die Einlagepflicht NICHT", () => {
    const result = checkPayment(
      { amountEur: 100_000, agioPercent: 0, paidEur: 60_000, dueDate: null },
      TODAY,
    );
    expect(result.isSettled).toBe(false);
    expect(result.warnings.some((w) => w.includes("erfüllt die Einlagepflicht nicht"))).toBe(true);
  });

  it("eine Ueberzahlung wird NICHT als weitere Einlage behandelt", () => {
    const result = checkPayment(
      { amountEur: 100_000, agioPercent: 0, paidEur: 120_000, dueDate: null },
      TODAY,
    );
    expect(result.overpaidEur).toBe(20_000);
    expect(result.warnings.some((w) => w.includes("zurückzuzahlen"))).toBe(true);
  });

  it("ein Cent Rundungsdifferenz gilt als erfuellt", () => {
    // Das Agio erzeugt sie.
    const result = checkPayment(
      { amountEur: 33_333.33, agioPercent: 5, paidEur: 34_999.99, dueDate: null },
      TODAY,
    );
    expect(result.isSettled).toBe(true);
  });

  it("Ueberfaelligkeit wird gezaehlt", () => {
    const result = checkPayment(
      { amountEur: 100_000, agioPercent: 0, paidEur: 0, dueDate: d("2026-07-01") },
      TODAY,
    );
    expect(result.daysOverdue).toBe(30);
    expect(result.statement).toContain("überfällig");
  });
});

describe("GwG-Legitimation", () => {
  it("abgeschlossen und gueltig", () => {
    const result = checkAml(VALID_AML, TODAY);
    expect(result.isValid).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("nicht abgeschlossen ist ungueltig", () => {
    const result = checkAml({ ...VALID_AML, status: "PENDING", identifiedAt: null }, TODAY);
    expect(result.isValid).toBe(false);
    expect(result.problems[0]).toContain("§ 11 Abs. 1 GwG");
  });

  it("ein abgelaufener Ausweis traegt die Identifizierung nicht fort", () => {
    const result = checkAml({ ...VALID_AML, documentValidUntil: d("2026-01-01") }, TODAY);
    expect(result.isValid).toBe(false);
    expect(result.problems.some((p) => p.includes("abgelaufen"))).toBe(true);
  });

  it("ein offener wirtschaftlich Berechtigter ist eine Warnung, kein Hindernis", () => {
    // Bei natuerlichen Personen auf eigene Rechnung genuegt der Vermerk.
    const result = checkAml({ ...VALID_AML, beneficialOwnerVerified: false }, TODAY);
    expect(result.isValid).toBe(true);
    expect(result.warnings.some((w) => w.includes("§ 10 Abs. 1 Nr. 2 GwG"))).toBe(true);
  });

  it("PEP loest verstaerkte Sorgfaltspflichten aus", () => {
    const result = checkAml({ ...VALID_AML, isPep: true }, TODAY);
    expect(result.warnings.some((w) => w.includes("§ 15 Abs. 4 GwG"))).toBe(true);
  });

  it("eine faellige Wiedervorlage wird gemeldet", () => {
    const result = checkAml({ ...VALID_AML, nextReviewAt: d("2026-08-15") }, TODAY);
    expect(result.reviewDue).toBe(true);
    expect(result.reviewInDays).toBe(15);
    expect(AML_REVIEW_WARN_DAYS).toBe(60);
  });

  it("eine ueberfaellige Wiedervorlage auch", () => {
    const result = checkAml({ ...VALID_AML, nextReviewAt: d("2026-01-01") }, TODAY);
    expect(result.reviewInDays!).toBeLessThan(0);
    expect(result.warnings.some((w) => w.includes("§ 10 Abs. 1 Nr. 5 GwG"))).toBe(true);
  });

  it("eine fehlende Wiedervorlage wird gemeldet", () => {
    const result = checkAml({ ...VALID_AML, nextReviewAt: null }, TODAY);
    expect(result.warnings.some((w) => w.includes("kontinuierliche Überwachung"))).toBe(true);
  });

  it("die Aufbewahrungsfrist sind fuenf Jahre", () => {
    expect(AML_RETENTION_YEARS).toBe(5);
  });
});

describe("Annahme der Zeichnung", () => {
  const withdrawalRunning = computeWithdrawal(
    { signedAt: d("2026-07-25"), instructionGivenAt: d("2026-07-25"), periodDays: 14 },
    TODAY,
  );

  it("ohne Legitimation wird BLOCKIERT, nicht gewarnt", () => {
    // Das ist der Verstoss selbst, kein spaeter zu heilender Mangel.
    const result = checkAcceptance({
      status: "SIGNED",
      aml: checkAml({ ...VALID_AML, status: "PENDING", identifiedAt: null }, TODAY),
      withdrawal: withdrawalRunning,
      signedAt: d("2026-07-25"),
    });
    expect(result.canAccept).toBe(false);
    expect(result.blockers.some((b) => b.includes("§ 10 Abs. 1 Nr. 1"))).toBe(true);
  });

  it("mit Legitimation geht es — trotz laufender Widerrufsfrist", () => {
    // Der Vertrag kommt zustande und ist nur widerruflich.
    const result = checkAcceptance({
      status: "SIGNED",
      aml: checkAml(VALID_AML, TODAY),
      withdrawal: withdrawalRunning,
      signedAt: d("2026-07-25"),
    });
    expect(result.canAccept).toBe(true);
    expect(result.warnings.some((w) => w.includes("zurückzuzahlen"))).toBe(true);
  });

  it("ohne Unterschrift geht nichts", () => {
    const result = checkAcceptance({
      status: "DRAFT",
      aml: checkAml(VALID_AML, TODAY),
      withdrawal: computeWithdrawal(
        { signedAt: null, instructionGivenAt: null, periodDays: 14 },
        TODAY,
      ),
      signedAt: null,
    });
    expect(result.canAccept).toBe(false);
    expect(result.blockers.some((b) => b.includes("nicht unterzeichnet"))).toBe(true);
  });

  it("eine widerrufene Zeichnung kann nicht angenommen werden", () => {
    const result = checkAcceptance({
      status: "WITHDRAWN",
      aml: checkAml(VALID_AML, TODAY),
      withdrawal: withdrawalRunning,
      signedAt: d("2026-07-25"),
    });
    expect(result.canAccept).toBe(false);
  });

  it("doppelte Annahme wird abgewiesen", () => {
    const result = checkAcceptance({
      status: "ACCEPTED",
      aml: checkAml(VALID_AML, TODAY),
      withdrawal: withdrawalRunning,
      signedAt: d("2026-07-25"),
    });
    expect(result.canAccept).toBe(false);
    expect(result.blockers.some((b) => b.includes("bereits angenommen"))).toBe(true);
  });
});
