"use client";

// Block renderers for the WYSIWYG invoice template preview canvas.
// Each block type has its own renderer that shows sample data in the preview.

import type { TemplateBlock, BlockStyle } from "@/lib/invoice-templates/template-types";
import { SAMPLE_INVOICE_DATA } from "@/lib/invoice-templates/default-template";
import { cn } from "@/lib/utils";

const sample = SAMPLE_INVOICE_DATA;

// ============================================
// Style helper: converts BlockStyle to CSS
// ============================================

function blockStyleToCSS(style?: BlockStyle): React.CSSProperties {
  if (!style) return {};
  return {
    fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
    fontWeight: style.fontWeight as string | undefined,
    textAlign: style.textAlign as React.CSSProperties["textAlign"],
    marginTop: style.marginTop ? `${style.marginTop}px` : undefined,
    marginBottom: style.marginBottom ? `${style.marginBottom}px` : undefined,
    padding: style.padding ? `${style.padding}px` : undefined,
    backgroundColor: style.backgroundColor as string | undefined,
    borderBottom: style.borderBottom as string | undefined,
    color: style.color as string | undefined,
  };
}

// ============================================
// Individual Block Renderers
// ============================================

function HeaderBlock({ block }: { block: TemplateBlock }) {
  const config = block.config as Record<string, boolean>;
  return (
    <div className="flex items-center justify-between" style={blockStyleToCSS(block.style)}>
      <div className="flex items-center gap-3">
        {config.showLogo && (
          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
            Logo
          </div>
        )}
        {config.showCompanyName && (
          <div>
            <div className="font-bold text-sm">{sample.companyName}</div>
            {config.showCompanyAddress && (
              <div className="text-[10px] text-muted-foreground">{sample.companyAddress}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SenderAddressBlock({ block }: { block: TemplateBlock }) {
  const config = block.config as Record<string, boolean>;
  return (
    <div style={blockStyleToCSS(block.style)}>
      {config.compact ? (
        <div className="text-[9px] text-muted-foreground underline decoration-dotted">
          {sample.senderName} - {sample.senderStreet} - {sample.senderCity}
        </div>
      ) : (
        <div className="text-[9px] text-muted-foreground space-y-0.5">
          <div>{sample.senderName}</div>
          <div>{sample.senderStreet}</div>
          <div>{sample.senderCity}</div>
        </div>
      )}
    </div>
  );
}

function RecipientAddressBlock({ block }: { block: TemplateBlock }) {
  return (
    <div style={blockStyleToCSS(block.style)}>
      <div className="border border-dashed border-muted-foreground/30 p-3 max-w-[55%]">
        <div className="text-xs font-medium">{sample.recipientName}</div>
        <div className="text-xs text-muted-foreground">{sample.recipientStreet}</div>
        <div className="text-xs text-muted-foreground">{sample.recipientCity}</div>
      </div>
    </div>
  );
}

function InvoiceMetaBlock({ block }: { block: TemplateBlock }) {
  const config = block.config as Record<string, boolean>;
  const rows: { label: string; value: string }[] = [];

  if (config.showInvoiceNumber) rows.push({ label: "Rechnungsnr.", value: sample.invoiceNumber });
  if (config.showDate) rows.push({ label: "Datum", value: sample.invoiceDate });
  if (config.showDueDate) rows.push({ label: "Fällig", value: sample.dueDate });
  if (config.showServicePeriod) rows.push({ label: "Zeitraum", value: sample.servicePeriod });
  if (config.showCustomerNumber) rows.push({ label: "Kd.-Nr.", value: sample.customerNumber });
  if (config.showPaymentReference) rows.push({ label: "Referenz", value: sample.paymentReference });

  return (
    <div className="flex justify-between" style={blockStyleToCSS(block.style)}>
      <div>
        <div className="text-sm font-bold">Rechnung</div>
      </div>
      <div className="text-right space-y-0.5">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-end gap-3 text-[10px]">
            <span className="text-muted-foreground">{row.label}:</span>
            <span className="font-medium w-28 text-right">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PositionsTableBlock({ block }: { block: TemplateBlock }) {
  const config = block.config as Record<string, boolean>;
  const positions = sample.positions;

  return (
    <div style={blockStyleToCSS(block.style)}>
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="border-b border-foreground/20">
            {config.showPosition && <th className="text-left py-1 pr-2 font-medium">Pos.</th>}
            <th className="text-left py-1 pr-2 font-medium">Beschreibung</th>
            {config.showQuantity && <th className="text-right py-1 pr-2 font-medium">Menge</th>}
            {config.showUnit && <th className="text-left py-1 pr-2 font-medium">Einh.</th>}
            {config.showUnitPrice && <th className="text-right py-1 pr-2 font-medium">Einzelpreis</th>}
            {config.showTaxRate && <th className="text-right py-1 pr-2 font-medium">MwSt</th>}
            {config.showNetAmount && <th className="text-right py-1 font-medium">Netto</th>}
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => (
            <tr key={pos.pos} className="border-b border-muted/50">
              {config.showPosition && <td className="py-1 pr-2">{pos.pos}</td>}
              <td className="py-1 pr-2">{pos.description}</td>
              {config.showQuantity && (
                <td className="text-right py-1 pr-2">
                  {pos.quantity.toLocaleString("de-DE")}
                </td>
              )}
              {config.showUnit && <td className="py-1 pr-2">{pos.unit}</td>}
              {config.showUnitPrice && (
                <td className="text-right py-1 pr-2">
                  {pos.unitPrice.toLocaleString("de-DE", { minimumFractionDigits: 4 })} EUR
                </td>
              )}
              {config.showTaxRate && <td className="text-right py-1 pr-2">{pos.taxRate}%</td>}
              {config.showNetAmount && (
                <td className="text-right py-1">
                  {pos.netAmount.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubtotalBlock({ block }: { block: TemplateBlock }) {
  return (
    <div className="flex justify-end" style={blockStyleToCSS(block.style)}>
      <div className="flex gap-8 text-[10px]">
        <span className="text-muted-foreground">Nettobetrag:</span>
        <span className="font-medium w-28 text-right">
          {sample.netTotal.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR
        </span>
      </div>
    </div>
  );
}

function TaxSummaryBlock({ block }: { block: TemplateBlock }) {
  return (
    <div className="flex justify-end" style={blockStyleToCSS(block.style)}>
      <div className="flex gap-8 text-[10px]">
        <span className="text-muted-foreground">MwSt. {sample.taxRate}%:</span>
        <span className="font-medium w-28 text-right">
          {sample.taxAmount.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR
        </span>
      </div>
    </div>
  );
}

function TotalBlock({ block }: { block: TemplateBlock }) {
  return (
    <div
      className={cn(
        "flex justify-end rounded",
        (block.config as Record<string, boolean>).highlight && "bg-muted/50"
      )}
      style={blockStyleToCSS(block.style)}
    >
      <div className="flex gap-8 text-xs">
        <span className="font-bold">Gesamtbetrag:</span>
        <span className="font-bold w-28 text-right">
          {sample.grossTotal.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR
        </span>
      </div>
    </div>
  );
}

function PaymentInfoBlock({ block }: { block: TemplateBlock }) {
  const config = block.config as Record<string, boolean>;
  return (
    <div className="bg-muted/30 rounded p-2 text-[10px]" style={blockStyleToCSS(block.style)}>
      {config.showPaymentTerms && (
        <div>
          <span className="font-medium">Zahlungsbedingungen: </span>
          <span className="text-muted-foreground">{sample.paymentTerms}</span>
        </div>
      )}
      {config.showSkonto && (
        <div className="mt-1">
          <span className="font-medium">Skonto: </span>
          <span className="text-muted-foreground">
            {sample.skontoPercent} bei Zahlung innerhalb von {sample.skontoPeriod}
          </span>
        </div>
      )}
    </div>
  );
}

function BankDetailsBlock({ block }: { block: TemplateBlock }) {
  const config = block.config as Record<string, boolean>;
  return (
    <div className="text-[10px] space-y-0.5" style={blockStyleToCSS(block.style)}>
      <div className="font-medium text-[11px] mb-1">Bankverbindung</div>
      {config.showBankName && (
        <div className="flex gap-2">
          <span className="text-muted-foreground w-14">Bank:</span>
          <span>{sample.bankName}</span>
        </div>
      )}
      {config.showIban && (
        <div className="flex gap-2">
          <span className="text-muted-foreground w-14">IBAN:</span>
          <span className="font-mono">{sample.iban}</span>
        </div>
      )}
      {config.showBic && (
        <div className="flex gap-2">
          <span className="text-muted-foreground w-14">BIC:</span>
          <span className="font-mono">{sample.bic}</span>
        </div>
      )}
    </div>
  );
}

function NotesBlock({ block }: { block: TemplateBlock }) {
  const config = block.config as Record<string, unknown>;
  const text = (config.defaultText as string) || "Hier können Notizen und Bemerkungen stehen...";
  return (
    <div className="text-[10px] text-muted-foreground italic" style={blockStyleToCSS(block.style)}>
      {text}
    </div>
  );
}

function FooterBlock({ block }: { block: TemplateBlock }) {
  const config = block.config as Record<string, boolean | string>;
  return (
    <div className="border-t pt-2 text-[8px] text-muted-foreground" style={blockStyleToCSS(block.style)}>
      {config.showTaxDisclaimer && sample.taxDisclaimer ? (
        <div className="mb-1">{sample.taxDisclaimer}</div>
      ) : null}
      {config.customText ? (
        <div>{String(config.customText)}</div>
      ) : null}
      {!config.showTaxDisclaimer && !config.customText && (
        <div>
          {sample.companyName} | {sample.companyAddress} | {sample.bankName} | IBAN: {sample.iban}
        </div>
      )}
    </div>
  );
}

function CustomTextBlock({ block }: { block: TemplateBlock }) {
  const config = block.config as Record<string, unknown>;
  const text = (config.text as string) || "Eigener Text...";

  // Replace merge variables with sample data
  const resolved = text
    .replace(/\{\{companyName\}\}/g, sample.companyName)
    .replace(/\{\{invoiceNumber\}\}/g, sample.invoiceNumber)
    .replace(/\{\{invoiceDate\}\}/g, sample.invoiceDate)
    .replace(/\{\{recipientName\}\}/g, sample.recipientName)
    .replace(/\{\{dueDate\}\}/g, sample.dueDate);

  return (
    <div className="text-[10px]" style={blockStyleToCSS(block.style)}>
      {resolved}
    </div>
  );
}

function SpacerBlock({ block }: { block: TemplateBlock }) {
  const height = (block.config.height as number) || 24;
  return <div style={{ height: `${height}px` }} />;
}

function DividerBlock({ block }: { block: TemplateBlock }) {
  const thickness = (block.config.thickness as number) || 1;
  const color = (block.config.color as string) || "#e5e7eb";
  return (
    <div style={blockStyleToCSS(block.style)}>
      <hr style={{ borderTop: `${thickness}px solid ${color}`, margin: 0 }} />
    </div>
  );
}

// ============================================
// Main Block Renderer (dispatches by type)
// ============================================

interface BlockRendererProps {
  block: TemplateBlock;
}

export function BlockRenderer({ block }: BlockRendererProps) {
  if (!block.visible) return null;

  switch (block.type) {
    case "HEADER":
      return <HeaderBlock block={block} />;
    case "SENDER_ADDRESS":
      return <SenderAddressBlock block={block} />;
    case "RECIPIENT_ADDRESS":
      return <RecipientAddressBlock block={block} />;
    case "INVOICE_META":
      return <InvoiceMetaBlock block={block} />;
    case "POSITIONS_TABLE":
      return <PositionsTableBlock block={block} />;
    case "SUBTOTAL":
      return <SubtotalBlock block={block} />;
    case "TAX_SUMMARY":
      return <TaxSummaryBlock block={block} />;
    case "TOTAL":
      return <TotalBlock block={block} />;
    case "PAYMENT_INFO":
      return <PaymentInfoBlock block={block} />;
    case "BANK_DETAILS":
      return <BankDetailsBlock block={block} />;
    case "NOTES":
      return <NotesBlock block={block} />;
    case "FOOTER":
      return <FooterBlock block={block} />;
    case "CUSTOM_TEXT":
      return <CustomTextBlock block={block} />;
    case "SPACER":
      return <SpacerBlock block={block} />;
    case "DIVIDER":
      return <DividerBlock block={block} />;
    default:
      return (
        <div className="text-xs text-destructive p-2 bg-destructive/10 rounded">
          Unbekannter Block: {block.type}
        </div>
      );
  }
}
