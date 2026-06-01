/**
 * Backfill: Mappt LedgerAccount.accountNumber → balanceSheetSection
 * für alle Tenants. Idempotent — überschreibt nur null-Werte.
 *
 * Audit-C: liest TenantSettings.chartOfAccountsVersion und wählt
 * pro Tenant das passende Range-Mapping (SKR03 vs. SKR04).
 *
 * Aufruf:
 *   npx tsx scripts/backfill-balance-sheet-section.ts
 */

import { PrismaClient } from "@prisma/client";
import { getTenantSettings } from "../src/lib/tenant-settings";
import {
  getAccountMapper,
  type ChartOfAccountsVersion,
} from "../src/lib/accounting/chart-of-accounts";

const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.ledgerAccount.findMany({
    where: { balanceSheetSection: null },
    select: { id: true, tenantId: true, accountNumber: true },
  });

  console.log(`Backfilling balanceSheetSection for ${accounts.length} account(s)…`);

  const byTenant = new Map<string, { mapped: number; unmapped: number; version: string }>();
  const mapperCache = new Map<string, ReturnType<typeof getAccountMapper>>();

  for (const acc of accounts) {
    let mapper = mapperCache.get(acc.tenantId);
    if (!mapper) {
      const settings = await getTenantSettings(acc.tenantId);
      const version = (settings.chartOfAccountsVersion ?? "SKR04") as ChartOfAccountsVersion;
      mapper = getAccountMapper(version);
      mapperCache.set(acc.tenantId, mapper);
      byTenant.set(acc.tenantId, { mapped: 0, unmapped: 0, version });
    }

    const section = mapper(acc.accountNumber);
    const stats = byTenant.get(acc.tenantId)!;
    if (section) {
      await prisma.ledgerAccount.update({
        where: { id: acc.id },
        data: { balanceSheetSection: section },
      });
      stats.mapped++;
    } else {
      stats.unmapped++;
    }
  }

  for (const [tenantId, stats] of byTenant.entries()) {
    console.log(
      `  ${tenantId} [${stats.version}]: ${stats.mapped} mapped, ${stats.unmapped} unmapped (GuV-Konten oder unbekannte Range)`,
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
