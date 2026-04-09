"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Building2,
  FileText,
  Wind,
  Receipt,
  FolderOpen,
  ChevronDown,
  Plus,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatDate, formatCurrency } from "@/lib/format";

// ----------------------------------------------------------------------------
// Types (mirror src/lib/crm/contact-360.ts, but serialized — Dates become strings)
// ----------------------------------------------------------------------------

export interface LeaseItemDto {
  id: string;
  startDate: string;
  endDate: string | null;
  status: string;
  linkedParkId: string | null;
  linkedParkName: string | null;
  annualRentEur: number | null;
  source: "LESSOR" | "CONTACT_LINK";
  linkRole?: string | null;
}

export interface ShareholderItemDto {
  id: string;
  fundId: string;
  fundName: string;
  legalForm: string | null;
  ownershipPercentage: number | null;
  capitalContribution: number | null;
  entryDate: string | null;
  exitDate: string | null;
}

export interface ContractItemDto {
  id: string;
  contractType: string;
  title: string;
  contractNumber: string | null;
  startDate: string;
  endDate: string | null;
  status: string;
  annualValue: number | null;
  daysUntilExpiry: number | null;
  source: "PARTNER" | "CONTACT_LINK";
  linkRole?: string | null;
}

export interface ParkRoleItemDto {
  id: string;
  parkId: string;
  parkName: string;
  role: string;
  isPrimary: boolean;
  notes: string | null;
}

export interface InvoiceItemDto {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  grossAmount: number;
  status: string;
  invoiceType: string;
  linkedVia: "LEASE" | "SHAREHOLDER";
  linkedEntityId: string;
}

export interface DocumentItemDto {
  id: string;
  title: string;
  category: string;
  fileName: string;
  createdAt: string;
  linkedVia: "CONTRACT" | "FUND" | "PARK" | "SHAREHOLDER";
  linkedEntityId: string;
}

export interface Contact360Dto {
  leases: LeaseItemDto[];
  shareholders: ShareholderItemDto[];
  contracts: ContractItemDto[];
  parkRoles: ParkRoleItemDto[];
  invoices: InvoiceItemDto[];
  documents: DocumentItemDto[];
  stats: {
    leaseCount: number;
    fundCount: number;
    contractCount: number;
    parkRoleCount: number;
    invoiceCount: number;
    documentCount: number;
    openTaskCount: number;
  };
}

interface RelatedEntitiesPanelProps {
  data: Contact360Dto;
  onAddContactLink?: () => void;
}

// ----------------------------------------------------------------------------
// Section wrapper
// ----------------------------------------------------------------------------

function Section({
  title,
  icon,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || count > 0);
  if (count === 0) return null;
  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {icon}
              {title}
              <Badge variant="secondary" className="ml-1">
                {count}
              </Badge>
            </CardTitle>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function EntityRow({
  href,
  title,
  subtitle,
  right,
}: {
  href: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-muted/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate flex items-center gap-2">
          {title}
          <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
        </div>
        {subtitle && (
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {subtitle}
          </div>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </Link>
  );
}

function ExpiryBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  if (days < 0) {
    return (
      <Badge variant="destructive" className="text-xs gap-1">
        <AlertTriangle className="h-3 w-3" />
        Abgelaufen
      </Badge>
    );
  }
  if (days <= 30) {
    return (
      <Badge variant="destructive" className="text-xs">
        {days} Tage
      </Badge>
    );
  }
  if (days <= 90) {
    return (
      <Badge
        variant="outline"
        className="text-xs border-amber-500 text-amber-600 dark:text-amber-400"
      >
        {days} Tage
      </Badge>
    );
  }
  return null;
}

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------

export function RelatedEntitiesPanel({
  data,
  onAddContactLink,
}: RelatedEntitiesPanelProps) {
  const {
    leases,
    shareholders,
    contracts,
    parkRoles,
    invoices,
    documents,
    stats,
  } = data;

  const nothingLinked =
    stats.leaseCount +
      stats.fundCount +
      stats.contractCount +
      stats.parkRoleCount +
      stats.invoiceCount +
      stats.documentCount ===
    0;

  return (
    <div className="space-y-4">
      {/* Header with "Verknüpfung hinzufügen" button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Alle Verknüpfungen dieses Kontakts
        </h3>
        {onAddContactLink && (
          <Button variant="outline" size="sm" onClick={onAddContactLink}>
            <Plus className="mr-2 h-4 w-4" />
            Verknüpfung
          </Button>
        )}
      </div>

      {nothingLinked ? (
        <div className="py-12 text-center text-sm text-muted-foreground border rounded-md">
          Keine Verknüpfungen vorhanden. Nutze den Button oben, um diesen Kontakt
          mit einem Park, Fonds, Pachtvertrag oder sonstigem Vertrag zu
          verknüpfen.
        </div>
      ) : null}

      {/* Pachtverträge — CRITICAL section per user requirement */}
      <Section
        title="Pachtverträge"
        icon={<FileText className="h-4 w-4" />}
        count={stats.leaseCount}
        defaultOpen
      >
        <div className="space-y-2">
          {leases.map((l) => (
            <EntityRow
              key={l.id}
              href={`/leases/${l.id}`}
              title={
                <>
                  {l.linkedParkName ?? "Pachtvertrag"}
                  {l.source === "CONTACT_LINK" && l.linkRole ? (
                    <Badge variant="outline" className="text-xs">
                      {l.linkRole}
                    </Badge>
                  ) : null}
                </>
              }
              subtitle={
                <>
                  {formatDate(l.startDate)}
                  {l.endDate ? ` – ${formatDate(l.endDate)}` : " – unbefristet"}
                </>
              }
              right={
                <div className="flex items-center gap-2">
                  <Badge
                    variant={l.status === "ACTIVE" ? "default" : "outline"}
                    className="text-xs"
                  >
                    {l.status}
                  </Badge>
                </div>
              }
            />
          ))}
        </div>
      </Section>

      {/* Fonds-Beteiligungen */}
      <Section
        title="Fonds-Beteiligungen"
        icon={<Building2 className="h-4 w-4" />}
        count={stats.fundCount}
      >
        <div className="space-y-2">
          {shareholders.map((s) => (
            <EntityRow
              key={s.id}
              href={`/funds/${s.fundId}`}
              title={
                <>
                  {s.fundName}
                  {s.legalForm ? (
                    <Badge variant="outline" className="text-xs">
                      {s.legalForm}
                    </Badge>
                  ) : null}
                </>
              }
              subtitle={
                <>
                  {s.ownershipPercentage !== null
                    ? `${s.ownershipPercentage}% Anteil`
                    : "Anteil unbekannt"}
                  {s.capitalContribution !== null
                    ? ` · ${formatCurrency(s.capitalContribution)}`
                    : null}
                  {s.entryDate ? ` · ab ${formatDate(s.entryDate)}` : null}
                </>
              }
              right={
                s.exitDate ? (
                  <Badge variant="outline" className="text-xs">
                    Ausgetreten
                  </Badge>
                ) : null
              }
            />
          ))}
        </div>
      </Section>

      {/* Verträge */}
      <Section
        title="Verträge"
        icon={<FileText className="h-4 w-4" />}
        count={stats.contractCount}
      >
        <div className="space-y-2">
          {contracts.map((c) => (
            <EntityRow
              key={c.id}
              href={`/contracts/${c.id}`}
              title={
                <>
                  {c.title}
                  <Badge variant="outline" className="text-xs">
                    {c.contractType}
                  </Badge>
                  {c.source === "CONTACT_LINK" && c.linkRole ? (
                    <Badge variant="secondary" className="text-xs">
                      {c.linkRole}
                    </Badge>
                  ) : null}
                </>
              }
              subtitle={
                <>
                  {c.contractNumber ? `${c.contractNumber} · ` : ""}
                  {formatDate(c.startDate)}
                  {c.endDate ? ` – ${formatDate(c.endDate)}` : " – unbefristet"}
                </>
              }
              right={
                <div className="flex items-center gap-2">
                  <ExpiryBadge days={c.daysUntilExpiry} />
                  <Badge
                    variant={c.status === "ACTIVE" ? "default" : "outline"}
                    className="text-xs"
                  >
                    {c.status}
                  </Badge>
                </div>
              }
            />
          ))}
        </div>
      </Section>

      {/* Parks (Rollen) */}
      <Section
        title="Parks (Rollen)"
        icon={<Wind className="h-4 w-4" />}
        count={stats.parkRoleCount}
      >
        <div className="space-y-2">
          {parkRoles.map((p) => (
            <EntityRow
              key={p.id}
              href={`/parks/${p.parkId}`}
              title={
                <>
                  {p.parkName}
                  <Badge variant="secondary" className="text-xs">
                    {p.role}
                  </Badge>
                  {p.isPrimary ? (
                    <Badge variant="default" className="text-xs">
                      Primär
                    </Badge>
                  ) : null}
                </>
              }
              subtitle={p.notes ?? undefined}
            />
          ))}
        </div>
      </Section>

      {/* Rechnungen */}
      <Section
        title="Rechnungen"
        icon={<Receipt className="h-4 w-4" />}
        count={stats.invoiceCount}
      >
        <div className="space-y-2">
          {invoices.slice(0, 20).map((inv) => (
            <EntityRow
              key={inv.id}
              href={`/invoices/${inv.id}`}
              title={
                <>
                  {inv.invoiceNumber}
                  <Badge variant="outline" className="text-xs">
                    {inv.invoiceType}
                  </Badge>
                </>
              }
              subtitle={
                <>
                  {formatDate(inv.invoiceDate)} · via {inv.linkedVia}
                </>
              }
              right={
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {formatCurrency(inv.grossAmount)}
                  </span>
                  <Badge
                    variant={inv.status === "PAID" ? "default" : "outline"}
                    className="text-xs"
                  >
                    {inv.status}
                  </Badge>
                </div>
              }
            />
          ))}
          {invoices.length > 20 && (
            <div className="text-xs text-muted-foreground text-center pt-2">
              {invoices.length - 20} weitere Rechnungen nicht angezeigt
            </div>
          )}
        </div>
      </Section>

      {/* Dokumente */}
      <Section
        title="Dokumente"
        icon={<FolderOpen className="h-4 w-4" />}
        count={stats.documentCount}
      >
        <div className="space-y-2">
          {documents.slice(0, 30).map((d) => (
            <EntityRow
              key={d.id}
              href={`/documents/${d.id}`}
              title={
                <>
                  {d.title}
                  <Badge variant="outline" className="text-xs">
                    {d.category}
                  </Badge>
                </>
              }
              subtitle={
                <>
                  {d.fileName} · {formatDate(d.createdAt)} · via {d.linkedVia}
                </>
              }
            />
          ))}
          {documents.length > 30 && (
            <div className="text-xs text-muted-foreground text-center pt-2">
              {documents.length - 30} weitere Dokumente nicht angezeigt
            </div>
          )}
        </div>
      </Section>

    </div>
  );
}
