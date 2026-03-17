/**
 * One-time migration: create UserTenantMembership entries for all existing users.
 *
 * Run BEFORE prisma db push:
 *   NODE_PATH=/prisma-cli/node_modules /prisma-cli/node_modules/.bin/tsx prisma/migrate-tenant-memberships.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting tenant membership migration...");

  const users = await prisma.user.findMany({
    select: { id: true, email: true, tenantId: true },
  });

  console.log(`Found ${users.length} users to migrate`);

  let created = 0;
  let skipped = 0;

  for (const user of users) {
    const existing = await prisma.userTenantMembership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: user.tenantId } },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.userTenantMembership.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        isPrimary: true,
        status: "ACTIVE",
      },
    });

    created++;
    console.log(`  ✓ ${user.email} → tenant ${user.tenantId}`);
  }

  console.log(`\nDone: ${created} created, ${skipped} already existed`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
