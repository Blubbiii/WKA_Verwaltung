import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  generateXRechnungXml,
  generateZugferdXml,
  validateXRechnungXml,
  buildXRechnungDataFromInvoice,
} from "@/lib/einvoice";
import { apiLogger as logger } from "@/lib/logger";

/**
 * GET /api/invoices/[id]/xrechnung
 *
 * Generate and return XRechnung XML for an invoice.
 * Supports both XRechnung (UBL 2.1) and ZUGFeRD (CII) formats.
 *
 * Query parameters:
 *   - format: "xrechnung" (default) | "zugferd" - output format
 *   - validate: "true" | "false" (default: "true") - validate before returning
 *   - regenerate: "true" | "false" (default: "false") - force regeneration even if cached
 *
 * Returns XML with Content-Type application/xml.
 * Caches generated XML in einvoiceXml field.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "xrechnung";
    const shouldValidate = searchParams.get("validate") !== "false";
    const forceRegenerate = searchParams.get("regenerate") === "true";

    // Validate format parameter
    if (!["xrechnung", "zugferd"].includes(format)) {
      return NextResponse.json(
        { error: "Ungueltiges Format. Erlaubt: xrechnung, zugferd" },
        { status: 400 }
      );
    }

    // Load invoice with all relations needed for XML generation
    const invoice = await prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: {
          orderBy: { position: "asc" },
        },
        tenant: {
          select: {
            name: true,
            address: true,
            contactEmail: true,
            contactPhone: true,
            bankName: true,
            iban: true,
            bic: true,
            taxId: true,
            vatId: true,
          },
        },
        fund: {
          select: { id: true, name: true },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Rechnung nicht gefunden" },
        { status: 404 }
      );
    }

    // Tenant check
    if (invoice.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Check invoice status - only generate for non-draft invoices (or allow drafts with warning)
    if (invoice.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Fuer stornierte Rechnungen kann keine XRechnung erstellt werden" },
        { status: 400 }
      );
    }

    // Check if we have required data
    if (!invoice.items || invoice.items.length === 0) {
      return NextResponse.json(
        { error: "Rechnung hat keine Positionen. Mindestens eine Position ist erforderlich." },
        { status: 400 }
      );
    }

    if (!invoice.recipientName) {
      return NextResponse.json(
        { error: "Empfaengername ist erforderlich fuer XRechnung-Generierung" },
        { status: 400 }
      );
    }

    // Determine the expected format tag for cache comparison
    const formatTag = format === "zugferd" ? "ZUGFERD" : "XRECHNUNG";

    // Return cached XML if available and not forcing regeneration
    if (
      !forceRegenerate &&
      invoice.einvoiceXml &&
      invoice.einvoiceFormat === formatTag
    ) {
      // Return cached XML
      const filename = `${invoice.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}_${formatTag}.xml`;
      return new NextResponse(invoice.einvoiceXml, {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-cache",
        },
      });
    }

    // Build the invoice data structure for XML generation
    const invoiceData = buildXRechnungDataFromInvoice(invoice as never);

    // Generate XML based on requested format
    let xml: string;
    if (format === "zugferd") {
      xml = generateZugferdXml(invoiceData);
    } else {
      xml = generateXRechnungXml(invoiceData);
    }

    // Validate the generated XML (only for XRechnung format)
    if (shouldValidate && format === "xrechnung") {
      const validation = validateXRechnungXml(xml);
      if (!validation.valid) {
        logger.warn(
          { invoiceId: id, errors: validation.errors },
          "XRechnung validation failed"
        );
        return NextResponse.json(
          {
            error: "XRechnung-Validierung fehlgeschlagen",
            validationErrors: validation.errors,
            validationWarnings: validation.warnings,
          },
          { status: 422 }
        );
      }

      // Log warnings but still proceed
      if (validation.warnings.length > 0) {
        logger.info(
          { invoiceId: id, warnings: validation.warnings },
          "XRechnung generated with warnings"
        );
      }
    }

    // Cache the generated XML in the database
    try {
      await prisma.invoice.update({
        where: { id },
        data: {
          einvoiceXml: xml,
          einvoiceFormat: formatTag,
          einvoiceGeneratedAt: new Date(),
        },
      });
    } catch (cacheError) {
      // Log but don't fail - the XML was generated successfully
      logger.warn(
        { err: cacheError, invoiceId: id },
        "Failed to cache e-invoice XML"
      );
    }

    // Return XML response
    const filename = `${invoice.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}_${formatTag}.xml`;
    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": Buffer.byteLength(xml, "utf-8").toString(),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating XRechnung XML");
    return NextResponse.json(
      {
        error: "Fehler bei der XRechnung-Generierung",
        details: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 }
    );
  }
}
