/**
 * P20 Post-Deploy-Setup
 *
 * Wird nach jedem Deployment einmal aufgerufen. Bündelt alle Auto-Seeds
 * und Backfills idempotent. Sicher mehrfach aufrufbar.
 *
 * Schritte:
 *   1. SystemSettings auto-seeden (Audit A — 15 gesetzliche Werte)
 *   2. TaxCategoryTemplates auto-seeden (P10 — 9 Templates global)
 *   3. BaseInterestRates auto-seeden (P16 — Bundesbank-Historie)
 *   4. Pro Tenant:
 *      a) TaxCodes materialisieren (P10)
 *      b) balanceSheetSection-Backfill (P15 + Audit C)
 *
 * Aufruf (lokal):
 *   npx tsx scripts/post-deploy-setup.ts [--dry-run] [--system-user-id=<uuid>]
 *
 * Aufruf (Docker-Container):
 *   NODE_PATH=/prisma-cli/node_modules /prisma-cli/node_modules/.bin/tsx \
 *     scripts/post-deploy-setup.ts
 *
 * Flags:
 *   --dry-run            zeigt was getan würde, ohne zu schreiben
 *   --system-user-id=X   User-ID für Audit-Spalten (createdBy/updatedBy).
 *                        Default: erster Superadmin im System.
 */

import { PrismaClient } from "@prisma/client";
import { seedBundesbankRates } from "../src/lib/mahnwesen/base-interest-rate";
import { seedSystemSettings } from "../src/lib/system-settings";
import { getTenantSettings } from "../src/lib/tenant-settings";

const prisma = new PrismaClient();

interface Options {
  dryRun: boolean;
  systemUserId: string | null;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  let dryRun = false;
  let systemUserId: string | null = null;
  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--system-user-id=")) {
      systemUserId = a.split("=")[1];
    }
  }
  return { dryRun, systemUserId };
}

async function resolveSystemUserId(provided: string | null): Promise<string> {
  if (provided) return provided;
  // Fallback: ersten Superadmin im System nehmen (Hierarchy 100).
  const superadmin = await prisma.user.findFirst({
    where: {
      userRoleAssignments: {
        some: {
          role: {
            isSystem: true,
            hierarchy: { gte: 100 },
          },
        },
      },
    },
    select: { id: true, email: true },
  });
  if (!superadmin) {
    throw new Error(
      "Kein Superadmin im System gefunden — bitte --system-user-id=<uuid> übergeben",
    );
  }
  console.log(`  → Verwende Superadmin als System-User: ${superadmin.email}`);
  return superadmin.id;
}

async function main() {
  const opts = parseArgs();
  console.log("==========================================");
  console.log("  WPM Post-Deploy-Setup");
  if (opts.dryRun) console.log("  *** DRY-RUN — keine Änderungen ***");
  console.log("==========================================\n");

  const systemUserId = await resolveSystemUserId(opts.systemUserId);

  // Schritt 1: SystemSettings (Audit A)
  console.log("[1/2] SystemSettings (gesetzliche Werte)...");
  if (opts.dryRun) {
    const count = await prisma.systemSetting.count();
    console.log(`     Aktuell ${count} Settings in DB.`);
    const inserted = 15 - count;
    console.log(`     Würde ${Math.max(0, inserted)} neue anlegen.`);
  } else {
    const inserted = await seedSystemSettings(systemUserId);
    console.log(`     ${inserted} neue SystemSettings angelegt.`);
  }

  // Schritt 3: BaseInterestRates (P16)
  console.log("\n[2/2] BaseInterestRates (Bundesbank-Historie)...");
  if (opts.dryRun) {
    const count = await prisma.baseInterestRate.count();
    console.log(`     Aktuell ${count} Sätze in DB.`);
  } else {
    const inserted = await seedBundesbankRates();
    console.log(`     ${inserted} neue Basiszinssätze angelegt.`);
  }


  console.log("\n==========================================");
  console.log("  ✓ Post-Deploy-Setup abgeschlossen");
  if (opts.dryRun) {
    console.log("  (DRY-RUN — keine Änderungen geschrieben)");
  }
  console.log("==========================================");
}

main()
  .catch((err) => {
    console.error("\n✗ Setup fehlgeschlagen:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
