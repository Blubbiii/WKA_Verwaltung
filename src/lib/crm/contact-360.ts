/**
 * Contact-360 Aggregator
 *
 * Loads everything reachable from a Person in one pass, so the CRM contact
 * detail page can show a full relationship view (Pachtverträge, Fonds-Beteiligungen,
 * Verträge, Parks via ContactLink, Rechnungen, Dokumente).
 *
 * ContactLink is polymorphic (entityType + entityId), so the referenced entities
 * (Park/Fund/Lease/Contract) must be loaded in a second step once we know the IDs.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type ContactLinkRow = {
  id: string;
  role: string;
  entityType: string;
  entityId: string;
  notes: string | null;
  isPrimary: boolean;
  validFrom: Date | null;
  validTo: Date | null;
};

export interface LeaseItem {
  id: string;
  startDate: Date;
  endDate: Date | null;
  status: string;
  linkedParkName: string | null;
  linkedParkId: string | null;
  annualRentEur: number | null;
  /** Set if linked via ContactLink (role/notes) rather than direct lessor FK. */
  linkRole?: string | null;
  source: "LESSOR" | "CONTACT_LINK";
}

export interface ShareholderItem {
  id: string;
  fundId: string;
  fundName: string;
  legalForm: string | null;
  ownershipPercentage: number | null;
  capitalContribution: number | null;
  entryDate: Date | null;
  exitDate: Date | null;
}

export interface ContractItem {
  id: string;
  contractType: string;
  title: string;
  contractNumber: string | null;
  startDate: Date;
  endDate: Date | null;
  status: string;
  annualValue: number | null;
  /** Days until endDate (null if no endDate). Negative = already expired. */
  daysUntilExpiry: number | null;
  source: "PARTNER" | "CONTACT_LINK";
  linkRole?: string | null;
}

export interface ParkRoleItem {
  id: string;
  parkId: string;
  parkName: string;
  role: string;
  isPrimary: boolean;
  notes: string | null;
}

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  grossAmount: number;
  status: string;
  invoiceType: string;
  /** Why is this invoice linked to this person? */
  linkedVia: "LEASE" | "SHAREHOLDER";
  linkedEntityId: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  category: string;
  fileName: string;
  createdAt: Date;
  linkedVia: "CONTRACT" | "FUND" | "PARK" | "SHAREHOLDER";
  linkedEntityId: string;
}

export interface Contact360Stats {
  leaseCount: number;
  fundCount: number;
  contractCount: number;
  parkRoleCount: number;
  invoiceCount: number;
  documentCount: number;
  openTaskCount: number;
}

export interface Contact360 {
  leases: LeaseItem[];
  shareholders: ShareholderItem[];
  contracts: ContractItem[];
  parkRoles: ParkRoleItem[];
  invoices: InvoiceItem[];
  documents: DocumentItem[];
  stats: Contact360Stats;
}

function toNumber(v: Prisma.Decimal | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  return Number(v);
}

function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  const ms = date.getTime() - Date.now();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * Load the full 360° view for a given Person within a tenant.
 * All queries run in parallel where possible.
 */
export async function loadContact360(
  personId: string,
  tenantId: string,
): Promise<Contact360> {
  // ---------------------------------------------------------------------------
  // Step 1: Parallel queries that depend only on personId/tenantId
  // ---------------------------------------------------------------------------
  const [
    directLeases,
    shareholderRows,
    directContracts,
    contactLinks,
    openTaskCount,
  ] = await Promise.all([
    // Leases where person is direct lessor
    prisma.lease.findMany({
      where: { lessorId: personId, tenantId, deletedAt: null },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
        leasePlots: {
          select: {
            plot: { select: { park: { select: { id: true, name: true } } } },
          },
          take: 1,
        },
      },
      orderBy: { startDate: "desc" },
    }),

    // Shareholder participations
    prisma.shareholder.findMany({
      where: { personId, fund: { tenantId } },
      select: {
        id: true,
        fundId: true,
        ownershipPercentage: true,
        capitalContribution: true,
        entryDate: true,
        exitDate: true,
        fund: { select: { id: true, name: true, legalForm: true } },
      },
      orderBy: { entryDate: "desc" },
    }),

    // Contracts where person is direct partner
    prisma.contract.findMany({
      where: { partnerId: personId, tenantId, deletedAt: null },
      select: {
        id: true,
        contractType: true,
        title: true,
        contractNumber: true,
        startDate: true,
        endDate: true,
        status: true,
        annualValue: true,
      },
      orderBy: { startDate: "desc" },
    }),

    // Raw ContactLinks - entities resolved in Step 2
    prisma.$queryRaw<ContactLinkRow[]>`
      SELECT id, role::text AS role, "entityType", "entityId", notes,
             "isPrimary", "validFrom", "validTo"
      FROM contact_links
      WHERE "tenantId" = ${tenantId} AND "personId" = ${personId}
      ORDER BY "isPrimary" DESC, "createdAt" DESC
    `,

    // Open tasks linked to person
    prisma.crmActivity.count({
      where: {
        personId,
        tenantId,
        type: "TASK",
        status: "PENDING",
        deletedAt: null,
      },
    }),
  ]);

  // ---------------------------------------------------------------------------
  // Step 2: Resolve ContactLink-referenced entities
  // ---------------------------------------------------------------------------
  const parkLinkIds = contactLinks
    .filter((l) => l.entityType === "PARK")
    .map((l) => l.entityId);
  const fundLinkIds = contactLinks
    .filter((l) => l.entityType === "FUND")
    .map((l) => l.entityId);
  const leaseLinkIds = contactLinks
    .filter((l) => l.entityType === "LEASE")
    .map((l) => l.entityId);
  const contractLinkIds = contactLinks
    .filter((l) => l.entityType === "CONTRACT")
    .map((l) => l.entityId);

  const [linkedParks, linkedLeases, linkedContracts] = await Promise.all([
    parkLinkIds.length
      ? prisma.park.findMany({
          where: { id: { in: parkLinkIds }, tenantId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    leaseLinkIds.length
      ? prisma.lease.findMany({
          where: { id: { in: leaseLinkIds }, tenantId, deletedAt: null },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
            leasePlots: {
              select: {
                plot: { select: { park: { select: { id: true, name: true } } } },
              },
              take: 1,
            },
          },
        })
      : Promise.resolve([]),
    contractLinkIds.length
      ? prisma.contract.findMany({
          where: { id: { in: contractLinkIds }, tenantId, deletedAt: null },
          select: {
            id: true,
            contractType: true,
            title: true,
            contractNumber: true,
            startDate: true,
            endDate: true,
            status: true,
            annualValue: true,
          },
        })
      : Promise.resolve([]),
  ]);
  // fundLinkIds consumed below for invoice lookup (fund shareholders are
  // authoritative for fund participations, so we don't surface fund-linked
  // parkRoles as "Fund", only as contact_link notes if needed).
  void fundLinkIds;

  // ---------------------------------------------------------------------------
  // Step 3: Aggregated queries that depend on Step 1/2 IDs
  // ---------------------------------------------------------------------------
  const allLeaseIds = [
    ...directLeases.map((l) => l.id),
    ...linkedLeases.map((l) => l.id),
  ];
  const shareholderIds = shareholderRows.map((s) => s.id);
  const contractIds = [
    ...directContracts.map((c) => c.id),
    ...linkedContracts.map((c) => c.id),
  ];
  const fundIds = shareholderRows.map((s) => s.fundId);
  const parkRoleIds = linkedParks.map((p) => p.id);

  const [leaseInvoices, shareholderInvoices, documents] = await Promise.all([
    allLeaseIds.length
      ? prisma.invoice.findMany({
          where: {
            leaseId: { in: allLeaseIds },
            tenantId,
            deletedAt: null,
          },
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            grossAmount: true,
            status: true,
            invoiceType: true,
            leaseId: true,
          },
          orderBy: { invoiceDate: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
    shareholderIds.length
      ? prisma.invoice.findMany({
          where: {
            shareholderId: { in: shareholderIds },
            tenantId,
            deletedAt: null,
          },
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            grossAmount: true,
            status: true,
            invoiceType: true,
            shareholderId: true,
          },
          orderBy: { invoiceDate: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
    contractIds.length || fundIds.length || parkRoleIds.length || shareholderIds.length
      ? prisma.document.findMany({
          where: {
            tenantId,
            deletedAt: null,
            OR: [
              contractIds.length ? { contractId: { in: contractIds } } : {},
              fundIds.length ? { fundId: { in: fundIds } } : {},
              parkRoleIds.length ? { parkId: { in: parkRoleIds } } : {},
              shareholderIds.length ? { shareholderId: { in: shareholderIds } } : {},
            ].filter((c) => Object.keys(c).length > 0),
          },
          select: {
            id: true,
            title: true,
            category: true,
            fileName: true,
            createdAt: true,
            contractId: true,
            fundId: true,
            parkId: true,
            shareholderId: true,
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  // ---------------------------------------------------------------------------
  // Step 4: Shape output
  // ---------------------------------------------------------------------------
  const leaseItems: LeaseItem[] = [
    ...directLeases.map<LeaseItem>((l) => ({
      id: l.id,
      startDate: l.startDate,
      endDate: l.endDate,
      status: l.status,
      linkedParkId: l.leasePlots[0]?.plot?.park?.id ?? null,
      linkedParkName: l.leasePlots[0]?.plot?.park?.name ?? null,
      annualRentEur: null,
      source: "LESSOR",
    })),
    ...linkedLeases.map<LeaseItem>((l) => {
      const link = contactLinks.find(
        (cl) => cl.entityType === "LEASE" && cl.entityId === l.id,
      );
      return {
        id: l.id,
        startDate: l.startDate,
        endDate: l.endDate,
        status: l.status,
        linkedParkId: l.leasePlots[0]?.plot?.park?.id ?? null,
        linkedParkName: l.leasePlots[0]?.plot?.park?.name ?? null,
        annualRentEur: null,
        source: "CONTACT_LINK",
        linkRole: link?.role ?? null,
      };
    }),
  ];

  const shareholderItems: ShareholderItem[] = shareholderRows.map((s) => ({
    id: s.id,
    fundId: s.fund.id,
    fundName: s.fund.name,
    legalForm: s.fund.legalForm,
    ownershipPercentage: toNumber(s.ownershipPercentage),
    capitalContribution: toNumber(s.capitalContribution),
    entryDate: s.entryDate,
    exitDate: s.exitDate,
  }));

  const contractItems: ContractItem[] = [
    ...directContracts.map<ContractItem>((c) => ({
      id: c.id,
      contractType: c.contractType,
      title: c.title,
      contractNumber: c.contractNumber,
      startDate: c.startDate,
      endDate: c.endDate,
      status: c.status,
      annualValue: toNumber(c.annualValue),
      daysUntilExpiry: daysUntil(c.endDate),
      source: "PARTNER",
    })),
    ...linkedContracts.map<ContractItem>((c) => {
      const link = contactLinks.find(
        (cl) => cl.entityType === "CONTRACT" && cl.entityId === c.id,
      );
      return {
        id: c.id,
        contractType: c.contractType,
        title: c.title,
        contractNumber: c.contractNumber,
        startDate: c.startDate,
        endDate: c.endDate,
        status: c.status,
        annualValue: toNumber(c.annualValue),
        daysUntilExpiry: daysUntil(c.endDate),
        source: "CONTACT_LINK",
        linkRole: link?.role ?? null,
      };
    }),
  ];

  const parkRoleItems: ParkRoleItem[] = linkedParks.map((p) => {
    const link = contactLinks.find(
      (cl) => cl.entityType === "PARK" && cl.entityId === p.id,
    );
    return {
      id: link?.id ?? p.id,
      parkId: p.id,
      parkName: p.name,
      role: link?.role ?? "SONSTIGES",
      isPrimary: link?.isPrimary ?? false,
      notes: link?.notes ?? null,
    };
  });

  const invoiceItems: InvoiceItem[] = [
    ...leaseInvoices.map<InvoiceItem>((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      grossAmount: Number(inv.grossAmount),
      status: inv.status,
      invoiceType: inv.invoiceType,
      linkedVia: "LEASE",
      linkedEntityId: inv.leaseId!,
    })),
    ...shareholderInvoices.map<InvoiceItem>((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      grossAmount: Number(inv.grossAmount),
      status: inv.status,
      invoiceType: inv.invoiceType,
      linkedVia: "SHAREHOLDER",
      linkedEntityId: inv.shareholderId!,
    })),
  ].sort((a, b) => b.invoiceDate.getTime() - a.invoiceDate.getTime());

  const documentItems: DocumentItem[] = documents.map<DocumentItem>((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    fileName: d.fileName,
    createdAt: d.createdAt,
    linkedVia: d.contractId
      ? "CONTRACT"
      : d.shareholderId
        ? "SHAREHOLDER"
        : d.fundId
          ? "FUND"
          : "PARK",
    linkedEntityId:
      d.contractId ?? d.shareholderId ?? d.fundId ?? d.parkId ?? "",
  }));

  return {
    leases: leaseItems,
    shareholders: shareholderItems,
    contracts: contractItems,
    parkRoles: parkRoleItems,
    invoices: invoiceItems,
    documents: documentItems,
    stats: {
      leaseCount: leaseItems.length,
      fundCount: shareholderItems.length,
      contractCount: contractItems.length,
      parkRoleCount: parkRoleItems.length,
      invoiceCount: invoiceItems.length,
      documentCount: documentItems.length,
      openTaskCount,
    },
  };
}
