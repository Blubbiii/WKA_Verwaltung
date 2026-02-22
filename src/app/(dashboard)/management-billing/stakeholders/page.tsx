"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Eye, Pencil, Briefcase } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SearchFilter } from "@/components/ui/search-filter";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

// =============================================================================
// TYPES
// =============================================================================

type StakeholderRole =
  | "DEVELOPER"
  | "GRID_OPERATOR"
  | "TECHNICAL_BF"
  | "COMMERCIAL_BF"
  | "OPERATOR";

interface Stakeholder {
  id: string;
  role: StakeholderRole;
  parkId: string;
  parkName: string;
  parkTenantName: string;
  stakeholderTenantId: string;
  stakeholderTenantName: string;
  billingEnabled: boolean;
  feePercentage: number;
  isActive: boolean;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
  visibleFundIds?: string[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const roleLabels: Record<StakeholderRole, string> = {
  DEVELOPER: "Projektierer",
  GRID_OPERATOR: "Netzbetreiber",
  TECHNICAL_BF: "Techn. BF",
  COMMERCIAL_BF: "Kaufm. BF",
  OPERATOR: "Betreiber",
};

const roleBadgeColors: Record<StakeholderRole, string> = {
  DEVELOPER: "bg-purple-100 text-purple-800",
  GRID_OPERATOR: "bg-blue-100 text-blue-800",
  TECHNICAL_BF: "bg-orange-100 text-orange-800",
  COMMERCIAL_BF: "bg-emerald-100 text-emerald-800",
  OPERATOR: "bg-gray-100 text-gray-800",
};

// =============================================================================
// HELPERS
// =============================================================================

function formatPercent(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + " %";
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function StakeholdersListPage() {
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  // Filter state
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const res = await fetch("/api/management-billing/stakeholders");
        if (!res.ok) throw new Error("Failed to fetch stakeholders");
        const json = await res.json();
        if (!cancelled) {
          setStakeholders(json.stakeholders ?? json.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setIsError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filtered stakeholders
  const filtered = useMemo(() => {
    return stakeholders.filter((s) => {
      // Search filter
      if (search) {
        const q = search.toLowerCase();
        const matchesSearch =
          s.stakeholderTenantName.toLowerCase().includes(q) ||
          s.parkName.toLowerCase().includes(q) ||
          s.parkTenantName.toLowerCase().includes(q) ||
          roleLabels[s.role]?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      // Role filter
      if (roleFilter !== "all" && s.role !== roleFilter) return false;

      // Status filter
      if (statusFilter === "active" && !s.isActive) return false;
      if (statusFilter === "inactive" && s.isActive) return false;

      return true;
    });
  }, [stakeholders, search, roleFilter, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="BF-Vertraege"
        description="Dienstleister und deren Aufgaben in Windparks verwalten"
        createHref="/management-billing/stakeholders/new"
        createLabel="Neuer BF-Vertrag"
      />

      {/* Filter Bar */}
      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Dienstleister, Park oder Aufgabe suchen..."
        filters={[
          {
            value: roleFilter,
            onChange: setRoleFilter,
            placeholder: "Alle Aufgaben",
            options: [
              { value: "all", label: "Alle Aufgaben" },
              { value: "DEVELOPER", label: "Projektierer" },
              { value: "GRID_OPERATOR", label: "Netzbetreiber" },
              { value: "TECHNICAL_BF", label: "Techn. BF" },
              { value: "COMMERCIAL_BF", label: "Kaufm. BF" },
              { value: "OPERATOR", label: "Betreiber" },
            ],
          },
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: "Alle Status",
            options: [
              { value: "all", label: "Alle Status" },
              { value: "active", label: "Aktiv" },
              { value: "inactive", label: "Inaktiv" },
            ],
            width: "w-[150px]",
          },
        ]}
      />

      {/* Table */}
      {isLoading ? (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-16 flex-1" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Fehler beim Laden der BF-Vertraege. Bitte versuchen Sie es
              erneut.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Briefcase}
              title={
                stakeholders.length === 0
                  ? "Keine BF-Vertraege vorhanden"
                  : "Keine Ergebnisse"
              }
              description={
                stakeholders.length === 0
                  ? "Erstellen Sie den ersten BF-Vertrag, um Betriebsfuehrungs-Abrechnungen zu verwalten."
                  : "Passen Sie Ihre Suchkriterien an, um Ergebnisse zu finden."
              }
              action={
                stakeholders.length === 0 ? (
                  <Button asChild>
                    <Link href="/management-billing/stakeholders/new">
                      Neuen BF-Vertrag erstellen
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dienstleister</TableHead>
                    <TableHead>Park</TableHead>
                    <TableHead>Aufgabe</TableHead>
                    <TableHead>Gesellschaften</TableHead>
                    <TableHead className="text-right">Gebuehr %</TableHead>
                    <TableHead>Abrechnung</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((stakeholder) => (
                    <TableRow key={stakeholder.id}>
                      <TableCell className="font-medium">
                        {stakeholder.stakeholderTenantName}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div>{stakeholder.parkName}</div>
                          <div className="text-xs text-muted-foreground">
                            {stakeholder.parkTenantName}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={roleBadgeColors[stakeholder.role] ?? ""}
                        >
                          {roleLabels[stakeholder.role] ?? stakeholder.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {!stakeholder.visibleFundIds ||
                        stakeholder.visibleFundIds.length === 0
                          ? "Alle"
                          : stakeholder.visibleFundIds.length}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPercent(stakeholder.feePercentage)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            stakeholder.billingEnabled ? "default" : "outline"
                          }
                          className={
                            stakeholder.billingEnabled
                              ? "bg-green-100 text-green-800"
                              : "text-muted-foreground"
                          }
                        >
                          {stakeholder.billingEnabled ? "aktiv" : "inaktiv"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={stakeholder.isActive ? "default" : "outline"}
                          className={
                            stakeholder.isActive
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }
                        >
                          {stakeholder.isActive ? "Aktiv" : "Inaktiv"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            title="Details anzeigen"
                          >
                            <Link
                              href={`/management-billing/stakeholders/${stakeholder.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            title="Bearbeiten"
                          >
                            <Link
                              href={`/management-billing/stakeholders/${stakeholder.id}?edit=true`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
