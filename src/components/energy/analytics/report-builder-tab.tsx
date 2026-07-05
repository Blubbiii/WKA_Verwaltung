"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Download,
  Loader2,
  BookMarked,
  Trash2,
  FileText,
  Save,
  GripVertical,
  Settings,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import { ANALYTICS_MODULES } from "@/types/analytics";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDebounce } from "@/hooks/useDebounce";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ReportLivePreview } from "./report-live-preview";

// =============================================================================
// Types & Constants
// =============================================================================

interface Park {
  id: string;
  name: string;
}

interface ReportConfig {
  id: string;
  name: string;
  description: string | null;
  modules: string[];
  moduleOrder: string[];
  moduleSettings: Record<string, ModuleSettings>;
  interval: string;
  park: { id: string; name: string } | null;
}

// Per-module settings shape (all optional — modules use only what they support)
interface ModuleSettings {
  compareYear?: number | null;
  turbineIds?: string[];
}

const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

// Classic report modules (matches create-report-dialog.tsx)
const CLASSIC_MODULES: Record<string, string> = {
  kpiSummary: "KPI-Zusammenfassung",
  production: "Produktion",
  powerCurve: "Leistungskurve",
  windRose: "Windrose",
  dailyProfile: "Tagesverlauf",
  turbineComparison: "Anlagenvergleich (klassisch)",
};

// Group analytics modules for display (same logic as create-report-dialog.tsx)
const MODULE_GROUPS = (() => {
  const groups = new Map<string, Array<{ key: string; label: string }>>();
  for (const [key, meta] of Object.entries(ANALYTICS_MODULES)) {
    const arr = groups.get(meta.group) || [];
    arr.push({ key, label: meta.label });
    groups.set(meta.group, arr);
  }
  return groups;
})();

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

const TOTAL_MODULE_COUNT =
  Object.keys(ANALYTICS_MODULES).length + Object.keys(CLASSIC_MODULES).length;

// Per-module config schema — declares which options each module supports.
// Modules not listed here fall back to "compareYear only".
const MODULE_CONFIG_SCHEMA: Record<
  string,
  { supportsCompareYear: boolean; supportsTurbineFilter: boolean }
> = {
  performanceKpis: { supportsCompareYear: true, supportsTurbineFilter: true },
  productionHeatmap: { supportsCompareYear: false, supportsTurbineFilter: true },
  turbineRanking: { supportsCompareYear: false, supportsTurbineFilter: true },
  yearOverYear: { supportsCompareYear: true, supportsTurbineFilter: false },
  availabilityBreakdown: { supportsCompareYear: false, supportsTurbineFilter: true },
  availabilityTrend: { supportsCompareYear: true, supportsTurbineFilter: false },
  availabilityHeatmap: { supportsCompareYear: false, supportsTurbineFilter: true },
  downtimePareto: { supportsCompareYear: false, supportsTurbineFilter: false },
  turbineComparison: { supportsCompareYear: false, supportsTurbineFilter: true },
  powerCurveOverlay: { supportsCompareYear: false, supportsTurbineFilter: true },
  faultPareto: { supportsCompareYear: false, supportsTurbineFilter: false },
  warningTrend: { supportsCompareYear: true, supportsTurbineFilter: false },
  windDistribution: { supportsCompareYear: false, supportsTurbineFilter: false },
  environmentalData: { supportsCompareYear: false, supportsTurbineFilter: false },
  financialOverview: { supportsCompareYear: true, supportsTurbineFilter: true },
  revenueComparison: { supportsCompareYear: true, supportsTurbineFilter: false },
  curtailmentAnalysis: { supportsCompareYear: true, supportsTurbineFilter: false },
  reactivePowerQuality: { supportsCompareYear: true, supportsTurbineFilter: true },
  meteoExtended: { supportsCompareYear: false, supportsTurbineFilter: false },
};

function getModuleLabel(key: string): string {
  if (key in ANALYTICS_MODULES) {
    return ANALYTICS_MODULES[key as keyof typeof ANALYTICS_MODULES].label;
  }
  return CLASSIC_MODULES[key] ?? key;
}

// =============================================================================
// SortableItem — one draggable module row
// =============================================================================

function SortableModuleItem({
  id,
  label,
  isActive,
  onSelectConfig,
  onRemove,
}: {
  id: string;
  label: string;
  isActive: boolean;
  onSelectConfig: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border bg-background p-2 text-sm ${
        isActive ? "border-primary ring-1 ring-primary/40" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        aria-label="Ziehen zum Umsortieren"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 truncate">{label}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onSelectConfig}
        aria-label={`Konfiguration für ${label}`}
      >
        <Settings className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label={`${label} entfernen`}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function ReportBuilderTab() {
  const t = useTranslations("energy.componentToasts");
  const [parks, setParks] = useState<Park[]>([]);
  const [turbines, setTurbines] = useState<Array<{ id: string; designation: string; parkId: string }>>([]);
  const [templates, setTemplates] = useState<ReportConfig[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // New report state
  const [parkId, setParkId] = useState("all");
  const [year, setYear] = useState(currentYear.toString());
  const [month, setMonth] = useState("all");

  // Selection + ordering
  const [selectedModules, setSelectedModules] = useState<Set<string>>(
    new Set(["performanceKpis", "availabilityBreakdown", "faultPareto"])
  );
  const [moduleOrder, setModuleOrder] = useState<string[]>([
    "performanceKpis",
    "availabilityBreakdown",
    "faultPareto",
  ]);

  // Per-module settings
  const [moduleSettings, setModuleSettings] = useState<Record<string, ModuleSettings>>({});
  const [activeConfigModule, setActiveConfigModule] = useState<string | null>(null);

  // Live preview toggle (mobile) / always on for lg+
  const [previewVisible, setPreviewVisible] = useState(true);

  const [generating, setGenerating] = useState(false);

  // Save as template state
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saving, setSaving] = useState(false);

  // Per-template generating / delete state
  const [generatingTemplate, setGeneratingTemplate] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Per-template park / year selectors
  const [templateParks, setTemplateParks] = useState<Record<string, string>>({});
  const [templateYears, setTemplateYears] = useState<Record<string, string>>({});

  // ---------------------------------------------------------------------------
  // dnd-kit sensors
  // ---------------------------------------------------------------------------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/energy/reports/configs");
      if (res.ok) {
        const json = await res.json();
        setTemplates(Array.isArray(json.data) ? json.data : []);
      }
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/parks?limit=100")
      .then((r) => r.json())
      .then((d) => setParks(d.data || []))
      .catch(() => {});
    fetch("/api/turbines?limit=500")
      .then((r) => r.json())
      .then((d) => setTurbines(d.data || []))
      .catch(() => {});
    loadTemplates();
  }, [loadTemplates]);

  // ---------------------------------------------------------------------------
  // Sync moduleOrder <-> selectedModules
  // ---------------------------------------------------------------------------

  const toggleModule = (key: string) => {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setModuleOrder((order) => order.filter((k) => k !== key));
        // If the removed one was the active config, clear it
        setActiveConfigModule((current) => (current === key ? null : current));
      } else {
        next.add(key);
        setModuleOrder((order) => (order.includes(key) ? order : [...order, key]));
      }
      return next;
    });
  };

  const toggleGroup = (items: Array<{ key: string }>) => {
    const allOn = items.every((m) => selectedModules.has(m.key));
    if (allOn) {
      // Turn all off
      setSelectedModules((prev) => {
        const next = new Set(prev);
        for (const m of items) next.delete(m.key);
        return next;
      });
      const keys = new Set(items.map((m) => m.key));
      setModuleOrder((order) => order.filter((k) => !keys.has(k)));
      setActiveConfigModule((current) => (current && keys.has(current) ? null : current));
    } else {
      // Turn all on
      setSelectedModules((prev) => {
        const next = new Set(prev);
        for (const m of items) next.add(m.key);
        return next;
      });
      setModuleOrder((order) => {
        const orderSet = new Set(order);
        const additions = items.map((m) => m.key).filter((k) => !orderSet.has(k));
        return [...order, ...additions];
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setModuleOrder((order) => {
      const oldIdx = order.indexOf(String(active.id));
      const newIdx = order.indexOf(String(over.id));
      if (oldIdx === -1 || newIdx === -1) return order;
      return arrayMove(order, oldIdx, newIdx);
    });
  };

  const updateModuleSettings = (
    moduleKey: string,
    patch: Partial<ModuleSettings>
  ) => {
    setModuleSettings((prev) => ({
      ...prev,
      [moduleKey]: { ...prev[moduleKey], ...patch },
    }));
  };

  // ---------------------------------------------------------------------------
  // Debounced preview data (500 ms after last change)
  // ---------------------------------------------------------------------------

  const modulesForPreview = useMemo(
    () => (moduleOrder.length > 0 ? moduleOrder : Array.from(selectedModules)),
    [moduleOrder, selectedModules]
  );
  const debouncedModulesForPreview = useDebounce(modulesForPreview, 500);
  const debouncedYear = useDebounce(year, 500);
  const debouncedMonth = useDebounce(month, 500);
  const debouncedParkId = useDebounce(parkId, 500);

  const previewParkName = useMemo(() => {
    if (debouncedParkId === "all") return "Alle Parks";
    const p = parks.find((x) => x.id === debouncedParkId);
    return p?.name ?? "Vorschau";
  }, [debouncedParkId, parks]);

  // ---------------------------------------------------------------------------
  // PDF download helper
  // ---------------------------------------------------------------------------

  const downloadPdf = async (
    body: Record<string, unknown>,
    fallbackFilename: string,
    label: string,
    setLoading: (v: boolean) => void
  ) => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Fehler" }));
        throw new Error(err.error || "Fehler beim Generieren");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      const match = cd?.match(/filename="(.+)"/);
      const filename = match?.[1] || fallbackFilename;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("reportDownloaded", { label }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("pdfGenerateError"));
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleGenerate = () => {
    if (selectedModules.size === 0) {
      toast.error(t("moduleSelectRequired"));
      return;
    }
    // Prefer moduleOrder (user-sorted); fall back to Set iteration order
    const orderedModules =
      moduleOrder.length > 0 ? moduleOrder : Array.from(selectedModules);
    downloadPdf(
      {
        parkId: parkId === "all" ? undefined : parkId,
        year: parseInt(year),
        ...(month && month !== "all" ? { month: parseInt(month) } : {}),
        modules: orderedModules,
      },
      `Bericht_${year}.pdf`,
      "Bericht",
      (v) => setGenerating(v)
    );
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error(t("nameRequired"));
      return;
    }
    if (selectedModules.size === 0) {
      toast.error(t("moduleSelectRequired"));
      return;
    }
    setSaving(true);
    try {
      const orderedModules =
        moduleOrder.length > 0 ? moduleOrder : Array.from(selectedModules);
      const res = await fetch("/api/energy/reports/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          modules: orderedModules,
          moduleOrder: orderedModules,
          moduleSettings,
          parkId: parkId !== "all" ? parkId : null,
          interval: month && month !== "all" ? "month" : "year",
          portalVisible: false,
        }),
      });
      if (!res.ok) throw new Error(t("saveError"));
      toast.success(t("templateSaved"));
      setShowSaveForm(false);
      setTemplateName("");
      loadTemplates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateTemplate = (config: ReportConfig) => {
    const tParkId = templateParks[config.id] || config.park?.id || "all";
    const tYear = templateYears[config.id] || currentYear.toString();
    // Prefer moduleOrder from saved template, fall back to modules
    const orderedModules =
      config.moduleOrder && config.moduleOrder.length > 0
        ? config.moduleOrder
        : config.modules;
    downloadPdf(
      {
        parkId: tParkId === "all" ? undefined : tParkId,
        year: parseInt(tYear),
        modules: orderedModules,
      },
      `${config.name}_${tYear}.pdf`,
      config.name,
      (v) => setGeneratingTemplate(v ? config.id : null)
    );
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/energy/reports/configs/${deleteTarget.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(t("deleteError"));
      toast.success(t("templateDeleted", { name: deleteTarget.name }));
      setDeleteTarget(null);
      loadTemplates();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setDeleting(false);
    }
  };

  // Classic module items (memoised)
  const classicItems = useMemo(
    () =>
      Object.entries(CLASSIC_MODULES).map(([key, label]) => ({ key, label })),
    []
  );

  const activeConfigSchema = activeConfigModule
    ? MODULE_CONFIG_SCHEMA[activeConfigModule] ?? {
        supportsCompareYear: true,
        supportsTurbineFilter: false,
      }
    : null;
  const activeSettings = activeConfigModule
    ? moduleSettings[activeConfigModule] ?? {}
    : {};

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-8">
      {/* ====================================================================
          Section 1: Gespeicherte Vorlagen
      ==================================================================== */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <BookMarked className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">Gespeicherte Vorlagen</h2>
          <Separator className="flex-1" />
          {!loadingTemplates && (
            <span className="text-xs text-muted-foreground">
              {templates.length}{" "}
              {templates.length === 1 ? "Vorlage" : "Vorlagen"}
            </span>
          )}
        </div>

        {loadingTemplates ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-64 shrink-0 h-40 rounded-xl bg-muted animate-pulse"
              />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="flex items-center gap-3 p-6 rounded-xl border border-dashed text-muted-foreground">
            <BookMarked className="h-5 w-5 opacity-40 shrink-0" />
            <p className="text-sm">
              Noch keine Vorlagen gespeichert. Erstellen Sie unten einen Bericht
              und speichern ihn als Vorlage.
            </p>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {templates.map((config) => (
              <Card
                key={config.id}
                className="w-72 shrink-0 border-2"
                style={{ borderTopColor: "#335E99", borderTopWidth: 3 }}
              >
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold leading-tight">
                      {config.name}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(config)}
                      aria-label={`Vorlage "${config.name}" löschen`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <Badge variant="outline" className="text-xs h-5">
                      {config.modules.length} Module
                    </Badge>
                    {config.park && (
                      <Badge variant="secondary" className="text-xs h-5">
                        {config.park.name}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={
                        templateParks[config.id] ||
                        config.park?.id ||
                        "all"
                      }
                      onValueChange={(v) =>
                        setTemplateParks((p) => ({ ...p, [config.id]: v }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Park" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle Parks</SelectItem>
                        {parks.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={
                        templateYears[config.id] || currentYear.toString()
                      }
                      onValueChange={(v) =>
                        setTemplateYears((p) => ({ ...p, [config.id]: v }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {YEARS.map((y) => (
                          <SelectItem key={y} value={y.toString()}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full h-8 text-xs"
                    onClick={() => handleGenerateTemplate(config)}
                    disabled={generatingTemplate === config.id}
                  >
                    {generatingTemplate === config.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    PDF laden
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ====================================================================
          Section 2: Neuer Bericht — Split-Screen (Builder | Live-Preview)
      ==================================================================== */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">Neuer Bericht</h2>
          <Separator className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setPreviewVisible((v) => !v)}
          >
            {previewVisible ? (
              <>
                <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Preview ausblenden
              </>
            ) : (
              <>
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview zeigen
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ================= Left: Builder ================= */}
          <div className="space-y-4">
            {/* Global filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Windpark
                </Label>
                <Select value={parkId} onValueChange={setParkId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alle Parks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Parks</SelectItem>
                    {parks.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Jahr
                </Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Monat (opt.)
                </Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Gesamt" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Gesamtes Jahr</SelectItem>
                    {MONTH_NAMES.map((n, i) => (
                      <SelectItem key={i} value={(i + 1).toString()}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Module selection */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Module auswählen
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {selectedModules.size} von {TOTAL_MODULE_COUNT}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  {Array.from(MODULE_GROUPS.entries()).map(([groupName, items]) => {
                    const allOn = items.every((m) => selectedModules.has(m.key));
                    return (
                      <div key={groupName} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">
                            {groupName}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleGroup(items)}
                            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {allOn ? "Alle ab" : "Alle an"}
                          </button>
                        </div>
                        {items.map((m) => (
                          <label
                            key={m.key}
                            className="flex items-center gap-2 cursor-pointer group"
                          >
                            <Checkbox
                              checked={selectedModules.has(m.key)}
                              onCheckedChange={() => toggleModule(m.key)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="text-sm group-hover:text-foreground transition-colors">
                              {m.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Klassische Module
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleGroup(classicItems)}
                        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {classicItems.every((m) => selectedModules.has(m.key))
                          ? "Alle ab"
                          : "Alle an"}
                      </button>
                    </div>
                    {classicItems.map((m) => (
                      <label
                        key={m.key}
                        className="flex items-center gap-2 cursor-pointer group"
                      >
                        <Checkbox
                          checked={selectedModules.has(m.key)}
                          onCheckedChange={() => toggleModule(m.key)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-sm group-hover:text-foreground transition-colors">
                          {m.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Module Sorter (DnD) */}
            {moduleOrder.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    Reihenfolge
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      Ziehen zum Umsortieren
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={moduleOrder}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1.5">
                        {moduleOrder.map((key) => (
                          <SortableModuleItem
                            key={key}
                            id={key}
                            label={getModuleLabel(key)}
                            isActive={activeConfigModule === key}
                            onSelectConfig={() => setActiveConfigModule(key)}
                            onRemove={() => toggleModule(key)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </CardContent>
              </Card>
            )}

            {/* Per-module config panel */}
            {activeConfigModule && activeConfigSchema && (
              <Card>
                <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-semibold">
                    Konfiguration: {getModuleLabel(activeConfigModule)}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setActiveConfigModule(null)}
                    aria-label="Konfiguration schließen"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeConfigSchema.supportsCompareYear && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Vergleichsjahr
                      </Label>
                      <Select
                        value={
                          activeSettings.compareYear != null
                            ? String(activeSettings.compareYear)
                            : "none"
                        }
                        onValueChange={(v) =>
                          updateModuleSettings(activeConfigModule, {
                            compareYear: v === "none" ? null : parseInt(v),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Kein Vergleich</SelectItem>
                          {[1, 2, 3].map((offset) => {
                            const y = parseInt(year) - offset;
                            return (
                              <SelectItem key={y} value={y.toString()}>
                                {y}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {activeConfigSchema.supportsTurbineFilter && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Turbinen-Filter
                        <span className="ml-2 normal-case tracking-normal font-normal text-muted-foreground">
                          {activeSettings.turbineIds?.length
                            ? `${activeSettings.turbineIds.length} ausgewählt`
                            : "Alle"}
                        </span>
                      </Label>
                      <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
                        {turbines.length === 0 ? (
                          <div className="text-xs text-muted-foreground italic p-2">
                            Keine Turbinen verfügbar
                          </div>
                        ) : (
                          turbines
                            .filter(
                              (tur) =>
                                parkId === "all" || tur.parkId === parkId
                            )
                            .map((tur) => {
                              const checked =
                                activeSettings.turbineIds?.includes(tur.id) ??
                                false;
                              return (
                                <label
                                  key={tur.id}
                                  className="flex items-center gap-2 cursor-pointer text-xs"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => {
                                      const current =
                                        activeSettings.turbineIds ?? [];
                                      const next = checked
                                        ? current.filter((id) => id !== tur.id)
                                        : [...current, tur.id];
                                      updateModuleSettings(activeConfigModule, {
                                        turbineIds: next.length > 0 ? next : undefined,
                                      });
                                    }}
                                    className="h-3.5 w-3.5"
                                  />
                                  {tur.designation}
                                </label>
                              );
                            })
                        )}
                      </div>
                    </div>
                  )}
                  {!activeConfigSchema.supportsCompareYear &&
                    !activeConfigSchema.supportsTurbineFilter && (
                      <p className="text-xs text-muted-foreground italic">
                        Dieses Modul hat keine zusätzlichen Optionen.
                      </p>
                    )}
                </CardContent>
              </Card>
            )}

            {/* Action buttons */}
            <div className="pt-2 space-y-2">
              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={generating || selectedModules.size === 0}
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                PDF generieren ({selectedModules.size} Module)
              </Button>

              {!showSaveForm ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowSaveForm(true)}
                  disabled={selectedModules.size === 0}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Als Vorlage speichern
                </Button>
              ) : (
                <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                  <Input
                    placeholder="Vorlagenname..."
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTemplate();
                      if (e.key === "Escape") setShowSaveForm(false);
                    }}
                    autoFocus
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={handleSaveTemplate}
                      disabled={saving}
                    >
                      {saving && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      Speichern
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => {
                        setShowSaveForm(false);
                        setTemplateName("");
                      }}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ================= Right: Live-Preview ================= */}
          <div
            className={`${
              previewVisible ? "" : "hidden lg:block"
            } lg:sticky lg:top-4 h-[calc(100vh-8rem)] border rounded-lg overflow-hidden bg-muted/10`}
          >
            <ReportLivePreview
              parkName={previewParkName}
              year={parseInt(debouncedYear)}
              month={debouncedMonth === "all" ? undefined : parseInt(debouncedMonth)}
              tenantName="Vorschau"
              selectedModules={debouncedModulesForPreview}
            />
          </div>
        </div>
      </div>

      {/* ====================================================================
          Delete confirmation dialog
      ==================================================================== */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Soll die Vorlage{" "}
              <span className="font-semibold">
                &quot;{deleteTarget?.name}&quot;
              </span>{" "}
              unwiderruflich gelöscht werden?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
