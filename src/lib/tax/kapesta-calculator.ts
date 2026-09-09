/**
 * F-3 Sprint 4: Kapitalertragsteuer-Berechnung (§44a EStG).
 *
 * Bei Ausschüttungen einer Kapitalgesellschaft (GmbH) an natürliche
 * Personen ist Kapitalertragsteuer (25%) + Solidaritätszuschlag (5,5%
 * davon) + ggf. Kirchensteuer einzubehalten und mit Kapitalertragsteuer-
 * Anmeldung (§45a EStG) an das Finanzamt abzuführen.
 *
 * Freistellungsauftrag: 1.000 EUR pro Single, 2.000 EUR pro Verheiratet
 * (Stand 2023+, vorher 801 EUR / 1.602 EUR).
 *
 * Dieses Modul stellt ein BEIBLATT bereit — keine automatische
 * Einbehaltung. Die Buchung erfolgt manuell durch den Buchhalter.
 */

export interface KapEStInput {
  grossAmount: number;
  /** Freibetrag (Freistellungsauftrag) — wird auf das Brutto angerechnet. */
  freibetragRemaining?: number;
  /** Kirchensteuer-Satz (0.08 = Bayern/BW, 0.09 = alle anderen) oder 0 falls nicht KiSt-pflichtig. */
  kirchensteuerRate?: number;
  /**
   * Ist der Kirchensteuersatz erfasst — oder nur angenommen?
   *
   * `false` heisst: die Person ist kirchensteuerpflichtig, der Satz steht aber
   * nirgends. Gerechnet wird dann OHNE Kirchensteuer, und das Beiblatt weist
   * es aus. Stillschweigend mit 0 zu rechnen sähe aus wie „nicht Mitglied" —
   * genau die Verwechslung, die dieses Feld verhindert.
   */
  kirchensteuerDetermined?: boolean;
  /**
   * Ist der Freistellungsauftrag erfasst?
   *
   * `false` heisst: es wurde ohne Freibetrag gerechnet, weil keiner hinterlegt
   * ist. Das ist der richtige Vorbehalt — ohne Auftrag wird auf den vollen
   * Betrag einbehalten —, aber der Leser soll wissen, dass hier nichts geprüft
   * wurde.
   */
  freibetragDetermined?: boolean;
  /**
   * Kapitalertragsteuersatz (§43a Abs. 1 Nr. 1 EStG).
   *
   * Bewusst als Eingabe statt als Konstante in diesem Modul: der Wert liegt in
   * den System-Einstellungen und wird dort gepflegt. Diese Funktion bleibt
   * dadurch rein und synchron — sie rechnet, sie lädt nicht.
   *
   * Ohne Angabe gilt der Rechtsstand vom 01.06.2026 (siehe DEFAULT_KAPEST_RATE).
   */
  kapestRate?: number;
  /** Solidaritätszuschlag auf die Kapitalertragsteuer (§4 SolZG). Siehe `kapestRate`. */
  soliRate?: number;
}

export interface KapEStResult {
  grossAmount: number;
  freibetragApplied: number;
  taxableAmount: number;
  kapestRate: number;
  kapestAmount: number;
  soliRate: number;
  soliAmount: number;
  kirchensteuerRate: number;
  kirchensteuerAmount: number;
  totalDeducted: number;
  netPayout: number;
  /** Siehe KapEStInput.kirchensteuerDetermined. */
  kirchensteuerDetermined: boolean;
  /** Siehe KapEStInput.freibetragDetermined. */
  freibetragDetermined: boolean;
}

/**
 * Rückfallwerte, Rechtsstand 01.06.2026.
 *
 * Die maßgeblichen Werte stehen in den System-Einstellungen (`KAPEST_RATE`,
 * `SOLI_RATE`) und werden von den Aufrufern übergeben. Diese Konstanten greifen
 * nur, wenn keine übergeben wurden — damit ein Aufruf ohne Einstellungen nicht
 * mit 0 % rechnet und dabei wie ein gültiges Ergebnis aussieht.
 */
export const DEFAULT_KAPEST_RATE = 0.25;
export const DEFAULT_SOLI_RATE = 0.055; // 5,5 % auf die KapESt, nicht auf den Ertrag

/**
 * Berechnet KapESt + SolZ + ggf. KiSt pro Ausschüttung an einen Gesellschafter.
 *
 * @example
 *   computeKapESt({ grossAmount: 5000, freibetragRemaining: 1000 })
 *   // → KapESt auf 4000 → 1000 KapESt, 55 SolZ, 945 Netto-Ersparnis vs 1000
 */
export function computeKapESt(input: KapEStInput): KapEStResult {
  const gross = Math.max(0, input.grossAmount);
  const freibetragRemaining = Math.max(0, input.freibetragRemaining ?? 0);
  const kirchensteuerRate = Math.max(0, Math.min(input.kirchensteuerRate ?? 0, 0.09));

  const kapestRate = input.kapestRate ?? DEFAULT_KAPEST_RATE;
  const soliRate = input.soliRate ?? DEFAULT_SOLI_RATE;
  const kirchensteuerDetermined = input.kirchensteuerDetermined ?? true;
  const freibetragDetermined = input.freibetragDetermined ?? true;

  const freibetragApplied = Math.min(gross, freibetragRemaining);
  const taxableAmount = Math.max(0, gross - freibetragApplied);

  const kapestAmount = roundCent(taxableAmount * kapestRate);
  const soliAmount = roundCent(kapestAmount * soliRate);
  // Bei unbekanntem Satz bleibt die Kirchensteuer aussen vor, statt mit einem
  // geratenen Wert zu rechnen. Der Nettobetrag ist dann ein Hoechstwert — das
  // Beiblatt sagt es dazu.
  const kirchensteuerAmount = kirchensteuerDetermined
    ? roundCent(kapestAmount * kirchensteuerRate)
    : 0;

  const totalDeducted = roundCent(kapestAmount + soliAmount + kirchensteuerAmount);
  const netPayout = roundCent(gross - totalDeducted);

  return {
    grossAmount: gross,
    freibetragApplied,
    taxableAmount,
    kapestRate,
    kapestAmount,
    soliRate,
    soliAmount,
    kirchensteuerRate,
    kirchensteuerAmount,
    totalDeducted,
    netPayout,
    kirchensteuerDetermined,
    freibetragDetermined,
  };
}

function roundCent(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Personenbezogene Merkmale in Rechner-Eingaben übersetzen.
 *
 * Vorher kamen Kirchensteuersatz und Freibetrag als Abfrageparameter und galten
 * damit EINHEITLICH für alle Gesellschafter einer Ausschüttung. Beides ist aber
 * personenbezogen: der Satz hängt am Wohnsitz-Bundesland und an der
 * Mitgliedschaft, der Freistellungsauftrag wird von jedem einzeln erteilt.
 *
 * Die Abfrageparameter bleiben als ausdrückliche Vorgabe erhalten — wer weiss,
 * dass alle Beteiligten denselben Auftrag erteilt haben, soll ihn weiter in
 * einem Zug setzen können. Was auf einer Vorgabe beruht und was erfasst ist,
 * unterscheidet die Rückgabe aber sauber, damit das Beiblatt es ausweisen kann.
 */
export function resolvePersonKapESt(input: {
  /** § 51a EStG — ist die Person kirchensteuerpflichtig? */
  churchTaxLiable: boolean;
  /** Erfasster Satz als Dezimalbruch, oder null wenn nicht gepflegt. */
  churchTaxRate: number | null;
  /** Erfasster Freistellungsauftrag in EUR, oder null wenn nicht gepflegt. */
  exemptionOrderEur: number | null;
  /** Vorgabe aus der Abfrage — gilt als Annahme, nicht als erfasster Wert. */
  fallbackKirchensteuerRate: number;
  /** Vorgabe aus der Abfrage — gilt als Annahme, nicht als erfasster Wert. */
  fallbackFreibetragEur: number;
}): Pick<
  KapEStInput,
  | "kirchensteuerRate"
  | "kirchensteuerDetermined"
  | "freibetragRemaining"
  | "freibetragDetermined"
> {
  // Nicht kirchensteuerpflichtig ist eine ERFASSTE Aussage, keine Lücke —
  // deshalb determined = true bei Satz 0.
  const churchKnown = !input.churchTaxLiable || input.churchTaxRate !== null;
  const churchRate = !input.churchTaxLiable
    ? 0
    : (input.churchTaxRate ?? input.fallbackKirchensteuerRate);

  const freibetragKnown = input.exemptionOrderEur !== null;
  const freibetrag = input.exemptionOrderEur ?? input.fallbackFreibetragEur;

  return {
    kirchensteuerRate: churchRate,
    kirchensteuerDetermined: churchKnown,
    freibetragRemaining: Math.max(0, freibetrag),
    freibetragDetermined: freibetragKnown,
  };
}

export interface KapEStLeafletRow {
  shareholderName: string;
  shareholderId: string;
  grossAmount: number;
  kapest: KapEStResult;
}

/**
 * Bildet das vollständige Beiblatt pro Distribution: pro Gesellschafter
 * eine Zeile mit KapESt + SolZ + KiSt-Berechnung.
 */
export function buildKapEStLeaflet(rows: KapEStLeafletRow[]): {
  rows: KapEStLeafletRow[];
  totals: {
    grossTotal: number;
    kapestTotal: number;
    soliTotal: number;
    kirchensteuerTotal: number;
    totalDeducted: number;
    netPayoutTotal: number;
  };
  /**
   * Vorbehalte zum Blatt.
   *
   * Ein Beiblatt ohne Hinweis liest sich wie eine Abrechnung. Wo Angaben
   * fehlen, muss das dabeistehen — sonst nimmt der Empfänger eine Zahl für
   * geprüft, die auf einem Standardwert beruht.
   */
  warnings: string[];
} {
  let grossTotal = 0;
  let kapestTotal = 0;
  let soliTotal = 0;
  let kirchensteuerTotal = 0;
  let totalDeducted = 0;
  let netPayoutTotal = 0;

  for (const r of rows) {
    grossTotal += r.kapest.grossAmount;
    kapestTotal += r.kapest.kapestAmount;
    soliTotal += r.kapest.soliAmount;
    kirchensteuerTotal += r.kapest.kirchensteuerAmount;
    totalDeducted += r.kapest.totalDeducted;
    netPayoutTotal += r.kapest.netPayout;
  }

  const missingChurchTax = rows.filter((r) => !r.kapest.kirchensteuerDetermined);
  const missingFreibetrag = rows.filter((r) => !r.kapest.freibetragDetermined);

  const warnings: string[] = [];
  if (missingChurchTax.length > 0) {
    warnings.push(
      `Bei ${missingChurchTax.length} Gesellschafter(n) ist die Kirchensteuerpflicht vermerkt, aber kein Satz hinterlegt (${missingChurchTax
        .map((r) => r.shareholderName)
        .join(", ")}). Für diese Zeilen wurde OHNE Kirchensteuer gerechnet — der ausgewiesene Nettobetrag ist ein Höchstwert.`,
    );
  }
  if (missingFreibetrag.length > 0) {
    warnings.push(
      `Bei ${missingFreibetrag.length} Gesellschafter(n) ist kein Freistellungsauftrag hinterlegt (${missingFreibetrag
        .map((r) => r.shareholderName)
        .join(", ")}). Gerechnet wurde mit dem Vorgabewert dieser Abfrage — die Zahl beruht insoweit auf einer Annahme. Liegt ein Auftrag vor, ist er beim Kontakt zu erfassen.`,
    );
  }

  return {
    rows,
    totals: {
      grossTotal: roundCent(grossTotal),
      kapestTotal: roundCent(kapestTotal),
      soliTotal: roundCent(soliTotal),
      kirchensteuerTotal: roundCent(kirchensteuerTotal),
      totalDeducted: roundCent(totalDeducted),
      netPayoutTotal: roundCent(netPayoutTotal),
    },
    warnings,
  };
}
