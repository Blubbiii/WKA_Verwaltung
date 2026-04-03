"use client";

/**
 * Translation Editor Tab — 3-column editor for DE Technisch / DE Persönlich / EN
 * SuperAdmin can override any translation key via DB (SystemConfig).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  RefreshCw,
  Undo2,
  Languages,
  Filter,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
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

interface TranslationRow {
  key: string;
  de: string;
  "de-personal": string;
  en: string;
  hasOverride: boolean;
}

type Locale = "de" | "de-personal" | "en";

const LOCALE_LABELS: Record<Locale, string> = {
  de: "DE Technisch",
  "de-personal": "DE Persönlich",
  en: "Englisch",
};

const PAGE_SIZE = 50;

export default function TranslationsTab() {
  const [translations, setTranslations] = useState<TranslationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "overrides" | "missing">("all");
  const [editingCell, setEditingCell] = useState<{
    key: string;
    locale: Locale;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);

  const loadTranslations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/translations");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setTranslations(data.translations);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Laden"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTranslations();
  }, [loadTranslations]);

  // Filter + search
  const filtered = useMemo(() => {
    let result = translations;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.key.toLowerCase().includes(q) ||
          t.de.toLowerCase().includes(q) ||
          t["de-personal"].toLowerCase().includes(q) ||
          t.en.toLowerCase().includes(q)
      );
    }

    if (filter === "overrides") {
      result = result.filter((t) => t.hasOverride);
    } else if (filter === "missing") {
      result = result.filter((t) => !t.de || !t["de-personal"] || !t.en);
    }

    return result;
  }, [translations, search, filter]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  );

  // Reset page on search/filter change
  useEffect(() => {
    setPage(0);
  }, [search, filter]);

  const startEdit = (key: string, locale: Locale, currentValue: string) => {
    setEditingCell({ key, locale });
    setEditValue(currentValue);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const saveEdit = async () => {
    if (!editingCell) return;

    try {
      setSaving(true);
      const res = await fetch("/api/admin/translations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: editingCell.key,
          locale: editingCell.locale,
          value: editValue,
        }),
      });
      if (!res.ok) throw new Error("Fehler beim Speichern");

      // Update local state
      setTranslations((prev) =>
        prev.map((t) => {
          if (t.key !== editingCell.key) return t;
          return {
            ...t,
            [editingCell.locale]: editValue || t[editingCell.locale],
            hasOverride: true,
          };
        })
      );

      toast.success("Übersetzung gespeichert");
      cancelEdit();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  };

  const revertOverride = async (key: string, locale: Locale) => {
    try {
      const res = await fetch("/api/admin/translations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, locale, value: "" }),
      });
      if (!res.ok) throw new Error("Fehler beim Zurücksetzen");

      toast.success("Override entfernt — Datei-Standard wiederhergestellt");
      await loadTranslations();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Zurücksetzen"
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const overrideCount = translations.filter((t) => t.hasOverride).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Übersetzungen verwalten</h2>
          <p className="text-muted-foreground text-sm">
            {translations.length} Keys insgesamt · {overrideCount} mit
            DB-Override
          </p>
        </div>
        <Button variant="outline" onClick={loadTranslations} disabled={loading}>
          <RefreshCw
            className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          Aktualisieren
        </Button>
      </div>

      {/* Search + Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Key oder Text suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={filter}
              onValueChange={(v) =>
                setFilter(v as "all" | "overrides" | "missing")
              }
            >
              <SelectTrigger className="w-[200px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Keys</SelectItem>
                <SelectItem value="overrides">Nur Overrides</SelectItem>
                <SelectItem value="missing">Fehlende Texte</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Translation Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            Übersetzungen
          </CardTitle>
          <CardDescription>
            Klicke auf einen Text um ihn zu bearbeiten. Overrides werden in der
            Datenbank gespeichert und haben Vorrang vor den JSON-Dateien.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium w-[280px]">
                    Key
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    {LOCALE_LABELS.de}
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    {LOCALE_LABELS["de-personal"]}
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    {LOCALE_LABELS.en}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paged.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Keine Ergebnisse gefunden
                    </td>
                  </tr>
                ) : (
                  paged.map((row) => (
                    <tr
                      key={row.key}
                      className={`hover:bg-muted/30 ${row.hasOverride ? "bg-primary/5" : ""}`}
                    >
                      {/* Key column */}
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground align-top">
                        <div className="flex items-start gap-2">
                          <span className="break-all">{row.key}</span>
                          {row.hasOverride && (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[10px]"
                            >
                              DB
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* DE, DE-Personal, EN columns */}
                      {(["de", "de-personal", "en"] as Locale[]).map(
                        (locale) => {
                          const isEditing =
                            editingCell?.key === row.key &&
                            editingCell?.locale === locale;

                          return (
                            <td key={locale} className="px-4 py-2 align-top">
                              {isEditing ? (
                                <div className="flex gap-1">
                                  <Input
                                    value={editValue}
                                    onChange={(e) =>
                                      setEditValue(e.target.value)
                                    }
                                    onKeyDown={handleKeyDown}
                                    onBlur={() => {
                                      // Small delay to allow button click
                                      setTimeout(() => {
                                        if (
                                          editingCell?.key === row.key &&
                                          editingCell?.locale === locale
                                        ) {
                                          cancelEdit();
                                        }
                                      }, 200);
                                    }}
                                    autoFocus
                                    className="h-8 text-sm"
                                    disabled={saving}
                                  />
                                  <Button
                                    size="sm"
                                    onClick={saveEdit}
                                    disabled={saving}
                                    className="h-8 px-2"
                                  >
                                    {saving ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      "OK"
                                    )}
                                  </Button>
                                </div>
                              ) : (
                                <div className="group flex items-start gap-1">
                                  <button
                                    type="button"
                                    className="text-left hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 cursor-pointer flex-1 min-h-[24px]"
                                    onClick={() =>
                                      startEdit(row.key, locale, row[locale])
                                    }
                                  >
                                    {row[locale] || (
                                      <span className="text-muted-foreground italic">
                                        —
                                      </span>
                                    )}
                                  </button>
                                  {row.hasOverride && (
                                    <button
                                      type="button"
                                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-destructive shrink-0"
                                      onClick={() =>
                                        revertOverride(row.key, locale)
                                      }
                                      title="Override entfernen"
                                    >
                                      <Undo2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        }
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Seite {page + 1} von {totalPages} ({filtered.length} Keys)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Zurück
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1}
                >
                  Weiter
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
