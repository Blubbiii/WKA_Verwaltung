/**
 * Webhook Event Type Constants
 *
 * Defines all supported webhook events and their German display labels.
 */

export const WEBHOOK_EVENTS = {
  // Invoices
  "invoice.created": "Rechnung erstellt",
  "invoice.sent": "Rechnung versendet",
  "invoice.paid": "Rechnung bezahlt",
  "invoice.overdue": "Rechnung ueberfaellig",
  // Contracts
  "contract.expiring": "Vertrag laeuft aus",
  "contract.expired": "Vertrag ausgelaufen",
  // Settlements
  "settlement.created": "Abrechnung erstellt",
  "settlement.finalized": "Abrechnung abgeschlossen",
  // Votes
  "vote.created": "Abstimmung erstellt",
  "vote.closed": "Abstimmung geschlossen",
  // Documents
  "document.uploaded": "Dokument hochgeladen",
  "document.approved": "Dokument genehmigt",
  // Service Events
  "service_event.created": "Service-Event erstellt",
  // Technician Check-Ins
  "technician.checked_in": "Techniker eingecheckt",
  "technician.checked_out": "Techniker ausgecheckt",
} as const;

export type WebhookEventType = keyof typeof WEBHOOK_EVENTS;

/**
 * Event categories for grouping in UI
 */
export const WEBHOOK_EVENT_CATEGORIES: Record<
  string,
  { label: string; events: WebhookEventType[] }
> = {
  invoices: {
    label: "Rechnungen",
    events: [
      "invoice.created",
      "invoice.sent",
      "invoice.paid",
      "invoice.overdue",
    ],
  },
  contracts: {
    label: "Vertraege",
    events: ["contract.expiring", "contract.expired"],
  },
  settlements: {
    label: "Abrechnungen",
    events: ["settlement.created", "settlement.finalized"],
  },
  votes: {
    label: "Abstimmungen",
    events: ["vote.created", "vote.closed"],
  },
  documents: {
    label: "Dokumente",
    events: ["document.uploaded", "document.approved"],
  },
  serviceEvents: {
    label: "Service-Events",
    events: ["service_event.created"],
  },
  technicianCheckins: {
    label: "Techniker-Check-Ins",
    events: ["technician.checked_in", "technician.checked_out"],
  },
};
