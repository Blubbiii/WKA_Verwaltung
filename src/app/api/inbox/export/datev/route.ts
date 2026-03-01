import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

// DATEV EXTF 510 — Eingangsrechnungen (Buchungsstapel)
// Soll: Aufwandskonto (datevAccount oder Standardkonto 4980)
// Haben: Kreditorenkonto (70000 + vendor sequence, simplified as 70000)

function formatDatevDate(d: Date | null): string {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}`;
}

function formatDatevAmount(n: number): string {
  return Math.abs(n).toFixed(2).replace(".", ",");
}

function csvVal(v: string | null | undefined): string {
  if (v === null || v === undefined) return "";
  // Escape quotes
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

// GET /api/inbox/export/datev?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("inbox:export");
    if (!check.authorized) return check.error;
    if (!await getConfigBoolean("inbox.enabled", check.tenantId!, false)) {
      return NextResponse.json({ error: "Inbox nicht aktiviert" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");

    const from = fromStr ? new Date(fromStr) : new Date(new Date().getFullYear(), 0, 1);
    const to = toStr ? new Date(toStr) : new Date();
    to.setHours(23, 59, 59, 999);

    const tenantId = check.tenantId!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const invoices = await prisma.incomingInvoice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: ["APPROVED", "PAID"] },
        invoiceDate: { gte: from, lte: to },
      },
      include: {
        vendor: { select: { name: true } },
        lines: { orderBy: { position: "asc" } },
      },
      orderBy: { invoiceDate: "asc" },
    });

    // DATEV EXTF 510 header (row 1)
    const now = new Date();
    const creationDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const fiscalYear = from.getFullYear();
    const fromDate = `${from.getFullYear()}${String(from.getMonth() + 1).padStart(2, "0")}${String(from.getDate()).padStart(2, "0")}`;
    const toDate = `${to.getFullYear()}${String(to.getMonth() + 1).padStart(2, "0")}${String(to.getDate()).padStart(2, "0")}`;

    const headerRow = `"EXTF";510;21;"Buchungsstapel";12;1;${creationDate};;;${fromDate};${toDate};;;1;${fiscalYear};${String(fiscalYear).slice(-2)};4;`;

    // Column headers (row 2)
    const columnHeaders = `Umsatz (ohne Soll/Haben-Kz);Soll/Haben-Kennzeichen;WKZ Umsatz;Kurs;Basis-Umsatz;WKZ Basis-Umsatz;Konto;Gegenkonto (ohne BU-Schlüssel);BU-Schlüssel;Belegdatum;Belegfeld 1;Belegfeld 2;Skonto;Buchungstext`;

    const rows: string[] = [headerRow, columnHeaders];

    for (const inv of invoices) {
      const vendorName = inv.vendor?.name ?? inv.vendorNameFallback ?? "Lieferant";
      const invoiceDate = inv.invoiceDate ?? inv.createdAt;

      if (inv.lines.length > 0) {
        // Per-line booking
        for (const line of inv.lines) {
          const expenseAccount = line.datevAccount ?? inv.datevAccount ?? "4980";
          const amount = formatDatevAmount(Number(line.grossAmount));
          const bookingText = `${vendorName.slice(0, 60)} ${line.description.slice(0, 60)}`;

          rows.push(
            [
              amount,       // Umsatz
              "S",          // Soll/Haben (S = incoming invoice is a debit on expense account)
              "",           // WKZ
              "",           // Kurs
              "",           // Basis-Umsatz
              "",           // WKZ Basis-Umsatz
              expenseAccount, // Konto (Aufwand)
              "70000",      // Gegenkonto (Kreditor, simplified)
              "",           // BU-Schlüssel
              formatDatevDate(invoiceDate), // Belegdatum
              csvVal(inv.invoiceNumber?.slice(0, 36) ?? ""),
              "",           // Belegfeld 2
              "",           // Skonto
              csvVal(bookingText),
            ].join(";")
          );
        }
      } else {
        // Single booking from invoice totals
        const expenseAccount = inv.datevAccount ?? "4980";
        const amount = formatDatevAmount(Number(inv.grossAmount ?? 0));
        const bookingText = `${vendorName.slice(0, 80)} ${inv.invoiceNumber ?? ""}`.trim();

        rows.push(
          [
            amount,
            "S",
            "",
            "",
            "",
            "",
            expenseAccount,
            "70000",
            "",
            formatDatevDate(invoiceDate),
            csvVal(inv.invoiceNumber?.slice(0, 36) ?? ""),
            "",
            "",
            csvVal(bookingText.slice(0, 60)),
          ].join(";")
        );
      }
    }

    // Mark as DATEV exported
    if (invoices.length > 0) {
      await prisma.incomingInvoice.updateMany({
        where: { id: { in: invoices.map((i) => i.id) } },
        data: { datevExportedAt: now },
      });
    }

    const bom = "\uFEFF";
    const csv = bom + rows.join("\r\n");
    const filename = `EXTF_Eingangsrechnungen_${fromDate}_${toDate}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating DATEV export for inbox");
    return NextResponse.json({ error: "Fehler beim DATEV-Export" }, { status: 500 });
  }
}
