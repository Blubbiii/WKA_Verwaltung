import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache/invalidation";
import {
  createPartialCancellation,
  createCorrectionInvoice,
  type PartialCancelPosition,
  type CorrectedPosition,
} from "@/lib/invoices/invoice-correction";

// Zod schemas for validation
const partialCancelPositionSchema = z.object({
  originalIndex: z.number().int().min(0),
  cancelQuantity: z.number().positive().optional(),
});

const correctionPositionSchema = z.object({
  originalIndex: z.number().int().min(0),
  newDescription: z.string().min(1).optional(),
  newQuantity: z.number().positive().optional(),
  newUnitPrice: z.number().min(0).optional(),
  newTaxType: z.enum(["STANDARD", "REDUCED", "EXEMPT"]).optional(),
});

const correctRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("PARTIAL_CANCEL"),
    positions: z.array(partialCancelPositionSchema).min(1, "Mindestens eine Position erforderlich"),
    reason: z.string().min(1, "Korrekturgrund erforderlich"),
  }),
  z.object({
    type: z.literal("CORRECTION"),
    corrections: z.array(correctionPositionSchema).min(1, "Mindestens eine Korrektur erforderlich"),
    reason: z.string().min(1, "Korrekturgrund erforderlich"),
  }),
]);

// POST /api/invoices/[id]/correct - Create a correction (partial cancel or correction invoice)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:create");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const validated = correctRequestSchema.parse(body);

    if (validated.type === "PARTIAL_CANCEL") {
      // Partial cancellation
      const positions: PartialCancelPosition[] = validated.positions.map((p) => ({
        originalIndex: p.originalIndex,
        cancelQuantity: p.cancelQuantity,
      }));

      const creditNote = await createPartialCancellation(
        id,
        positions,
        validated.reason,
        check.userId!,
        check.tenantId!
      );

      // Invalidate caches
      invalidate.onInvoiceChange(check.tenantId!, id, "update").catch((err) => {
        logger.warn({ err }, "[Invoices] Cache invalidation error after partial cancel");
      });

      return NextResponse.json(
        {
          message: "Teilstorno erstellt",
          creditNote,
        },
        { status: 201 }
      );
    } else {
      // Correction invoice
      const corrections: CorrectedPosition[] = validated.corrections.map((c) => ({
        originalIndex: c.originalIndex,
        newDescription: c.newDescription,
        newQuantity: c.newQuantity,
        newUnitPrice: c.newUnitPrice,
        newTaxType: c.newTaxType,
      }));

      const result = await createCorrectionInvoice(
        id,
        corrections,
        validated.reason,
        check.userId!,
        check.tenantId!
      );

      // Invalidate caches
      invalidate.onInvoiceChange(check.tenantId!, id, "update").catch((err) => {
        logger.warn({ err }, "[Invoices] Cache invalidation error after correction");
      });

      return NextResponse.json(
        {
          message: "Korrektur erstellt",
          creditNote: result.creditNote,
          correctionInvoice: result.correctionInvoice,
        },
        { status: 201 }
      );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      // Business logic errors from the correction functions
      const isClientError = [
        "nicht gefunden",
        "Keine Berechtigung",
        "Nur versendete",
        "Nur bezahlte",
        "Mindestens eine",
        "Ungültige Position",
        "Stornomenge",
        "Alle Positionen",
        "Keine Änderungen",
        "muss größer",
        "darf nicht negativ",
      ].some((msg) => error.message.includes(msg));

      if (isClientError) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    logger.error({ err: error }, "Error creating invoice correction");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Korrektur" },
      { status: 500 }
    );
  }
}
