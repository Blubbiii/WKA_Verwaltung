"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, List, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

export function PositionTemplateDialog({
  open,
  onOpenChange,
  onSelect,
}: PositionTemplateDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [templates, setTemplates] = useState<PositionTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
    if (!open) return;
    const timer = setTimeout(() => {
      fetchTemplates(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, open, fetchTemplates]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSearchQuery("");
    }
  }, [open]);

  function handleSelect(template: PositionTemplate) {
    onSelect({
      description: resolvePlaceholders(template.description),
      unit: template.unit,
      taxType: template.taxType as "STANDARD" | "REDUCED" | "EXEMPT",
      unitPrice: template.defaultPrice,
    });
    onOpenChange(false);
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
          <DialogTitle>Positionsvorlage auswaehlen</DialogTitle>
          <DialogDescription>
            Waehlen Sie eine Vorlage fuer die Rechnungsposition. Platzhalter werden automatisch aufgeloest.
          </DialogDescription>
        </DialogHeader>

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
          <div className="max-h-[400px] overflow-y-auto space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                {searchQuery
                  ? "Keine Vorlagen gefunden"
                  : "Keine Positionsvorlagen vorhanden. Erstellen Sie Vorlagen unter Einstellungen."}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
