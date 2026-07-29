/**
 * Settlement-Release — gibt die Abrechnungskette nach einem Gutschrift-Storno frei.
 *
 * Hintergrund: `create-invoices` sperrt beim Erzeugen der Gutschriften drei Dinge
 * gleichzeitig:
 *   1. `EnergySettlementItem.invoiceId` → zeigt auf die Gutschrift
 *   2. `EnergySettlement.status`        → INVOICED
 *   3. `TurbineProduction.status`       → INVOICED
 *
 * Ein Storno der Gutschrift löst bisher keinen dieser drei Punkte. Ergebnis ist ein
 * hängender Prozess: Produktion nicht mehr editierbar, Settlement weder neu berechenbar
 * noch löschbar, create-invoices lehnt wegen vorhandener invoiceId ab.
 *
 * Diese Funktion macht genau diese drei Sperren rückgängig — und zwar nur für die
 * Items, die tatsächlich an der stornierten Rechnung hängen (Teil-Storno bei mehreren
 * Gutschriften pro Abrechnung bleibt dadurch korrekt).
 *
 * ⚠️ AUFRUF FEHLT NOCH: `src/app/api/invoices/[id]/cancel/route.ts` muss diese Funktion
 * innerhalb seiner Storno-Transaktion aufrufen.
 */

// TxClient statt Prisma.TransactionClient: der Prisma-Client ist um
// Soft-Delete- und Verschluesselungs-Extensions erweitert, dadurch ist der
// Callback-Parameter von $transaction ein anderer Typ. TxClient leitet ihn
// direkt vom erweiterten Client ab und ist die Konvention im Repo.
import type { TxClient } from "@/lib/invoices/numberGenerator";
import { logger } from "@/lib/logger";

export interface SettlementReleaseResult {
  /** true, wenn mindestens ein EnergySettlementItem an der Rechnung hing */
  released: boolean;
  /** Anzahl der Items, deren invoiceId geleert wurde */
  itemsReleased: number;
  /** IDs der Settlements, die von INVOICED/CLOSED auf CALCULATED zurückgesetzt wurden */
  settlementsReset: string[];
  /** Anzahl der TurbineProduction-Zeilen, die von INVOICED auf CONFIRMED zurückgingen */
  productionsReleased: number;
}

/**
 * Gibt die Energieabrechnungs-Kette für eine (soeben stornierte) Rechnung frei.
 *
 * Muss innerhalb der Storno-Transaktion laufen, damit Storno und Freigabe atomar sind.
 *
 * @param tx - Prisma-Transaktionsclient der Storno-Transaktion
 * @param invoiceId - ID der stornierten Rechnung/Gutschrift
 * @returns Zusammenfassung der freigegebenen Objekte
 */
export async function releaseSettlementForInvoice(
  tx: TxClient,
  invoiceId: string,
): Promise<SettlementReleaseResult> {
  const items = await tx.energySettlementItem.findMany({
    where: { invoiceId },
    select: {
      id: true,
      turbineId: true,
      energySettlementId: true,
      energySettlement: {
        select: {
          id: true,
          status: true,
          year: true,
          month: true,
          tenantId: true,
        },
      },
    },
  });

  if (items.length === 0) {
    return {
      released: false,
      itemsReleased: 0,
      settlementsReset: [],
      productionsReleased: 0,
    };
  }

  // 1. Beleglink lösen
  await tx.energySettlementItem.updateMany({
    where: { invoiceId },
    data: { invoiceId: null },
  });

  // 2. TurbineProduction wieder freigeben: INVOICED → CONFIRMED.
  //    CONFIRMED (nicht DRAFT), weil die Zahlen fachlich geprüft waren — sie sind nur
  //    nicht mehr abgerechnet. So bleiben sie für eine Neuberechnung nutzbar.
  let productionsReleased = 0;

  // Pro Abrechnungsperiode gruppieren, damit wir eine updateMany je Periode brauchen.
  const periodBuckets = new Map<
    string,
    { tenantId: string; year: number; month: number | null; turbineIds: Set<string> }
  >();

  for (const item of items) {
    if (!item.turbineId) continue; // Item ohne Turbinenbezug (z. B. Turbine gelöscht)
    const s = item.energySettlement;
    const key = `${s.tenantId}:${s.year}:${s.month ?? "Y"}`;
    const bucket = periodBuckets.get(key) ?? {
      tenantId: s.tenantId,
      year: s.year,
      month: s.month,
      turbineIds: new Set<string>(),
    };
    bucket.turbineIds.add(item.turbineId);
    periodBuckets.set(key, bucket);
  }

  for (const bucket of periodBuckets.values()) {
    const result = await tx.turbineProduction.updateMany({
      where: {
        tenantId: bucket.tenantId,
        turbineId: { in: Array.from(bucket.turbineIds) },
        year: bucket.year,
        // Jahres-Settlement (month = null) betrifft alle regulären Monate 1..12
        month:
          bucket.month !== null && bucket.month !== 0
            ? bucket.month
            : { in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
        status: "INVOICED",
      },
      data: { status: "CONFIRMED" },
    });
    productionsReleased += result.count;
  }

  // 3. Settlement-Status: nur zurücksetzen, wenn KEIN Item mehr eine Gutschrift trägt.
  //    Bei Teil-Storno (eine von fünf Gutschriften) bleibt das Settlement INVOICED.
  const settlementsReset: string[] = [];
  const settlementIds = Array.from(new Set(items.map((i) => i.energySettlementId)));

  for (const settlementId of settlementIds) {
    const remaining = await tx.energySettlementItem.count({
      where: { energySettlementId: settlementId, invoiceId: { not: null } },
    });
    if (remaining > 0) continue;

    const settlement = items.find((i) => i.energySettlementId === settlementId)!
      .energySettlement;
    if (settlement.status !== "INVOICED" && settlement.status !== "CLOSED") continue;

    await tx.energySettlement.update({
      where: { id: settlementId },
      data: { status: "CALCULATED" },
    });
    settlementsReset.push(settlementId);
  }

  logger.info(
    {
      invoiceId,
      itemsReleased: items.length,
      settlementsReset,
      productionsReleased,
    },
    "[SettlementRelease] Energieabrechnung nach Storno freigegeben",
  );

  return {
    released: true,
    itemsReleased: items.length,
    settlementsReset,
    productionsReleased,
  };
}
