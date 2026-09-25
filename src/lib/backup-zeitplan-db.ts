/**
 * Reads and writes the backup schedule and the container's status in
 * system_configs (global rows, tenantId null). See backup-zeitplan.ts.
 */

import { prisma } from "@/lib/prisma";
import {
  STATUS_SCHLUESSEL,
  ZEITPLAN_SCHLUESSEL,
  zeitplanAusWerten,
  type BackupStatus,
  type BackupZeitplan,
} from "@/lib/backup-zeitplan";

async function globaleWerte(praefix: string) {
  const zeilen = await prisma.systemConfig.findMany({
    where: { tenantId: null, key: { startsWith: praefix } },
    select: { key: true, value: true },
  });
  return Object.fromEntries(zeilen.map((z) => [z.key, z.value])) as Record<string, string>;
}

export async function ladeBackupZeitplan(): Promise<BackupZeitplan> {
  return zeitplanAusWerten(await globaleWerte("backup.schedule."));
}

export async function ladeBackupStatus(): Promise<BackupStatus> {
  const w = await globaleWerte("backup.status.");
  const groesse = Number(w[STATUS_SCHLUESSEL.letzteGroesse]);
  return {
    letzterErfolg: w[STATUS_SCHLUESSEL.letzterErfolg] || undefined,
    letzterTyp: w[STATUS_SCHLUESSEL.letzterTyp] || undefined,
    letzteGroesse: Number.isFinite(groesse) && groesse > 0 ? groesse : undefined,
    letzterFehler: w[STATUS_SCHLUESSEL.letzterFehler] || undefined,
    fehlertext: w[STATUS_SCHLUESSEL.fehlertext] || undefined,
    lebenszeichen: w[STATUS_SCHLUESSEL.lebenszeichen] || undefined,
  };
}

export async function speichereBackupZeitplan(plan: BackupZeitplan): Promise<void> {
  const werte: Record<string, string> = {
    [ZEITPLAN_SCHLUESSEL.aktiv]: String(plan.aktiv),
    [ZEITPLAN_SCHLUESSEL.rhythmus]: plan.rhythmus,
    [ZEITPLAN_SCHLUESSEL.uhrzeit]: plan.uhrzeit,
    [ZEITPLAN_SCHLUESSEL.behalteTaeglich]: String(plan.behalteTaeglich),
    [ZEITPLAN_SCHLUESSEL.behalteWoechentlich]: String(plan.behalteWoechentlich),
    [ZEITPLAN_SCHLUESSEL.behalteMonatlich]: String(plan.behalteMonatlich),
    [ZEITPLAN_SCHLUESSEL.s3]: String(plan.s3),
  };
  // Global rows: the composite unique (tenantId, key) does not apply to NULL,
  // so find + update/create instead of upsert (same as setConfig).
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(werte)) {
      const vorhanden = await tx.systemConfig.findFirst({ where: { key, tenantId: null }, select: { id: true } });
      if (vorhanden) {
        await tx.systemConfig.update({ where: { id: vorhanden.id }, data: { value } });
      } else {
        await tx.systemConfig.create({ data: { key, value, category: "backup", tenantId: null } });
      }
    }
  });
}
