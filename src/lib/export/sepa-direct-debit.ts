/**
 * SEPA Direct Debit (Lastschrift) — pain.008.001.02
 *
 * Generiert ISO 20022 SEPA Direct Debit XML für CORE- und B2B-Lastschriften.
 *
 * Sequence-Types:
 *   FRST  Erstmalige Lastschrift bei wiederkehrenden Mandaten
 *   RCUR  Wiederkehrende Lastschrift (folgende Einzüge)
 *   OOFF  Einmalige Lastschrift
 *   FNAL  Letzte Lastschrift eines wiederkehrenden Mandats
 *
 * Local-Instrument:
 *   CORE   Standard Privatkunden (8 Wochen Rückgaberecht)
 *   B2B    Business-to-Business (kein Rückgaberecht)
 *
 * Fristen:
 *   CORE FRST  6 Bankarbeitstage vor Fälligkeit (D-6)
 *   CORE RCUR  3 Bankarbeitstage vor Fälligkeit (D-3)
 *   B2B alle   2 Bankarbeitstage vor Fälligkeit (D-2)
 */

import { formatAmountFixed2 as formatAmount } from "@/lib/formatters";
import { IbanValidationError, assertValidIban } from "@/lib/iban";

export type DirectDebitSequenceType = "FRST" | "RCUR" | "OOFF" | "FNAL";
export type DirectDebitScheme = "CORE" | "B2B";

export interface DirectDebitMandate {
  /** Eindeutige Mandatsreferenz (Mandant-Nr beim Schuldner). */
  mandateId: string;
  /** Datum der Mandatsunterzeichnung. */
  signedDate: string; // YYYY-MM-DD
  sequenceType: DirectDebitSequenceType;
}

export interface DirectDebitPayment {
  endToEndId: string;
  /** Eindeutige Mandatsreferenz. */
  mandate: DirectDebitMandate;
  amount: number;
  currency: string; // i.d.R. "EUR"
  debtorName: string;
  debtorIban: string;
  debtorBic?: string;
  remittanceInfo: string;
}

export interface DirectDebitOptions {
  messageId: string;
  creationDateTime: string; // ISO 8601
  /** Creditor = Eigene Daten (Tenant). */
  creditorName: string;
  creditorIban: string;
  creditorBic?: string;
  /** Creditor-Identifier (CI) — vom Gläubiger-ID-Register. */
  creditorId: string;
  /** Lokales Instrument (CORE oder B2B). */
  scheme: DirectDebitScheme;
  requestedCollectionDate: string; // YYYY-MM-DD
  payments: DirectDebitPayment[];
}

export class SepaDirectDebitValidationError extends Error {
  constructor(public readonly errors: Array<{ field: string; reason: string }>) {
    super(
      `SEPA-DD-Validierung fehlgeschlagen: ${errors.map((e) => `${e.field}: ${e.reason}`).join("; ")}`,
    );
    this.name = "SepaDirectDebitValidationError";
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateSepaDirectDebitXml(options: DirectDebitOptions): string {
  // P18-konform: alle IBANs vor XML-Generierung validieren
  const errors: Array<{ field: string; reason: string }> = [];
  try {
    assertValidIban(options.creditorIban);
  } catch (err) {
    if (err instanceof IbanValidationError) {
      errors.push({
        field: "creditorIban",
        reason: `${err.errorCode}: "${options.creditorIban}"`,
      });
    } else {
      throw err;
    }
  }
  options.payments.forEach((p, idx) => {
    try {
      assertValidIban(p.debtorIban);
    } catch (err) {
      if (err instanceof IbanValidationError) {
        errors.push({
          field: `payments[${idx}].debtorIban (${p.debtorName})`,
          reason: `${err.errorCode}: "${p.debtorIban}"`,
        });
      } else {
        throw err;
      }
    }
  });
  if (errors.length > 0) {
    throw new SepaDirectDebitValidationError(errors);
  }

  const totalAmount = options.payments.reduce((s, p) => s + p.amount, 0);
  const txCount = options.payments.length;

  // Pro Sequence-Type ein PaymentInformation-Block
  const bySequence = new Map<DirectDebitSequenceType, DirectDebitPayment[]>();
  for (const p of options.payments) {
    const seq = p.mandate.sequenceType;
    const arr = bySequence.get(seq) ?? [];
    arr.push(p);
    bySequence.set(seq, arr);
  }

  const paymentInfoBlocks: string[] = [];
  let pmtInfId = 1;

  for (const [seq, payments] of bySequence.entries()) {
    const blockAmount = payments.reduce((s, p) => s + p.amount, 0);

    const transactions = payments
      .map((p) => {
        return `      <DrctDbtTxInf>
        <PmtId><EndToEndId>${escapeXml(p.endToEndId)}</EndToEndId></PmtId>
        <InstdAmt Ccy="${escapeXml(p.currency)}">${formatAmount(p.amount)}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${escapeXml(p.mandate.mandateId)}</MndtId>
            <DtOfSgntr>${escapeXml(p.mandate.signedDate)}</DtOfSgntr>
          </MndtRltdInf>
        </DrctDbtTx>
        ${p.debtorBic ? `<DbtrAgt><FinInstnId><BIC>${escapeXml(p.debtorBic)}</BIC></FinInstnId></DbtrAgt>` : "<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>"}
        <Dbtr><Nm>${escapeXml(p.debtorName)}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>${escapeXml(p.debtorIban)}</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>${escapeXml(p.remittanceInfo)}</Ustrd></RmtInf>
      </DrctDbtTxInf>`;
      })
      .join("\n");

    paymentInfoBlocks.push(`  <PmtInf>
    <PmtInfId>${escapeXml(options.messageId)}-${pmtInfId++}</PmtInfId>
    <PmtMtd>DD</PmtMtd>
    <BtchBookg>true</BtchBookg>
    <NbOfTxs>${payments.length}</NbOfTxs>
    <CtrlSum>${formatAmount(blockAmount)}</CtrlSum>
    <PmtTpInf>
      <SvcLvl><Cd>SEPA</Cd></SvcLvl>
      <LclInstrm><Cd>${escapeXml(options.scheme)}</Cd></LclInstrm>
      <SeqTp>${seq}</SeqTp>
    </PmtTpInf>
    <ReqdColltnDt>${escapeXml(options.requestedCollectionDate)}</ReqdColltnDt>
    <Cdtr><Nm>${escapeXml(options.creditorName)}</Nm></Cdtr>
    <CdtrAcct><Id><IBAN>${escapeXml(options.creditorIban)}</IBAN></Id></CdtrAcct>
    ${options.creditorBic ? `<CdtrAgt><FinInstnId><BIC>${escapeXml(options.creditorBic)}</BIC></FinInstnId></CdtrAgt>` : "<CdtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></CdtrAgt>"}
    <ChrgBr>SLEV</ChrgBr>
    <CdtrSchmeId>
      <Id>
        <PrvtId>
          <Othr>
            <Id>${escapeXml(options.creditorId)}</Id>
            <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>
          </Othr>
        </PrvtId>
      </Id>
    </CdtrSchmeId>
${transactions}
  </PmtInf>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02">
<CstmrDrctDbtInitn>
  <GrpHdr>
    <MsgId>${escapeXml(options.messageId)}</MsgId>
    <CreDtTm>${escapeXml(options.creationDateTime)}</CreDtTm>
    <NbOfTxs>${txCount}</NbOfTxs>
    <CtrlSum>${formatAmount(totalAmount)}</CtrlSum>
    <InitgPty><Nm>${escapeXml(options.creditorName)}</Nm></InitgPty>
  </GrpHdr>
${paymentInfoBlocks.join("\n")}
</CstmrDrctDbtInitn>
</Document>
`;
}
