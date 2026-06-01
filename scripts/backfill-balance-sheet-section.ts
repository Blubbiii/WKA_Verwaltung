/**
 * P15 Backfill: Mappt LedgerAccount.accountNumber → balanceSheetSection
 * für alle Tenants. Idempotent — überschreibt nur null-Werte.
 *
 * Verwendet die SKR04-Range-Heuristik aus src/lib/accounting/skr04-mapping.ts.
 * Tenants mit anderem Kontenrahmen (z.B. SKR03) müssen ihre Sections
 * manuell setzen.
 *
 * Aufruf:
 *   npx tsx scripts/backfill-balance-sheet-section.ts
 */

import { PrismaClient } from "@prisma/client";
import { mapSkr04ToBalanceSheetSection } from "../src/lib/accounting/skr04-mapping";

const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.ledgerAccount.findMany({
    where: { balanceSheetSection: null },
    select: { id: true, tenantId: true, accountNumber: true },
  });

  console.log(`Backfilling balanceSheetSection for ${accounts.length} account(s)…`);

  const byTenant = new Map<string, { mapped: number; unmapped: number }>();
  for (const acc of accounts) {
    const section = mapSkr04ToBalanceSheetSection(acc.accountNumber);
    const stats = byTenant.get(acc.tenantId) ?? { mapped: 0, unmapped: 0 };
    if (section) {
      await prisma.ledgerAccount.update({
        where: { id: acc.id },
        data: { balanceSheetSection: section },
      });
      stats.mapped++;
    } else {
      stats.unmapped++;
    }
    byTenant.set(acc.tenantId, stats);
  }

  for (const [tenantId, stats] of byTenant.entries()) {
    console.log(
      `  ${tenantId}: ${stats.mapped} mapped, ${stats.unmapped} unmapped (GuV-Konten oder unbekannte Range)`,
    );
  }

  console.log(`Done. ${accounts.length} account(s) processed.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
