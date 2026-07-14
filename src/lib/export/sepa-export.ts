/**
 * SEPA pain.001.001.03 Credit Transfer XML Generator
 *
 * Generates ISO 20022 SEPA Credit Transfer XML for batch payment of incoming invoices.
 * No external npm package required — pure XML template.
 *
 * P18: Vor jedem Export werden ALLE IBANs (Debtor + jeder Creditor) per
 * Mod-97 validiert. Fehlerhafte IBAN → SepaExportValidationError mit
 * konkretem Hinweis, statt die Bank das XML später ablehnen zu lassen.
 */

import { formatAmountFixed2 as formatAmount } from "@/lib/format";
import { IbanValidationError, assertValidIban } from "@/lib/iban";
import {
  checkAwvReportable,
  AWV_THRESHOLD_EUR,
  type AwvCheckResult,
} from "@/lib/accounting/awv-check";

export interface SepaPayment {
  endToEndId: string;
  amount: number;
  currency: string;
  creditorName: string;
  creditorIban: string;
  creditorBic?: string;
  remittanceInfo: string;
  requestedExecutionDate: string; // YYYY-MM-DD
}

export interface SepaExportOptions {
  messageId: string;
  creationDateTime: string; // ISO 8601
  debtorName: string;
  debtorIban: string;
  debtorBic?: string;
  payments: SepaPayment[];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Wird geworfen wenn vor der XML-Generierung eine ungültige IBAN
 * gefunden wurde. Caller sollte die Liste an Fehlern dem User anzeigen.
 */
export class SepaExportValidationError extends Error {
  constructor(public readonly errors: Array<{ field: string; reason: string }>) {
    super(
      `SEPA-Export-Validierung fehlgeschlagen: ${errors.map((e) => `${e.field}: ${e.reason}`).join("; ")}`,
    );
    this.name = "SepaExportValidationError";
  }
}

/**
 * C-2 Sprint 5: Prüft die SEPA-Zahlungen auf AWV-Meldepflicht (§11 AWG / §67 AWV).
 * Erzeugt KEINE Errors — nur Warnungen für die UI/Audit-Log.
 *
 * Ein Lauf-Total kann meldepflichtig sein auch wenn keine einzelne Zahlung
 * darüber liegt (Aggregations-Regel pro Mitteilungszeitraum), daher wird
 * zusätzlich das Gesamt-Volumen pro Ziel-Land aggregiert.
 */
export function checkSepaAwvWarnings(payments: SepaPayment[]): Array<{
  endToEndId: string;
  creditorName: string;
  amount: number;
  awv: AwvCheckResult;
}> {
  const warnings: Array<{
    endToEndId: string;
    creditorName: string;
    amount: number;
    awv: AwvCheckResult;
  }> = [];

  for (const p of payments) {
    const awv = checkAwvReportable({
      amountEur: p.amount,
      iban: p.creditorIban,
      bic: p.creditorBic,
    });
    if (awv.reportable) {
      warnings.push({
        endToEndId: p.endToEndId,
        creditorName: p.creditorName,
        amount: p.amount,
        awv,
      });
    }
  }

  return warnings;
}

export { AWV_THRESHOLD_EUR };

export function generateSepaXml(options: SepaExportOptions): string {
  const { messageId, creationDateTime, debtorName, debtorIban, debtorBic, payments } = options;

  // P18: IBAN-Validierung VOR der teuren XML-Generierung.
  // Wir sammeln alle Fehler in einem Durchgang, damit der User mehrere
  // Korrekturen gleichzeitig vornehmen kann.
  const errors: Array<{ field: string; reason: string }> = [];
  try {
    assertValidIban(debtorIban);
  } catch (err) {
    if (err instanceof IbanValidationError) {
      errors.push({
        field: "debtorIban",
        reason: `${err.errorCode}: "${debtorIban}"`,
      });
    } else {
      throw err;
    }
  }
  payments.forEach((p, idx) => {
    try {
      assertValidIban(p.creditorIban);
    } catch (err) {
      if (err instanceof IbanValidationError) {
        errors.push({
          field: `payments[${idx}].creditorIban (${p.creditorName})`,
          reason: `${err.errorCode}: "${p.creditorIban}"`,
        });
      } else {
        throw err;
      }
    }
  });
  if (errors.length > 0) {
    throw new SepaExportValidationError(errors);
  }

  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
  const txCount = payments.length;

  // Group payments by requested execution date
  const byDate = new Map<string, SepaPayment[]>();
  for (const p of payments) {
    const existing = byDate.get(p.requestedExecutionDate) ?? [];
    existing.push(p);
    byDate.set(p.requestedExecutionDate, existing);
  }

  const pmtInfBlocks: string[] = [];
  let pmtInfIdx = 1;

  for (const [execDate, pmts] of byDate.entries()) {
    const pmtInfId = `${messageId}-${String(pmtInfIdx).padStart(3, "0")}`;
    pmtInfIdx++;

    const pmtInfTotal = pmts.reduce((s, p) => s + p.amount, 0);

    const cdtTrfTxInfBlocks = pmts.map((p) => {
      const bic = p.creditorBic
        ? `<FinInstnId><BIC>${escapeXml(p.creditorBic)}</BIC></FinInstnId>`
        : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;

      return `      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${escapeXml(p.endToEndId.slice(0, 35))}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="${escapeXml(p.currency)}">${formatAmount(p.amount)}</InstdAmt>
        </Amt>
        <CdtrAgt>
          ${bic}
        </CdtrAgt>
        <Cdtr>
          <Nm>${escapeXml(p.creditorName.slice(0, 140))}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${escapeXml(p.creditorIban.replace(/\s/g, ""))}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${escapeXml(p.remittanceInfo.slice(0, 140))}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`;
    });

    const debtorBicBlock = debtorBic
      ? `<DbtrAgt><FinInstnId><BIC>${escapeXml(debtorBic)}</BIC></FinInstnId></DbtrAgt>`
      : `<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>`;

    pmtInfBlocks.push(`    <PmtInf>
      <PmtInfId>${escapeXml(pmtInfId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${pmts.length}</NbOfTxs>
      <CtrlSum>${formatAmount(pmtInfTotal)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${execDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(debtorName.slice(0, 140))}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${escapeXml(debtorIban.replace(/\s/g, ""))}</IBAN>
        </Id>
      </DbtrAcct>
      ${debtorBicBlock}
${cdtTrfTxInfBlocks.join("\n")}
    </PmtInf>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03 pain.001.001.03.xsd">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(messageId.slice(0, 35))}</MsgId>
      <CreDtTm>${escapeXml(creationDateTime)}</CreDtTm>
      <NbOfTxs>${txCount}</NbOfTxs>
      <CtrlSum>${formatAmount(totalAmount)}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(debtorName.slice(0, 140))}</Nm>
      </InitgPty>
    </GrpHdr>
${pmtInfBlocks.join("\n")}
  </CstmrCdtTrfInitn>
</Document>`;
}
