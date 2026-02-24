"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Stakeholder {
  id: string;
  role: string;
  parkId: string;
  parkTenantId: string;
  stakeholderTenantId: string;
  billingEnabled: boolean;
  feePercentage: number | null;
  taxType: string | null;
  sepaMandate: string | null;
  creditorId: string | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  notes: string | null;
  visibleFundIds: string[];
  parkName: string;
  parkTenantName: string;
  stakeholderTenant: {
    id: string;
    name: string;
    slug: string;
  };
}

interface FundOption {
  id: string;
  name: string;
  legalForm: string | null;
  status: string;
  categoryName: string | null;
  categoryCode: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  OPERATOR: "Betreiber",
  SERVICE_PROVIDER: "Dienstleister",
  GRID_OPERATOR: "Netzbetreiber",
  DIRECT_MARKETER: "Direktvermarkter",
  LANDOWNER: "Grundstueckseigentuemer",
  OTHER: "Sonstiges",
};

const TAX_TYPE_OPTIONS = [
  { value: "STANDARD", label: "19% MwSt (Standard)" },
  { value: "REDUCED", label: "7% MwSt (Ermaessigt)" },
  { value: "EXEMPT", label: "0% (Steuerfrei)" },
];

export default function EditStakeholderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [stakeholder, setStakeholder] = useState<Stakeholder | null>(null);

  // Fund options for visibility selection
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [fundsLoading, setFundsLoading] = useState(false);
  const [visibleFundIds, setVisibleFundIds] = useState<string[]>([]);
  const [allFundsSelected, setAllFundsSelected] = useState(true);

  // Editable form state
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [feePercentage, setFeePercentage] = useState("");
  const [originalFeePercentage, setOriginalFeePercentage] = useState("");
  const [taxType, setTaxType] = useState("EXEMPT");
  const [feeChangeReason, setFeeChangeReason] = useState("");
  const [sepaMandate, setSepaMandate] = useState("");
  const [creditorId, setCreditorId] = useState("");
  const [validTo, setValidTo] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function fetchStakeholder() {
      try {
        const response = await fetch(
          `/api/management-billing/stakeholders/${id}`
        );
        if (!response.ok) {
          if (response.status === 404) {
            toast.error("BF-Vertrag nicht gefunden");
            router.push("/management-billing");
            return;
          }
          throw new Error("Fehler beim Laden");
        }

        const data = await response.json();
        const s: Stakeholder = data.stakeholder;
        setStakeholder(s);

        // Pre-fill form
        setBillingEnabled(s.billingEnabled);
        const feeStr =
          s.feePercentage !== null ? String(s.feePercentage) : "";
        setFeePercentage(feeStr);
        setOriginalFeePercentage(feeStr);
        setTaxType(s.taxType || "EXEMPT");
        setSepaMandate(s.sepaMandate || "");
        setCreditorId(s.creditorId || "");
        setValidTo(
          s.validTo
            ? new Date(s.validTo).toISOString().split("T")[0]
            : ""
        );
        setIsActive(s.isActive);
        setNotes(s.notes || "");
        const fundIds = s.visibleFundIds ?? [];
        setVisibleFundIds(fundIds);
        setAllFundsSelected(fundIds.length === 0);
      } catch {
        toast.error("Fehler beim Laden des BF-Vertrags");
      } finally {
        setIsLoading(false);
      }
    }

    fetchStakeholder();
  }, [id, router]);

  // Fetch available funds for the stakeholder's park
  useEffect(() => {
    if (!stakeholder) return;

    let cancelled = false;

    async function loadFunds() {
      setFundsLoading(true);
      try {
        const res = await fetch(
          `/api/management-billing/available-funds?tenantId=${stakeholder!.parkTenantId}&parkId=${stakeholder!.parkId}`
        );
        if (!res.ok) throw new Error("Failed to fetch funds");
        const json = await res.json();
        if (!cancelled) {
          setFunds(json.funds ?? []);
        }
      } catch {
        if (!cancelled) {
          toast.error("Fehler beim Laden der Gesellschaften");
        }
      } finally {
        if (!cancelled) {
          setFundsLoading(false);
        }
      }
    }

    loadFunds();
    return () => {
      cancelled = true;
    };
  }, [stakeholder]);

  const feePercentageChanged =
    feePercentage !== originalFeePercentage;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setIsSaving(true);

      const payload: Record<string, unknown> = {
        billingEnabled,
        feePercentage:
          feePercentage !== "" ? parseFloat(feePercentage) : null,
        taxType,
        visibleFundIds: allFundsSelected ? [] : visibleFundIds,
        sepaMandate: sepaMandate || null,
        creditorId: creditorId || null,
        validTo: validTo || null,
        isActive,
        notes: notes || null,
      };

      if (feePercentageChanged && feeChangeReason.trim()) {
        payload.feeChangeReason = feeChangeReason.trim();
      }

      const response = await fetch(
        `/api/management-billing/stakeholders/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || "Fehler beim Speichern"
        );
      }

      toast.success("BF-Vertrag erfolgreich aktualisiert");
      router.push(`/management-billing/stakeholders/${id}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Speichern"
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40 mt-2" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!stakeholder) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          BF-Vertrag nicht gefunden
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild type="button">
            <Link
              href={`/management-billing/stakeholders/${id}`}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              BF-Vertrag bearbeiten
            </h1>
            <p className="text-muted-foreground">
              {stakeholder.stakeholderTenant.name} &mdash;{" "}
              {stakeholder.parkName}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Abbrechen
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Speichern
          </Button>
        </div>
      </div>

      <Separator />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Card 1: Zuordnung (read-only) */}
        <Card>
          <CardHeader>
            <CardTitle>Zuordnung</CardTitle>
            <CardDescription>
              Diese Felder können nicht geändert werden
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                Dienstleister
              </Label>
              <p className="font-medium">
                {stakeholder.stakeholderTenant.name}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                Park gehoert zu
              </Label>
              <p className="font-medium">
                {stakeholder.parkTenantName}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                Park
              </Label>
              <p className="font-medium">{stakeholder.parkName}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                Aufgabe
              </Label>
              <Badge variant="outline">
                {ROLE_LABELS[stakeholder.role] || stakeholder.role}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Abrechnung */}
        <Card>
          <CardHeader>
            <CardTitle>Abrechnung</CardTitle>
            <CardDescription>
              Abrechnungseinstellungen und Gebühren
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="billingEnabled">
                  Abrechnung aktiviert
                </Label>
                <p className="text-sm text-muted-foreground">
                  Automatische BF-Abrechnung für diesen
                  Vertrag
                </p>
              </div>
              <Switch
                id="billingEnabled"
                checked={billingEnabled}
                onCheckedChange={setBillingEnabled}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="feePercentage">
                Gebührensatz (%)
              </Label>
              <Input
                id="feePercentage"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={feePercentage}
                onChange={(e) => setFeePercentage(e.target.value)}
                placeholder="z.B. 2.50"
              />
            </div>

            {feePercentageChanged && (
              <div className="space-y-2">
                <Label htmlFor="feeChangeReason">
                  Grund der Änderung
                </Label>
                <Input
                  id="feeChangeReason"
                  value={feeChangeReason}
                  onChange={(e) =>
                    setFeeChangeReason(e.target.value)
                  }
                  placeholder="z.B. Vertragsanpassung 2026"
                />
                <p className="text-xs text-muted-foreground">
                  Wird in der Gebührenhistorie dokumentiert
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="taxType">Steuerart</Label>
              <Select value={taxType} onValueChange={setTaxType}>
                <SelectTrigger id="taxType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAX_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: SEPA & Zahlung */}
        <Card>
          <CardHeader>
            <CardTitle>SEPA &amp; Zahlung</CardTitle>
            <CardDescription>
              Zahlungsverkehr und SEPA-Lastschrift
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sepaMandate">
                SEPA-Mandatsreferenz
              </Label>
              <Input
                id="sepaMandate"
                value={sepaMandate}
                onChange={(e) => setSepaMandate(e.target.value)}
                placeholder="z.B. MNDT-2024-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="creditorId">
                Glaeubiger-Identifikationsnummer
              </Label>
              <Input
                id="creditorId"
                value={creditorId}
                onChange={(e) => setCreditorId(e.target.value)}
                placeholder="z.B. DE98ZZZ09999999999"
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Gültigkeit */}
        <Card>
          <CardHeader>
            <CardTitle>Gültigkeit</CardTitle>
            <CardDescription>
              Zeitraum und Aktivitaetsstatus
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="validTo">Gültig bis</Label>
              <Input
                id="validTo"
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leer lassen für unbefristete Gültigkeit
              </p>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isActive">Aktiv</Label>
                <p className="text-sm text-muted-foreground">
                  Deaktivierte Verträge werden nicht
                  abgerechnet
                </p>
              </div>
              <Switch
                id="isActive"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="notes">Notizen</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Interne Anmerkungen..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 5: Verwaltete Gesellschaften (full width) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Verwaltete Gesellschaften</CardTitle>
            <CardDescription>
              Für welche Gesellschaften werden BF-Gebühren berechnet?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {funds.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="allFundsEdit"
                  checked={allFundsSelected}
                  onCheckedChange={(checked) => {
                    const isAll = checked === true;
                    setAllFundsSelected(isAll);
                    if (isAll) setVisibleFundIds([]);
                  }}
                />
                <Label
                  htmlFor="allFundsEdit"
                  className="text-sm font-normal cursor-pointer"
                >
                  Alle Gesellschaften
                </Label>
              </div>
            )}

            {fundsLoading ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-md" />
                ))}
              </div>
            ) : funds.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Keine Gesellschaften für diesen Park gefunden
              </div>
            ) : allFundsSelected ? (
              <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Alle {funds.length} Gesellschaften dieses Parks werden
                  verwaltet. Deaktivieren Sie &quot;Alle
                  Gesellschaften&quot;, um einzelne auszuwaehlen.
                </span>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {funds.map((fund) => {
                  const isChecked = visibleFundIds.includes(fund.id);
                  return (
                    <label
                      key={fund.id}
                      className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                        isChecked
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          setVisibleFundIds((prev) =>
                            checked === true
                              ? [...prev, fund.id]
                              : prev.filter((id) => id !== fund.id)
                          );
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {fund.name}
                          {fund.legalForm && (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              {fund.legalForm}
                            </span>
                          )}
                        </div>
                        {fund.categoryName && (
                          <Badge
                            variant="secondary"
                            className="mt-1 text-xs"
                          >
                            {fund.categoryName}
                          </Badge>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Die Gebühr wird basierend auf der Einspeisevergütung dieser
              Gesellschaften berechnet
            </p>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
