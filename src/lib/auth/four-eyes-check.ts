/**
 * Sprint 3 Permissions v2: Generisches 4-Augen-Prinzip.
 *
 * Prüft ob der aktuelle User eine kritische Aktion auf einer Entity
 * ausführen darf, die von ihm selbst erstellt wurde. Wird oberhalb
 * eines konfigurierbaren Schwellwerts geblockt.
 *
 * Pattern (analog zu inbox/approve):
 *   1. Schwelle aus TenantSettings holen
 *   2. Wenn Schwelle null → IMMER 4-Augen (gesetzliche / strenge Compliance)
 *   3. Wenn Betrag > Schwelle → 4-Augen-Check, sonst single-user OK
 *   4. Bei 4-Augen-Pflicht: createdById === currentUserId → 403
 *
 * Nutzung:
 *   await assertFourEyes({
 *     tenantId, userId, action: "POSTING",
 *     createdById: entry.createdById,
 *     amountEur: totalDebit,
 *   });
 */

import { getTenantSettings, type TenantSettings } from "@/lib/tenant-settings";

export type FourEyesAction =
  | "POSTING"
  | "REVERSE"
  | "SETTLEMENT_FINALIZE"
  | "SEPA_RUN";

export class FourEyesViolationError extends Error {
  constructor(
    public readonly action: FourEyesAction,
    public readonly threshold: number | null,
    public readonly amountEur: number,
  ) {
    const msg =
      threshold === null
        ? `Vier-Augen-Prinzip: Aktion "${action}" kann nicht von der erstellenden Person selbst durchgeführt werden.`
        : `Vier-Augen-Prinzip: Aktion "${action}" über ${threshold.toFixed(2)} € muss von einer anderen Person freigegeben werden.`;
    super(msg);
    this.name = "FourEyesViolationError";
  }
}

function getThreshold(
  action: FourEyesAction,
  settings: TenantSettings,
): number | null {
  switch (action) {
    case "POSTING":
      return settings.postingApprovalThresholdEur;
    case "REVERSE":
      return settings.reverseApprovalThresholdEur;
    case "SETTLEMENT_FINALIZE":
      return settings.settlementApprovalThresholdEur;
    case "SEPA_RUN":
      return settings.sepaApprovalThresholdEur;
  }
}

export interface AssertFourEyesParams {
  tenantId: string;
  userId: string;
  action: FourEyesAction;
  createdById: string | null;
  amountEur: number;
}

/**
 * Wirft FourEyesViolationError wenn der User die Aktion nicht ausführen darf.
 * Kein Throw = OK.
 */
export async function assertFourEyes(params: AssertFourEyesParams): Promise<void> {
  const settings = await getTenantSettings(params.tenantId);
  const threshold = getThreshold(params.action, settings);
  const requireFourEyes =
    threshold === null || params.amountEur > threshold;

  if (!requireFourEyes) return;

  // 4-Augen erforderlich — verbieten wenn User === Ersteller
  if (params.createdById && params.createdById === params.userId) {
    throw new FourEyesViolationError(
      params.action,
      threshold,
      params.amountEur,
    );
  }
}
