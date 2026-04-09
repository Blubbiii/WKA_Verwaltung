"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import {
  Search,
  Plus,
  Users,
  Download,
  Tag as TagIcon,
  X,
  Check,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { DERIVED_LABEL_KEYS } from "@/lib/crm/label-constants";

// ============================================================================
// Types
// ============================================================================

interface ContactContext {
  activeLeaseCount: number;
  activeShareholderCount: number;
  totalYearlyRentEur: number | null;
  totalCapitalContributionEur: number | null;
}

interface CrmContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  contactType: string | null;
  status: string;
  lastActivityAt: string | null;
  _count: { crmActivities: number };
  labels: string[];
  context: ContactContext;
}

interface CustomLabelLite {
  id: string;
  name: string;
  color: string | null;
}

interface ExistingMatch {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  email: string | null;
}

interface CreateForm {
  personType: "natural" | "legal";
  salutation: string;
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
}

const EMPTY_FORM: CreateForm = {
  personType: "natural",
  salutation: "",
  firstName: "",
  lastName: "",
  companyName: "",
  email: "",
  phone: "",
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
};

function activityAgeClass(lastActivityAt: string | null): string {
  if (!lastActivityAt) return "text-destructive";
  const days = Math.floor(
    (Date.now() - new Date(lastActivityAt).getTime()) / 86_400_000,
  );
  if (days < 30) return "text-green-600 dark:text-green-400";
  if (days < 90) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

// ============================================================================
// Page
// ============================================================================

export default function CrmContactsPage() {
  const router = useRouter();
  const { flags } = useFeatureFlags();

  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [activeLabels, setActiveLabels] = useState<string[]>([]);
  const [labelPopoverOpen, setLabelPopoverOpen] = useState(false);

  // Initialize from URL ?labels=Verpächter,Bank so deep links work
  // Read from window directly (not useSearchParams) to avoid the Next.js
  // "useSearchParams() should be wrapped in a suspense boundary" build error.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search).get("labels");
    if (p) {
      setActiveLabels(p.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }, []);

  const [customLabels, setCustomLabels] = useState<CustomLabelLite[]>([]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [bulkTagId, setBulkTagId] = useState<string>("");
  const [bulkTagging, setBulkTagging] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [dedupMatch, setDedupMatch] = useState<ExistingMatch | null>(null);

  // --------------------------------------------------------------------------
  // Data loading
  // --------------------------------------------------------------------------
  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (search) params.set("search", search);
      if (activeLabels.length > 0) params.set("labels", activeLabels.join(","));

      const res = await fetch(`/api/crm/contacts?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setContacts(json.data ?? []);
      setTotal(json.pagination?.total ?? 0);
    } catch {
      toast.error("Kontakte konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (flags.crm) load();
  }, [search, activeLabels, flags.crm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load custom labels (PersonTag table) once for the filter dropdown
  useEffect(() => {
    if (!flags.crm) return;
    fetch("/api/crm/tags")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCustomLabels)
      .catch(() => {});
  }, [flags.crm]);

  // Reset selection when filter or search changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, activeLabels]);

  // Keep URL in sync with label filter
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeLabels.length > 0) {
      url.searchParams.set("labels", activeLabels.join(","));
    } else {
      url.searchParams.delete("labels");
    }
    window.history.replaceState({}, "", url.toString());
  }, [activeLabels]);

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  const displayName = (c: CrmContact) => {
    if (c.firstName || c.lastName)
      return `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
    return c.companyName ?? "—";
  };

  const toggleLabel = (label: string) => {
    setActiveLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  };

  const clearLabels = () => setActiveLabels([]);

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === contacts.length && contacts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  };

  // --------------------------------------------------------------------------
  // Dynamic columns — show context-specific data when filter implies it
  // --------------------------------------------------------------------------
  const showLeaseColumn = activeLabels.includes("Verpächter");
  const showShareholderColumn = activeLabels.includes("Gesellschafter");

  // --------------------------------------------------------------------------
  // Bulk actions
  // --------------------------------------------------------------------------
  const exportCsv = () => {
    const selected = contacts.filter((c) => selectedIds.has(c.id));
    if (selected.length === 0) {
      toast.error("Keine Kontakte ausgewählt");
      return;
    }
    const header = [
      "Name",
      "Firma",
      "E-Mail",
      "Telefon",
      "Straße",
      "PLZ",
      "Ort",
      "Labels",
    ];
    const rows = selected.map((c) => [
      displayName(c),
      c.companyName ?? "",
      c.email ?? "",
      c.phone ?? "",
      [c.street, c.houseNumber].filter(Boolean).join(" "),
      c.postalCode ?? "",
      c.city ?? "",
      c.labels.join("; "),
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? "");
            return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(";"),
      )
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kontakte-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${selected.length} Kontakte exportiert`);
  };

  const bulkAssignTag = async () => {
    if (!bulkTagId) {
      toast.error("Bitte ein Label auswählen");
      return;
    }
    setBulkTagging(true);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/crm/contacts/${id}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagId: bulkTagId }),
          }),
        ),
      );
      const ok = results.filter(
        (r) => r.status === "fulfilled" && (r.value as Response).ok,
      ).length;
      toast.success(`${ok} von ${ids.length} Kontakten mit Label versehen`);
      setTagDialogOpen(false);
      setBulkTagId("");
      setSelectedIds(new Set());
      load();
    } catch {
      toast.error("Fehler beim Bulk-Labeln");
    } finally {
      setBulkTagging(false);
    }
  };

  // --------------------------------------------------------------------------
  // Create contact — with dedup check
  // --------------------------------------------------------------------------
  const handleCreate = async (force = false) => {
    setCreating(true);
    try {
      const body = {
        personType: form.personType,
        salutation: form.salutation || null,
        firstName: form.firstName || null,
        lastName: form.lastName || null,
        companyName: form.companyName || null,
        email: form.email || null,
        phone: form.phone || null,
        street: form.street || null,
        houseNumber: form.houseNumber || null,
        postalCode: form.postalCode || null,
        city: form.city || null,
        force,
      };
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        const err = await res.json();
        setDedupMatch(err.existing as ExistingMatch);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Fehler");
      }
      const created = await res.json();
      toast.success("Kontakt erstellt");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setDedupMatch(null);
      router.push(`/crm/contacts/${created.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Erstellen");
    } finally {
      setCreating(false);
    }
  };

  const openExistingFromDedup = () => {
    if (dedupMatch) {
      setCreateOpen(false);
      setDedupMatch(null);
      setForm(EMPTY_FORM);
      router.push(`/crm/contacts/${dedupMatch.id}`);
    }
  };

  // --------------------------------------------------------------------------
  // Label filter: all available labels = derived keys + custom tag names
  // --------------------------------------------------------------------------
  const allAvailableLabels = useMemo(() => {
    const derived = [...DERIVED_LABEL_KEYS];
    const custom = customLabels.map((t) => t.name);
    return [...derived, ...custom.filter((c) => !derived.includes(c as (typeof DERIVED_LABEL_KEYS)[number]))];
  }, [customLabels]);

  // --------------------------------------------------------------------------
  // Guard
  // --------------------------------------------------------------------------
  if (!flags.crm) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">CRM nicht aktiviert</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Das CRM-Modul ist für diesen Mandanten nicht freigeschaltet. Bitte
          wenden Sie sich an Ihren Administrator.
        </p>
      </div>
    );
  }

  const columnCount = 5 + (showLeaseColumn ? 1 : 0) + (showShareholderColumn ? 2 : 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kontakte"
        description={`${total} Kontakte im CRM`}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Neuer Kontakt
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Name, E-Mail oder Firma suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Label multi-select */}
        <Popover open={labelPopoverOpen} onOpenChange={setLabelPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full sm:w-64 justify-start gap-2"
            >
              <TagIcon className="h-4 w-4" />
              {activeLabels.length === 0
                ? "Alle Labels"
                : `${activeLabels.length} Label${activeLabels.length === 1 ? "" : "s"} aktiv`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="flex items-center justify-between px-2 py-1.5 text-xs text-muted-foreground">
              <span>Labels filtern (UND)</span>
              {activeLabels.length > 0 && (
                <button
                  onClick={clearLabels}
                  className="hover:text-foreground"
                >
                  Zurücksetzen
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {allAvailableLabels.map((label) => {
                const isActive = activeLabels.includes(label);
                return (
                  <button
                    key={label}
                    onClick={() => toggleLabel(label)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-muted"
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      {isActive && <Check className="h-3 w-3" />}
                    </div>
                    <span className="flex-1 text-left">{label}</span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active label chips */}
      {activeLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeLabels.map((label) => (
            <Badge key={label} variant="secondary" className="gap-1 pr-1">
              {label}
              <button
                onClick={() => toggleLabel(label)}
                className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5"
                aria-label={`${label} entfernen`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      contacts.length > 0 &&
                      selectedIds.size === contacts.length
                    }
                    onCheckedChange={toggleAll}
                    aria-label="Alle auswählen"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">E-Mail</TableHead>
                <TableHead className="hidden lg:table-cell">Telefon</TableHead>
                {showLeaseColumn && (
                  <TableHead className="text-right">Pachtverträge</TableHead>
                )}
                {showShareholderColumn && (
                  <>
                    <TableHead className="text-right">Fonds</TableHead>
                    <TableHead className="text-right">Kapital</TableHead>
                  </>
                )}
                <TableHead>Letzte Aktivität</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: columnCount }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : contacts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columnCount}
                    className="py-12 text-center text-muted-foreground"
                  >
                    Keine Kontakte gefunden
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => router.push(`/crm/contacts/${c.id}`)}
                  >
                    <TableCell
                      className="w-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={() => toggleOne(c.id)}
                        aria-label={`${displayName(c)} auswählen`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{displayName(c)}</div>
                      {c.labels.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.labels.slice(0, 4).map((label) => (
                            <Badge
                              key={label}
                              variant="secondary"
                              className="text-[10px] h-4 px-1.5"
                            >
                              {label}
                            </Badge>
                          ))}
                          {c.labels.length > 4 && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-4 px-1.5"
                            >
                              +{c.labels.length - 4}
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {c.email ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {c.phone ?? c.mobile ?? "—"}
                    </TableCell>
                    {showLeaseColumn && (
                      <TableCell className="text-right">
                        <Badge variant="outline">
                          {c.context.activeLeaseCount}
                        </Badge>
                      </TableCell>
                    )}
                    {showShareholderColumn && (
                      <>
                        <TableCell className="text-right">
                          <Badge variant="outline">
                            {c.context.activeShareholderCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {c.context.totalCapitalContributionEur !== null
                            ? formatCurrency(
                                c.context.totalCapitalContributionEur,
                              )
                            : "—"}
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      {c.lastActivityAt ? (
                        <span
                          className={`text-sm ${activityAgeClass(c.lastActivityAt)}`}
                          title={format(
                            new Date(c.lastActivityAt),
                            "dd.MM.yyyy HH:mm",
                            { locale: de },
                          )}
                        >
                          {formatDistanceToNow(new Date(c.lastActivityAt), {
                            addSuffix: true,
                            locale: de,
                          })}
                        </span>
                      ) : (
                        <span className="text-sm text-destructive">
                          Kein Kontakt
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <BatchActionBar
          selectedCount={selectedIds.size}
          onClearSelection={() => setSelectedIds(new Set())}
          actions={[
            {
              label: "CSV exportieren",
              icon: <Download className="h-4 w-4" />,
              onClick: exportCsv,
            },
            {
              label: "Label zuweisen",
              icon: <TagIcon className="h-4 w-4" />,
              onClick: () => setTagDialogOpen(true),
              disabled: customLabels.length === 0,
            },
          ]}
        />
      )}

      {/* Bulk label dialog */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Label zuweisen</DialogTitle>
            <DialogDescription>
              Weise {selectedIds.size} Kontakten ein eigenes Label zu.
              Abgeleitete Labels entstehen automatisch aus Verträgen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Select value={bulkTagId} onValueChange={setBulkTagId}>
                <SelectTrigger>
                  <SelectValue placeholder="Label wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {customLabels.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTagDialogOpen(false)}
              disabled={bulkTagging}
            >
              Abbrechen
            </Button>
            <Button
              onClick={bulkAssignTag}
              disabled={bulkTagging || !bulkTagId}
            >
              {bulkTagging ? "Wird zugewiesen..." : "Zuweisen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) {
            setForm(EMPTY_FORM);
            setDedupMatch(null);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Neuer Kontakt</DialogTitle>
            <DialogDescription>
              Labels wie Verpächter oder Gesellschafter werden automatisch
              vergeben, sobald ein Vertrag angelegt ist.
            </DialogDescription>
          </DialogHeader>

          {/* Dedup warning banner */}
          {dedupMatch && (
            <div className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                <div className="flex-1 text-sm">
                  <div className="font-medium text-amber-900 dark:text-amber-200">
                    Existiert bereits
                  </div>
                  <div className="mt-1 text-amber-800 dark:text-amber-300">
                    {dedupMatch.companyName ??
                      `${dedupMatch.firstName ?? ""} ${dedupMatch.lastName ?? ""}`.trim()}
                    {dedupMatch.street && (
                      <>
                        , {dedupMatch.street} {dedupMatch.houseNumber}
                        <br />
                        {dedupMatch.postalCode} {dedupMatch.city}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openExistingFromDedup}
                >
                  Bestehenden öffnen
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDedupMatch(null);
                    handleCreate(true);
                  }}
                >
                  Trotzdem neu anlegen
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Typ</Label>
              <Select
                value={form.personType}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    personType: v as "natural" | "legal",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="natural">Natürliche Person</SelectItem>
                  <SelectItem value="legal">
                    Juristische Person / Firma
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.personType === "natural" && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Anrede</Label>
                  <Select
                    value={form.salutation || "none"}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        salutation: v === "none" ? "" : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="Herr">Herr</SelectItem>
                      <SelectItem value="Frau">Frau</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Vorname</Label>
                  <Input
                    value={form.firstName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, firstName: e.target.value }))
                    }
                    placeholder="Max"
                  />
                </div>
              </div>
            )}

            {form.personType === "natural" ? (
              <div className="space-y-1.5">
                <Label>Nachname *</Label>
                <Input
                  value={form.lastName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, lastName: e.target.value }))
                  }
                  placeholder="Mustermann"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Firmenname *</Label>
                <Input
                  value={form.companyName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, companyName: e.target.value }))
                  }
                  placeholder="Muster GmbH"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>E-Mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="m.mustermann@beispiel.de"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                placeholder="+49 123 456789"
              />
            </div>

            {/* Address — needed for dedup key */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Straße</Label>
                <Input
                  value={form.street}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, street: e.target.value }))
                  }
                  placeholder="Hauptstraße"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hausnr.</Label>
                <Input
                  value={form.houseNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, houseNumber: e.target.value }))
                  }
                  placeholder="12a"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>PLZ</Label>
                <Input
                  value={form.postalCode}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, postalCode: e.target.value }))
                  }
                  placeholder="12345"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Ort</Label>
                <Input
                  value={form.city}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, city: e.target.value }))
                  }
                  placeholder="Berlin"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Abbrechen
            </Button>
            <Button
              onClick={() => handleCreate(false)}
              disabled={creating || dedupMatch !== null}
            >
              {creating ? "Speichern..." : "Kontakt anlegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
