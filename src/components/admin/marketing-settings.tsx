"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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
  GripVertical,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  MessageSquareQuote,
  Workflow,
  Package,
  Shield,
  Building2,
  LayoutDashboard,
  Receipt,
  Upload,
  Send,
  Download,
  FileCheck,
  Mail,
  Settings,
  RefreshCw,
  Zap,
  FolderSync,
  Inbox,
  ContactRound,
  ScanLine,
  FileBarChart,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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

import type {
  MarketingConfig,
  LegalPages,
  FeatureConfig,
  StatConfig,
  TestimonialConfig,
  WorkflowStepConfig,
  ModuleConfig,
  SectionId,
} from "@/lib/marketing/types";
import { SECTION_LABELS } from "@/lib/marketing/types";
import { DEFAULT_MARKETING_CONFIG, DEFAULT_SECTION_ORDER } from "@/lib/marketing/defaults";

// ---------------------------------------------------------------------------
// Icon options for features
// ---------------------------------------------------------------------------

const FEATURE_ICON_OPTIONS = [
  { value: "activity", label: "SCADA/Aktivität", icon: Activity },
  { value: "credit-card", label: "Abrechnung", icon: CreditCard },
  { value: "users", label: "Portal/Benutzer", icon: Users },
  { value: "check-square", label: "Compliance", icon: CheckSquare },
  { value: "layers", label: "Multi-Tenant", icon: Layers },
  { value: "bar-chart", label: "Reporting", icon: BarChart },
  { value: "shield", label: "Sicherheit", icon: Shield },
  { value: "building", label: "Gebäude", icon: Building2 },
  { value: "layout-dashboard", label: "Dashboard", icon: LayoutDashboard },
  { value: "receipt", label: "Rechnung", icon: Receipt },
  { value: "zap", label: "Schnell", icon: Zap },
  { value: "settings", label: "Einstellungen", icon: Settings },
] as const;

const WORKFLOW_ICON_OPTIONS = [
  { value: "upload", label: "Upload", icon: Upload },
  { value: "calculator", label: "Berechnen", icon: Calculator },
  { value: "send", label: "Senden", icon: Send },
  { value: "download", label: "Download", icon: Download },
  { value: "file-check", label: "Prüfen", icon: FileCheck },
  { value: "bar-chart", label: "Bericht", icon: BarChart },
  { value: "mail", label: "E-Mail", icon: Mail },
  { value: "shield", label: "Sicherheit", icon: Shield },
  { value: "zap", label: "Schnell", icon: Zap },
  { value: "settings", label: "Einstellungen", icon: Settings },
  { value: "eye", label: "Ansicht", icon: Eye },
  { value: "refresh-cw", label: "Aktualisieren", icon: RefreshCw },
] as const;

const MODULE_ICON_OPTIONS = [
  { value: "calculator", label: "Buchhaltung", icon: Calculator },
  { value: "folder-sync", label: "Dokument-Routing", icon: FolderSync },
  { value: "inbox", label: "Rechnungseingang", icon: Inbox },
  { value: "contact-round", label: "CRM", icon: ContactRound },
  { value: "mail", label: "Serienbriefe", icon: Mail },
  { value: "scan", label: "Paperless", icon: ScanLine },
  { value: "file-bar-chart", label: "Wirtschaftsplan", icon: FileBarChart },
  { value: "briefcase", label: "Betriebsführung", icon: Briefcase },
  { value: "zap", label: "Schnell", icon: Zap },
  { value: "shield", label: "Sicherheit", icon: Shield },
  { value: "bar-chart", label: "Reporting", icon: BarChart },
  { value: "settings", label: "Einstellungen", icon: Settings },
  { value: "activity", label: "Aktivität", icon: Activity },
  { value: "credit-card", label: "Bezahlung", icon: CreditCard },
  { value: "users", label: "Benutzer", icon: Users },
  { value: "layout-dashboard", label: "Dashboard", icon: LayoutDashboard },
  { value: "receipt", label: "Rechnung", icon: Receipt },
  { value: "building", label: "Gebäude", icon: Building2 },
] as const;

// ---------------------------------------------------------------------------
// Helper: resolve icon component from name
// ---------------------------------------------------------------------------

const ALL_ICONS: Record<string, React.ElementType> = {
  activity: Activity, "credit-card": CreditCard, users: Users,
  "check-square": CheckSquare, layers: Layers, "bar-chart": BarChart,
  shield: Shield, building: Building2, "layout-dashboard": LayoutDashboard,
  receipt: Receipt, zap: Zap, settings: Settings, upload: Upload,
  calculator: Calculator, send: Send, download: Download,
  "file-check": FileCheck, mail: Mail, eye: Eye, "refresh-cw": RefreshCw,
  "folder-sync": FolderSync, inbox: Inbox, "contact-round": ContactRound,
  scan: ScanLine, "file-bar-chart": FileBarChart, briefcase: Briefcase,
};

function getIcon(name: string) {
  return ALL_ICONS[name] ?? Zap;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MarketingSettings() {
  const t = useTranslations("admin.marketingSettingsUI");
  const [config, setConfig] = useState<MarketingConfig>(DEFAULT_MARKETING_CONFIG);
  const [legal, setLegal] = useState<LegalPages>({ impressum: "", datenschutz: "", cookies: "" });
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingLegal, setLoadingLegal] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingLegal, setSavingLegal] = useState<"impressum" | "datenschutz" | "cookies" | null>(null);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchConfig = useCallback(async () => {
    try {
      setLoadingConfig(true);
      const response = await fetch("/api/admin/marketing-config");
      if (response.ok) {
        const data = await response.json();
        setConfig({
          sections: data.sections ?? DEFAULT_MARKETING_CONFIG.sections,
          hero: data.hero ?? DEFAULT_MARKETING_CONFIG.hero,
          trustBar: data.trustBar ?? DEFAULT_MARKETING_CONFIG.trustBar,
          features: data.features ?? DEFAULT_MARKETING_CONFIG.features,
          showcase: data.showcase ?? DEFAULT_MARKETING_CONFIG.showcase,
          stats: data.stats ?? DEFAULT_MARKETING_CONFIG.stats,
          workflow: data.workflow ?? DEFAULT_MARKETING_CONFIG.workflow,
          modules: data.modules ?? DEFAULT_MARKETING_CONFIG.modules,
          pricing: data.pricing ?? DEFAULT_MARKETING_CONFIG.pricing,
          testimonials: data.testimonials ?? DEFAULT_MARKETING_CONFIG.testimonials,
          cta: data.cta ?? DEFAULT_MARKETING_CONFIG.cta,
        });
      }
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoadingConfig(false);
    }
  }, [t]);

  const fetchLegal = useCallback(async () => {
    try {
      setLoadingLegal(true);
      const response = await fetch("/api/admin/legal-pages");
      if (response.ok) {
        const data = await response.json();
        setLegal({
          impressum: data.impressum ?? "",
          datenschutz: data.datenschutz ?? "",
          cookies: data.cookies ?? "",
        });
      }
    } catch {
      toast.error(t("loadLegalError"));
    } finally {
      setLoadingLegal(false);
    }
  }, [t]);

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
      const response = await fetch("/api/admin/marketing-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t("saveError"));
      }

      toast.success(t("saved"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("saveError")
      );
    } finally {
      setSavingConfig(false);
    }
  }

  async function saveLegalPage(page: "impressum" | "datenschutz" | "cookies") {
    try {
      setSavingLegal(page);
      const response = await fetch("/api/admin/legal-pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(legal),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t("saveError"));
      }

      const label = page === "impressum" ? "Impressum" : page === "datenschutz" ? "Datenschutzerklärung" : "Cookie-Richtlinie";
      toast.success(t("savedLabel", { label }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("saveError")
      );
    } finally {
      setSavingLegal(null);
    }
  }

  // -----------------------------------------------------------------------
  // Save button (reusable)
  // -----------------------------------------------------------------------

  function SaveButton() {
    return (
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={saveConfig} disabled={savingConfig}>
          {savingConfig && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Speichern
        </Button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Section ordering helpers
  // -----------------------------------------------------------------------

  function moveSectionUp(idx: number) {
    if (idx === 0) return;
    setConfig((prev) => {
      const arr = [...prev.sections];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return { ...prev, sections: arr };
    });
  }

  function moveSectionDown(idx: number) {
    setConfig((prev) => {
      if (idx >= prev.sections.length - 1) return prev;
      const arr = [...prev.sections];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return { ...prev, sections: arr };
    });
  }

  function toggleSection(id: SectionId) {
    setConfig((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s
      ),
    }));
  }

  function resetSectionOrder() {
    setConfig((prev) => ({ ...prev, sections: DEFAULT_SECTION_ORDER }));
  }

  // -----------------------------------------------------------------------
  // Feature helpers
  // -----------------------------------------------------------------------

  function addFeature() {
    if (config.features.length >= 12) {
      toast.error(t("maxFeatures"));
      return;
    }
    setConfig((prev) => ({
      ...prev,
      features: [...prev.features, { icon: "activity", title: "", description: "" }],
    }));
  }

  function updateFeature(idx: number, field: keyof FeatureConfig, value: string) {
    setConfig((prev) => ({
      ...prev,
      features: prev.features.map((f, i) => (i === idx ? { ...f, [field]: value } : f)),
    }));
  }

  function removeFeature(idx: number) {
    setConfig((prev) => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== idx),
    }));
  }

  // -----------------------------------------------------------------------
  // Stats helpers
  // -----------------------------------------------------------------------

  function addStat() {
    if (config.stats.items.length >= 6) {
      toast.error(t("maxStats"));
      return;
    }
    setConfig((prev) => ({
      ...prev,
      stats: { ...prev.stats, items: [...prev.stats.items, { end: 0, suffix: "", label: "" }] },
    }));
  }

  function updateStat(idx: number, field: keyof StatConfig, value: string | number) {
    setConfig((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        items: prev.stats.items.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
      },
    }));
  }

  function removeStat(idx: number) {
    setConfig((prev) => ({
      ...prev,
      stats: { ...prev.stats, items: prev.stats.items.filter((_, i) => i !== idx) },
    }));
  }

  // -----------------------------------------------------------------------
  // Testimonial helpers
  // -----------------------------------------------------------------------

  function addTestimonial() {
    if (config.testimonials.items.length >= 6) {
      toast.error(t("maxTestimonials"));
      return;
    }
    setConfig((prev) => ({
      ...prev,
      testimonials: {
        ...prev.testimonials,
        items: [...prev.testimonials.items, { initials: "", name: "", role: "", company: "", quote: "" }],
      },
    }));
  }

  function updateTestimonial(idx: number, field: keyof TestimonialConfig, value: string) {
    setConfig((prev) => ({
      ...prev,
      testimonials: {
        ...prev.testimonials,
        items: prev.testimonials.items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
      },
    }));
  }

  function removeTestimonial(idx: number) {
    setConfig((prev) => ({
      ...prev,
      testimonials: {
        ...prev.testimonials,
        items: prev.testimonials.items.filter((_, i) => i !== idx),
      },
    }));
  }

  // -----------------------------------------------------------------------
  // Workflow helpers
  // -----------------------------------------------------------------------

  function addWorkflowStep() {
    if (config.workflow.steps.length >= 5) {
      toast.error(t("maxWorkflowSteps"));
      return;
    }
    setConfig((prev) => ({
      ...prev,
      workflow: {
        ...prev.workflow,
        steps: [...prev.workflow.steps, { icon: "upload", title: "", description: "" }],
      },
    }));
  }

  function updateWorkflowStep(idx: number, field: keyof WorkflowStepConfig, value: string) {
    setConfig((prev) => ({
      ...prev,
      workflow: {
        ...prev.workflow,
        steps: prev.workflow.steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
      },
    }));
  }

  function removeWorkflowStep(idx: number) {
    setConfig((prev) => ({
      ...prev,
      workflow: { ...prev.workflow, steps: prev.workflow.steps.filter((_, i) => i !== idx) },
    }));
  }

  // -----------------------------------------------------------------------
  // Module helpers
  // -----------------------------------------------------------------------

  function addModule() {
    if (config.modules.items.length >= 12) {
      toast.error(t("maxModules"));
      return;
    }
    const newId = `mod-${Date.now()}`;
    setConfig((prev) => ({
      ...prev,
      modules: {
        ...prev.modules,
        items: [...prev.modules.items, { id: newId, icon: "zap", title: "", description: "" }],
      },
    }));
  }

  function updateModule(idx: number, field: keyof ModuleConfig, value: string | undefined) {
    setConfig((prev) => ({
      ...prev,
      modules: {
        ...prev.modules,
        items: prev.modules.items.map((m, i) => (i === idx ? { ...m, [field]: value } : m)),
      },
    }));
  }

  function removeModule(idx: number) {
    setConfig((prev) => ({
      ...prev,
      modules: { ...prev.modules, items: prev.modules.items.filter((_, i) => i !== idx) },
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
  // Icon select helper
  // -----------------------------------------------------------------------

  function IconSelect({
    value,
    onChange,
    options,
    id,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: ReadonlyArray<{ value: string; label: string; icon: React.ElementType }>;
    id: string;
  }) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Icon wählen" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <span className="flex items-center gap-2">
                <opt.icon className="h-4 w-4" />
                {opt.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Tabs defaultValue="sections" className="space-y-6">
      <TabsList className="flex flex-wrap h-auto gap-1">
        <TabsTrigger value="sections" className="flex items-center gap-2">
          <GripVertical className="h-4 w-4" />
          Sektionen
        </TabsTrigger>
        <TabsTrigger value="hero" className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Hero
        </TabsTrigger>
        <TabsTrigger value="features" className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4" />
          Features
        </TabsTrigger>
        <TabsTrigger value="stats" className="flex items-center gap-2">
          <BarChart className="h-4 w-4" />
          Statistiken
        </TabsTrigger>
        <TabsTrigger value="workflow" className="flex items-center gap-2">
          <Workflow className="h-4 w-4" />
          Workflow
        </TabsTrigger>
        <TabsTrigger value="modules" className="flex items-center gap-2">
          <Package className="h-4 w-4" />
          Module
        </TabsTrigger>
        <TabsTrigger value="testimonials" className="flex items-center gap-2">
          <MessageSquareQuote className="h-4 w-4" />
          Kundenstimmen
        </TabsTrigger>
        <TabsTrigger value="pricing" className="flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          Preisrechner
        </TabsTrigger>
        <TabsTrigger value="cta" className="flex items-center gap-2">
          <Megaphone className="h-4 w-4" />
          CTA
        </TabsTrigger>
        <TabsTrigger value="legal" className="flex items-center gap-2">
          <Scale className="h-4 w-4" />
          Rechtliches
        </TabsTrigger>
      </TabsList>

      {/* ================================================================ */}
      {/* Tab: Sektionen (ordering + toggle)                               */}
      {/* ================================================================ */}
      <TabsContent value="sections" className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <GripVertical className="h-5 w-5" />
                  Sektionen verwalten
                </CardTitle>
                <CardDescription>
                  Reihenfolge und Sichtbarkeit der Landingpage-Sektionen steuern
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={resetSectionOrder}>
                Zurücksetzen
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {config.sections.map((section, idx) => (
              <div
                key={section.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  section.enabled ? "bg-card border-border" : "bg-muted/50 border-border/50 opacity-60"
                }`}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm font-medium">
                  {SECTION_LABELS[section.id]}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveSectionUp(idx)}
                    disabled={idx === 0}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveSectionDown(idx)}
                    disabled={idx === config.sections.length - 1}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Switch
                  checked={section.enabled}
                  onCheckedChange={() => toggleSection(section.id)}
                  aria-label={`${SECTION_LABELS[section.id]} ${section.enabled ? "deaktivieren" : "aktivieren"}`}
                />
                {section.enabled ? (
                  <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <EyeOff className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
            ))}
            <SaveButton />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ================================================================ */}
      {/* Tab: Hero                                                        */}
      {/* ================================================================ */}
      <TabsContent value="hero" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Hero-Bereich
            </CardTitle>
            <CardDescription>Titel und Untertitel der Landingpage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="hero-title">Titel</Label>
                <span className="text-xs text-muted-foreground">{config.hero.title.length}/200</span>
              </div>
              <Input
                id="hero-title"
                placeholder="z.B. Die Zukunft der Windpark-Verwaltung"
                value={config.hero.title}
                maxLength={200}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, hero: { ...prev.hero, title: e.target.value } }))
                }
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="hero-subtitle">Untertitel</Label>
                <span className="text-xs text-muted-foreground">{config.hero.subtitle.length}/500</span>
              </div>
              <Textarea
                id="hero-subtitle"
                placeholder="Beschreibung für den Hero-Bereich"
                value={config.hero.subtitle}
                maxLength={500}
                rows={3}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, hero: { ...prev.hero, subtitle: e.target.value } }))
                }
              />
            </div>
            <SaveButton />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ================================================================ */}
      {/* Tab: Features                                                    */}
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
                <CardDescription>Feature-Karten auf der Landingpage (max. 12)</CardDescription>
              </div>
              <Button onClick={addFeature} disabled={config.features.length >= 12} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Hinzufügen
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {config.features.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <LayoutGrid className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">Keine Features vorhanden</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {config.features.map((feature, idx) => {
                  const IconComp = getIcon(feature.icon);
                  return (
                    <Card key={idx} className="relative">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <IconComp className="h-4 w-4" />
                            Feature {idx + 1}
                          </div>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeFeature(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-1.5">
                          <Label>Icon</Label>
                          <IconSelect
                            id={`feat-icon-${idx}`}
                            value={feature.icon}
                            onChange={(v) => updateFeature(idx, "icon", v)}
                            options={FEATURE_ICON_OPTIONS}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Titel</Label>
                          <Input
                            placeholder="Feature-Titel"
                            value={feature.title}
                            onChange={(e) => updateFeature(idx, "title", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Beschreibung</Label>
                          <Textarea
                            placeholder="Kurze Beschreibung"
                            value={feature.description}
                            rows={2}
                            onChange={(e) => updateFeature(idx, "description", e.target.value)}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
            <SaveButton />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ================================================================ */}
      {/* Tab: Statistiken                                                 */}
      {/* ================================================================ */}
      <TabsContent value="stats" className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart className="h-5 w-5" />
                  Statistiken
                </CardTitle>
                <CardDescription>Animierte Zahlenwerte im dunklen Balken (max. 6)</CardDescription>
              </div>
              <Button onClick={addStat} disabled={config.stats.items.length >= 6} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Hinzufügen
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {config.stats.items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">Keine Statistiken vorhanden</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {config.stats.items.map((stat, idx) => (
                  <Card key={idx} className="relative">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Statistik {idx + 1}</span>
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeStat(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label>Zielwert</Label>
                          <Input
                            type="number"
                            min={0}
                            value={stat.end || ""}
                            onChange={(e) => updateStat(idx, "end", parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Prefix</Label>
                          <Input
                            placeholder="z.B. €"
                            value={stat.prefix ?? ""}
                            maxLength={10}
                            onChange={(e) => updateStat(idx, "prefix", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Suffix</Label>
                          <Input
                            placeholder="z.B. +"
                            value={stat.suffix}
                            maxLength={10}
                            onChange={(e) => updateStat(idx, "suffix", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Label</Label>
                        <Input
                          placeholder="z.B. Windparks"
                          value={stat.label}
                          onChange={(e) => updateStat(idx, "label", e.target.value)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            <SaveButton />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ================================================================ */}
      {/* Tab: Workflow                                                    */}
      {/* ================================================================ */}
      <TabsContent value="workflow" className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Workflow className="h-5 w-5" />
                  Workflow-Schritte
                </CardTitle>
                <CardDescription>&quot;So einfach funktioniert es&quot; — max. 5 Schritte</CardDescription>
              </div>
              <Button onClick={addWorkflowStep} disabled={config.workflow.steps.length >= 5} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Hinzufügen
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Überschrift</Label>
                <Input
                  value={config.workflow.title}
                  maxLength={200}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, workflow: { ...prev.workflow, title: e.target.value } }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Untertitel</Label>
                <Input
                  value={config.workflow.subtitle}
                  maxLength={500}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, workflow: { ...prev.workflow, subtitle: e.target.value } }))
                  }
                />
              </div>
            </div>

            {config.workflow.steps.map((step, idx) => {
              const StepIcon = getIcon(step.icon);
              return (
                <Card key={idx}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <StepIcon className="h-4 w-4" />
                        Schritt {idx + 1}
                      </div>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeWorkflowStep(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Icon</Label>
                        <IconSelect
                          id={`wf-icon-${idx}`}
                          value={step.icon}
                          onChange={(v) => updateWorkflowStep(idx, "icon", v)}
                          options={WORKFLOW_ICON_OPTIONS}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Titel</Label>
                        <Input
                          value={step.title}
                          onChange={(e) => updateWorkflowStep(idx, "title", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Beschreibung</Label>
                      <Textarea
                        value={step.description}
                        rows={2}
                        onChange={(e) => updateWorkflowStep(idx, "description", e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            <SaveButton />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ================================================================ */}
      {/* Tab: Module                                                      */}
      {/* ================================================================ */}
      <TabsContent value="modules" className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Module & Addons
                </CardTitle>
                <CardDescription>Verfügbare Module auf der Landingpage (max. 12)</CardDescription>
              </div>
              <Button onClick={addModule} disabled={config.modules.items.length >= 12} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Hinzufügen
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Überschrift</Label>
                <Input
                  value={config.modules.title}
                  maxLength={200}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, modules: { ...prev.modules, title: e.target.value } }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Untertitel</Label>
                <Input
                  value={config.modules.subtitle}
                  maxLength={500}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, modules: { ...prev.modules, subtitle: e.target.value } }))
                  }
                />
              </div>
            </div>

            {config.modules.items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">Keine Module vorhanden</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {config.modules.items.map((mod, idx) => {
                  const ModIcon = getIcon(mod.icon);
                  return (
                    <Card key={idx} className="relative">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <ModIcon className="h-4 w-4" />
                            Modul {idx + 1}
                          </div>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeModule(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>Icon</Label>
                            <IconSelect
                              id={`mod-icon-${idx}`}
                              value={mod.icon}
                              onChange={(v) => updateModule(idx, "icon", v)}
                              options={MODULE_ICON_OPTIONS}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>ID</Label>
                            <Input
                              value={mod.id}
                              placeholder="z.B. accounting"
                              onChange={(e) => updateModule(idx, "id", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Titel</Label>
                          <Input
                            value={mod.title}
                            onChange={(e) => updateModule(idx, "title", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Beschreibung</Label>
                          <Textarea
                            value={mod.description}
                            rows={2}
                            onChange={(e) => updateModule(idx, "description", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Badge (optional)</Label>
                          <Input
                            placeholder="z.B. Neu"
                            value={mod.badge ?? ""}
                            maxLength={30}
                            onChange={(e) => updateModule(idx, "badge", e.target.value || undefined)}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
            <SaveButton />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ================================================================ */}
      {/* Tab: Kundenstimmen                                               */}
      {/* ================================================================ */}
      <TabsContent value="testimonials" className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquareQuote className="h-5 w-5" />
                  Kundenstimmen
                </CardTitle>
                <CardDescription>Zitate von Kunden auf der Landingpage (max. 6)</CardDescription>
              </div>
              <Button onClick={addTestimonial} disabled={config.testimonials.items.length >= 6} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Hinzufügen
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1.5">
              <Label>Überschrift</Label>
              <Input
                value={config.testimonials.title}
                maxLength={200}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, testimonials: { ...prev.testimonials, title: e.target.value } }))
                }
              />
            </div>

            {config.testimonials.items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquareQuote className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">Keine Kundenstimmen vorhanden</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {config.testimonials.items.map((t, idx) => (
                  <Card key={idx} className="relative">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Kundenstimme {idx + 1}</span>
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeTestimonial(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Initialen</Label>
                          <Input
                            placeholder="z.B. TM"
                            value={t.initials}
                            maxLength={5}
                            onChange={(e) => updateTestimonial(idx, "initials", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Name</Label>
                          <Input
                            value={t.name}
                            onChange={(e) => updateTestimonial(idx, "name", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Position</Label>
                          <Input
                            placeholder="z.B. Geschäftsführer"
                            value={t.role}
                            onChange={(e) => updateTestimonial(idx, "role", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Unternehmen</Label>
                          <Input
                            value={t.company}
                            onChange={(e) => updateTestimonial(idx, "company", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Zitat</Label>
                        <Textarea
                          value={t.quote}
                          rows={2}
                          maxLength={500}
                          onChange={(e) => updateTestimonial(idx, "quote", e.target.value)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            <SaveButton />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ================================================================ */}
      {/* Tab: Preisrechner                                                */}
      {/* ================================================================ */}
      <TabsContent value="pricing" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Preisrechner-Konfiguration
            </CardTitle>
            <CardDescription>Parameter für den Preiskalkulator auf der Landingpage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pricing-base">Basispreis (EUR/Monat)</Label>
                <Input
                  id="pricing-base" type="number" min={0} step={0.01}
                  value={config.pricing.basePrice || ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      pricing: { ...prev.pricing, basePrice: parseFloat(e.target.value) || 0 },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricing-turbine">Preis pro Turbine (EUR/Monat)</Label>
                <Input
                  id="pricing-turbine" type="number" min={0} step={0.01}
                  value={config.pricing.turbinePrice || ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      pricing: { ...prev.pricing, turbinePrice: parseFloat(e.target.value) || 0 },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricing-user">Preis pro Benutzer (EUR/Monat)</Label>
                <Input
                  id="pricing-user" type="number" min={0} step={0.01}
                  value={config.pricing.userPrice || ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      pricing: { ...prev.pricing, userPrice: parseFloat(e.target.value) || 0 },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricing-discount">Jahresrabatt (%)</Label>
                <Input
                  id="pricing-discount" type="number" min={0} max={100} step={1}
                  value={config.pricing.annualDiscountPercent || ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      pricing: { ...prev.pricing, annualDiscountPercent: parseFloat(e.target.value) || 0 },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricing-max-turbines">Max. Turbinen (Slider)</Label>
                <Input
                  id="pricing-max-turbines" type="number" min={1} step={1}
                  value={config.pricing.maxTurbines || ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      pricing: { ...prev.pricing, maxTurbines: parseInt(e.target.value) || 0 },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricing-max-users">Max. Benutzer (Slider)</Label>
                <Input
                  id="pricing-max-users" type="number" min={1} step={1}
                  value={config.pricing.maxUsers || ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      pricing: { ...prev.pricing, maxUsers: parseInt(e.target.value) || 0 },
                    }))
                  }
                />
              </div>
            </div>
            <SaveButton />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ================================================================ */}
      {/* Tab: CTA                                                         */}
      {/* ================================================================ */}
      <TabsContent value="cta" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Call-to-Action-Bereich
            </CardTitle>
            <CardDescription>Titel und Untertitel des CTA-Bereichs am Ende der Seite</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cta-title">Titel</Label>
                <span className="text-xs text-muted-foreground">{config.cta.title.length}/200</span>
              </div>
              <Input
                id="cta-title"
                placeholder="z.B. Bereit für die Zukunft?"
                value={config.cta.title}
                maxLength={200}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, cta: { ...prev.cta, title: e.target.value } }))
                }
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cta-subtitle">Untertitel</Label>
                <span className="text-xs text-muted-foreground">{config.cta.subtitle.length}/500</span>
              </div>
              <Textarea
                id="cta-subtitle"
                placeholder="Beschreibung für den CTA-Bereich"
                value={config.cta.subtitle}
                maxLength={500}
                rows={3}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, cta: { ...prev.cta, subtitle: e.target.value } }))
                }
              />
            </div>
            <SaveButton />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ================================================================ */}
      {/* Tab: Rechtliches                                                 */}
      {/* ================================================================ */}
      <TabsContent value="legal" className="space-y-6">
        {loadingLegal ? (
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            {(["impressum", "datenschutz", "cookies"] as const).map((page) => {
              const labels = {
                impressum: "Impressum",
                datenschutz: "Datenschutzerklärung",
                cookies: "Cookie-Richtlinie",
              };
              return (
                <Card key={page}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Scale className="h-5 w-5" />
                      {labels[page]}
                    </CardTitle>
                    <CardDescription>HTML/Markdown wird unterstützt</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      value={legal[page]}
                      rows={12}
                      className="font-mono text-sm"
                      onChange={(e) => setLegal((prev) => ({ ...prev, [page]: e.target.value }))}
                    />
                    <div className="flex justify-end">
                      <Button onClick={() => saveLegalPage(page)} disabled={savingLegal === page}>
                        {savingLegal === page && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {labels[page]} speichern
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
