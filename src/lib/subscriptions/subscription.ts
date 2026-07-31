/**
 * Zeichnungsschein: Widerrufsfrist, Einzahlung, GwG-Legitimation.
 *
 * B6 (Audit 2026-07): „`shareholders/onboard` deckt die Datenerfassung. Es
 * fehlen Zeichnungsschein mit Widerrufsfrist, Einzahlungsüberwachung und
 * Legitimationsprüfung nach GwG mit Wiedervorlage."
 *
 * ## Die eine Stelle, an der diese Datei blockiert statt zu warnen
 *
 * Nach § 10 Abs. 1 Nr. 1 i. V. m. § 11 Abs. 1 GwG ist der Vertragspartner zu
 * identifizieren, **bevor** die Geschäftsbeziehung begründet wird. Eine
 * Zeichnung ohne abgeschlossene Legitimation anzunehmen ist deshalb kein
 * Schönheitsfehler, den man später nachholt — es ist der Verstoss selbst.
 * `canAccept` liefert dort `false`, nicht eine Warnung.
 *
 * ## Warum die Widerrufsfrist `null` sein kann
 *
 * Die Frist läuft erst mit ordnungsgemässer Widerrufsbelehrung an (§ 356
 * Abs. 3 S. 1 BGB). Ist keine Belehrung erfasst, gibt es kein Fristende — und
 * eine ausgerechnete Frist wäre die gefährlichere Antwort, weil sie eine
 * Sicherheit vorspiegelt, die nicht besteht.
 */

export type SubscriptionStatus =
  | "DRAFT"
  | "SIGNED"
  | "ACCEPTED"
  | "PAID"
  | "WITHDRAWN"
  | "REJECTED";

export type AmlStatus = "PENDING" | "VERIFIED" | "EXPIRED" | "REJECTED";

/** Regelmässige Widerrufsfrist, § 355 Abs. 2 S. 1 BGB. */
export const DEFAULT_WITHDRAWAL_DAYS = 14;

/**
 * Aufbewahrungsfrist der Legitimationsunterlagen, § 8 Abs. 4 S. 1 GwG:
 * fünf Jahre nach Ende der Geschäftsbeziehung.
 */
export const AML_RETENTION_YEARS = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface WithdrawalInput {
  signedAt: Date | null;
  /** Wann die Widerrufsbelehrung erteilt wurde. Ohne sie läuft keine Frist. */
  instructionGivenAt: Date | null;
  periodDays: number;
}

export interface WithdrawalState {
  /** Ende der Frist. `null` = die Frist läuft nicht. */
  deadline: Date | null;
  /** Läuft die Frist noch? `null` = nicht bestimmbar. */
  isRunning: boolean | null;
  daysLeft: number | null;
  statement: string;
}

/**
 * Widerrufsfrist bestimmen.
 *
 * Die Frist beginnt frühestens mit dem späteren der beiden Zeitpunkte:
 * Vertragsschluss und Belehrung.
 */
export function computeWithdrawal(input: WithdrawalInput, referenceDate: Date): WithdrawalState {
  if (!input.signedAt) {
    return {
      deadline: null,
      isRunning: null,
      daysLeft: null,
      statement: "Noch nicht gezeichnet — eine Widerrufsfrist läuft nicht.",
    };
  }

  if (!input.instructionGivenAt) {
    // Kein ausgerechnetes Fristende. Es würde eine Sicherheit vorspiegeln,
    // die nicht besteht: ohne Belehrung läuft die Frist nicht an.
    return {
      deadline: null,
      isRunning: true,
      daysLeft: null,
      statement:
        "Keine Widerrufsbelehrung erfasst. Die Widerrufsfrist läuft damit nicht an (§ 356 Abs. 3 S. 1 BGB) — der Widerruf ist auf unbestimmte Zeit möglich.",
    };
  }

  const start = input.instructionGivenAt > input.signedAt ? input.instructionGivenAt : input.signedAt;
  const deadline = addDays(startOfDay(start), input.periodDays);
  const daysLeft = Math.ceil(
    (deadline.getTime() - startOfDay(referenceDate).getTime()) / MS_PER_DAY,
  );
  const isRunning = daysLeft > 0;

  return {
    deadline,
    isRunning,
    daysLeft,
    statement: isRunning
      ? `Die Widerrufsfrist läuft noch ${daysLeft} Tage, bis zum ${formatGerman(deadline)}.`
      : `Die Widerrufsfrist ist am ${formatGerman(deadline)} abgelaufen.`,
  };
}

export interface PaymentInput {
  /** Gezeichnete Einlage. */
  amountEur: number;
  /** Agio in Prozent der Einlage. */
  agioPercent: number;
  /** Tatsächlich eingegangen. */
  paidEur: number;
  dueDate: Date | null;
}

export interface PaymentState {
  /** Zu zahlen: Einlage plus Agio. */
  dueEur: number;
  paidEur: number;
  openEur: number;
  isSettled: boolean;
  /** Mehr gezahlt als gefordert. */
  overpaidEur: number;
  daysOverdue: number | null;
  statement: string;
  warnings: string[];
}

/**
 * Einzahlung gegen Soll prüfen.
 *
 * Das Agio gehört zum Soll: es ist Teil des Zeichnungsbetrags, auch wenn es
 * nicht auf die Einlage angerechnet wird. Es wegzulassen ergäbe eine
 * Einzahlung, die vollständig aussieht und es nicht ist.
 */
export function checkPayment(input: PaymentInput, referenceDate: Date): PaymentState {
  const warnings: string[] = [];

  const agio = round2((input.amountEur * input.agioPercent) / 100);
  const due = round2(input.amountEur + agio);
  const paid = round2(input.paidEur);
  const difference = round2(due - paid);

  const open = difference > 0 ? difference : 0;
  const overpaid = difference < 0 ? round2(-difference) : 0;

  // Toleranz von einem Cent für Rundungen aus dem Agio. Alles darüber ist
  // eine echte Abweichung und wird benannt.
  const isSettled = Math.abs(difference) <= 0.01;

  let daysOverdue: number | null = null;
  if (input.dueDate && !isSettled && open > 0) {
    const days = Math.floor(
      (startOfDay(referenceDate).getTime() - startOfDay(input.dueDate).getTime()) / MS_PER_DAY,
    );
    daysOverdue = days > 0 ? days : 0;
  }

  if (overpaid > 0.01) {
    warnings.push(
      `Es sind ${formatEur(overpaid)} mehr eingegangen als gefordert. Der Mehrbetrag ist zurückzuzahlen oder zuzuordnen — er wird nicht als weitere Einlage behandelt.`,
    );
  }
  if (paid > 0 && open > 0.01) {
    warnings.push(
      `Teilzahlung: ${formatEur(paid)} von ${formatEur(due)}. Eine Teilzahlung erfüllt die Einlagepflicht nicht.`,
    );
  }

  return {
    dueEur: due,
    paidEur: paid,
    openEur: open,
    isSettled,
    overpaidEur: overpaid,
    daysOverdue,
    statement: isSettled
      ? `Einlage und Agio sind vollständig eingegangen (${formatEur(paid)}).`
      : open > 0
        ? `Offen: ${formatEur(open)} von ${formatEur(due)}${
            daysOverdue !== null && daysOverdue > 0 ? `, seit ${daysOverdue} Tagen überfällig` : ""
          }.`
        : `Überzahlung von ${formatEur(overpaid)}.`,
    warnings,
  };
}

export interface AmlInput {
  status: AmlStatus;
  identifiedAt: Date | null;
  /** Ablauf des vorgelegten Ausweisdokuments. */
  documentValidUntil: Date | null;
  /** Wiedervorlage zur Aktualisierung (§ 10 Abs. 1 Nr. 5 GwG). */
  nextReviewAt: Date | null;
  /** Wirtschaftlich Berechtigter geklärt (§ 10 Abs. 1 Nr. 2, § 3 GwG). */
  beneficialOwnerVerified: boolean;
  /** Politisch exponierte Person (§ 1 Abs. 12 GwG). */
  isPep: boolean;
}

export interface AmlState {
  /** Liegt eine gültige Legitimation vor? */
  isValid: boolean;
  /** Wiedervorlage fällig oder überfällig. */
  reviewDue: boolean;
  /** Tage bis zur Wiedervorlage. Negativ = überfällig. */
  reviewInDays: number | null;
  problems: string[];
  warnings: string[];
  statement: string;
}

/** Vorlauf, ab dem eine Wiedervorlage gemeldet wird. */
export const AML_REVIEW_WARN_DAYS = 60;

export function checkAml(input: AmlInput, referenceDate: Date): AmlState {
  const problems: string[] = [];
  const warnings: string[] = [];

  if (input.status === "REJECTED") {
    problems.push("Die Legitimationsprüfung wurde abgelehnt.");
  }
  if (input.status === "PENDING" || !input.identifiedAt) {
    problems.push("Die Identifizierung ist nicht abgeschlossen (§ 11 Abs. 1 GwG).");
  }

  if (input.documentValidUntil && input.documentValidUntil < startOfDay(referenceDate)) {
    // Ein abgelaufener Ausweis trägt die Identifizierung nicht mehr fort.
    problems.push(
      `Das vorgelegte Ausweisdokument ist am ${formatGerman(input.documentValidUntil)} abgelaufen.`,
    );
  }

  if (!input.beneficialOwnerVerified) {
    // Kein Hinderungsgrund für sich genommen, aber eine offene Pflicht.
    warnings.push(
      "Der wirtschaftlich Berechtigte ist nicht abgeklärt (§ 10 Abs. 1 Nr. 2 GwG). Bei natürlichen Personen, die auf eigene Rechnung handeln, genügt der Vermerk darüber.",
    );
  }

  if (input.isPep) {
    warnings.push(
      "Politisch exponierte Person: verstärkte Sorgfaltspflichten (§ 15 Abs. 4 GwG), Zustimmung der Führungsebene erforderlich.",
    );
  }

  let reviewInDays: number | null = null;
  let reviewDue = false;
  if (input.nextReviewAt) {
    reviewInDays = Math.floor(
      (startOfDay(input.nextReviewAt).getTime() - startOfDay(referenceDate).getTime()) / MS_PER_DAY,
    );
    reviewDue = reviewInDays <= AML_REVIEW_WARN_DAYS;
    if (reviewInDays < 0) {
      warnings.push(
        `Die Wiedervorlage war am ${formatGerman(input.nextReviewAt)} fällig (§ 10 Abs. 1 Nr. 5 GwG).`,
      );
    }
  } else if (input.status === "VERIFIED") {
    warnings.push(
      "Keine Wiedervorlage hinterlegt. Die kontinuierliche Überwachung verlangt eine Aktualisierung in angemessenen Abständen (§ 10 Abs. 1 Nr. 5 GwG).",
    );
  }

  const isValid = problems.length === 0 && input.status === "VERIFIED";

  return {
    isValid,
    reviewDue,
    reviewInDays,
    problems,
    warnings,
    statement: isValid
      ? `Legitimation liegt vor${input.identifiedAt ? ` (identifiziert am ${formatGerman(input.identifiedAt)})` : ""}.`
      : problems[0] ?? "Legitimation nicht abgeschlossen.",
  };
}

export interface AcceptanceCheck {
  canAccept: boolean;
  /** Gründe, die dagegen stehen. Leer, wenn angenommen werden darf. */
  blockers: string[];
  warnings: string[];
}

/**
 * Darf die Zeichnung angenommen werden?
 *
 * Die harte Schranke ist die Legitimation: ohne sie wäre die Annahme der
 * Verstoss selbst, nicht ein später zu heilender Mangel (§ 10 Abs. 1 Nr. 1,
 * § 11 Abs. 1 GwG).
 *
 * Die laufende Widerrufsfrist ist dagegen KEIN Hindernis — der Vertrag kommt
 * zustande und ist nur widerruflich. Sie wird als Hinweis geführt, damit
 * niemand das Geld verplant, das noch zurückgefordert werden kann.
 */
export function checkAcceptance(input: {
  status: SubscriptionStatus;
  aml: AmlState;
  withdrawal: WithdrawalState;
  signedAt: Date | null;
}): AcceptanceCheck {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.signedAt) {
    blockers.push("Der Zeichnungsschein ist nicht unterzeichnet.");
  }
  if (input.status === "WITHDRAWN") {
    blockers.push("Die Zeichnung wurde widerrufen.");
  }
  if (input.status === "REJECTED") {
    blockers.push("Die Zeichnung wurde abgelehnt.");
  }
  if (input.status === "ACCEPTED" || input.status === "PAID") {
    blockers.push("Die Zeichnung ist bereits angenommen.");
  }

  if (!input.aml.isValid) {
    blockers.push(
      `Die GwG-Legitimation liegt nicht vor: ${input.aml.problems[0] ?? "nicht abgeschlossen"}. Die Identifizierung muss vor Begründung der Geschäftsbeziehung abgeschlossen sein (§ 10 Abs. 1 Nr. 1, § 11 Abs. 1 GwG).`,
    );
  }

  warnings.push(...input.aml.warnings);

  if (input.withdrawal.isRunning) {
    warnings.push(
      `${input.withdrawal.statement} Eingegangene Beträge sind bis dahin zurückzuzahlen, wenn widerrufen wird.`,
    );
  }

  return { canAccept: blockers.length === 0, blockers, warnings };
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatEur(value: number): string {
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function formatGerman(date: Date): string {
  const day = startOfDay(date);
  return `${String(day.getUTCDate()).padStart(2, "0")}.${String(day.getUTCMonth() + 1).padStart(2, "0")}.${day.getUTCFullYear()}`;
}
