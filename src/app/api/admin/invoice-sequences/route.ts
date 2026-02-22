import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { generatePreview } from "@/lib/invoices/numberGenerator";
import { apiLogger as logger } from "@/lib/logger";

// GET /api/admin/invoice-sequences - Liste aller Nummernkreise
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const currentYear = new Date().getFullYear();

    // Hole oder erstelle beide Sequenzen
    const sequences = await prisma.$transaction(async (tx) => {
      const results = [];

      for (const type of ["INVOICE", "CREDIT_NOTE"] as const) {
        let sequence = await tx.invoiceNumberSequence.findUnique({
          where: {
            tenantId_type: {
              tenantId: check.tenantId!,
              type,
            },
          },
        });

        // Falls keine Sequence existiert, erstelle eine mit Defaults
        if (!sequence) {
          sequence = await tx.invoiceNumberSequence.create({
            data: {
              tenantId: check.tenantId!,
              type,
              format: type === "INVOICE" ? "RG-{YEAR}-{NUMBER}" : "GS-{YEAR}-{NUMBER}",
              currentYear,
              nextNumber: 1,
              digitCount: 4,
            },
          });
        }

        // Jahr zurücksetzen wenn nötig (nur Anzeige, nicht speichern)
        const displayYear = sequence.currentYear !== currentYear ? currentYear : sequence.currentYear;
        const displayNumber = sequence.currentYear !== currentYear ? 1 : sequence.nextNumber;

        results.push({
          ...sequence,
          preview: generatePreview(sequence.format, displayNumber, sequence.digitCount),
        });
      }

      return results;
    });

    return NextResponse.json(sequences);
  } catch (error) {
    logger.error({ err: error }, "Error fetching invoice sequences");
    return NextResponse.json(
      { error: "Fehler beim Laden der Nummernkreise" },
      { status: 500 }
    );
  }
}
