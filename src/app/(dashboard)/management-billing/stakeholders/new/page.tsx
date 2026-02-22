"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// =============================================================================
// TYPES
// =============================================================================

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

interface ParkOption {
  id: string;
  name: string;
  shortName: string | null;
  tenantId: string;
  tenantName: string;
  totalCapacityKw: number | null;
}

interface FundOption {
  id: string;
  name: string;
  legalForm: string | null;
  status: string;
  categoryName: string | null;
  categoryCode: string | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const ROLE_OPTIONS = [
  { value: "TECHNICAL_BF", label: "Technische Betriebsfuehrung" },
  { value: "COMMERCIAL_BF", label: "Kaufmaennische Betriebsfuehrung" },
  { value: "DEVELOPER", label: "Projektierer" },
  { value: "GRID_OPERATOR", label: "Netzbetreiber" },
  { value: "OPERATOR", label: "Betreiber" },
];

const TAX_TYPE_OPTIONS = [
  { value: "STANDARD", label: "Standard (19%)" },
  { value: "REDUCED", label: "Ermaessigt (7%)" },
  { value: "EXEMPT", label: "Befreit (0%)" },
];

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function NewStakeholderPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Available options
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [allParks, setAllParks] = useState<ParkOption[]>([]);
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [parksLoading, setParksLoading] = useState(true);
  const [fundsLoading, setFundsLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    stakeholderTenantId: "",
    parkId: "",
    role: "",
    visibleFundIds: [] as string[],
    allFundsSelected: true,
    billingEnabled: true,
    feePercentage: "",
    taxType: "STANDARD",
    sepaMandate: "",
    creditorId: "",
    validFrom: "",
    validTo: "",
    notes: "",
  });

  // Derive parkTenantId from selected park
  const selectedPark = allParks.find((p) => p.id === formData.parkId);
  const derivedParkTenantId = selectedPark?.tenantId ?? "";

  // Group parks by tenant for the dropdown
  const parksByTenant = useMemo(() => {
    const groups: Record<string, { tenantName: string; parks: ParkOption[] }> =
      {};
    for (const park of allParks) {
      if (!groups[park.tenantId]) {
        groups[park.tenantId] = { tenantName: park.tenantName, parks: [] };
      }
      groups[park.tenantId].parks.push(park);
    }
    return Object.entries(groups).sort(([, a], [, b]) =>
      a.tenantName.localeCompare(b.tenantName)
    );
  }, [allParks]);

  // Fetch tenants + all parks on mount
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setTenantsLoading(true);
      setParksLoading(true);
      try {
        const [tenantsRes, parksRes] = await Promise.all([
          fetch("/api/management-billing/available-tenants"),
          fetch("/api/management-billing/available-parks"),
        ]);

        if (!cancelled) {
          if (tenantsRes.ok) {
            const tenantsJson = await tenantsRes.json();
            setTenants(tenantsJson.tenants ?? []);
          } else {
            toast.error("Fehler beim Laden der Mandanten");
          }

          if (parksRes.ok) {
            const parksJson = await parksRes.json();
            setAllParks(parksJson.parks ?? []);
          } else {
            toast.error("Fehler beim Laden der Parks");
          }
        }
      } catch {
        if (!cancelled) {
          toast.error("Fehler beim Laden der Daten");
        }
      } finally {
        if (!cancelled) {
          setTenantsLoading(false);
          setParksLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch funds when park changes
  useEffect(() => {
    if (!derivedParkTenantId || !formData.parkId) {
      setFunds([]);
      return;
    }

    let cancelled = false;

    async function loadFunds() {
      setFundsLoading(true);
      try {
        const res = await fetch(
          `/api/management-billing/available-funds?tenantId=${derivedParkTenantId}&parkId=${formData.parkId}`
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
  }, [formData.parkId, derivedParkTenantId]);

  function handleChange(field: string, value: string | boolean) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function handleParkChange(parkId: string) {
    // Reset fund selection when park changes
    setFormData((prev) => ({
      ...prev,
      parkId,
      visibleFundIds: [],
      allFundsSelected: true,
    }));
  }

  function handleFundToggle(fundId: string, checked: boolean) {
    setFormData((prev) => {
      const newIds = checked
        ? [...prev.visibleFundIds, fundId]
        : prev.visibleFundIds.filter((id) => id !== fundId);
      return { ...prev, visibleFundIds: newIds };
    });
  }

  function handleAllFundsToggle(checked: boolean) {
    setFormData((prev) => ({
      ...prev,
      allFundsSelected: checked,
      visibleFundIds: checked ? [] : [],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validation
    if (!formData.stakeholderTenantId) {
      toast.error("Bitte waehlen Sie einen Dienstleister aus");
      return;
    }
    if (!formData.parkId || !derivedParkTenantId) {
      toast.error("Bitte waehlen Sie einen Windpark aus");
      return;
    }
    if (!formData.role) {
      toast.error("Bitte waehlen Sie eine Aufgabe aus");
      return;
    }
    if (!formData.feePercentage || parseFloat(formData.feePercentage) < 0) {
      toast.error("Bitte geben Sie einen gueltigen Gebuehrensatz ein");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        stakeholderTenantId: formData.stakeholderTenantId,
        parkTenantId: derivedParkTenantId,
        parkId: formData.parkId,
        role: formData.role,
        visibleFundIds: formData.allFundsSelected
          ? []
          : formData.visibleFundIds,
        billingEnabled: formData.billingEnabled,
        feePercentage: parseFloat(formData.feePercentage),
        taxType: formData.taxType,
        sepaMandate: formData.sepaMandate || null,
        creditorId: formData.creditorId || null,
        validFrom: formData.validFrom || null,
        validTo: formData.validTo || null,
        notes: formData.notes || null,
      };

      const res = await fetch("/api/management-billing/stakeholders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(
          errorData?.error ?? "Fehler beim Erstellen des BF-Vertrags"
        );
      }

      toast.success("BF-Vertrag erfolgreich erstellt");
      router.push("/management-billing/stakeholders");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Erstellen des BF-Vertrags"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild type="button">
            <Link href="/management-billing/stakeholders">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Neuen BF-Vertrag anlegen</h1>
            <p className="text-muted-foreground">
              Dienstleister einem Windpark zuordnen und Gebuehren festlegen
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
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Erstellen
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Main Fields */}
        <div className="space-y-6 lg:col-span-2">
          {/* ============================================================= */}
          {/* SECTION 1: Vertragspartner                                     */}
          {/* ============================================================= */}
          <Card>
            <CardHeader>
              <CardTitle>Vertragspartner</CardTitle>
              <CardDescription>
                Wer fuehrt die Betriebsfuehrung fuer welchen Windpark durch?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Dienstleister */}
                <div className="space-y-2">
                  <Label htmlFor="stakeholderTenantId">
                    Dienstleister (BF-Firma) *
                  </Label>
                  <Select
                    value={formData.stakeholderTenantId || "none"}
                    onValueChange={(value) =>
                      handleChange(
                        "stakeholderTenantId",
                        value === "none" ? "" : value
                      )
                    }
                  >
                    <SelectTrigger id="stakeholderTenantId">
                      <SelectValue placeholder="Firma waehlen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>
                        Firma waehlen...
                      </SelectItem>
                      {tenantsLoading ? (
                        <SelectItem value="loading" disabled>
                          Laden...
                        </SelectItem>
                      ) : (
                        tenants.map((tenant) => (
                          <SelectItem key={tenant.id} value={tenant.id}>
                            {tenant.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Die Firma, die die Betriebsfuehrung durchfuehrt
                  </p>
                </div>

                {/* Windpark */}
                <div className="space-y-2">
                  <Label htmlFor="parkId">Windpark *</Label>
                  <Select
                    value={formData.parkId || "none"}
                    onValueChange={(value) =>
                      handleParkChange(value === "none" ? "" : value)
                    }
                  >
                    <SelectTrigger id="parkId">
                      <SelectValue placeholder="Windpark waehlen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>
                        Windpark waehlen...
                      </SelectItem>
                      {parksLoading ? (
                        <SelectItem value="loading" disabled>
                          Laden...
                        </SelectItem>
                      ) : parksByTenant.length === 1 ? (
                        // Single tenant — no grouping needed
                        parksByTenant[0][1].parks.map((park) => (
                          <SelectItem key={park.id} value={park.id}>
                            {park.name}
                            {park.shortName ? ` (${park.shortName})` : ""}
                          </SelectItem>
                        ))
                      ) : (
                        // Multiple tenants — group by tenant
                        parksByTenant.map(([tenantId, group]) => (
                          <SelectGroup key={tenantId}>
                            <SelectLabel>{group.tenantName}</SelectLabel>
                            {group.parks.map((park) => (
                              <SelectItem key={park.id} value={park.id}>
                                {park.name}
                                {park.shortName ? ` (${park.shortName})` : ""}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Der Windpark, der verwaltet werden soll
                    {selectedPark && (
                      <span className="ml-1 text-foreground">
                        — Mandant: {selectedPark.tenantName}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ============================================================= */}
          {/* SECTION 2: Aufgabe & verwaltete Gesellschaften                 */}
          {/* ============================================================= */}
          <Card>
            <CardHeader>
              <CardTitle>Aufgabe & verwaltete Gesellschaften</CardTitle>
              <CardDescription>
                Welche Aufgabe wird uebernommen und fuer welche Gesellschaften?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Aufgabe (Rolle) */}
              <div className="space-y-2">
                <Label htmlFor="role">Aufgabe *</Label>
                <Select
                  value={formData.role || "none"}
                  onValueChange={(value) =>
                    handleChange("role", value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger id="role" className="max-w-sm">
                    <SelectValue placeholder="Aufgabe waehlen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>
                      Aufgabe waehlen...
                    </SelectItem>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Verwaltete Betreibergesellschaften */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Verwaltete Betreibergesellschaften</Label>
                  {formData.parkId && funds.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="allFunds"
                        checked={formData.allFundsSelected}
                        onCheckedChange={(checked) =>
                          handleAllFundsToggle(checked === true)
                        }
                      />
                      <Label
                        htmlFor="allFunds"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Alle Gesellschaften
                      </Label>
                    </div>
                  )}
                </div>

                {!formData.parkId ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Bitte waehlen Sie zuerst einen Windpark aus
                  </div>
                ) : fundsLoading ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 rounded-md" />
                    ))}
                  </div>
                ) : funds.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Keine Gesellschaften fuer diesen Park gefunden
                  </div>
                ) : formData.allFundsSelected ? (
                  <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground flex items-start gap-2">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Alle {funds.length} Gesellschaften dieses Parks werden
                      verwaltet. Deaktivieren Sie &quot;Alle
                      Gesellschaften&quot;, um einzelne auszuwaehlen.
                    </span>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {funds.map((fund) => {
                      const isChecked = formData.visibleFundIds.includes(
                        fund.id
                      );
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
                            onCheckedChange={(checked) =>
                              handleFundToggle(fund.id, checked === true)
                            }
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
                  Die Gebuehr wird basierend auf der Einspeiseverguetung dieser
                  Gesellschaften berechnet
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ============================================================= */}
          {/* SECTION 3: Konditionen                                         */}
          {/* ============================================================= */}
          <Card>
            <CardHeader>
              <CardTitle>Konditionen</CardTitle>
              <CardDescription>
                Gebuehren und Steuereinstellungen fuer die Betriebsfuehrung
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Switch
                  id="billingEnabled"
                  checked={formData.billingEnabled}
                  onCheckedChange={(checked) =>
                    handleChange("billingEnabled", checked)
                  }
                />
                <Label htmlFor="billingEnabled">Abrechnung aktiviert</Label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Fee Percentage */}
                <div className="space-y-2">
                  <Label htmlFor="feePercentage">Gebuehrensatz (%) *</Label>
                  <Input
                    id="feePercentage"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={formData.feePercentage}
                    onChange={(e) =>
                      handleChange("feePercentage", e.target.value)
                    }
                    placeholder="z.B. 1,86"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Anteil an der Einspeiseverguetung, z.B. 1,86%
                  </p>
                </div>

                {/* Tax Type */}
                <div className="space-y-2">
                  <Label htmlFor="taxType">Steuerart</Label>
                  <Select
                    value={formData.taxType}
                    onValueChange={(value) => handleChange("taxType", value)}
                  >
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
              </div>
            </CardContent>
          </Card>

          {/* Notizen */}
          <Card>
            <CardHeader>
              <CardTitle>Notizen</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                placeholder="Optionale Notizen zum Vertrag"
                rows={3}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Sonstiges */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sonstiges</CardTitle>
              <CardDescription>
                SEPA-Daten und Vertragslaufzeiten
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* SEPA Mandate */}
              <div className="space-y-2">
                <Label htmlFor="sepaMandate">SEPA-Mandat</Label>
                <Input
                  id="sepaMandate"
                  value={formData.sepaMandate}
                  onChange={(e) =>
                    handleChange("sepaMandate", e.target.value)
                  }
                  placeholder="z.B. SEPA-2024-001"
                />
              </div>

              {/* Creditor ID */}
              <div className="space-y-2">
                <Label htmlFor="creditorId">Glaeubiger-ID</Label>
                <Input
                  id="creditorId"
                  value={formData.creditorId}
                  onChange={(e) =>
                    handleChange("creditorId", e.target.value)
                  }
                  placeholder="z.B. DE98ZZZ09999999999"
                />
              </div>

              {/* Valid From */}
              <div className="space-y-2">
                <Label htmlFor="validFrom">Gueltig ab</Label>
                <Input
                  id="validFrom"
                  type="date"
                  value={formData.validFrom}
                  onChange={(e) =>
                    handleChange("validFrom", e.target.value)
                  }
                />
              </div>

              {/* Valid To */}
              <div className="space-y-2">
                <Label htmlFor="validTo">Gueltig bis</Label>
                <Input
                  id="validTo"
                  type="date"
                  value={formData.validTo}
                  onChange={(e) =>
                    handleChange("validTo", e.target.value)
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Info Box */}
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <p className="text-sm text-blue-800">
                Nach dem Erstellen koennen Sie den Vertrag jederzeit bearbeiten
                und die Gebuehrenhistorie einsehen.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
