/**
 * Reset Settlement Invoices (Endabrechnungs-Gutschriften)
 *
 * Deletes existing FINAL settlement invoices and resets the settlement
 * so that generateSettlementInvoices() can be run again with the new
 * detailed format (full positions + negative advance deductions + Anlage).
 *
 * Usage: node scripts/reset-settlement-invoices.js [settlementId]
 *
 * Without settlementId: lists all FINAL settlements with status SETTLED
 * With settlementId: resets that specific settlement
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const settlementId = process.argv[2];

  if (!settlementId) {
    // List all FINAL settlements that have settlement invoices
    const settlements = await prisma.leaseRevenueSettlement.findMany({
      where: {
        periodType: 'FINAL',
        status: { in: ['SETTLED', 'ADVANCE_CREATED', 'CALCULATED'] },
      },
      include: {
        park: { select: { name: true } },
        items: {
          select: {
            id: true,
            settlementInvoiceId: true,
            lessorPersonId: true,
          },
        },
      },
      orderBy: [{ year: 'desc' }, { parkId: 'asc' }],
    });

    console.log('\n=== FINAL Settlements ===\n');

    for (const s of settlements) {
      const invoiceCount = s.items.filter(i => i.settlementInvoiceId).length;
      console.log(
        `ID: ${s.id}` +
        `  | ${s.park.name} ${s.year}` +
        `  | Status: ${s.status}` +
        `  | Items: ${s.items.length}` +
        `  | Invoices: ${invoiceCount}`
      );
    }

    if (settlements.length === 0) {
      console.log('Keine FINAL Settlements gefunden.');
    } else {
      console.log('\nUsage: node scripts/reset-settlement-invoices.js <settlementId>');
    }
    return;
  }

  // Load the specific settlement
  const settlement = await prisma.leaseRevenueSettlement.findUnique({
    where: { id: settlementId },
    include: {
      park: { select: { name: true } },
      items: {
        include: {
          settlementInvoice: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!settlement) {
    console.error(`Settlement ${settlementId} nicht gefunden.`);
    process.exit(1);
  }

  console.log(`\nSettlement: ${settlement.park.name} ${settlement.year}`);
  console.log(`Status: ${settlement.status}`);
  console.log(`Typ: ${settlement.periodType}`);

  // Collect settlement invoices to delete
  const invoicesToDelete = [];
  const itemsToReset = [];

  for (const item of settlement.items) {
    if (item.settlementInvoice) {
      const inv = item.settlementInvoice;

      // Safety check: don't delete invoices that are SENT or PAID
      if (inv.status === 'SENT' || inv.status === 'PAID') {
        console.error(
          `\nABBRUCH: Gutschrift ${inv.invoiceNumber} hat Status ${inv.status}.` +
          `\nBereits versendete/bezahlte Gutschriften koennen nicht zurueckgesetzt werden.`
        );
        process.exit(1);
      }

      invoicesToDelete.push(inv);
      itemsToReset.push(item.id);
    }
  }

  if (invoicesToDelete.length === 0) {
    console.log('\nKeine Settlement-Gutschriften zum Zuruecksetzen gefunden.');
    return;
  }

  console.log(`\n${invoicesToDelete.length} Gutschriften werden geloescht:`);
  for (const inv of invoicesToDelete) {
    console.log(`  - ${inv.invoiceNumber} (${inv.status})`);
  }

  // Execute reset in transaction
  await prisma.$transaction(async (tx) => {
    // 1. Unlink settlement invoices from items
    for (const itemId of itemsToReset) {
      await tx.leaseRevenueSettlementItem.update({
        where: { id: itemId },
        data: { settlementInvoiceId: null },
      });
    }

    // 2. Delete invoice items first (FK constraint)
    for (const inv of invoicesToDelete) {
      await tx.invoiceItem.deleteMany({
        where: { invoiceId: inv.id },
      });
    }

    // 3. Delete invoices
    for (const inv of invoicesToDelete) {
      await tx.invoice.delete({
        where: { id: inv.id },
      });
    }

    // 4. Reset settlement status to ADVANCE_CREATED (or CALCULATED if no advances)
    const hasAdvances = settlement.items.some(i => i.advanceInvoiceId != null);
    const newStatus = hasAdvances ? 'ADVANCE_CREATED' : 'CALCULATED';

    await tx.leaseRevenueSettlement.update({
      where: { id: settlementId },
      data: {
        status: newStatus,
        settlementCreatedAt: null,
      },
    });

    console.log(`\nSettlement Status zurueckgesetzt auf: ${newStatus}`);
  });

  console.log(`\nErledigt! ${invoicesToDelete.length} Gutschriften geloescht.`);
  console.log('Jetzt koennen neue Gutschriften ueber die UI generiert werden.');
}

main()
  .catch((e) => {
    console.error('Fehler:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
