/**
 * Meldefristen aus den Regulatorik-Stammdaten ableiten.
 *
 * B2 (Audit 2026-07): `mastrNumber` ist ein ungeprüftes Freitextfeld auf
 * `Turbine`, sonst nichts. Es fehlen der EEG-Anlagenschlüssel, der
 * MaStR-Registrierungsstatus, der Zuschlagswert — und ein vorkonfiguriertes
 * Fristenset.
 *
 * ## Was diese Datei tut und was nicht
 *
 * Sie berechnet **Termine**, keine Rechtsfolgen. Jede Regel nennt ihre
 * Grundlage und ist einzeln abschaltbar, weil die Praxis abweicht: der
 * Netzbetreiber setzt seinen eigenen Meldetermin, und der liegt regelmässig
 * vor dem gesetzlichen.
 *
 * ## Warum die Fristen gespeichert und nicht bei jedem Aufruf gerechnet werden
 *
 * Eine erledigte Frist muss erledigt bleiben. Würde die Liste jedes Mal neu
 * abgeleitet, verschwände der Haken beim nächsten Laden — oder schlimmer: eine
 * Frist, die sich durch geänderte Stammdaten verschiebt, sähe aus, als sei sie
 * nie erledigt worden. Deshalb erzeugt diese Datei Vorschläge, und der
 * Aufrufer legt sie einmalig an (siehe `@@unique` auf der Frist).
 */

export type ComplianceDeadlineKind =
  | "EEG_ANNUAL_REPORT"
  | "MASTR_CHANGE_NOTICE"
  | "EEG_36H_SITE_REVIEW"
  | "MASTR_REGISTRATION";

export interface RegulatoryProfileInput {
  /** Inbetriebnahme. Ohne sie lässt sich keine Betriebsjahr-Frist bilden. */
  commissioningDate: Date | null;
  /** MaStR-Nummer der Einheit (SEE…). `null` = noch nicht registriert. */
  mastrUnitNumber: string | null;
  /** Wann zuletzt eine anzeigepflichtige Änderung eingetreten ist. */
  lastChangeAt: Date | null;
  /** Wann diese Änderung gemeldet wurde. */
  lastChangeReportedAt: Date | null;
  /**
   * Fällt die Anlage unter das Ausschreibungsregime mit
   * Standortgüte-Korrektur? Nur dann gibt es die Nachprüfung.
   */
  subjectToSiteQualityReview: boolean;
  /** Abweichender Meldetermin des Netzbetreibers (Tag im Jahr, `MM-TT`). */
  annualReportDay: string | null;
}

export interface DeadlineProposal {
  kind: ComplianceDeadlineKind;
  dueDate: Date;
  /** Stabile Kennung der Regel — verhindert Dubletten beim erneuten Erzeugen. */
  ruleKey: string;
  /** Rechtsgrundlage bzw. Herleitung, in der Liste sichtbar. */
  basis: string;
  /** Betriebsjahr, sofern die Frist daran hängt. */
  operatingYear: number | null;
}

/**
 * Gesetzlicher Termin der EEG-Jahresmeldung an den Netzbetreiber.
 *
 * § 71 Nr. 1 EEG: die für die Endabrechnung erforderlichen Daten sind bis zum
 * 28. Februar des Folgejahres mitzuteilen. Der Netzbetreiber setzt in der
 * Praxis oft einen früheren Termin — dafür gibt es `annualReportDay`.
 */
export const EEG_ANNUAL_REPORT_DAY = "02-28";

/**
 * Frist der MaStR-Änderungsanzeige in Tagen.
 *
 * § 5 Abs. 1 MaStRV: Änderungen sind binnen eines Monats mitzuteilen. Ein
 * Monat wird hier als 30 Tage gerechnet — bewusst konservativ, weil eine
 * kalendarische Monatsfrist bei Monatsenden länger wäre und eine zu lange
 * Frist der falsche Fehler ist.
 */
export const MASTR_CHANGE_NOTICE_DAYS = 30;

/**
 * Betriebsjahre, nach denen die Standortgüte überprüft wird.
 *
 * § 36h Abs. 4 EEG i. V. m. Anlage 2: nach dem fünften, zehnten und
 * fünfzehnten Betriebsjahr wird der Standortertrag mit dem Referenzertrag
 * verglichen und der anzulegende Wert korrigiert — mit Nachzahlung oder
 * Rückforderung. Der Termin fällt niemandem von selbst auf.
 */
export const SITE_REVIEW_YEARS = [5, 10, 15] as const;

/**
 * Vorlauf für die Standortgüte-Nachprüfung in Tagen.
 *
 * Die Prüfung braucht Ertragsdaten und ein Gutachten; am Stichtag selbst zu
 * beginnen wäre zu spät. Der Vorlauf ist eine Arbeitshilfe, keine Rechtsfrist —
 * deshalb steht das Ende des Betriebsjahres im `basis`-Text daneben.
 */
export const SITE_REVIEW_LEAD_DAYS = 90;

/**
 * Fristen für eine Anlage vorschlagen.
 *
 * `horizonYears` begrenzt, wie weit in die Zukunft Jahresmeldungen erzeugt
 * werden. Alle 20 Restlaufjahre auf einmal anzulegen würde die Liste
 * unbrauchbar machen.
 */
export function proposeDeadlines(
  profile: RegulatoryProfileInput,
  options: { referenceDate: Date; horizonYears?: number },
): DeadlineProposal[] {
  const { referenceDate } = options;
  const horizonYears = options.horizonYears ?? 2;
  const proposals: DeadlineProposal[] = [];

  // --- MaStR-Registrierung ------------------------------------------------
  // Keine Frist im Sinne eines Termins, sondern ein offener Zustand: eine
  // Anlage ohne MaStR-Nummer verliert den Anspruch auf die Vergütung
  // (§ 52 Abs. 1 EEG). Deshalb wird sie als sofort fällig geführt und nicht
  // stillschweigend übergangen.
  if (!profile.mastrUnitNumber) {
    proposals.push({
      kind: "MASTR_REGISTRATION",
      dueDate: startOfDay(referenceDate),
      ruleKey: "mastr-registration",
      basis:
        "Keine MaStR-Nummer hinterlegt. Ohne Registrierung im Marktstammdatenregister entfällt der Zahlungsanspruch (§ 52 Abs. 1 EEG).",
      operatingYear: null,
    });
  }

  // --- MaStR-Änderungsanzeige --------------------------------------------
  if (profile.lastChangeAt) {
    const reported = profile.lastChangeReportedAt;
    // Nur offen, wenn die Meldung fehlt ODER älter ist als die Änderung.
    if (!reported || reported < profile.lastChangeAt) {
      proposals.push({
        kind: "MASTR_CHANGE_NOTICE",
        dueDate: addDays(startOfDay(profile.lastChangeAt), MASTR_CHANGE_NOTICE_DAYS),
        // Der Schlüssel trägt das Änderungsdatum: eine zweite Änderung ist
        // eine zweite Frist und darf die erste nicht überschreiben.
        ruleKey: `mastr-change-${formatDay(profile.lastChangeAt)}`,
        basis: `Änderung vom ${formatGerman(profile.lastChangeAt)} — Anzeige binnen eines Monats (§ 5 Abs. 1 MaStRV).`,
        operatingYear: null,
      });
    }
  }

  // Alles Weitere hängt an der Inbetriebnahme. Ohne sie wird nichts geraten.
  if (!profile.commissioningDate) return proposals;

  const commissioning = startOfDay(profile.commissioningDate);
  const currentYear = referenceDate.getUTCFullYear();

  // --- EEG-Jahresmeldung ---------------------------------------------------
  // Für jedes abgeschlossene Betriebsjahr im Horizont. Das laufende Jahr hat
  // noch keine Endabrechnung.
  const day = profile.annualReportDay || EEG_ANNUAL_REPORT_DAY;
  const [month, dayOfMonth] = day.split("-").map((part) => Number(part));

  for (let offset = 0; offset <= horizonYears; offset++) {
    // Meldejahr = Jahr der Abgabe; es betrifft das Vorjahr.
    const reportYear = currentYear + offset;
    const reportedYear = reportYear - 1;
    if (reportedYear < commissioning.getUTCFullYear()) continue;

    const dueDate = new Date(Date.UTC(reportYear, month - 1, dayOfMonth));
    // Bereits verstrichene Termine des laufenden Jahres trotzdem anlegen: eine
    // versäumte Meldung verschwindet nicht dadurch, dass der Termin vorbei ist.
    proposals.push({
      kind: "EEG_ANNUAL_REPORT",
      dueDate,
      ruleKey: `eeg-annual-${reportedYear}`,
      basis:
        profile.annualReportDay && profile.annualReportDay !== EEG_ANNUAL_REPORT_DAY
          ? `Jahresmeldung ${reportedYear} an den Netzbetreiber — abweichender Termin laut Netzbetreiber (gesetzlich: 28.02., § 71 Nr. 1 EEG).`
          : `Jahresmeldung ${reportedYear} an den Netzbetreiber (§ 71 Nr. 1 EEG).`,
      operatingYear: reportedYear,
    });
  }

  // --- Standortgüte-Nachprüfung -------------------------------------------
  if (profile.subjectToSiteQualityReview) {
    for (const year of SITE_REVIEW_YEARS) {
      // Ende des n-ten Betriebsjahres.
      const anniversary = addYears(commissioning, year);
      const dueDate = addDays(anniversary, -SITE_REVIEW_LEAD_DAYS);

      // Vergangene Prüfungen nicht mehr vorschlagen — sie sind entweder
      // erledigt oder nicht mehr nachholbar, und eine Liste voller toter
      // Termine liest niemand.
      if (anniversary < startOfDay(referenceDate)) continue;

      proposals.push({
        kind: "EEG_36H_SITE_REVIEW",
        dueDate,
        ruleKey: `site-review-${year}`,
        basis: `Standortgüte-Nachprüfung nach dem ${year}. Betriebsjahr (§ 36h Abs. 4 EEG i. V. m. Anlage 2). Betriebsjahr endet am ${formatGerman(
          anniversary,
        )}; ${SITE_REVIEW_LEAD_DAYS} Tage Vorlauf für Ertragsdaten und Gutachten.`,
        operatingYear: year,
      });
    }
  }

  return proposals;
}

/**
 * Dringlichkeit einer Frist — dieselbe Einteilung wie im Fristenkalender,
 * damit beide Ansichten dieselbe Farbe für denselben Abstand zeigen.
 */
export function deadlineUrgency(
  dueDate: Date,
  referenceDate: Date,
): "overdue" | "urgent" | "soon" | "ok" {
  const days = Math.floor(
    (startOfDay(dueDate).getTime() - startOfDay(referenceDate).getTime()) / MS_PER_DAY,
  );
  if (days < 0) return "overdue";
  if (days <= 30) return "urgent";
  if (days <= 90) return "soon";
  return "ok";
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/**
 * Jahre addieren — über die Kalenderfelder, nicht über Millisekunden.
 * 5 × 365 Tage lägen bei einer Inbetriebnahme im Schaltjahr um einen Tag
 * daneben, und die Frist hängt am Kalenderdatum.
 */
function addYears(date: Date, years: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
}

function formatDay(date: Date): string {
  return startOfDay(date).toISOString().slice(0, 10);
}

function formatGerman(date: Date): string {
  const day = startOfDay(date);
  return `${String(day.getUTCDate()).padStart(2, "0")}.${String(
    day.getUTCMonth() + 1,
  ).padStart(2, "0")}.${day.getUTCFullYear()}`;
}
