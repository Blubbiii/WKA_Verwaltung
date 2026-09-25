/**
 * Form state of a GwG identity check and its mapping to POST /api/aml-checks.
 *
 * Kept free of React so the rules the server enforces are also checked
 * before sending — the server stays the authority.
 */

export type AmlStatus = "PENDING" | "VERIFIED" | "EXPIRED" | "REJECTED";
export type AmlMethode =
  | "IN_PERSON"
  | "VIDEO_IDENT"
  | "POST_IDENT"
  | "QUALIFIED_SIGNATURE"
  | "THIRD_PARTY"
  | "OTHER";
export type AmlRisiko = "LOW" | "MEDIUM" | "HIGH";

export const AML_STATUS: AmlStatus[] = ["PENDING", "VERIFIED", "EXPIRED", "REJECTED"];
export const AML_METHODEN: AmlMethode[] = [
  "IN_PERSON",
  "VIDEO_IDENT",
  "POST_IDENT",
  "QUALIFIED_SIGNATURE",
  "THIRD_PARTY",
  "OTHER",
];
export const AML_RISIKEN: AmlRisiko[] = ["LOW", "MEDIUM", "HIGH"];

export interface AmlFormular {
  status: AmlStatus;
  method: AmlMethode;
  /** yyyy-mm-dd or "" */
  identifiedAt: string;
  documentType: string;
  documentNumber: string;
  issuingAuthority: string;
  documentValidUntil: string;
  beneficialOwnerVerified: boolean;
  isPep: boolean;
  riskLevel: AmlRisiko;
  /** Empty → the server derives it from the risk level. */
  nextReviewAt: string;
  notes: string;
}

export function leeresAmlFormular(): AmlFormular {
  return {
    status: "PENDING",
    method: "IN_PERSON",
    identifiedAt: "",
    documentType: "",
    documentNumber: "",
    issuingAuthority: "",
    documentValidUntil: "",
    beneficialOwnerVerified: false,
    isPep: false,
    riskLevel: "LOW",
    nextReviewAt: "",
    notes: "",
  };
}

/** i18n key of the first problem, or null when the form may be sent. */
export function amlFormularFehler(form: AmlFormular): "identifiedAtRequired" | null {
  if (form.status === "VERIFIED" && !form.identifiedAt) return "identifiedAtRequired";
  return null;
}

const oderNull = (wert: string) => wert.trim() || null;

export function amlFormularZuPayload(
  form: AmlFormular,
  personId: string,
  subscriptionId?: string | null,
) {
  return {
    personId,
    subscriptionId: subscriptionId ?? null,
    status: form.status,
    method: form.method,
    identifiedAt: oderNull(form.identifiedAt),
    documentType: oderNull(form.documentType),
    documentNumber: oderNull(form.documentNumber),
    issuingAuthority: oderNull(form.issuingAuthority),
    documentValidUntil: oderNull(form.documentValidUntil),
    beneficialOwnerVerified: form.beneficialOwnerVerified,
    isPep: form.isPep,
    riskLevel: form.riskLevel,
    nextReviewAt: oderNull(form.nextReviewAt),
    notes: oderNull(form.notes),
  };
}
