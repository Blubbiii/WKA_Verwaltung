/**
 * Which selected grid-operator settlements a batch action applies to
 * (POST /api/batch/settlements):
 *
 * - approve: INVOICED → CLOSED. A settlement without credit notes must never
 *   count as settled, so CALCULATED is not approvable.
 * - reject: CALCULATED → DRAFT, undoing the calculation.
 *
 * Only eligible IDs are sent; the rest is reported, not tried.
 */
export function sammelAuswahl(auswahl: { id: string; status: string }[]) {
  const freigeben = auswahl.filter((s) => s.status === "INVOICED").map((s) => s.id);
  const zurueckweisen = auswahl.filter((s) => s.status === "CALCULATED").map((s) => s.id);
  return {
    freigeben,
    zurueckweisen,
    uebrig: auswahl.length - freigeben.length - zurueckweisen.length,
  };
}
