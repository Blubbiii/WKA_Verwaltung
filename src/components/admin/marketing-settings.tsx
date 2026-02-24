"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  LayoutGrid,
  Calculator,
  Megaphone,
  Scale,
  Plus,
  Trash2,
  Loader2,
  Activity,
  CreditCard,
  Users,
  CheckSquare,
  Layers,
  BarChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import type { MarketingConfig, LegalPages, FeatureConfig } from "@/lib/marketing/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Feature with a local `id` for UI state management (key, edit/delete) */
type Feature = FeatureConfig & { id: string };

/** Admin-local config type with id-bearing features for state management */
type AdminConfig = Omit<MarketingConfig, "features"> & { features: Feature[] };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ICON_OPTIONS = [
  { value: "activity", label: "SCADA", icon: Activity },
  { value: "credit-card", label: "Abrechnung", icon: CreditCard },
  { value: "users", label: "Portal", icon: Users },
  { value: "check-square", label: "Compliance", icon: CheckSquare },
  { value: "layers", label: "Multi-Tenant", icon: Layers },
  { value: "bar-chart", label: "Reporting", icon: BarChart },
] as const;

const MAX_FEATURES = 12;

const DEFAULT_CONFIG: AdminConfig = {
  hero: { title: "", subtitle: "" },
  features: [],
  pricing: {
    basePrice: 0,
    turbinePrice: 0,
    userPrice: 0,
    annualDiscountPercent: 0,
    maxTurbines: 100,
    maxUsers: 50,
  },
  cta: { title: "", subtitle: "" },
};

const DEFAULT_LEGAL: LegalPages = {
  impressum: "",
  datenschutz: "",
};

// ---------------------------------------------------------------------------
// Helper: Icon resolver
// ---------------------------------------------------------------------------

function getIconComponent(iconName: string) {
  const found = ICON_OPTIONS.find((opt) => opt.value === iconName);
  return found?.icon ?? Activity;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MarketingSettings() {
  const [config, setConfig] = useState<AdminConfig>(DEFAULT_CONFIG);
  const [legal, setLegal] = useState<LegalPages>(DEFAULT_LEGAL);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingLegal, setLoadingLegal] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingLegal, setSavingLegal] = useState<"impressum" | "datenschutz" | null>(null);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchConfig = useCallback(async () => {
    try {
      setLoadingConfig(true);
      const response = await fetch("/api/admin/marketing-config");
      if (response.ok) {
        const data = await response.json();
        // Add local IDs to features for UI state management
        const features = (data.features ?? []).map((f: FeatureConfig) => ({
          ...f,
          id: crypto.randomUUID(),
        }));
        setConfig({
          hero: data.hero ?? DEFAULT_CONFIG.hero,
          features,
          pricing: data.pricing ?? DEFAULT_CONFIG.pricing,
          cta: data.cta ?? DEFAULT_CONFIG.cta,
        });
      }
    } catch {
      toast.error("Fehler beim Laden der Marketing-Konfiguration");
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const fetchLegal = useCallback(async () => {
    try {
      setLoadingLegal(true);
      const response = await fetch("/api/admin/legal-pages");
      if (response.ok) {
        const data = await response.json();
        setLegal({
          impressum: data.impressum ?? "",
          datenschutz: data.datenschutz ?? "",
        });
      }
    } catch {
      toast.error("Fehler beim Laden der rechtlichen Texte");
    } finally {
      setLoadingLegal(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchLegal();
  }, [fetchConfig, fetchLegal]);

  // -----------------------------------------------------------------------
  // Save handlers
  // -----------------------------------------------------------------------

  async function saveConfig() {
    try {
      setSavingConfig(true);
      // Strip local `id` from features before sending to API
      const payload: MarketingConfig = {
        ...config,
        features: config.features.map(({ id: _id, ...rest }) => rest),
      };
      const response = await fetch("/api/admin/marketing-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      toast.success("Marketing-Konfiguration gespeichert");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setSavingConfig(false);
    }
  }

  async function saveLegalPage(page: "impressum" | "datenschutz") {
    try {
      setSavingLegal(page);
      // Send both fields because the API schema requires them
      const response = await fetch("/api/admin/legal-pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(legal),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      const label = page === "impressum" ? "Impressum" : "Datenschutzerklärung";
      toast.success(`${label} gespeichert`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setSavingLegal(null);
    }
  }

  // -----------------------------------------------------------------------
  // Feature helpers
  // -----------------------------------------------------------------------

  function addFeature() {
    if (config.features.length >= MAX_FEATURES) {
      toast.error(`Maximal ${MAX_FEATURES} Features erlaubt`);
      return;
    }

    const newFeature: Feature = {
      id: crypto.randomUUID(),
      icon: "activity",
      title: "",
      description: "",
    };

    setConfig((prev) => ({
      ...prev,
      features: [...prev.features, newFeature],
    }));
  }

  function removeFeature(id: string) {
    setConfig((prev) => ({
      ...prev,
      features: prev.features.filter((f) => f.id !== id),
    }));
  }

  function updateFeature(id: string, field: keyof Feature, value: string) {
    setConfig((prev) => ({
      ...prev,
      features: prev.features.map((f) =>
        f.id === id ? { ...f, [field]: value } : f
      ),
    }));
  }

  // -----------------------------------------------------------------------
  // Loading skeleton
  // -----------------------------------------------------------------------

  if (loadingConfig && loadingLegal) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Tabs defaultValue="hero" className="space-y-6">
      <TabsList className="flex flex-wrap h-auto gap-1">
        <TabsTrigger value="hero" className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Hero
        </TabsTrigger>
        <TabsTrigger value="features" className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4" />
          Features
        </TabsTrigger>
        <TabsTrigger value="pricing" className="flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          Preisrechner
        </TabsTrigger>
        <TabsTrigger value="cta" className="flex items-center gap-2">
          <Megaphone className="h-4 w-4" />
          CTA-Bereich
        </TabsTrigger>
        <TabsTrigger value="legal" className="flex items-center gap-2">
          <Scale className="h-4 w-4" />
          Rechtliches
        </TabsTrigger>
      </TabsList>

      {/* ================================================================ */}
      {/* Tab 1: Hero                                                      */}
      {/* ================================================================ */}
      <TabsContent value="hero" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Hero-Bereich
            </CardTitle>
            <CardDescription>
              Titel und Untertitel der Landingpage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="hero-title">Titel</Label>
                <span className="text-xs text-muted-foreground">
                  {config.hero.title.length}/200
                </span>
              </div>
              <Input
                id="hero-title"
                placeholder="z.B. Windpark-Management leicht gemacht"
                value={config.hero.title}
                maxLength={200}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    hero: { ...prev.hero, title: e.target.value },
                  }))
                }
              />
            </div>

            {/* Subtitle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="hero-subtitle">Untertitel</Label>
                <span className="text-xs text-muted-foreground">
                  {config.hero.subtitle.length}/500
                </span>
              </div>
              <Textarea
                id="hero-subtitle"
                placeholder="z.B. Die zentrale Plattform für Betreiber, Investoren und Dienstleister"
                value={config.hero.subtitle}
                maxLength={500}
                rows={3}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    hero: { ...prev.hero, subtitle: e.target.value },
                  }))
                }
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={saveConfig} disabled={savingConfig}>
                {savingConfig && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Speichern
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ================================================================ */}
      {/* Tab 2: Features                                                  */}
      {/* ================================================================ */}
      <TabsContent value="features" className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <LayoutGrid className="h-5 w-5" />
                  Features
                </CardTitle>
                <CardDescription>
                  Features der Landingpage verwalten (max. {MAX_FEATURES})
                </CardDescription>
              </div>
              <Button
                onClick={addFeature}
                disabled={config.features.length >= MAX_FEATURES}
                size="sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                Feature hinzufügen
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {config.features.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <LayoutGrid className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">Keine Features vorhanden</p>
                <p className="text-sm">
                  Klicke auf &quot;Feature hinzufügen&quot; um loszulegen.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {config.features.map((feature, index) => {
                  const IconComp = getIconComponent(feature.icon);
                  return (
                    <Card key={feature.id} className="relative">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <IconComp className="h-4 w-4" />
                            Feature {index + 1}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeFeature(feature.id)}
                            aria-label={`Feature ${index + 1} löschen`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Icon */}
                        <div className="space-y-1.5">
                          <Label htmlFor={`feature-icon-${feature.id}`}>
                            Icon
                          </Label>
                          <Select
                            value={feature.icon}
                            onValueChange={(value) =>
                              updateFeature(feature.id, "icon", value)
                            }
                          >
                            <SelectTrigger id={`feature-icon-${feature.id}`}>
                              <SelectValue placeholder="Icon waehlen" />
                            </SelectTrigger>
                            <SelectContent>
                              {ICON_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  <span className="flex items-center gap-2">
                                    <opt.icon className="h-4 w-4" />
                                    {opt.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Title */}
                        <div className="space-y-1.5">
                          <Label htmlFor={`feature-title-${feature.id}`}>
                            Titel
                          </Label>
                          <Input
                            id={`feature-title-${feature.id}`}
                            placeholder="Feature-Titel"
                            value={feature.title}
                            onChange={(e) =>
                              updateFeature(
                                feature.id,
                                "title",
                                e.target.value
                              )
                            }
                          />
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5">
                          <Label
                            htmlFor={`feature-desc-${feature.id}`}
                          >
                            Beschreibung
                          </Label>
                          <Textarea
                            id={`feature-desc-${feature.id}`}
                            placeholder="Kurze Beschreibung des Features"
                            value={feature.description}
                            rows={2}
                            onChange={(e) =>
                              updateFeature(
                                feature.id,
                                "description",
                                e.target.value
                              )
                            }
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end pt-4 border-t">
              <Button onClick={saveConfig} disabled={savingConfig}>
                {savingConfig && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Speichern
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ================================================================ */}
      {/* Tab 3: Preisrechner                                              */}
      {/* ================================================================ */}
      <TabsContent value="pricing" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Preisrechner-Konfiguration
            </CardTitle>
            <CardDescription>
              Parameter für den Preiskalkulator auf der Landingpage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Base price */}
              <div className="space-y-2">
                <Label htmlFor="pricing-base">Basispreis (EUR/Monat)</Label>
                <Input
                  id="pricing-base"
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={config.pricing.basePrice || ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      pricing: {
                        ...prev.pricing,
                        basePrice: parseFloat(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>

              {/* Price per turbine */}
              <div className="space-y-2">
                <Label htmlFor="pricing-turbine">
                  Preis pro Turbine (EUR/Monat)
                </Label>
                <Input
                  id="pricing-turbine"
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={config.pricing.turbinePrice || ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      pricing: {
                        ...prev.pricing,
                        turbinePrice: parseFloat(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>

              {/* Price per user */}
              <div className="space-y-2">
                <Label htmlFor="pricing-user">
                  Preis pro Benutzer (EUR/Monat)
                </Label>
                <Input
                  id="pricing-user"
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={config.pricing.userPrice || ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      pricing: {
                        ...prev.pricing,
                        userPrice: parseFloat(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>

              {/* Yearly discount */}
              <div className="space-y-2">
                <Label htmlFor="pricing-discount">Jahresrabatt (%)</Label>
                <Input
                  id="pricing-discount"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  placeholder="0"
                  value={config.pricing.annualDiscountPercent || ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      pricing: {
                        ...prev.pricing,
                        annualDiscountPercent: parseFloat(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>

              {/* Max turbines */}
              <div className="space-y-2">
                <Label htmlFor="pricing-max-turbines">
                  Max. Turbinen (Slider-Maximum)
                </Label>
                <Input
                  id="pricing-max-turbines"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="100"
                  value={config.pricing.maxTurbines || ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      pricing: {
                        ...prev.pricing,
                        maxTurbines: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>

              {/* Max users */}
              <div className="space-y-2">
                <Label htmlFor="pricing-max-users">
                  Max. Benutzer (Slider-Maximum)
                </Label>
                <Input
                  id="pricing-max-users"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="50"
                  value={config.pricing.maxUsers || ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      pricing: {
                        ...prev.pricing,
                        maxUsers: parseInt(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button onClick={saveConfig} disabled={savingConfig}>
                {savingConfig && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Speichern
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ================================================================ */}
      {/* Tab 4: CTA-Bereich                                               */}
      {/* ================================================================ */}
      <TabsContent value="cta" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Call-to-Action-Bereich
            </CardTitle>
            <CardDescription>
              Titel und Untertitel des CTA-Bereichs am Ende der Landingpage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cta-title">Titel</Label>
                <span className="text-xs text-muted-foreground">
                  {config.cta.title.length}/200
                </span>
              </div>
              <Input
                id="cta-title"
                placeholder="z.B. Bereit für effizientes Windpark-Management?"
                value={config.cta.title}
                maxLength={200}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    cta: { ...prev.cta, title: e.target.value },
                  }))
                }
              />
            </div>

            {/* Subtitle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cta-subtitle">Untertitel</Label>
                <span className="text-xs text-muted-foreground">
                  {config.cta.subtitle.length}/500
                </span>
              </div>
              <Textarea
                id="cta-subtitle"
                placeholder="z.B. Starten Sie jetzt mit WindparkManager und optimieren Sie Ihre Windpark-Verwaltung"
                value={config.cta.subtitle}
                maxLength={500}
                rows={3}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    cta: { ...prev.cta, subtitle: e.target.value },
                  }))
                }
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={saveConfig} disabled={savingConfig}>
                {savingConfig && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Speichern
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ================================================================ */}
      {/* Tab 5: Rechtliches                                               */}
      {/* ================================================================ */}
      <TabsContent value="legal" className="space-y-6">
        {loadingLegal ? (
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            {/* Impressum */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="h-5 w-5" />
                  Impressum
                </CardTitle>
                <CardDescription>
                  Impressum-Text (Markdown wird unterstuetzt)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  id="legal-impressum"
                  placeholder="# Impressum&#10;&#10;Angaben gemaess 5 TMG:&#10;&#10;Firmenname GmbH&#10;Strasse 1&#10;12345 Stadt&#10;..."
                  value={legal.impressum}
                  rows={12}
                  className="font-mono text-sm"
                  onChange={(e) =>
                    setLegal((prev) => ({
                      ...prev,
                      impressum: e.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Markdown-Formatierung wird unterstuetzt: **fett**, *kursiv*,
                  # Überschriften, - Listen
                </p>
                <div className="flex justify-end">
                  <Button
                    onClick={() => saveLegalPage("impressum")}
                    disabled={savingLegal === "impressum"}
                  >
                    {savingLegal === "impressum" && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Impressum speichern
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Datenschutz */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="h-5 w-5" />
                  Datenschutzerklärung
                </CardTitle>
                <CardDescription>
                  Datenschutzerklärung (Markdown wird unterstuetzt)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  id="legal-datenschutz"
                  placeholder="# Datenschutzerklärung&#10;&#10;## 1. Datenschutz auf einen Blick&#10;&#10;### Allgemeine Hinweise&#10;..."
                  value={legal.datenschutz}
                  rows={12}
                  className="font-mono text-sm"
                  onChange={(e) =>
                    setLegal((prev) => ({
                      ...prev,
                      datenschutz: e.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Markdown-Formatierung wird unterstuetzt: **fett**, *kursiv*,
                  # Überschriften, - Listen
                </p>
                <div className="flex justify-end">
                  <Button
                    onClick={() => saveLegalPage("datenschutz")}
                    disabled={savingLegal === "datenschutz"}
                  >
                    {savingLegal === "datenschutz" && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Datenschutzerklärung speichern
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
