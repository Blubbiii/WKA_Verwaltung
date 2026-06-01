/**
 * P20 Duplikat-Check für IncomingInvoice.
 *
 * Muss VOR der Anwendung der Partial-Unique-Migration
 * (prisma/migrations/manual/incoming_invoice_unique_partial.sql) laufen,
 * sonst bricht der Index-Build wegen Bestandsdaten.
 *
 * Listet Eingangsrechnungen, die unter dem geplanten UNIQUE-Schlüssel
 * (tenantId, vendorId, invoiceNumber) NICHT eindeutig sind. Für jede
 * Konfliktgruppe wird ein Vorschlag ausgegeben: welcher Datensatz
 * sollte gelöscht / gemerged werden.
 *
 * Aufruf:
 *   npx tsx scripts/check-incoming-invoice-duplicates.ts
 *
 * Exit-Codes:
 *   0  keine Duplikate gefunden — Migration kann angewendet werden
 *   1  Duplikate gefunden — manueller Review nötig
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

interface DuplicateGroup {
  tenantId: string;
  vendorId: string;
  invoiceNumber: string;
  count: number;
}

async function main() {
  console.log("Suche Duplikate in IncomingInvoice...\n");

  // Group-By via raw SQL — Prisma kann das nicht direkt.
  const groups = await prisma.$queryRaw<DuplicateGroup[]>(Prisma.sql`
    SELECT
      "tenantId",
      "vendorId",
      "invoiceNumber",
      count(*)::int as count
    FROM "incoming_invoices"
    WHERE "vendorId" IS NOT NULL
      AND "invoiceNumber" IS NOT NULL
      AND "deletedAt" IS NULL
    GROUP BY "tenantId", "vendorId", "invoiceNumber"
    HAVING count(*) > 1
    ORDER BY count(*) DESC, "tenantId"
  `);

  if (groups.length === 0) {
    console.log("✓ Keine Duplikate gefunden.");
    console.log("  Partial-Unique-Migration kann gefahrlos angewendet werden:");
    console.log("  psql $DATABASE_URL -f prisma/migrations/manual/incoming_invoice_unique_partial.sql\n");
    return;
  }

  console.log(`✗ ${groups.length} Duplikat-Gruppen gefunden:\n`);
  console.log("─".repeat(80));

  let totalDups = 0;
  for (const group of groups) {
    const records = await prisma.incomingInvoice.findMany({
      where: {
        tenantId: group.tenantId,
        vendorId: group.vendorId,
        invoiceNumber: group.invoiceNumber,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        invoiceDate: true,
        grossAmount: true,
        paidAt: true,
        createdAt: true,
        fileName: true,
        vendor: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    totalDups += records.length;

    console.log(
      `Tenant: ${group.tenantId.slice(0, 8)} | Vendor: ${records[0].vendor?.name ?? group.vendorId.slice(0, 8)} | Rechnung: ${group.invoiceNumber}`,
    );
    console.log(`  ${group.count} Records:`);
    records.forEach((r, idx) => {
      const recommendation = idx === 0 ? "✓ BEHALTEN (ältester)" : "✗ PRÜFEN/LÖSCHEN";
      console.log(
        `    [${idx + 1}] ${r.id.slice(0, 8)} | ${r.status.padEnd(10)} | ${
          r.invoiceDate?.toISOString().slice(0, 10) ?? "no-date"
        } | ${String(r.grossAmount ?? "0").padStart(8)} € | ${r.fileName ?? "no-file"} | ${recommendation}`,
      );
    });
    console.log();
  }

  console.log("─".repeat(80));
  console.log(`\nGesamt: ${totalDups} Records in ${groups.length} Duplikat-Gruppen.\n`);
  console.log("Empfehlung:");
  console.log("  1. Die markierten 'PRÜFEN/LÖSCHEN'-Records manuell reviewen.");
  console.log("  2. Tatsächliche Duplikate per soft-delete entfernen (deletedAt setzen).");
  console.log("  3. Skript erneut aufrufen — bei 0 Duplikaten Migration anwenden.\n");

  process.exit(1);
}

main()
  .catch((err) => {
    console.error("\n✗ Check fehlgeschlagen:", err);
    process.exit(1);
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
