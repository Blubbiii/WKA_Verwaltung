"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import {
  ArrowLeft,
  Pencil,
  Power,
  Plus,
  Loader2,
  Save,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// =============================================================================
// TYPES
// =============================================================================

type StakeholderRole =
  | "DEVELOPER"
  | "GRID_OPERATOR"
  | "TECHNICAL_BF"
  | "COMMERCIAL_BF"
  | "OPERATOR";

interface FeeHistoryEntry {
  id: string;
  feePercentage: number;
  validFrom: string;
  validUntil: string | null;
  reason: string | null;
}

interface BillingEntry {
  id: string;
  year: number;
  month: number;
  status: string;
  baseRevenueEur: number;
  feeAmountNetEur: number;
  feeAmountGrossEur: number;
}

interface StakeholderDetail {
  id: string;
  role: StakeholderRole;
  parkId: string;
  parkTenantId: string;
  stakeholderTenantId: string;
  billingEnabled: boolean;
  feePercentage: number;
  taxType: string;
  sepaMandate: string | null;
  creditorId: string | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  notes: string | null;
  visibleFundIds: string[];
  visibleFundNames?: string[];
  stakeholderTenant: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
  feeHistory: FeeHistoryEntry[];
  billings: BillingEntry[];
  parkName: string;
  parkTenantName: string;
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

const taxTypeLabels: Record<string, string> = {
  STANDARD: "Standard (19%)",
  REDUCED: "Ermaessigt (7%)",
  EXEMPT: "Befreit (0%)",
};

const billingStatusLabels: Record<string, string> = {
  DRAFT: "Entwurf",
  CALCULATED: "Berechnet",
  APPROVED: "Freigegeben",
  INVOICED: "Fakturiert",
  PAID: "Bezahlt",
  CANCELLED: "Storniert",
};

const billingStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  CALCULATED: "bg-blue-100 text-blue-800",
  APPROVED: "bg-yellow-100 text-yellow-800",
  INVOICED: "bg-emerald-100 text-emerald-800",
  PAID: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

// =============================================================================
// HELPERS
// =============================================================================

function formatPercent(value: number): string {
  return (
    new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value) + " %"
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd.MM.yyyy", { locale: de });
  } catch {
    return "-";
  }
}

function formatPeriod(year: number, month: number | null): string {
  if (!month) return `${year}`;
  const date = new Date(year, month - 1, 1);
  return format(date, "MMMM yyyy", { locale: de });
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function StakeholderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [stakeholder, setStakeholder] = useState<StakeholderDetail | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  // New fee dialog state
  const [feeDialogOpen, setFeeDialogOpen] = useState(false);
  const [newFee, setNewFee] = useState({
    feePercentage: "",
    validFrom: "",
    reason: "",
  });
  const [savingFee, setSavingFee] = useState(false);

  // Fetch stakeholder
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const res = await fetch(
          `/api/management-billing/stakeholders/${id}`
        );
        if (!res.ok) throw new Error("Failed to fetch stakeholder");
        const json = await res.json();
        if (!cancelled) {
          setStakeholder(json.stakeholder ?? json);
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
  }, [id]);

  // Deactivate stakeholder
  async function handleDeactivate() {
    if (!confirm("Möchten Sie diesen BF-Vertrag wirklich deaktivieren?")) {
      return;
    }

    try {
      setDeactivating(true);
      const res = await fetch(
        `/api/management-billing/stakeholders/${id}`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(
          errorData?.error ?? "Fehler beim Deaktivieren"
        );
      }
      toast.success("BF-Vertrag deaktiviert");
      router.push("/management-billing/stakeholders");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Deaktivieren"
      );
    } finally {
      setDeactivating(false);
    }
  }

  // Add new fee history entry
  async function handleAddFee(e: React.FormEvent) {
    e.preventDefault();

    if (
      !newFee.feePercentage ||
      parseFloat(newFee.feePercentage) < 0
    ) {
      toast.error("Bitte geben Sie einen gültigen Gebührensatz ein");
      return;
    }
    if (!newFee.validFrom) {
      toast.error("Bitte geben Sie ein Startdatum ein");
      return;
    }

    try {
      setSavingFee(true);

      const payload = {
        feePercentage: parseFloat(newFee.feePercentage),
        validFrom: newFee.validFrom,
        reason: newFee.reason || null,
      };

      const res = await fetch(
        `/api/management-billing/stakeholders/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addFeeHistory: payload }),
        }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(
          errorData?.error ?? "Fehler beim Hinzufügen der Gebühr"
        );
      }

      const json = await res.json();
      setStakeholder(json.stakeholder ?? json);
      setFeeDialogOpen(false);
      setNewFee({ feePercentage: "", validFrom: "", reason: "" });
      toast.success("Gebühr erfolgreich hinzugefügt");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Hinzufügen der Gebühr"
      );
    } finally {
      setSavingFee(false);
    }
  }

  // =========================================================================
  // LOADING STATE
  // =========================================================================

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ERROR STATE
  // =========================================================================

  if (isError || !stakeholder) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/management-billing/stakeholders">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">BF-Vertrag nicht gefunden</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Der BF-Vertrag konnte nicht geladen werden. Bitte versuchen
              Sie es erneut oder kehren Sie zur Übersicht zurück.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // =========================================================================
  // MAIN RENDER
  // =========================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/management-billing/stakeholders">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">
                {stakeholder.stakeholderTenant.name}
              </h1>
              <Badge
                variant="secondary"
                className={roleBadgeColors[stakeholder.role] ?? ""}
              >
                {roleLabels[stakeholder.role] ?? stakeholder.role}
              </Badge>
              {!stakeholder.isActive && (
                <Badge variant="destructive">Inaktiv</Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {stakeholder.parkName} - {stakeholder.parkTenantName}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link
              href={`/management-billing/stakeholders/${id}?edit=true`}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Bearbeiten
            </Link>
          </Button>
          {stakeholder.isActive && (
            <Button
              variant="destructive"
              onClick={handleDeactivate}
              disabled={deactivating}
            >
              {deactivating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Power className="mr-2 h-4 w-4" />
              )}
              Deaktivieren
            </Button>
          )}
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-border via-border/50 to-transparent" />

      {/* Info Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Vertragsdaten */}
        <Card>
          <CardHeader>
            <CardTitle>Vertragsdaten</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Aufgabe</dt>
                <dd className="text-sm font-medium">
                  <Badge
                    variant="secondary"
                    className={roleBadgeColors[stakeholder.role] ?? ""}
                  >
                    {roleLabels[stakeholder.role] ?? stakeholder.role}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Park</dt>
                <dd className="text-sm font-medium">
                  {stakeholder.parkName}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">
                  Mandant
                </dt>
                <dd className="text-sm font-medium">
                  {stakeholder.parkTenantName}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">
                  Dienstleister
                </dt>
                <dd className="text-sm font-medium">
                  {stakeholder.stakeholderTenant.name}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">
                  Verwaltete Gesellschaften
                </dt>
                <dd className="text-sm font-medium">
                  {!stakeholder.visibleFundIds ||
                  stakeholder.visibleFundIds.length === 0
                    ? "Alle Gesellschaften"
                    : stakeholder.visibleFundNames &&
                        stakeholder.visibleFundNames.length > 0
                      ? stakeholder.visibleFundNames.join(", ")
                      : `${stakeholder.visibleFundIds.length} Gesellschaft(en)`}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">
                  Gültig ab
                </dt>
                <dd className="text-sm font-medium">
                  {formatDate(stakeholder.validFrom)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">
                  Gültig bis
                </dt>
                <dd className="text-sm font-medium">
                  {formatDate(stakeholder.validTo)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Status</dt>
                <dd>
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
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Abrechnungsdaten */}
        <Card>
          <CardHeader>
            <CardTitle>Abrechnungsdaten</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">
                  Gebühr
                </dt>
                <dd className="text-sm font-medium font-mono">
                  {formatPercent(stakeholder.feePercentage)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">
                  Steuerart
                </dt>
                <dd className="text-sm font-medium">
                  {taxTypeLabels[stakeholder.taxType] ??
                    stakeholder.taxType}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">
                  SEPA-Mandat
                </dt>
                <dd className="text-sm font-medium">
                  {stakeholder.sepaMandate ?? "-"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">
                  Glaeubiger-ID
                </dt>
                <dd className="text-sm font-medium">
                  {stakeholder.creditorId ?? "-"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">
                  Abrechnung
                </dt>
                <dd>
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
                    {stakeholder.billingEnabled ? "Aktiviert" : "Deaktiviert"}
                  </Badge>
                </dd>
              </div>
              {stakeholder.notes && (
                <div className="pt-2 border-t">
                  <dt className="text-sm text-muted-foreground mb-1">
                    Notizen
                  </dt>
                  <dd className="text-sm">{stakeholder.notes}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Fee History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Gebührenhistorie</CardTitle>
              <CardDescription>
                Verlauf der Gebührensaetze für diesen BF-Vertrag
              </CardDescription>
            </div>
            <Dialog open={feeDialogOpen} onOpenChange={setFeeDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Neue Gebühr
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleAddFee}>
                  <DialogHeader>
                    <DialogTitle>Neue Gebühr hinzufügen</DialogTitle>
                    <DialogDescription>
                      Erstellen Sie einen neuen Gebührensatz. Der bisherige
                      Satz wird automatisch mit einem Enddatum versehen.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="newFeePercentage">
                        Gebührensatz (%) *
                      </Label>
                      <Input
                        id="newFeePercentage"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={newFee.feePercentage}
                        onChange={(e) =>
                          setNewFee((prev) => ({
                            ...prev,
                            feePercentage: e.target.value,
                          }))
                        }
                        placeholder="z.B. 3,50"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newFeeValidFrom">
                        Gültig ab *
                      </Label>
                      <Input
                        id="newFeeValidFrom"
                        type="date"
                        value={newFee.validFrom}
                        onChange={(e) =>
                          setNewFee((prev) => ({
                            ...prev,
                            validFrom: e.target.value,
                          }))
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newFeeReason">Grund</Label>
                      <Input
                        id="newFeeReason"
                        value={newFee.reason}
                        onChange={(e) =>
                          setNewFee((prev) => ({
                            ...prev,
                            reason: e.target.value,
                          }))
                        }
                        placeholder="z.B. Vertragsanpassung 2026"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setFeeDialogOpen(false)}
                    >
                      Abbrechen
                    </Button>
                    <Button type="submit" disabled={savingFee}>
                      {savingFee ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Speichern
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {stakeholder.feeHistory && stakeholder.feeHistory.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gültig ab</TableHead>
                    <TableHead>Gültig bis</TableHead>
                    <TableHead className="text-right">
                      Gebühr %
                    </TableHead>
                    <TableHead>Grund</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stakeholder.feeHistory.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {formatDate(entry.validFrom)}
                      </TableCell>
                      <TableCell>
                        {entry.validUntil ? (
                          formatDate(entry.validUntil)
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-800"
                          >
                            aktuell
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPercent(entry.feePercentage)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.reason ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              Keine Gebührenhistorie vorhanden
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Billings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Abrechnungen</CardTitle>
              <CardDescription>
                Betriebsführungs-Abrechnungen für diesen Vertrag
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/management-billing/billings?stakeholderId=${id}`}
              >
                Alle anzeigen
                <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {stakeholder.billings && stakeholder.billings.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zeitraum</TableHead>
                    <TableHead className="text-right">
                      Basiserlös
                    </TableHead>
                    <TableHead className="text-right">Netto</TableHead>
                    <TableHead className="text-right">Brutto</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stakeholder.billings.map((billing) => (
                    <TableRow key={billing.id}>
                      <TableCell className="font-medium">
                        {formatPeriod(billing.year, billing.month)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(billing.baseRevenueEur)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(billing.feeAmountNetEur)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(billing.feeAmountGrossEur)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            billingStatusColors[billing.status] ?? ""
                          }
                        >
                          {billingStatusLabels[billing.status] ??
                            billing.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              Noch keine Abrechnungen vorhanden
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
