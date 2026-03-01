"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, List, Loader2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface PositionTemplate {
  id: string;
  name: string;
  description: string;
  category: string | null;
  unit: string;
  taxType: string;
  defaultPrice: number | null;
}

export interface PositionTemplateSelection {
  description: string;
  unit: string;
  taxType: "STANDARD" | "REDUCED" | "EXEMPT";
  unitPrice: number | null;
}

interface PositionTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: PositionTemplateSelection) => void;
}

const MONTH_NAMES = [
  "Januar", "Februar", "Maerz", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/**
 * Resolves placeholders in a template description string.
 * Supported: {currentYear}, {lastYear}, {currentMonth}, {currentQuarter}
 */
function resolvePlaceholders(template: string): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based
  const currentQuarter = Math.floor(currentMonth / 3) + 1;

  let text = template;
  text = text.replace(/\{currentYear\}/g, String(currentYear));
  text = text.replace(/\{lastYear\}/g, String(currentYear - 1));
  text = text.replace(/\{currentMonth\}/g, `${MONTH_NAMES[currentMonth]} ${currentYear}`);
  text = text.replace(/\{currentQuarter\}/g, `Q${currentQuarter} ${currentYear}`);
  return text;
}

type Step = "search" | "create";

export function PositionTemplateDialog({
  open,
  onOpenChange,
  onSelect,
}: PositionTemplateDialogProps) {
  const [step, setStep] = useState<Step>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [templates, setTemplates] = useState<PositionTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newUnit, setNewUnit] = useState("pauschal");
  const [newTaxType, setNewTaxType] = useState<"STANDARD" | "REDUCED" | "EXEMPT">("EXEMPT");
  const [newDefaultPrice, setNewDefaultPrice] = useState("");

  const fetchTemplates = useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("search", query);
      const response = await fetch(`/api/admin/position-templates?${params}`);
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.data || []);
      }
    } catch {
      // Template fetch failed silently
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load templates on open and on search
  useEffect(() => {
    if (!open || step !== "search") return;
    const timer = setTimeout(() => {
      fetchTemplates(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, open, step, fetchTemplates]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep("search");
      setSearchQuery("");
      resetCreateForm();
    }
  }, [open]);

  function resetCreateForm() {
    setNewName("");
    setNewDescription("");
    setNewCategory("");
    setNewUnit("pauschal");
    setNewTaxType("EXEMPT");
    setNewDefaultPrice("");
  }

  function handleSelect(template: PositionTemplate) {
    onSelect({
      description: resolvePlaceholders(template.description),
      unit: template.unit,
      taxType: template.taxType as "STANDARD" | "REDUCED" | "EXEMPT",
      unitPrice: template.defaultPrice,
    });
    onOpenChange(false);
  }

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    if (!newDescription.trim()) {
      toast.error("Beschreibung ist erforderlich");
      return;
    }

    try {
      setIsCreating(true);
      const response = await fetch("/api/admin/position-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim(),
          category: newCategory.trim() || null,
          unit: newUnit,
          taxType: newTaxType,
          defaultPrice: newDefaultPrice ? parseFloat(newDefaultPrice) : null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Anlegen");
      }

      const created: PositionTemplate = await response.json();
      toast.success("Vorlage erfolgreich angelegt");

      // Directly select the newly created template
      onSelect({
        description: resolvePlaceholders(created.description),
        unit: created.unit,
        taxType: created.taxType as "STANDARD" | "REDUCED" | "EXEMPT",
        unitPrice: created.defaultPrice,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Anlegen");
    } finally {
      setIsCreating(false);
    }
  }

  // Group by category
  const grouped = templates.reduce<Record<string, PositionTemplate[]>>((acc, t) => {
    const cat = t.category || "Sonstige";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "search" ? "Positionsvorlage auswaehlen" : "Neue Vorlage anlegen"}
          </DialogTitle>
          <DialogDescription>
            {step === "search"
              ? "Waehlen Sie eine Vorlage oder legen Sie eine neue an."
              : "Die Vorlage wird gespeichert und direkt verwendet."}
          </DialogDescription>
        </DialogHeader>

        {step === "search" ? (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Vorlage suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>

            {/* Results */}
            <div className="max-h-[340px] overflow-y-auto space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : templates.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  {searchQuery ? "Keine Vorlagen gefunden" : "Noch keine Positionsvorlagen vorhanden."}
                </div>
              ) : (
                Object.entries(grouped).map(([category, items]) => (
                  <div key={category}>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      {category}
                    </h4>
                    <div className="space-y-1">
                      {items.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          className="w-full flex items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted transition-colors"
                          onClick={() => handleSelect(template)}
                        >
                          <List className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm">{template.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {resolvePlaceholders(template.description)}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {template.unit}
                              </Badge>
                              {template.defaultPrice != null && (
                                <span className="text-xs text-muted-foreground">
                                  {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(template.defaultPrice)}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <Separator />

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setStep("create")}
            >
              <Plus className="mr-2 h-4 w-4" />
              Neue Vorlage anlegen
            </Button>
          </div>
        ) : (
          /* Create Form */
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Name *</Label>
              <Input
                id="tpl-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="z.B. Betriebsführungspauschale"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tpl-description">
                Beschreibung / Rechnungstext *
              </Label>
              <Input
                id="tpl-description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="z.B. Betriebsführung {currentYear}"
              />
              <p className="text-xs text-muted-foreground">
                Platzhalter: {"{currentYear}"}, {"{lastYear}"}, {"{currentMonth}"}, {"{currentQuarter}"}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tpl-category">Kategorie</Label>
                <Input
                  id="tpl-category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="z.B. Betriebsführung"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-unit">Einheit</Label>
                <Select value={newUnit} onValueChange={setNewUnit}>
                  <SelectTrigger id="tpl-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pauschal">pauschal</SelectItem>
                    <SelectItem value="Stueck">Stück</SelectItem>
                    <SelectItem value="Stunden">Stunden</SelectItem>
                    <SelectItem value="Tage">Tage</SelectItem>
                    <SelectItem value="kWh">kWh</SelectItem>
                    <SelectItem value="MWh">MWh</SelectItem>
                    <SelectItem value="m2">m²</SelectItem>
                    <SelectItem value="ha">ha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tpl-tax">Steuer</Label>
                <Select value={newTaxType} onValueChange={(v) => setNewTaxType(v as typeof newTaxType)}>
                  <SelectTrigger id="tpl-tax">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXEMPT">0% (steuerfrei)</SelectItem>
                    <SelectItem value="REDUCED">7% MwSt</SelectItem>
                    <SelectItem value="STANDARD">19% MwSt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-price">Standardpreis (€)</Label>
                <Input
                  id="tpl-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newDefaultPrice}
                  onChange={(e) => setNewDefaultPrice(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <Separator />

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep("search");
                  resetCreateForm();
                }}
              >
                Zurück
              </Button>
              <Button type="button" onClick={handleCreate} disabled={isCreating}>
                {isCreating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Anlegen und verwenden
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
