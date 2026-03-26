"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Save,
  Trash2,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

// =============================================================================
// TYPES
// =============================================================================

interface ClaimDetail {
  id: string;
  claimNumber: string | null;
  title: string;
  description: string | null;
  incidentDate: string;
  reportedDate: string;
  claimType: "INSURANCE" | "SERVICE_PROVIDER";
  status: string;
  estimatedCostEur: number | string | null;
  actualCostEur: number | string | null;
  reimbursedEur: number | string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  contract: { id: string; title: string } | null;
  vendor: { id: string; name: string } | null;
  defect: { id: string; title: string } | null;
  park: { id: string; name: string } | null;
  turbine: { id: string; name: string } | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const statusLabels: Record<string, string> = {
  REPORTED: "Gemeldet",
  CLAIM_IN_PROGRESS: "In Bearbeitung",
  RESOLVED: "Erledigt",
  REJECTED: "Abgelehnt",
};

const statusBadgeColors: Record<string, string> = {
  REPORTED: "bg-yellow-100 text-yellow-800",
  CLAIM_IN_PROGRESS: "bg-blue-100 text-blue-800",
  RESOLVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

const typeLabels: Record<string, string> = {
  INSURANCE: "Versicherung",
  SERVICE_PROVIDER: "Dienstleister",
};

const typeBadgeColors: Record<string, string> = {
  INSURANCE: "bg-purple-100 text-purple-800",
  SERVICE_PROVIDER: "bg-orange-100 text-orange-800",
};

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();

  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Editable form state
  const [formData, setFormData] = useState({
    claimNumber: "",
    title: "",
    description: "",
    incidentDate: "",
    claimType: "INSURANCE" as "INSURANCE" | "SERVICE_PROVIDER",
    status: "REPORTED",
    estimatedCostEur: "",
    actualCostEur: "",
    reimbursedEur: "",
    resolutionNotes: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const res = await fetch(`/api/management-billing/insurance-claims/${id}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        const data: ClaimDetail = json.claim ?? json;
        if (!cancelled) {
          setClaim(data);
          setFormData({
            claimNumber: data.claimNumber ?? "",
            title: data.title,
            description: data.description ?? "",
            incidentDate: data.incidentDate ? data.incidentDate.slice(0, 10) : "",
            claimType: data.claimType,
            status: data.status,
            estimatedCostEur: data.estimatedCostEur != null ? String(parseFloat(String(data.estimatedCostEur))) : "",
            actualCostEur: data.actualCostEur != null ? String(parseFloat(String(data.actualCostEur))) : "",
            reimbursedEur: data.reimbursedEur != null ? String(parseFloat(String(data.reimbursedEur))) : "",
            resolutionNotes: data.resolutionNotes ?? "",
          });
        }
      } catch {
        if (!cancelled) setIsError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  function handleChange(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!formData.title.trim()) {
      toast.error("Bitte geben Sie einen Titel ein");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        claimNumber: formData.claimNumber || null,
        title: formData.title,
        description: formData.description || null,
        incidentDate: formData.incidentDate || null,
        claimType: formData.claimType,
        status: formData.status,
        estimatedCostEur: formData.estimatedCostEur ? parseFloat(formData.estimatedCostEur) : null,
        actualCostEur: formData.actualCostEur ? parseFloat(formData.actualCostEur) : null,
        reimbursedEur: formData.reimbursedEur ? parseFloat(formData.reimbursedEur) : null,
        resolutionNotes: formData.resolutionNotes || null,
      };

      const res = await fetch(`/api/management-billing/insurance-claims/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error ?? "Fehler beim Speichern");
      }

      const json = await res.json();
      setClaim(json.claim ?? json);
      toast.success("Schadensfall gespeichert");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/management-billing/insurance-claims/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error ?? "Fehler beim Loeschen");
    }
    toast.success("Schadensfall geloescht");
    router.push("/management-billing/insurance/claims");
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
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
              <CardContent className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
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

  if (isError || !claim) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/management-billing/insurance/claims">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Schadensfall nicht gefunden</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Der Schadensfall konnte nicht geladen werden.
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
            <Link href="/management-billing/insurance/claims">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{claim.title}</h1>
              <Badge
                variant="secondary"
                className={typeBadgeColors[claim.claimType] ?? ""}
              >
                {typeLabels[claim.claimType] ?? claim.claimType}
              </Badge>
              <Badge
                variant="secondary"
                className={statusBadgeColors[claim.status] ?? ""}
              >
                {statusLabels[claim.status] ?? claim.status}
              </Badge>
            </div>
            {claim.claimNumber && (
              <p className="text-muted-foreground font-mono text-sm">
                {claim.claimNumber}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Loeschen
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Speichern
          </Button>
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-border via-border/50 to-transparent" />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Editable fields */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Schadensdaten</CardTitle>
              <CardDescription>Grundlegende Informationen zum Schadensfall</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Titel *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="claimNumber">Aktenzeichen</Label>
                  <Input
                    id="claimNumber"
                    value={formData.claimNumber}
                    onChange={(e) => handleChange("claimNumber", e.target.value)}
                    placeholder="z.B. VU-2026-001"
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
                  placeholder="Detaillierte Beschreibung des Schadensfalls..."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="incidentDate">Schadenstag</Label>
                  <Input
                    id="incidentDate"
                    type="date"
                    value={formData.incidentDate}
                    onChange={(e) => handleChange("incidentDate", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="claimType">Typ</Label>
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
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => handleChange("status", value)}
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="REPORTED">Gemeldet</SelectItem>
                      <SelectItem value="CLAIM_IN_PROGRESS">In Bearbeitung</SelectItem>
                      <SelectItem value="RESOLVED">Erledigt</SelectItem>
                      <SelectItem value="REJECTED">Abgelehnt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kosten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
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
                <div className="space-y-2">
                  <Label htmlFor="actualCostEur">Tatsaechliche Kosten (EUR)</Label>
                  <Input
                    id="actualCostEur"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.actualCostEur}
                    onChange={(e) => handleChange("actualCostEur", e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reimbursedEur">Erstattung (EUR)</Label>
                  <Input
                    id="reimbursedEur"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.reimbursedEur}
                    onChange={(e) => handleChange("reimbursedEur", e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Loesung</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="resolutionNotes">Loesungsnotizen</Label>
                <Textarea
                  id="resolutionNotes"
                  value={formData.resolutionNotes}
                  onChange={(e) => handleChange("resolutionNotes", e.target.value)}
                  rows={3}
                  placeholder="Beschreibung der Loesung / Ergebnis..."
                />
              </div>
              {claim.resolvedAt && (
                <p className="text-sm text-muted-foreground mt-3">
                  Erledigt am: {formatDate(claim.resolvedAt)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Read-only relations */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Gemeldet am</dt>
                  <dd className="text-sm font-medium">
                    {formatDate(claim.reportedDate)}
                  </dd>
                </div>
                {claim.park && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Park</dt>
                    <dd className="text-sm font-medium">{claim.park.name}</dd>
                  </div>
                )}
                {claim.turbine && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Anlage</dt>
                    <dd className="text-sm font-medium">{claim.turbine.name}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verknuepfungen</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                {claim.contract && (
                  <div className="flex justify-between items-center">
                    <dt className="text-sm text-muted-foreground">Vertrag</dt>
                    <dd>
                      <Button variant="link" size="sm" className="h-auto p-0" asChild>
                        <Link href={`/contracts/${claim.contract.id}`}>
                          {claim.contract.title}
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </dd>
                  </div>
                )}
                {claim.vendor && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-muted-foreground">Dienstleister</dt>
                    <dd className="text-sm font-medium">{claim.vendor.name}</dd>
                  </div>
                )}
                {claim.defect && (
                  <div className="flex justify-between items-center">
                    <dt className="text-sm text-muted-foreground">Mangel</dt>
                    <dd>
                      <Button variant="link" size="sm" className="h-auto p-0" asChild>
                        <Link href={`/management-billing/defects/${claim.defect.id}`}>
                          {claim.defect.title}
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </dd>
                  </div>
                )}
                {!claim.contract && !claim.vendor && !claim.defect && (
                  <p className="text-sm text-muted-foreground">
                    Keine Verknuepfungen vorhanden
                  </p>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <p className="text-sm text-blue-800">
                Aenderungen werden erst nach Klick auf &quot;Speichern&quot; uebernommen.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        title="Schadensfall loeschen"
        itemName={claim.title}
      />
    </div>
  );
}
