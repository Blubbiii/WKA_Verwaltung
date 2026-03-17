/**
 * One-time migration script: user.role enum → UserRoleAssignment
 *
 * Since user.role has been removed from the schema, this script now assigns
 * the "Betrachter" role (hierarchy=40) to all users who don't already have
 * any role assignment, as a safe default.
 *
 * Run with:
 *   NODE_PATH=/prisma-cli/node_modules /prisma-cli/node_modules/.bin/tsx prisma/migrate-roles.ts
 * Or locally:
 *   npx tsx prisma/migrate-roles.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting role migration...\n");

  // Load all system roles grouped by hierarchy
  const systemRoles = await prisma.role.findMany({
    where: { isSystem: true },
    select: { id: true, name: true, hierarchy: true },
  });

  if (systemRoles.length === 0) {
    console.error("No system roles found! Run seed first.");
    process.exit(1);
  }

  console.log("Available system roles:");
  systemRoles.forEach((r) =>
    console.log(`  hierarchy=${r.hierarchy} -> "${r.name}" (${r.id})`)
  );
  console.log();

  // Build hierarchy -> role map (take first match if duplicates)
  const roleByHierarchy = new Map<number, string>();
  for (const r of systemRoles) {
    if (!roleByHierarchy.has(r.hierarchy)) {
      roleByHierarchy.set(r.hierarchy, r.id);
    }
  }

  // Default role: assign "Betrachter" (hierarchy=40) as a safe default
  const defaultRoleId =
    roleByHierarchy.get(40) ??
    [...roleByHierarchy.entries()].sort((a, b) => a[0] - b[0])[0]?.[1];

  if (!defaultRoleId) {
    console.error("No suitable default role found.");
    process.exit(1);
  }

  // Load all users who don't already have a role assignment
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      userRoleAssignments: { select: { id: true } },
    },
  });

  console.log(`Found ${users.length} total users\n`);

  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    // Skip users that already have at least one assignment
    if (user.userRoleAssignments.length > 0) {
      console.log(`  ${user.email} — already has ${user.userRoleAssignments.length} assignment(s), skipping`);
      skipped++;
      continue;
    }

    await prisma.userRoleAssignment.create({
      data: {
        userId: user.id,
        roleId: defaultRoleId,
        resourceType: "__global__",
      },
    });

    console.log(`  ${user.email} — assigned default role (hierarchy=40)`);
    migrated++;
  }

  console.log(`\nMigration complete:`);
  console.log(`   Migrated: ${migrated}`);
  console.log(`   Skipped (already had assignments): ${skipped}`);
}

main()
  .catch((e) => {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
