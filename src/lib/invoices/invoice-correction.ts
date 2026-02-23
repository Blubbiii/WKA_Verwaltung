import { prisma } from "@/lib/prisma";
import { getNextInvoiceNumber, getTaxRateByType } from "./numberGenerator";
import type { Prisma, InvoiceItem } from "@prisma/client";

// ============================================================================
// TYPES
// ============================================================================

export interface CorrectedPosition {
  originalIndex: number; // 0-based index into original items (sorted by position)
  newDescription?: string;
  newQuantity?: number;
  newUnitPrice?: number;
  newTaxType?: "STANDARD" | "REDUCED" | "EXEMPT";
}

export interface PartialCancelPosition {
  originalIndex: number; // 0-based index into original items (sorted by position)
  cancelQuantity?: number; // If omitted, cancels full quantity of this position
}

export interface CorrectionHistoryEntry {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  correctionType: string;
  netAmount: number;
  grossAmount: number;
  reason: string | null;
  correctedPositions: unknown;
  createdAt: Date;
}

export interface CorrectionHistory {
  originalInvoice: {
    id: string;
    invoiceNumber: string;
    netAmount: number;
    grossAmount: number;
    status: string;
  };
  corrections: CorrectionHistoryEntry[];
  netEffect: {
    originalNet: number;
    originalGross: number;
    totalCorrectionNet: number;
    totalCorrectionGross: number;
    effectiveNet: number;
    effectiveGross: number;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Rounds to 2 decimal places (financial rounding)
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculates net, tax, and gross amounts for a single line item
 */
function calculateItemAmounts(
  quantity: number,
  unitPrice: number,
  taxType: "STANDARD" | "REDUCED" | "EXEMPT"
): {
  netAmount: number;
  taxRate: number;
  taxAmount: number;
  grossAmount: number;
} {
  const netAmount = round2(quantity * unitPrice);
  const taxRate = getTaxRateByType(taxType);
  const taxAmount = round2(netAmount * (taxRate / 100));
  const grossAmount = round2(netAmount + taxAmount);
  return { netAmount, taxRate, taxAmount, grossAmount };
}

/**
 * Sums up item amounts for invoice-level totals
 */
function sumItemAmounts(
  items: Array<{ netAmount: number; taxAmount: number; grossAmount: number }>
): {
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
} {
  const netAmount = round2(items.reduce((sum, i) => sum + i.netAmount, 0));
  const taxAmount = round2(items.reduce((sum, i) => sum + i.taxAmount, 0));
  const grossAmount = round2(items.reduce((sum, i) => sum + i.grossAmount, 0));
  return { netAmount, taxAmount, grossAmount };
}

// ============================================================================
// PARTIAL CANCELLATION (Teilstorno)
// ============================================================================

/**
 * Creates a partial cancellation (Teilstorno) credit note for selected positions.
 *
 * - If cancelQuantity is provided for a position, only that quantity is cancelled
 * - If cancelQuantity is omitted, the entire position quantity is cancelled
 * - The original invoice status remains unchanged (it is NOT set to CANCELLED)
 * - Returns the new credit note invoice
 */
export async function createPartialCancellation(
  invoiceId: string,
  positions: PartialCancelPosition[],
  reason: string,
  userId: string,
  tenantId: string
) {
  // Load original invoice with items
  const original = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: { orderBy: { position: "asc" } },
    },
  });

  if (!original) {
    throw new Error("Rechnung nicht gefunden");
  }

  if (original.tenantId !== tenantId) {
    throw new Error("Keine Berechtigung");
  }

  if (original.status !== "SENT" && original.status !== "PAID") {
    throw new Error(
      "Nur versendete oder bezahlte Rechnungen koennen teilstorniert werden"
    );
  }

  if (!positions.length) {
    throw new Error("Mindestens eine Position muss ausgewaehlt werden");
  }

  // Validate position indices
  for (const pos of positions) {
    if (pos.originalIndex < 0 || pos.originalIndex >= original.items.length) {
      throw new Error(
        `Ungueltige Position: ${pos.originalIndex}. Gueltig: 0-${original.items.length - 1}`
      );
    }

    const originalItem = original.items[pos.originalIndex];
    const originalQty = Number(originalItem.quantity);

    if (pos.cancelQuantity !== undefined) {
      if (pos.cancelQuantity <= 0) {
        throw new Error(
          `Stornomenge fuer Position ${pos.originalIndex + 1} muss groesser als 0 sein`
        );
      }
      if (pos.cancelQuantity > originalQty) {
        throw new Error(
          `Stornomenge (${pos.cancelQuantity}) uebersteigt Originalmenge (${originalQty}) bei Position ${pos.originalIndex + 1}`
        );
      }
    }
  }

  // Check if all positions with full quantity = full cancel -> suggest full cancel instead
  const isEffectivelyFullCancel =
    positions.length === original.items.length &&
    positions.every((pos) => {
      const originalItem = original.items[pos.originalIndex];
      const originalQty = Number(originalItem.quantity);
      return (
        pos.cancelQuantity === undefined || pos.cancelQuantity === originalQty
      );
    });

  if (isEffectivelyFullCancel) {
    throw new Error(
      "Alle Positionen mit voller Menge ausgewaehlt. Bitte nutzen Sie die Vollstornierung."
    );
  }

  // Generate credit note number
  const { number: creditNoteNumber } = await getNextInvoiceNumber(
    tenantId,
    "CREDIT_NOTE"
  );

  // Build cancelled items data
  const cancelledItemsData: Array<{
    position: number;
    description: string;
    quantity: number;
    unit: string | null;
    unitPrice: number;
    netAmount: number;
    taxType: "STANDARD" | "REDUCED" | "EXEMPT";
    taxRate: number;
    taxAmount: number;
    grossAmount: number;
    originalItem: InvoiceItem;
  }> = [];

  for (const pos of positions) {
    const originalItem = original.items[pos.originalIndex];
    const cancelQty =
      pos.cancelQuantity ?? Number(originalItem.quantity);
    const unitPrice = Number(originalItem.unitPrice);
    const taxType = originalItem.taxType as "STANDARD" | "REDUCED" | "EXEMPT";

    const amounts = calculateItemAmounts(cancelQty, unitPrice, taxType);

    cancelledItemsData.push({
      position: originalItem.position,
      description: `TEILSTORNO: ${originalItem.description}`,
      quantity: cancelQty,
      unit: originalItem.unit,
      unitPrice: -unitPrice, // Negative unit price for credit note
      netAmount: -amounts.netAmount,
      taxType,
      taxRate: amounts.taxRate,
      taxAmount: -amounts.taxAmount,
      grossAmount: -amounts.grossAmount,
      originalItem,
    });
  }

  // Calculate totals
  const totals = sumItemAmounts(cancelledItemsData);

  // Build audit trail data for correctedPositions
  const correctedPositionsAudit = positions.map((pos) => {
    const originalItem = original.items[pos.originalIndex];
    return {
      originalIndex: pos.originalIndex,
      originalPosition: originalItem.position,
      originalDescription: originalItem.description,
      originalQuantity: Number(originalItem.quantity),
      cancelledQuantity:
        pos.cancelQuantity ?? Number(originalItem.quantity),
    };
  });

  // Create credit note in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create the credit note invoice
    const creditNote = await tx.invoice.create({
      data: {
        invoiceType: "CREDIT_NOTE",
        invoiceNumber: creditNoteNumber,
        invoiceDate: new Date(),
        dueDate: null,
        recipientType: original.recipientType,
        recipientName: original.recipientName,
        recipientAddress: original.recipientAddress,
        serviceStartDate: original.serviceStartDate,
        serviceEndDate: original.serviceEndDate,
        paymentReference: `TEILSTORNO ${original.invoiceNumber}`,
        internalReference: `Teilstorno zu ${original.invoiceNumber}`,
        netAmount: totals.netAmount,
        taxRate: Number(original.taxRate),
        taxAmount: totals.taxAmount,
        grossAmount: totals.grossAmount,
        notes: `Teilstornierung von ${original.invoiceNumber}: ${reason}`,
        status: "SENT",
        sentAt: new Date(),
        tenantId,
        createdById: userId,
        fundId: original.fundId,
        shareholderId: original.shareholderId,
        leaseId: original.leaseId,
        parkId: original.parkId,
        settlementPeriodId: original.settlementPeriodId,
        // Correction reference fields
        correctionOf: original.id,
        correctionType: "PARTIAL_CANCEL",
        correctedPositions:
          correctedPositionsAudit as unknown as Prisma.InputJsonValue,
        // Also set the legacy storno reference for backwards compatibility
        cancelledInvoiceId: original.id,
      },
    });

    // Create credit note line items
    for (let i = 0; i < cancelledItemsData.length; i++) {
      const item = cancelledItemsData[i];
      await tx.invoiceItem.create({
        data: {
          invoiceId: creditNote.id,
          position: i + 1,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          netAmount: item.netAmount,
          taxType: item.taxType,
          taxRate: item.taxRate,
          taxAmount: item.taxAmount,
          grossAmount: item.grossAmount,
          plotAreaType: item.originalItem.plotAreaType,
          plotId: item.originalItem.plotId,
          referenceType: item.originalItem.referenceType,
          referenceId: item.originalItem.referenceId,
          datevKonto: item.originalItem.datevKonto,
          datevGegenkonto: item.originalItem.datevGegenkonto,
          datevKostenstelle: item.originalItem.datevKostenstelle,
        },
      });
    }

    return creditNote;
  });

  // Load complete credit note with items
  const creditNote = await prisma.invoice.findUnique({
    where: { id: result.id },
    include: {
      items: { orderBy: { position: "asc" } },
      correctedInvoice: {
        select: { id: true, invoiceNumber: true },
      },
    },
  });

  return creditNote;
}

// ============================================================================
// CORRECTION INVOICE (Rechnungskorrektur)
// ============================================================================

/**
 * Creates a correction invoice (Rechnungskorrektur).
 *
 * This creates TWO documents:
 * 1. A credit note for the incorrect positions (negative amounts)
 * 2. A new invoice with the corrected positions (positive amounts)
 *
 * Both are linked to the original via correctionOf.
 */
export async function createCorrectionInvoice(
  invoiceId: string,
  corrections: CorrectedPosition[],
  reason: string,
  userId: string,
  tenantId: string
) {
  // Load original invoice with items
  const original = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: { orderBy: { position: "asc" } },
    },
  });

  if (!original) {
    throw new Error("Rechnung nicht gefunden");
  }

  if (original.tenantId !== tenantId) {
    throw new Error("Keine Berechtigung");
  }

  if (original.status !== "SENT" && original.status !== "PAID") {
    throw new Error(
      "Nur versendete oder bezahlte Rechnungen koennen korrigiert werden"
    );
  }

  if (!corrections.length) {
    throw new Error("Mindestens eine Korrektur muss angegeben werden");
  }

  // Validate position indices and that at least something changed
  for (const corr of corrections) {
    if (corr.originalIndex < 0 || corr.originalIndex >= original.items.length) {
      throw new Error(
        `Ungueltige Position: ${corr.originalIndex}. Gueltig: 0-${original.items.length - 1}`
      );
    }

    if (corr.newQuantity !== undefined && corr.newQuantity <= 0) {
      throw new Error(
        `Menge fuer Position ${corr.originalIndex + 1} muss groesser als 0 sein`
      );
    }

    if (corr.newUnitPrice !== undefined && corr.newUnitPrice < 0) {
      throw new Error(
        `Einzelpreis fuer Position ${corr.originalIndex + 1} darf nicht negativ sein`
      );
    }

    // Check that at least one field is different
    const originalItem = original.items[corr.originalIndex];
    const hasChange =
      (corr.newDescription !== undefined &&
        corr.newDescription !== originalItem.description) ||
      (corr.newQuantity !== undefined &&
        corr.newQuantity !== Number(originalItem.quantity)) ||
      (corr.newUnitPrice !== undefined &&
        corr.newUnitPrice !== Number(originalItem.unitPrice)) ||
      (corr.newTaxType !== undefined &&
        corr.newTaxType !== originalItem.taxType);

    if (!hasChange) {
      throw new Error(
        `Position ${corr.originalIndex + 1}: Keine Aenderungen erkannt`
      );
    }
  }

  // Get two numbers: one for credit note, one for correction invoice
  const { number: creditNoteNumber } = await getNextInvoiceNumber(
    tenantId,
    "CREDIT_NOTE"
  );
  const { number: correctionInvoiceNumber } = await getNextInvoiceNumber(
    tenantId,
    original.invoiceType
  );

  // Build credit note items (negative of original for corrected positions)
  const creditNoteItemsData: Array<{
    position: number;
    description: string;
    quantity: number;
    unit: string | null;
    unitPrice: number;
    netAmount: number;
    taxType: "STANDARD" | "REDUCED" | "EXEMPT";
    taxRate: number;
    taxAmount: number;
    grossAmount: number;
    originalItem: InvoiceItem;
  }> = [];

  // Build correction invoice items (new correct amounts for corrected positions)
  const correctionItemsData: Array<{
    position: number;
    description: string;
    quantity: number;
    unit: string | null;
    unitPrice: number;
    netAmount: number;
    taxType: "STANDARD" | "REDUCED" | "EXEMPT";
    taxRate: number;
    taxAmount: number;
    grossAmount: number;
    originalItem: InvoiceItem;
  }> = [];

  // Build audit trail
  const correctedPositionsAudit: Array<{
    originalIndex: number;
    originalPosition: number;
    originalDescription: string;
    originalQuantity: number;
    originalUnitPrice: number;
    originalTaxType: string;
    newDescription: string;
    newQuantity: number;
    newUnitPrice: number;
    newTaxType: string;
  }> = [];

  for (const corr of corrections) {
    const originalItem = original.items[corr.originalIndex];
    const origQty = Number(originalItem.quantity);
    const origUnitPrice = Number(originalItem.unitPrice);
    const origTaxType = originalItem.taxType as
      | "STANDARD"
      | "REDUCED"
      | "EXEMPT";

    // Calculate original amounts for credit note (negative)
    const origAmounts = calculateItemAmounts(origQty, origUnitPrice, origTaxType);

    creditNoteItemsData.push({
      position: originalItem.position,
      description: `KORREKTUR (alt): ${originalItem.description}`,
      quantity: origQty,
      unit: originalItem.unit,
      unitPrice: -origUnitPrice,
      netAmount: -origAmounts.netAmount,
      taxType: origTaxType,
      taxRate: origAmounts.taxRate,
      taxAmount: -origAmounts.taxAmount,
      grossAmount: -origAmounts.grossAmount,
      originalItem,
    });

    // Calculate new amounts for correction invoice (positive)
    const newDescription = corr.newDescription ?? originalItem.description;
    const newQty = corr.newQuantity ?? origQty;
    const newUnitPrice = corr.newUnitPrice ?? origUnitPrice;
    const newTaxType = corr.newTaxType ?? origTaxType;

    const newAmounts = calculateItemAmounts(newQty, newUnitPrice, newTaxType);

    correctionItemsData.push({
      position: originalItem.position,
      description: `KORREKTUR (neu): ${newDescription}`,
      quantity: newQty,
      unit: originalItem.unit,
      unitPrice: newUnitPrice,
      netAmount: newAmounts.netAmount,
      taxType: newTaxType,
      taxRate: newAmounts.taxRate,
      taxAmount: newAmounts.taxAmount,
      grossAmount: newAmounts.grossAmount,
      originalItem,
    });

    correctedPositionsAudit.push({
      originalIndex: corr.originalIndex,
      originalPosition: originalItem.position,
      originalDescription: originalItem.description,
      originalQuantity: origQty,
      originalUnitPrice: origUnitPrice,
      originalTaxType: origTaxType,
      newDescription,
      newQuantity: newQty,
      newUnitPrice: newUnitPrice,
      newTaxType: newTaxType,
    });
  }

  const creditNoteTotals = sumItemAmounts(creditNoteItemsData);
  const correctionTotals = sumItemAmounts(correctionItemsData);

  // Create both documents in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create credit note for wrong positions
    const creditNote = await tx.invoice.create({
      data: {
        invoiceType: "CREDIT_NOTE",
        invoiceNumber: creditNoteNumber,
        invoiceDate: new Date(),
        dueDate: null,
        recipientType: original.recipientType,
        recipientName: original.recipientName,
        recipientAddress: original.recipientAddress,
        serviceStartDate: original.serviceStartDate,
        serviceEndDate: original.serviceEndDate,
        paymentReference: `KORREKTUR-GS ${original.invoiceNumber}`,
        internalReference: `Korrekturgutschrift zu ${original.invoiceNumber}`,
        netAmount: creditNoteTotals.netAmount,
        taxRate: Number(original.taxRate),
        taxAmount: creditNoteTotals.taxAmount,
        grossAmount: creditNoteTotals.grossAmount,
        notes: `Korrekturgutschrift zu ${original.invoiceNumber}: ${reason}`,
        status: "SENT",
        sentAt: new Date(),
        tenantId,
        createdById: userId,
        fundId: original.fundId,
        shareholderId: original.shareholderId,
        leaseId: original.leaseId,
        parkId: original.parkId,
        settlementPeriodId: original.settlementPeriodId,
        correctionOf: original.id,
        correctionType: "CORRECTION",
        correctedPositions:
          correctedPositionsAudit as unknown as Prisma.InputJsonValue,
        cancelledInvoiceId: original.id,
      },
    });

    // Create credit note items
    for (let i = 0; i < creditNoteItemsData.length; i++) {
      const item = creditNoteItemsData[i];
      await tx.invoiceItem.create({
        data: {
          invoiceId: creditNote.id,
          position: i + 1,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          netAmount: item.netAmount,
          taxType: item.taxType,
          taxRate: item.taxRate,
          taxAmount: item.taxAmount,
          grossAmount: item.grossAmount,
          plotAreaType: item.originalItem.plotAreaType,
          plotId: item.originalItem.plotId,
          referenceType: item.originalItem.referenceType,
          referenceId: item.originalItem.referenceId,
          datevKonto: item.originalItem.datevKonto,
          datevGegenkonto: item.originalItem.datevGegenkonto,
          datevKostenstelle: item.originalItem.datevKostenstelle,
        },
      });
    }

    // 2. Create correction invoice with correct amounts
    const correctionInvoice = await tx.invoice.create({
      data: {
        invoiceType: original.invoiceType,
        invoiceNumber: correctionInvoiceNumber,
        invoiceDate: new Date(),
        dueDate: original.dueDate, // Same payment terms
        recipientType: original.recipientType,
        recipientName: original.recipientName,
        recipientAddress: original.recipientAddress,
        serviceStartDate: original.serviceStartDate,
        serviceEndDate: original.serviceEndDate,
        paymentReference: `KORREKTUR ${original.invoiceNumber}`,
        internalReference: `Korrekturrechnung zu ${original.invoiceNumber}`,
        netAmount: correctionTotals.netAmount,
        taxRate: Number(original.taxRate),
        taxAmount: correctionTotals.taxAmount,
        grossAmount: correctionTotals.grossAmount,
        notes: `Korrekturrechnung zu ${original.invoiceNumber}: ${reason}`,
        status: "SENT",
        sentAt: new Date(),
        tenantId,
        createdById: userId,
        fundId: original.fundId,
        shareholderId: original.shareholderId,
        leaseId: original.leaseId,
        parkId: original.parkId,
        settlementPeriodId: original.settlementPeriodId,
        correctionOf: original.id,
        correctionType: "CORRECTION",
        correctedPositions:
          correctedPositionsAudit as unknown as Prisma.InputJsonValue,
      },
    });

    // Create correction invoice items
    for (let i = 0; i < correctionItemsData.length; i++) {
      const item = correctionItemsData[i];
      await tx.invoiceItem.create({
        data: {
          invoiceId: correctionInvoice.id,
          position: i + 1,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          netAmount: item.netAmount,
          taxType: item.taxType,
          taxRate: item.taxRate,
          taxAmount: item.taxAmount,
          grossAmount: item.grossAmount,
          plotAreaType: item.originalItem.plotAreaType,
          plotId: item.originalItem.plotId,
          referenceType: item.originalItem.referenceType,
          referenceId: item.originalItem.referenceId,
          datevKonto: item.originalItem.datevKonto,
          datevGegenkonto: item.originalItem.datevGegenkonto,
          datevKostenstelle: item.originalItem.datevKostenstelle,
        },
      });
    }

    return { creditNote, correctionInvoice };
  });

  // Load complete documents with items
  const [creditNote, correctionInvoice] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id: result.creditNote.id },
      include: {
        items: { orderBy: { position: "asc" } },
        correctedInvoice: {
          select: { id: true, invoiceNumber: true },
        },
      },
    }),
    prisma.invoice.findUnique({
      where: { id: result.correctionInvoice.id },
      include: {
        items: { orderBy: { position: "asc" } },
        correctedInvoice: {
          select: { id: true, invoiceNumber: true },
        },
      },
    }),
  ]);

  return { creditNote, correctionInvoice };
}

// ============================================================================
// CORRECTION HISTORY
// ============================================================================

/**
 * Retrieves the full correction history for an invoice,
 * including all linked corrections and the net financial effect.
 */
export async function getInvoiceCorrectionHistory(
  invoiceId: string,
  tenantId: string
): Promise<CorrectionHistory> {
  const original = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      netAmount: true,
      grossAmount: true,
      status: true,
      tenantId: true,
    },
  });

  if (!original) {
    throw new Error("Rechnung nicht gefunden");
  }

  if (original.tenantId !== tenantId) {
    throw new Error("Keine Berechtigung");
  }

  // Find all corrections linked to this invoice
  const corrections = await prisma.invoice.findMany({
    where: {
      correctionOf: invoiceId,
      deletedAt: null,
    },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      correctionType: true,
      netAmount: true,
      grossAmount: true,
      notes: true,
      correctedPositions: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Also check for legacy storno references (from the existing full cancel flow)
  const legacyStornos = await prisma.invoice.findMany({
    where: {
      cancelledInvoiceId: invoiceId,
      correctionOf: null, // Only legacy ones without the new field
      deletedAt: null,
    },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      netAmount: true,
      grossAmount: true,
      notes: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const originalNet = Number(original.netAmount);
  const originalGross = Number(original.grossAmount);

  // Build correction entries
  const correctionEntries: CorrectionHistoryEntry[] = [
    ...corrections.map((c) => ({
      id: c.id,
      invoiceNumber: c.invoiceNumber,
      invoiceDate: c.invoiceDate,
      correctionType: c.correctionType || "FULL_CANCEL",
      netAmount: Number(c.netAmount),
      grossAmount: Number(c.grossAmount),
      reason: c.notes,
      correctedPositions: c.correctedPositions,
      createdAt: c.createdAt,
    })),
    ...legacyStornos.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      invoiceDate: s.invoiceDate,
      correctionType: "FULL_CANCEL",
      netAmount: Number(s.netAmount),
      grossAmount: Number(s.grossAmount),
      reason: s.notes,
      correctedPositions: null,
      createdAt: s.createdAt,
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Calculate net effect (correction amounts are already negative for credit notes)
  const totalCorrectionNet = round2(
    correctionEntries.reduce((sum, c) => sum + c.netAmount, 0)
  );
  const totalCorrectionGross = round2(
    correctionEntries.reduce((sum, c) => sum + c.grossAmount, 0)
  );

  return {
    originalInvoice: {
      id: original.id,
      invoiceNumber: original.invoiceNumber,
      netAmount: originalNet,
      grossAmount: originalGross,
      status: original.status,
    },
    corrections: correctionEntries,
    netEffect: {
      originalNet,
      originalGross,
      totalCorrectionNet,
      totalCorrectionGross,
      effectiveNet: round2(originalNet + totalCorrectionNet),
      effectiveGross: round2(originalGross + totalCorrectionGross),
    },
  };
}
