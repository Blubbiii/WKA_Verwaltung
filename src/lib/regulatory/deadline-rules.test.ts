/**
 * B2: Meldefristen aus den Regulatorik-Stammdaten.
 *
 * Die Regeln tragen Termine, an denen Geld hängt — der Zahlungsanspruch bei
 * fehlender MaStR-Registrierung, die Nachzahlung oder Rückforderung bei der
 * Standortgüte. Deshalb sind hier die Grenzfälle wichtiger als der Normalfall.
 */

import { describe, it, expect } from "vitest";
import {
  proposeDeadlines,
  deadlineUrgency,
  EEG_ANNUAL_REPORT_DAY,
  MASTR_CHANGE_NOTICE_DAYS,
  SITE_REVIEW_LEAD_DAYS,
  type RegulatoryProfileInput,
} from "./deadline-rules";

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const BASE: RegulatoryProfileInput = {
  commissioningDate: d("2018-06-15"),
  mastrUnitNumber: "SEE900000000001",
  lastChangeAt: null,
  lastChangeReportedAt: null,
  subjectToSiteQualityReview: false,
  annualReportDay: null,
};

const TODAY = d("2026-07-31");

function kinds(proposals: ReturnType<typeof proposeDeadlines>): string[] {
  return proposals.map((p) => p.kind);
}

describe("MaStR-Registrierung", () => {
  it("fehlende Nummer ist SOFORT faellig", () => {
    // Ohne Registrierung entfaellt der Zahlungsanspruch — das ist keine
    // Frist in der Zukunft, das ist ein laufender Verlust.
    const result = proposeDeadlines(
      { ...BASE, mastrUnitNumber: null },
      { referenceDate: TODAY },
    );
    const entry = result.find((p) => p.kind === "MASTR_REGISTRATION")!;
    expect(entry.dueDate).toEqual(TODAY);
    expect(entry.basis).toContain("§ 52 Abs. 1 EEG");
  });

  it("mit Nummer kommt kein Eintrag", () => {
    const result = proposeDeadlines(BASE, { referenceDate: TODAY });
    expect(kinds(result)).not.toContain("MASTR_REGISTRATION");
  });
});

describe("MaStR-Aenderungsanzeige", () => {
  it("eine ungemeldete Aenderung erzeugt eine Frist von 30 Tagen", () => {
    const result = proposeDeadlines(
      { ...BASE, lastChangeAt: d("2026-07-10") },
      { referenceDate: TODAY },
    );
    const entry = result.find((p) => p.kind === "MASTR_CHANGE_NOTICE")!;
    expect(entry.dueDate).toEqual(d("2026-08-09"));
    expect(MASTR_CHANGE_NOTICE_DAYS).toBe(30);
  });

  it("eine gemeldete Aenderung erzeugt KEINE Frist", () => {
    const result = proposeDeadlines(
      { ...BASE, lastChangeAt: d("2026-07-10"), lastChangeReportedAt: d("2026-07-12") },
      { referenceDate: TODAY },
    );
    expect(kinds(result)).not.toContain("MASTR_CHANGE_NOTICE");
  });

  it("eine NEUE Aenderung nach der letzten Meldung ist wieder offen", () => {
    // Der haeufige Fall: gemeldet, dann erneut geaendert.
    const result = proposeDeadlines(
      { ...BASE, lastChangeAt: d("2026-07-20"), lastChangeReportedAt: d("2026-07-12") },
      { referenceDate: TODAY },
    );
    expect(kinds(result)).toContain("MASTR_CHANGE_NOTICE");
  });

  it("der Schluessel traegt das Aenderungsdatum", () => {
    // Sonst wuerde die zweite Aenderung die Frist der ersten ueberschreiben.
    const first = proposeDeadlines(
      { ...BASE, lastChangeAt: d("2026-03-01") },
      { referenceDate: TODAY },
    ).find((p) => p.kind === "MASTR_CHANGE_NOTICE")!;
    const second = proposeDeadlines(
      { ...BASE, lastChangeAt: d("2026-07-20") },
      { referenceDate: TODAY },
    ).find((p) => p.kind === "MASTR_CHANGE_NOTICE")!;
    expect(first.ruleKey).not.toBe(second.ruleKey);
  });
});

describe("EEG-Jahresmeldung", () => {
  it("gilt fuer das VORJAHR, nicht das laufende", () => {
    // Das laufende Jahr hat noch keine Endabrechnung.
    const result = proposeDeadlines(BASE, { referenceDate: TODAY, horizonYears: 0 });
    const entry = result.find((p) => p.kind === "EEG_ANNUAL_REPORT")!;
    expect(entry.operatingYear).toBe(2025);
    expect(entry.dueDate).toEqual(d("2026-02-28"));
  });

  it("der gesetzliche Termin ist der 28.02.", () => {
    expect(EEG_ANNUAL_REPORT_DAY).toBe("02-28");
  });

  it("ein bereits verstrichener Termin wird trotzdem angelegt", () => {
    // Eine versaeumte Meldung verschwindet nicht dadurch, dass der Termin
    // vorbei ist — sie zu verschweigen waere das Gegenteil einer Fristenliste.
    const result = proposeDeadlines(BASE, { referenceDate: TODAY, horizonYears: 0 });
    const entry = result.find((p) => p.kind === "EEG_ANNUAL_REPORT")!;
    expect(entry.dueDate < TODAY).toBe(true);
  });

  it("ein abweichender Netzbetreiber-Termin schlaegt durch und wird benannt", () => {
    const result = proposeDeadlines(
      { ...BASE, annualReportDay: "01-31" },
      { referenceDate: TODAY, horizonYears: 0 },
    );
    const entry = result.find((p) => p.kind === "EEG_ANNUAL_REPORT")!;
    expect(entry.dueDate).toEqual(d("2026-01-31"));
    // Der gesetzliche Termin muss danebenstehen, sonst sieht der abweichende
    // aus wie das Gesetz.
    expect(entry.basis).toContain("28.02.");
  });

  it("nichts vor der Inbetriebnahme", () => {
    const result = proposeDeadlines(
      { ...BASE, commissioningDate: d("2026-05-01") },
      { referenceDate: TODAY, horizonYears: 0 },
    );
    // 2025 liegt vor Inbetriebnahme 2026 — keine Meldung dafuer.
    expect(kinds(result)).not.toContain("EEG_ANNUAL_REPORT");
  });

  it("der Horizont begrenzt die Anzahl", () => {
    const result = proposeDeadlines(BASE, { referenceDate: TODAY, horizonYears: 2 });
    expect(result.filter((p) => p.kind === "EEG_ANNUAL_REPORT")).toHaveLength(3);
  });
});

describe("Standortguete-Nachpruefung", () => {
  const subject: RegulatoryProfileInput = {
    ...BASE,
    commissioningDate: d("2022-06-15"),
    subjectToSiteQualityReview: true,
  };

  it("nur bei Anlagen im Ausschreibungsregime", () => {
    const without = proposeDeadlines(
      { ...subject, subjectToSiteQualityReview: false },
      { referenceDate: TODAY },
    );
    expect(kinds(without)).not.toContain("EEG_36H_SITE_REVIEW");
  });

  it("nach dem 5., 10. und 15. Betriebsjahr", () => {
    const result = proposeDeadlines(subject, { referenceDate: TODAY });
    const reviews = result.filter((p) => p.kind === "EEG_36H_SITE_REVIEW");
    expect(reviews.map((r) => r.operatingYear)).toEqual([5, 10, 15]);
  });

  it("mit Vorlauf vor dem Ende des Betriebsjahres", () => {
    const result = proposeDeadlines(subject, { referenceDate: TODAY });
    const fifth = result.find((p) => p.operatingYear === 5 && p.kind === "EEG_36H_SITE_REVIEW")!;
    // Betriebsjahr endet 15.06.2027, minus 90 Tage.
    expect(fifth.dueDate).toEqual(d("2027-03-17"));
    expect(SITE_REVIEW_LEAD_DAYS).toBe(90);
    // Der eigentliche Stichtag muss im Text stehen — der Vorlauf ist eine
    // Arbeitshilfe, keine Rechtsfrist.
    expect(fifth.basis).toContain("15.06.2027");
  });

  it("das Jubilaeumsdatum wird ueber den Kalender gerechnet, nicht ueber 365 Tage", () => {
    // 2020 ist ein Schaltjahr; 5 x 365 Tage laegen um einen Tag daneben.
    const leap = proposeDeadlines(
      { ...subject, commissioningDate: d("2019-03-01") },
      { referenceDate: d("2023-01-01") },
    );
    const fifth = leap.find((p) => p.operatingYear === 5 && p.kind === "EEG_36H_SITE_REVIEW")!;
    expect(fifth.basis).toContain("01.03.2024");
  });

  it("bereits verstrichene Pruefungen werden nicht mehr vorgeschlagen", () => {
    const old = proposeDeadlines(
      { ...subject, commissioningDate: d("2005-06-15") },
      { referenceDate: TODAY },
    );
    expect(old.filter((p) => p.kind === "EEG_36H_SITE_REVIEW")).toHaveLength(0);
  });
});

describe("Ohne Inbetriebnahmedatum wird nichts geraten", () => {
  it("keine Jahresmeldung, keine Nachpruefung", () => {
    const result = proposeDeadlines(
      { ...BASE, commissioningDate: null, subjectToSiteQualityReview: true },
      { referenceDate: TODAY },
    );
    expect(kinds(result)).not.toContain("EEG_ANNUAL_REPORT");
    expect(kinds(result)).not.toContain("EEG_36H_SITE_REVIEW");
  });

  it("die MaStR-Pflichten gelten trotzdem", () => {
    // Sie haengen nicht an der Inbetriebnahme.
    const result = proposeDeadlines(
      { ...BASE, commissioningDate: null, mastrUnitNumber: null },
      { referenceDate: TODAY },
    );
    expect(kinds(result)).toContain("MASTR_REGISTRATION");
  });
});

describe("Dringlichkeit", () => {
  it("stimmt mit der Einteilung des Fristenkalenders ueberein", () => {
    expect(deadlineUrgency(d("2026-07-30"), TODAY)).toBe("overdue");
    expect(deadlineUrgency(d("2026-07-31"), TODAY)).toBe("urgent");
    expect(deadlineUrgency(d("2026-08-30"), TODAY)).toBe("urgent");
    expect(deadlineUrgency(d("2026-08-31"), TODAY)).toBe("soon");
    expect(deadlineUrgency(d("2026-10-29"), TODAY)).toBe("soon");
    expect(deadlineUrgency(d("2026-10-30"), TODAY)).toBe("ok");
  });
});
