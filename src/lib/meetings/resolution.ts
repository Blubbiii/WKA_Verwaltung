/**
 * Ladungsfrist, Beschlussfähigkeit und Mehrheiten einer Gesellschafterversammlung.
 *
 * B4 (Audit 2026-07): `Vote`, `VoteProxy` und `Mailing` existieren jeweils
 * einzeln. Es fehlt die Klammer — und der Bericht nennt sie „rechtlich heikel
 * wenn schlecht dokumentiert".
 *
 * ## Warum die Mehrheitsbasis ein Feld ist und keine Konstante
 *
 * „Drei Viertel Mehrheit" heisst je nach Gesellschaftsvertrag dreierlei:
 *
 *   - drei Viertel der **abgegebenen** Stimmen (§ 47 Abs. 1, § 53 Abs. 2 GmbHG),
 *   - drei Viertel des **anwesenden** Kapitals,
 *   - drei Viertel des **gesamten** Kapitals.
 *
 * Dieselbe Abstimmung kann auf der einen Basis angenommen und auf der anderen
 * abgelehnt sein. Eine Vorbelegung wäre deshalb keine Vereinfachung, sondern
 * eine Rechtsauskunft im Code — und im Zweifel eine falsche. Die Basis steht
 * am Tagesordnungspunkt und wird im Protokoll mit ausgewiesen.
 *
 * ## Warum die Ladungsfrist geprüft und nicht berechnet wird
 *
 * Die gesetzliche Mindestfrist für die GmbH ist eine Woche (§ 51 Abs. 1 S. 2
 * GmbHG); Gesellschaftsverträge sehen regelmässig zwei bis vier Wochen vor,
 * und bei Personengesellschaften gilt ohnehin nur der Vertrag. Diese Datei
 * rechnet gegen die **hinterlegte** Frist und meldet zusätzlich, wenn sie
 * unter der gesetzlichen Wochenfrist liegt. Sie setzt sie nicht.
 */

/** Woran sich eine Mehrheit bemisst. */
export type MajorityBase =
  /** Abgegebene Stimmen (Enthaltungen zählen nicht mit). */
  | "VOTES_CAST"
  /** Anwesendes bzw. vertretenes Kapital. */
  | "CAPITAL_PRESENT"
  /** Gesamtes Kapital der Gesellschaft. */
  | "CAPITAL_TOTAL";

export type Presence = "PRESENT" | "REPRESENTED" | "ABSENT";

export interface AttendanceRow {
  shareholderId: string;
  presence: Presence;
  /**
   * Kapitalanteil in Prozent zum Versammlungstag. Snapshot — er wird beim
   * Anlegen der Anwesenheitsliste aus dem Anteilsverlauf (A8) gezogen und
   * nicht später nachgerechnet. Sonst änderte ein Anteilsübergang im Juli
   * rückwirkend die Beschlussfähigkeit der Mai-Versammlung.
   */
  sharePercent: number;
}

export interface AttendanceSummary {
  /** Vertretenes Kapital in Prozent — anwesend plus vertreten. */
  representedPercent: number;
  presentPercent: number;
  proxyPercent: number;
  headsPresent: number;
  headsRepresented: number;
  headsTotal: number;
  /** Summe aller erfassten Anteile. Sollte 100 ergeben. */
  registeredPercent: number;
  warnings: string[];
}

/** Gesetzliche Mindestladungsfrist der GmbH, § 51 Abs. 1 S. 2 GmbHG. */
export const STATUTORY_NOTICE_DAYS_GMBH = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function summarizeAttendance(rows: readonly AttendanceRow[]): AttendanceSummary {
  const warnings: string[] = [];

  let presentPercent = 0;
  let proxyPercent = 0;
  let registeredPercent = 0;
  let headsPresent = 0;
  let headsRepresented = 0;

  for (const row of rows) {
    registeredPercent += row.sharePercent;
    if (row.presence === "PRESENT") {
      presentPercent += row.sharePercent;
      headsPresent += 1;
    } else if (row.presence === "REPRESENTED") {
      proxyPercent += row.sharePercent;
      headsRepresented += 1;
    }
  }

  // Eine Anwesenheitsliste, die nicht das ganze Kapital abbildet, ist keine
  // Grundlage für eine Beschlussfähigkeitsprüfung — der fehlende Teil könnte
  // die Mehrheit tragen.
  if (Math.abs(registeredPercent - 100) > 0.011) {
    warnings.push(
      `Die Anwesenheitsliste erfasst ${round2(registeredPercent).toFixed(2)} % des Kapitals statt 100 %. Die Beschlussfähigkeit lässt sich damit nicht sicher feststellen.`,
    );
  }

  return {
    representedPercent: round2(presentPercent + proxyPercent),
    presentPercent: round2(presentPercent),
    proxyPercent: round2(proxyPercent),
    headsPresent,
    headsRepresented,
    headsTotal: rows.length,
    registeredPercent: round2(registeredPercent),
    warnings,
  };
}

export interface QuorumResult {
  isQuorate: boolean;
  representedPercent: number;
  requiredPercent: number | null;
  /** Begründung — sie gehört ins Protokoll. */
  statement: string;
  warnings: string[];
}

/**
 * Beschlussfähigkeit prüfen.
 *
 * Ohne hinterlegtes Quorum gilt die Versammlung als beschlussfähig — so ist
 * die gesetzliche Lage bei der GmbH (§ 48 GmbHG kennt kein Quorum). Das wird
 * aber ausdrücklich gesagt, statt es stillschweigend anzunehmen: wenn der
 * Gesellschaftsvertrag eines vorsieht und niemand es erfasst hat, ist die
 * Aussage falsch.
 */
export function checkQuorum(
  attendance: AttendanceSummary,
  requiredPercent: number | null,
): QuorumResult {
  const warnings = [...attendance.warnings];

  if (requiredPercent === null) {
    warnings.push(
      "Kein Quorum hinterlegt. Es wird von Beschlussfähigkeit ausgegangen — das entspricht der gesetzlichen Lage bei der GmbH, nicht notwendig dem Gesellschaftsvertrag.",
    );
    return {
      isQuorate: true,
      representedPercent: attendance.representedPercent,
      requiredPercent: null,
      statement: `Vertreten sind ${fmt(attendance.representedPercent)} % des Kapitals. Ein Quorum ist nicht hinterlegt.`,
      warnings,
    };
  }

  const isQuorate = attendance.representedPercent + 0.011 >= requiredPercent;

  return {
    isQuorate,
    representedPercent: attendance.representedPercent,
    requiredPercent,
    statement: isQuorate
      ? `Vertreten sind ${fmt(attendance.representedPercent)} % des Kapitals; erforderlich sind ${fmt(requiredPercent)} %. Die Versammlung ist beschlussfähig.`
      : `Vertreten sind ${fmt(attendance.representedPercent)} % des Kapitals; erforderlich sind ${fmt(requiredPercent)} %. Die Versammlung ist NICHT beschlussfähig.`,
    warnings,
  };
}

export interface NoticeCheck {
  compliant: boolean;
  /** Tage zwischen Einladung und Versammlung. */
  actualDays: number | null;
  requiredDays: number;
  statement: string;
  warnings: string[];
}

/**
 * Ladungsfrist prüfen.
 *
 * Das ist der Punkt, an dem eine Versammlung kippt: ein Beschluss aus einer zu
 * kurz geladenen Versammlung ist anfechtbar, und das fällt erst auf, wenn ihn
 * jemand angreift.
 */
export function checkNoticePeriod(input: {
  invitationSentAt: Date | null;
  scheduledAt: Date;
  /** Frist laut Gesellschaftsvertrag in Tagen. */
  requiredDays: number;
  /** Haben alle Gesellschafter auf die Frist verzichtet (Vollversammlung)? */
  waivedByAll: boolean;
}): NoticeCheck {
  const warnings: string[] = [];

  if (input.requiredDays < STATUTORY_NOTICE_DAYS_GMBH) {
    // Nicht ablehnen — bei Personengesellschaften gilt allein der Vertrag.
    // Aber benennen, weil es bei einer GmbH ein Fehler wäre.
    warnings.push(
      `Die hinterlegte Ladungsfrist von ${input.requiredDays} Tagen liegt unter der gesetzlichen Wochenfrist der GmbH (§ 51 Abs. 1 S. 2 GmbHG). Bei einer GmbH ist das zu prüfen.`,
    );
  }

  if (input.waivedByAll) {
    // § 51 Abs. 3 GmbHG: sind alle Gesellschafter erschienen und
    // einverstanden, heilt das den Ladungsmangel.
    return {
      compliant: true,
      actualDays: input.invitationSentAt
        ? daysBetween(input.invitationSentAt, input.scheduledAt)
        : null,
      requiredDays: input.requiredDays,
      statement:
        "Vollversammlung: alle Gesellschafter sind erschienen und mit der Beschlussfassung einverstanden. Ein Ladungsmangel ist damit geheilt (§ 51 Abs. 3 GmbHG).",
      warnings,
    };
  }

  if (!input.invitationSentAt) {
    return {
      compliant: false,
      actualDays: null,
      requiredDays: input.requiredDays,
      statement:
        "Kein Versanddatum der Einladung erfasst. Die Einhaltung der Ladungsfrist ist nicht nachweisbar.",
      warnings,
    };
  }

  const actualDays = daysBetween(input.invitationSentAt, input.scheduledAt);
  const compliant = actualDays >= input.requiredDays;

  return {
    compliant,
    actualDays,
    requiredDays: input.requiredDays,
    statement: compliant
      ? `Die Einladung ging ${actualDays} Tage vor der Versammlung hinaus; erforderlich sind ${input.requiredDays} Tage.`
      : `Die Einladung ging nur ${actualDays} Tage vor der Versammlung hinaus; erforderlich sind ${input.requiredDays} Tage. Beschlüsse aus dieser Versammlung sind anfechtbar, solange nicht alle Gesellschafter erschienen sind und zustimmen.`,
    warnings,
  };
}

export interface ResolutionVotes {
  /** Ja-Stimmen, gemessen in der Einheit der Basis (Prozent Kapital oder Stimmen). */
  inFavor: number;
  against: number;
  abstain: number;
}

export interface ResolutionResult {
  adopted: boolean | null;
  /** Erreichter Anteil in Prozent auf der gewählten Basis. */
  achievedPercent: number | null;
  requiredPercent: number;
  base: MajorityBase;
  /** Der Satz fürs Protokoll. */
  statement: string;
  warnings: string[];
}

/**
 * Beschluss auswerten.
 *
 * Gibt `null` zurück, wenn die Basis 0 ist — nicht „abgelehnt". Eine
 * Abstimmung ohne abgegebene Stimmen ist keine Ablehnung, sondern keine
 * Abstimmung.
 */
export function evaluateResolution(input: {
  votes: ResolutionVotes;
  base: MajorityBase;
  requiredPercent: number;
  /** Vertretenes Kapital in Prozent — Basis bei CAPITAL_PRESENT. */
  representedPercent: number;
  /** Beschlussfähig? Ein Beschluss ohne Beschlussfähigkeit ist keiner. */
  isQuorate: boolean;
}): ResolutionResult {
  const warnings: string[] = [];
  const { votes, base, requiredPercent } = input;

  if (!input.isQuorate) {
    // Ausdrücklich kein Ergebnis. Ein gerechnetes „angenommen" aus einer
    // beschlussunfähigen Versammlung wäre die gefährlichste Zahl hier.
    return {
      adopted: null,
      achievedPercent: null,
      requiredPercent,
      base,
      statement:
        "Die Versammlung ist nicht beschlussfähig. Ein Beschluss kommt nicht zustande; das Ergebnis wird nicht ausgewiesen.",
      warnings,
    };
  }

  let basis: number;
  let basisLabel: string;

  switch (base) {
    case "VOTES_CAST":
      // Enthaltungen zählen bei der Mehrheit der abgegebenen Stimmen NICHT
      // mit (§ 47 Abs. 1 GmbHG). Sie mitzuzählen würde eine Enthaltung wie
      // eine Nein-Stimme wirken lassen.
      basis = votes.inFavor + votes.against;
      basisLabel = "der abgegebenen Stimmen";
      if (votes.abstain > 0) {
        warnings.push(
          `${fmt(votes.abstain)} Enthaltungen sind in der Basis nicht enthalten — bei der Mehrheit der abgegebenen Stimmen zählen sie nicht mit.`,
        );
      }
      break;
    case "CAPITAL_PRESENT":
      basis = input.representedPercent;
      basisLabel = "des vertretenen Kapitals";
      break;
    case "CAPITAL_TOTAL":
      basis = 100;
      basisLabel = "des gesamten Kapitals";
      break;
  }

  if (basis <= 0) {
    return {
      adopted: null,
      achievedPercent: null,
      requiredPercent,
      base,
      statement:
        "Es wurden keine Stimmen abgegeben. Ein Beschluss ist nicht zustande gekommen; das Ergebnis wird nicht ausgewiesen.",
      warnings,
    };
  }

  const achieved = round2((votes.inFavor / basis) * 100);
  const adopted = achieved + 0.011 >= requiredPercent;

  return {
    adopted,
    achievedPercent: achieved,
    requiredPercent,
    base,
    statement: `Ja ${fmt(votes.inFavor)}, Nein ${fmt(votes.against)}, Enthaltung ${fmt(votes.abstain)}. Das entspricht ${fmt(achieved)} % ${basisLabel}; erforderlich sind ${fmt(requiredPercent)} %. Der Beschluss ist ${adopted ? "angenommen" : "abgelehnt"}.`,
    warnings,
  };
}

function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / MS_PER_DAY);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fmt(value: number): string {
  return value.toFixed(2).replace(".", ",").replace(/,00$/, "");
}
