import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { generatePreview } from "@/lib/invoices/numberGenerator";
import { z } from "zod";
import { InvoiceType } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

const previewSchema = z.object({
  type: z.enum(["INVOICE", "CREDIT_NOTE"]),
});

// POST /api/admin/invoice-sequences/preview - Vorschau der nächsten Nummer
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const { type } = previewSchema.parse(body);

    const currentYear = new Date().getFullYear();

    let sequence = await prisma.invoiceNumberSequence.findUnique({
      where: {
        tenantId_type: {
          tenantId: check.tenantId!,
          type: type as InvoiceType,
        },
      },
    });

    // Falls keine Sequence existiert, verwende Defaults
    if (!sequence) {
      const defaultFormat = type === "INVOICE" ? "RG-{YEAR}-{NUMBER}" : "GS-{YEAR}-{NUMBER}";
      return NextResponse.json({
        preview: generatePreview(defaultFormat, 1, 4),
        format: defaultFormat,
        nextNumber: 1,
        digitCount: 4,
      });
    }

    // Jahr zurücksetzen wenn nötig (nur für Vorschau)
    const displayNumber = sequence.currentYear !== currentYear ? 1 : sequence.nextNumber;

    return NextResponse.json({
      preview: generatePreview(sequence.format, displayNumber, sequence.digitCount),
      format: sequence.format,
      nextNumber: displayNumber,
      digitCount: sequence.digitCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error generating preview");
    return NextResponse.json(
      { error: "Fehler beim Generieren der Vorschau" },
      { status: 500 }
    );
  }
}
