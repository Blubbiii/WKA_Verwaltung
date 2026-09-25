/**
 * Which actions the invoice detail header shows, and where: one primary
 * action per status, a few visible secondaries, everything else in the "…"
 * menu, destructive actions last and separated.
 */

export type RechnungsAktion =
  | "send"
  | "edit"
  | "delete"
  | "recordPayment"
  | "markPaid"
  | "markPaidWithSkonto"
  | "preview"
  | "pdf"
  | "duplicate"
  | "xrechnung"
  | "zugferd"
  | "correction"
  | "partialCancel"
  | "fullCancel";

export interface RechnungsAktionen {
  haupt: RechnungsAktion | null;
  sichtbar: RechnungsAktion[];
  menue: RechnungsAktion[];
  gefaehrlich: RechnungsAktion[];
}

const DOKUMENT: RechnungsAktion[] = ["preview", "pdf", "duplicate"];
const E_RECHNUNG: RechnungsAktion[] = ["xrechnung", "zugferd"];

export function rechnungsAktionen(r: { status: string; skontoMoeglich: boolean }): RechnungsAktionen {
  switch (r.status) {
    case "DRAFT":
      return { haupt: "send", sichtbar: ["edit"], menue: [...DOKUMENT, ...E_RECHNUNG], gefaehrlich: ["delete"] };

    case "SENT":
      return {
        haupt: "recordPayment",
        sichtbar: [],
        menue: [
          "markPaid",
          ...(r.skontoMoeglich ? (["markPaidWithSkonto"] as const) : []),
          ...DOKUMENT,
          ...E_RECHNUNG,
          "correction",
        ],
        gefaehrlich: ["partialCancel", "fullCancel"],
      };

    case "PARTIALLY_PAID":
      return {
        haupt: "recordPayment",
        sichtbar: [],
        menue: [...DOKUMENT, ...E_RECHNUNG, "correction"],
        gefaehrlich: ["partialCancel"],
      };

    case "PAID":
      return {
        haupt: null,
        sichtbar: ["preview"],
        menue: ["pdf", "duplicate", ...E_RECHNUNG, "correction"],
        gefaehrlich: ["partialCancel"],
      };

    // CANCELLED, WRITTEN_OFF: view it or use it as a template.
    default:
      return { haupt: null, sichtbar: ["preview"], menue: ["pdf", "duplicate"], gefaehrlich: [] };
  }
}
