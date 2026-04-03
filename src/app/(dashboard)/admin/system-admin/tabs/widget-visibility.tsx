"use client";

/**
 * Widget Visibility Tab — SuperAdmin can override the minRole per widget via DB.
 * Shows all widgets grouped by category with role selectors.
 */

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Search, Loader2, RefreshCw, Undo2, Shield } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WidgetVisibility {
  id: string;
  name: string;
  category: string;
  defaultMinRole: string;
  currentMinRole: string;
  hasOverride: boolean;
}

const ROLE_OPTIONS = ["VIEWER", "MANAGER", "ADMIN", "SUPERADMIN"] as const;

const ROLE_LABELS: Record<string, string> = {
  VIEWER: "Viewer",
  MANAGER: "Manager",
  ADMIN: "Admin",
  SUPERADMIN: "SuperAdmin",
};

const CATEGORY_LABELS: Record<string, string> = {
  kpi: "KPIs",
  chart: "Charts",
  list: "Listen",
  utility: "Werkzeuge",
  admin: "Administration",
};

export default function WidgetVisibilityTab() {
  const [widgets, setWidgets] = useState<WidgetVisibility[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadWidgets = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/widget-visibility");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setWidgets(data.widgets);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Laden"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWidgets();
  }, [loadWidgets]);

  const handleRoleChange = useCallback(
    async (widgetId: string, minRole: string) => {
      setSavingId(widgetId);
      try {
        const res = await fetch("/api/admin/widget-visibility", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widgetId, minRole }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Fehler beim Speichern");
        }
        const data = await res.json();

        // Update local state
        setWidgets((prev) =>
          prev.map((w) =>
            w.id === widgetId
              ? {
                  ...w,
                  currentMinRole: minRole,
                  hasOverride: data.hasOverride,
                }
              : w
          )
        );
        toast.success(data.message);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Fehler beim Speichern"
        );
      } finally {
        setSavingId(null);
      }
    },
    []
  );

  const handleReset = useCallback(
    async (widget: WidgetVisibility) => {
      await handleRoleChange(widget.id, widget.defaultMinRole);
    },
    [handleRoleChange]
  );

  // Filter by search
  const filtered = widgets.filter(
    (w) =>
      !search ||
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.id.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const grouped = filtered.reduce<Record<string, WidgetVisibility[]>>(
    (acc, w) => {
      if (!acc[w.category]) acc[w.category] = [];
      acc[w.category].push(w);
      return acc;
    },
    {}
  );

  // Sort categories in a defined order
  const categoryOrder = ["kpi", "chart", "list", "utility", "admin"];
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  const overrideCount = widgets.filter((w) => w.hasOverride).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <CardTitle>Widget-Sichtbarkeit</CardTitle>
            {overrideCount > 0 && (
              <Badge variant="secondary">{overrideCount} Überschreibungen</Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadWidgets}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Aktualisieren
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Widget suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Keine Widgets gefunden.
          </p>
        ) : (
          <div className="space-y-6">
            {sortedCategories.map((category) => (
              <div key={category}>
                {/* Category header */}
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {CATEGORY_LABELS[category] || category}
                </h3>

                {/* Widget table */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-2 font-medium">
                          Widget
                        </th>
                        <th className="text-left px-4 py-2 font-medium w-36">
                          Standard-Rolle
                        </th>
                        <th className="text-left px-4 py-2 font-medium w-48">
                          Aktuelle Rolle
                        </th>
                        <th className="text-right px-4 py-2 font-medium w-32">
                          Aktionen
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped[category].map((widget) => (
                        <tr
                          key={widget.id}
                          className="border-b last:border-b-0 hover:bg-muted/30"
                        >
                          {/* Widget name */}
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{widget.name}</span>
                              {widget.hasOverride && (
                                <Badge
                                  variant="outline"
                                  className="text-xs px-1.5 py-0"
                                >
                                  DB
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {widget.id}
                            </span>
                          </td>

                          {/* Default role */}
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {ROLE_LABELS[widget.defaultMinRole] ||
                              widget.defaultMinRole}
                          </td>

                          {/* Current role selector */}
                          <td className="px-4 py-2.5">
                            <Select
                              value={widget.currentMinRole}
                              onValueChange={(value) =>
                                handleRoleChange(widget.id, value)
                              }
                              disabled={savingId === widget.id}
                            >
                              <SelectTrigger className="w-40 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLE_OPTIONS.map((role) => (
                                  <SelectItem key={role} value={role}>
                                    {ROLE_LABELS[role]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-2.5 text-right">
                            {widget.hasOverride && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReset(widget)}
                                disabled={savingId === widget.id}
                                title="Auf Standard zurücksetzen"
                              >
                                {savingId === widget.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Undo2 className="h-4 w-4" />
                                )}
                                <span className="ml-1">Zurücksetzen</span>
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
