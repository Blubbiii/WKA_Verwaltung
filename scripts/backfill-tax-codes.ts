/**
 * P10 Backfill: Erstellt die 8 Default-TaxCodes für alle bestehenden Tenants.
 *
 * Idempotent — kann mehrfach laufen (skipDuplicates).
 *
 * Aufruf (lokal):
 *   npx tsx scripts/backfill-tax-codes.ts
 *
 * Aufruf (Docker-Container):
 *   NODE_PATH=/prisma-cli/node_modules /prisma-cli/node_modules/.bin/tsx scripts/backfill-tax-codes.ts
 */

import { PrismaClient } from "@prisma/client";
import { seedDefaultTaxCodes } from "../src/lib/accounting/tax-codes";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true },
  });

  console.log(`Backfilling tax codes for ${tenants.length} tenant(s)…`);

  let totalCreated = 0;
  for (const t of tenants) {
    const created = await seedDefaultTaxCodes(prisma, t.id);
    totalCreated += created;
    console.log(
      `  ${t.slug.padEnd(20)} (${t.name}): ${created} new code(s)`,
    );
  }

  console.log(`\nDone. ${totalCreated} tax codes created across ${tenants.length} tenant(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
