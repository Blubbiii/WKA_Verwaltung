/**
 * P10 Backfill: Zwei-Schichten-Steuermodell.
 *
 * Schritt 1: TaxCategoryTemplate global anlegen (9 Defaults).
 * Schritt 2: Für jeden bestehenden Tenant alle aktiven Templates als
 *            TaxCode materialisieren (mit DATEV-Default-Schlüsseln).
 *
 * Idempotent — kann mehrfach laufen (skipDuplicates auf beiden Schichten).
 *
 * Aufruf (lokal):
 *   npx tsx scripts/backfill-tax-codes.ts
 *
 * Aufruf (Docker-Container):
 *   NODE_PATH=/prisma-cli/node_modules /prisma-cli/node_modules/.bin/tsx \
 *     scripts/backfill-tax-codes.ts
 */

import { PrismaClient } from "@prisma/client";
import {
  materializeTenantTaxCodes,
  seedTaxCategoryTemplates,
} from "../src/lib/accounting/tax-codes";

const prisma = new PrismaClient();

async function main() {
  console.log("== Step 1: Seed global TaxCategoryTemplates ==");
  const tplCreated = await seedTaxCategoryTemplates(prisma);
  console.log(`  ${tplCreated} new template(s) inserted (existing skipped).\n`);

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true },
  });

  console.log(`== Step 2: Materialize TaxCodes for ${tenants.length} tenant(s) ==`);
  let totalCreated = 0;
  for (const t of tenants) {
    const created = await materializeTenantTaxCodes(prisma, t.id);
    totalCreated += created;
    console.log(
      `  ${t.slug.padEnd(20)} (${t.name}): ${created} new tax code(s)`,
    );
  }

  console.log(
    `\nDone. ${tplCreated} template(s) + ${totalCreated} tenant tax code(s) created.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
