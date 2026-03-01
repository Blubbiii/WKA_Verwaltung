/**
 * SEPA pain.001.001.03 Credit Transfer XML Generator
 *
 * Generates ISO 20022 SEPA Credit Transfer XML for batch payment of incoming invoices.
 * No external npm package required — pure XML template.
 */

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

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

export function generateSepaXml(options: SepaExportOptions): string {
  const { messageId, creationDateTime, debtorName, debtorIban, debtorBic, payments } = options;

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
