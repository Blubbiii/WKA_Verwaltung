import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { generatePreview } from "@/lib/invoices/numberGenerator";
import { z } from "zod";
import { InvoiceType } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

const updateSequenceSchema = z.object({
  format: z
    .string()
    .max(100, "Format darf maximal 100 Zeichen lang sein")
    .refine((val) => val.includes("{NUMBER}"), {
      message: "Format muss {NUMBER} enthalten",
    })
    .optional(),
  nextNumber: z
    .number()
    .int()
    .positive("Nächste Nummer muss positiv sein")
    .optional(),
  digitCount: z
    .number()
    .int()
    .min(1, "Mindestens 1 Stelle")
    .max(10, "Maximal 10 Stellen")
    .optional(),
});

function validateType(type: string): InvoiceType | null {
  if (type === "INVOICE" || type === "CREDIT_NOTE") {
    return type as InvoiceType;
  }
  return null;
}

// GET /api/admin/invoice-sequences/[type] - Einzelner Nummernkreis
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const { type } = await params;
    const invoiceType = validateType(type);

    if (!invoiceType) {
      return NextResponse.json(
        { error: "Ungültiger Typ. Erlaubt: INVOICE, CREDIT_NOTE" },
        { status: 400 }
      );
    }

    const currentYear = new Date().getFullYear();

    let sequence = await prisma.invoiceNumberSequence.findUnique({
      where: {
        tenantId_type: {
          tenantId: check.tenantId!,
          type: invoiceType,
        },
      },
    });

    // Falls keine Sequence existiert, erstelle eine mit Defaults
    if (!sequence) {
      sequence = await prisma.invoiceNumberSequence.create({
        data: {
          tenantId: check.tenantId!,
          type: invoiceType,
          format: invoiceType === "INVOICE" ? "RG-{YEAR}-{NUMBER}" : "GS-{YEAR}-{NUMBER}",
          currentYear,
          nextNumber: 1,
          digitCount: 4,
        },
      });
    }

    return NextResponse.json({
      ...sequence,
      preview: generatePreview(sequence.format, sequence.nextNumber, sequence.digitCount),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching invoice sequence");
    return NextResponse.json(
      { error: "Fehler beim Laden des Nummernkreises" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/invoice-sequences/[type] - Nummernkreis aktualisieren
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { type } = await params;
    const invoiceType = validateType(type);

    if (!invoiceType) {
      return NextResponse.json(
        { error: "Ungültiger Typ. Erlaubt: INVOICE, CREDIT_NOTE" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validatedData = updateSequenceSchema.parse(body);

    const currentYear = new Date().getFullYear();

    // Hole oder erstelle Sequence
    let sequence = await prisma.invoiceNumberSequence.findUnique({
      where: {
        tenantId_type: {
          tenantId: check.tenantId!,
          type: invoiceType,
        },
      },
    });

    if (!sequence) {
      // Erstelle neue Sequence mit den übergebenen Werten
      sequence = await prisma.invoiceNumberSequence.create({
        data: {
          tenantId: check.tenantId!,
          type: invoiceType,
          format: validatedData.format ?? (invoiceType === "INVOICE" ? "RG-{YEAR}-{NUMBER}" : "GS-{YEAR}-{NUMBER}"),
          currentYear,
          nextNumber: validatedData.nextNumber ?? 1,
          digitCount: validatedData.digitCount ?? 4,
        },
      });
    } else {
      // Aktualisiere bestehende Sequence
      sequence = await prisma.invoiceNumberSequence.update({
        where: { id: sequence.id },
        data: {
          ...(validatedData.format && { format: validatedData.format }),
          ...(validatedData.nextNumber !== undefined && { nextNumber: validatedData.nextNumber }),
          ...(validatedData.digitCount !== undefined && { digitCount: validatedData.digitCount }),
        },
      });
    }

    return NextResponse.json({
      ...sequence,
      preview: generatePreview(sequence.format, sequence.nextNumber, sequence.digitCount),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating invoice sequence");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Nummernkreises" },
      { status: 500 }
    );
  }
}
