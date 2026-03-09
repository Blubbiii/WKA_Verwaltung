"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// =============================================================================
// TYPES
// =============================================================================

interface PolicyOption {
  id: string;
  title: string;
}

interface ParkOption {
  id: string;
  name: string;
}

interface TurbineOption {
  id: string;
  name: string;
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function NewClaimPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledDefectId = searchParams.get("defectId") ?? "";

  const [saving, setSaving] = useState(false);

  // Options for selects
  const [policies, setPolicies] = useState<PolicyOption[]>([]);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [turbines, setTurbines] = useState<TurbineOption[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const [parksLoading, setParksLoading] = useState(true);
  const [turbinesLoading, setTurbinesLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    claimNumber: "",
    description: "",
    incidentDate: "",
    claimType: "INSURANCE" as "INSURANCE" | "SERVICE_PROVIDER",
    contractId: "",
    vendorName: "",
    parkId: "",
    turbineId: "",
    defectId: prefilledDefectId,
    estimatedCostEur: "",
  });

  // Load policies and parks on mount
  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      setPoliciesLoading(true);
      setParksLoading(true);
      try {
        const [policiesRes, parksRes] = await Promise.all([
          fetch("/api/management-billing/insurance-policies"),
          fetch("/api/management-billing/available-parks"),
        ]);

        if (!cancelled) {
          if (policiesRes.ok) {
            const json = await policiesRes.json();
            setPolicies(json.policies ?? json.data ?? []);
          }
          if (parksRes.ok) {
            const json = await parksRes.json();
            setParks(json.parks ?? json.data ?? []);
          }
        }
      } catch {
        if (!cancelled) toast.error("Fehler beim Laden der Optionen");
      } finally {
        if (!cancelled) {
          setPoliciesLoading(false);
          setParksLoading(false);
        }
      }
    }

    loadOptions();
    return () => { cancelled = true; };
  }, []);

  // Load turbines when park changes
  useEffect(() => {
    if (!formData.parkId) {
      setTurbines([]);
      return;
    }

    let cancelled = false;

    async function loadTurbines() {
      setTurbinesLoading(true);
      try {
        const res = await fetch(`/api/parks/${formData.parkId}/turbines`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) {
            setTurbines(json.turbines ?? json.data ?? []);
          }
        }
      } catch {
        // Turbines are optional, silently fail
      } finally {
        if (!cancelled) setTurbinesLoading(false);
      }
    }

    loadTurbines();
    return () => { cancelled = true; };
  }, [formData.parkId]);

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error("Bitte geben Sie einen Titel ein");
      return;
    }
    if (!formData.incidentDate) {
      toast.error("Bitte geben Sie den Schadenstag ein");
      return;
    }

    try {
      setSaving(true);

      const payload: Record<string, unknown> = {
        title: formData.title,
        claimNumber: formData.claimNumber || null,
        description: formData.description || null,
        incidentDate: formData.incidentDate,
        claimType: formData.claimType,
        estimatedCostEur: formData.estimatedCostEur
          ? parseFloat(formData.estimatedCostEur)
          : null,
        parkId: formData.parkId || null,
        turbineId: formData.turbineId || null,
        defectId: formData.defectId || null,
      };

      if (formData.claimType === "INSURANCE") {
        payload.contractId = formData.contractId || null;
      } else {
        payload.vendorName = formData.vendorName || null;
      }

      const res = await fetch("/api/management-billing/insurance-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error ?? "Fehler beim Erstellen des Schadensfalls");
      }

      toast.success("Schadensfall erfolgreich erstellt");
      router.push("/management-billing/insurance/claims");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Erstellen"
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
            <Link href="/management-billing/insurance/claims">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Neuen Schadensfall melden</h1>
            <p className="text-muted-foreground">
              Versicherungs- oder Dienstleisterschaden erfassen
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
        {/* Left: Main fields */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic info */}
          <Card>
            <CardHeader>
              <CardTitle>Schadensinformationen</CardTitle>
              <CardDescription>
                Grunddaten zum Schadensfall
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Titel *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    placeholder="z.B. Blitzschaden WEA 3"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="claimNumber">Aktenzeichen</Label>
                  <Input
                    id="claimNumber"
                    value={formData.claimNumber}
                    onChange={(e) => handleChange("claimNumber", e.target.value)}
                    placeholder="z.B. VU-2026-001 (optional)"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Beschreibung</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  rows={4}
                  placeholder="Detaillierte Beschreibung des Schadens..."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="incidentDate">Schadenstag *</Label>
                  <Input
                    id="incidentDate"
                    type="date"
                    value={formData.incidentDate}
                    onChange={(e) => handleChange("incidentDate", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="claimType">Typ *</Label>
                  <Select
                    value={formData.claimType}
                    onValueChange={(value) => handleChange("claimType", value)}
                  >
                    <SelectTrigger id="claimType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INSURANCE">Versicherung</SelectItem>
                      <SelectItem value="SERVICE_PROVIDER">Dienstleister</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Type-specific: Contract or Vendor */}
          <Card>
            <CardHeader>
              <CardTitle>
                {formData.claimType === "INSURANCE"
                  ? "Versicherungsvertrag"
                  : "Dienstleister"}
              </CardTitle>
              <CardDescription>
                {formData.claimType === "INSURANCE"
                  ? "Zugehoerigen Versicherungsvertrag auswaehlen"
                  : "Zustaendigen Dienstleister angeben"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {formData.claimType === "INSURANCE" ? (
                <div className="space-y-2">
                  <Label htmlFor="contractId">Versicherungsvertrag</Label>
                  {policiesLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select
                      value={formData.contractId || "none"}
                      onValueChange={(value) =>
                        handleChange("contractId", value === "none" ? "" : value)
                      }
                    >
                      <SelectTrigger id="contractId">
                        <SelectValue placeholder="Vertrag auswaehlen..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Kein Vertrag</SelectItem>
                        {policies.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="vendorName">Dienstleistername</Label>
                  <Input
                    id="vendorName"
                    value={formData.vendorName}
                    onChange={(e) => handleChange("vendorName", e.target.value)}
                    placeholder="z.B. Enercon Service GmbH"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cost estimate */}
          <Card>
            <CardHeader>
              <CardTitle>Kosten</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-w-sm">
                <Label htmlFor="estimatedCostEur">Geschaetzte Kosten (EUR)</Label>
                <Input
                  id="estimatedCostEur"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.estimatedCostEur}
                  onChange={(e) => handleChange("estimatedCostEur", e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Location & Links */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Standort</CardTitle>
              <CardDescription>Betroffener Park und Anlage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="parkId">Windpark</Label>
                {parksLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    value={formData.parkId || "none"}
                    onValueChange={(value) => {
                      handleChange("parkId", value === "none" ? "" : value);
                      handleChange("turbineId", "");
                    }}
                  >
                    <SelectTrigger id="parkId">
                      <SelectValue placeholder="Park auswaehlen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Kein Park</SelectItem>
                      {parks.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="turbineId">Anlage</Label>
                {turbinesLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    value={formData.turbineId || "none"}
                    onValueChange={(value) =>
                      handleChange("turbineId", value === "none" ? "" : value)
                    }
                    disabled={!formData.parkId}
                  >
                    <SelectTrigger id="turbineId">
                      <SelectValue placeholder={formData.parkId ? "Anlage auswaehlen..." : "Zuerst Park waehlen"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Keine Anlage</SelectItem>
                      {turbines.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardContent>
          </Card>

          {prefilledDefectId && (
            <Card>
              <CardHeader>
                <CardTitle>Verknuepfter Mangel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="defectId">Mangel-ID</Label>
                  <Input
                    id="defectId"
                    value={formData.defectId}
                    onChange={(e) => handleChange("defectId", e.target.value)}
                    placeholder="Mangel-ID"
                  />
                  <p className="text-xs text-muted-foreground">
                    Automatisch aus dem Mangel uebernommen
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <p className="text-sm text-blue-800">
                Nach dem Erstellen koennen Sie weitere Details wie Kosten,
                Erstattungen und Loesungsnotizen hinzufuegen.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
