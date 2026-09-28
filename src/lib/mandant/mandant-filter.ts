/**
 * Tenant scoping of database queries (2026-09) — the rules, free of Prisma.
 *
 * Before, 1,587 database calls in 526 routes each had to name the tenant by
 * hand, and a forgotten one leaked another customer's data. mandantDb()
 * (lib/mandant/mandant-db.ts) applies these rules to every query instead.
 *
 * Direct models carry a required tenantId; indirect ones hang on a parent
 * (a turbine on its park). Anything else is not tenant data and passes
 * through unchanged.
 */

type Args = Record<string, unknown>;

/** Models with a required tenantId column. Kept in step with the schema by the test. */
export const MANDANT_MODELLE: ReadonlySet<string> = new Set([
  "AccountingPeriodLock", "AmlCheck", "AnnualBudget", "ApprovalRequest", "ArchiveVerificationLog",
  "ArchivedDocument", "AvailabilityGuarantee", "AvailabilitySettlement", "BillingRule",
  "ComplianceDeadline", "ContactLink", "Contract", "CostCenter", "CrmActivity", "CurtailmentEvent",
  "Defect", "DismantlingObligation", "Distribution", "Document", "DocumentRoutingRule",
  "DocumentTemplate", "DunningRun", "EmailRoute", "EmailTemplate", "EnergyMonthlyRate",
  "EnergyReportConfig", "EnergyRevenueType", "EnergySettlement", "EntityPresence", "FaultCase",
  "Fund", "FundCategory", "GeneratedReport", "InboundEmail", "IncomingInvoice", "InspectionPlan",
  "InspectionReport", "InsuranceClaim", "InsurancePolicy", "Invoice", "InvoiceItemTemplate",
  "InvoiceNumberSequence", "InvoicePayment", "InvoiceTemplate", "Lease", "LeaseRevenueSettlement",
  "LeaseSettlementPeriod", "Letterhead", "Mailing", "MailingTemplate", "MajorComponent",
  "MapAnnotation", "MarketPremiumCalculation", "MeteringPoint", "Municipality",
  "MunicipalityBenefit", "NetworkConnection", "NetworkNode", "News", "Notification",
  "OperationalChecklist", "OperationalTask", "Park", "ParkCostAllocation", "PendingBankUpdate",
  "Person", "PersonTag", "Plot", "PositionTaxMapping", "PowerPurchaseAgreement",
  "RecurringInvoice", "RegulatoryProfile", "ReminderLog", "ScadaAnomaly", "ScadaAnomalyConfig",
  "ScadaAutoImportLog", "ScadaAvailability", "ScadaElectricalPhase", "ScadaElectricalSummary",
  "ScadaImportLog", "ScadaMeasurement", "ScadaOperatingState", "ScadaShadowCasting",
  "ScadaStateEvent", "ScadaStateSummary", "ScadaTextEvent", "ScadaTurbineMapping",
  "ScadaWarningEvent", "ScadaWarningSummary", "ScadaWindSummary", "ScheduledReport",
  "SettlementCheck", "ShareTransfer", "ShareholderMeeting", "SidebarLink", "Subscription", "SupportZugriff",
  "TaxRateConfig", "TurbineProduction", "User", "UserSavedFilter", "UserTenantMembership",
  "Vendor", "Vote", "Webhook",
]);

/** Models without their own tenantId, scoped through a parent relation. */
export const INDIREKTE_MODELLE: Record<string, (tenantId: string) => Args> = {
  Turbine: (t) => ({ park: { tenantId: t } }),
  ServiceEvent: (t) => ({ turbine: { park: { tenantId: t } } }),
  Shareholder: (t) => ({ fund: { tenantId: t } }),
  InvoiceItem: (t) => ({ invoice: { tenantId: t } }),
  EnergySettlementItem: (t) => ({ energySettlement: { tenantId: t } }),
};

const LESEN_UND_MASSENAENDERUNG = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);
const PER_ID = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);
const ANLEGEN = new Set(["create", "createMany", "createManyAndReturn", "upsert"]);

function bereich(model: string, tenantId: string): Args | null {
  if (MANDANT_MODELLE.has(model)) return { tenantId };
  return INDIREKTE_MODELLE[model]?.(tenantId) ?? null;
}

function mitMandant(model: string, daten: unknown, tenantId: string): unknown {
  if (!MANDANT_MODELLE.has(model) || !daten || typeof daten !== "object") return daten;
  const d = daten as Args;
  // Created through the relation (tenant: { connect }) — Prisma checks that one.
  if ("tenant" in d) return d;
  if (d.tenantId === undefined) return { ...d, tenantId };
  if (d.tenantId !== tenantId) {
    throw new Error(`Mandantenfremder Datensatz: ${model} sollte für Mandant ${tenantId} angelegt werden`);
  }
  return d;
}

/** Rewrites the arguments of one query so it only reaches the tenant's rows. */
export function mandantFilter(model: string, operation: string, args: Args, tenantId: string): Args {
  const scope = bereich(model, tenantId);
  if (!scope) return args;
  const neu: Args = { ...args };

  if (LESEN_UND_MASSENAENDERUNG.has(operation) || PER_ID.has(operation)) {
    // Existing conditions stay at the top level and the tenant joins via AND:
    // unique filters must be top-level, and the soft-delete extension looks
    // for an explicit `deletedAt` there.
    const vorhanden = (args.where ?? {}) as Args;
    if (Object.keys(vorhanden).length === 0 && !PER_ID.has(operation)) {
      neu.where = scope;
    } else {
      const und = vorhanden.AND === undefined ? [] : Array.isArray(vorhanden.AND) ? vorhanden.AND : [vorhanden.AND];
      neu.where = { ...vorhanden, AND: [...und, scope] };
    }
  }

  if (ANLEGEN.has(operation)) {
    if (operation === "upsert") neu.create = mitMandant(model, args.create, tenantId);
    else if (Array.isArray(args.data)) neu.data = args.data.map((d) => mitMandant(model, d, tenantId));
    else neu.data = mitMandant(model, args.data, tenantId);
  }
  return neu;
}

const BEOBACHTET = new Set([...LESEN_UND_MASSENAENDERUNG, ...PER_ID]);

function enthaeltMandant(wert: unknown): boolean {
  if (!wert || typeof wert !== "object") return false;
  if (Array.isArray(wert)) return wert.some(enthaeltMandant);
  return Object.entries(wert as Args).some(([k, v]) => k === "tenantId" || enthaeltMandant(v));
}

/**
 * Observation mode: does a query on a tenant model run without any tenant
 * condition? Creating is not flagged (the value is in the data, not the filter).
 */
export function fehltMandant(model: string, operation: string, args: Args): boolean {
  if (!MANDANT_MODELLE.has(model) || !BEOBACHTET.has(operation)) return false;
  return !enthaeltMandant(args.where);
}
