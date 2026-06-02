"use client";

/**
 * P21.3: Konten-Markierung für HGB-Compliance.
 *
 * Fokus-Page um pro LedgerAccount die HGB-Compliance-Felder zu setzen:
 *  - gewStAddBackKey (für GewSt-Report P17)
 *  - balanceSheetSection (für Bilanz P15)
 *  - taxKey (DATEV-Steuerschlüssel für Auto-Posting P11)
 *
 * Geht über den existierenden Kontenrahmen-Editor hinaus, der das nicht
 * abbildet, weil die Felder nachträglich zur HGB-Compliance dazukamen.
 */

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  Save,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface LedgerAccount {
  id: string;
  accountNumber: string;
  name: string;
  category: string;
  taxBehavior: string;
  isActive: boolean;
  isSystem: boolean;
  taxKey: string | null;
  balanceSheetSection: string | null;
  gewStAddBackKey: string | null;
}

const BALANCE_SECTIONS = [
  { value: "ASSET_FIXED", label: "Anlagevermögen" },
  { value: "ASSET_CURRENT", label: "Umlaufvermögen" },
  { value: "ASSET_DEFERRED", label: "RAP Aktiv" },
  { value: "EQUITY", label: "Eigenkapital" },
  { value: "PROVISION", label: "Rückstellungen" },
  { value: "LIABILITY_LONG", label: "Verbindl. lang" },
  { value: "LIABILITY_SHORT", label: "Verbindl. kurz" },
  { value: "LIABILITY_DEFERRED", label: "RAP Passiv" },
];

const GEWST_KEYS = [
  { value: "INTEREST", label: "Schuldzinsen (100%)" },
  { value: "RENT_MOVABLE", label: "Miete bewegl. WG (20%)" },
  { value: "RENT_IMMOVABLE", label: "Pacht Immobilien (50%)" },
  { value: "LICENSE", label: "Lizenzen (25%)" },
];

const NONE_VALUE = "__none__";

export default function KontenMarkierungPage() {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unmarked" | "gewst" | "tax">("all");

  // Edits werden lokal gehalten, einzeln gespeichert
  const [edits, setEdits] = useState<Record<string, Partial<LedgerAccount>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/buchhaltung/accounts");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setAccounts(json.data ?? []);
      setEdits({});
    } catch {
      toast.error("Kontenrahmen konnte nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setEdit = (id: string, key: keyof LedgerAccount, value: string | null) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: value },
    }));
  };

  const handleSave = async (account: LedgerAccount) => {
    const edit = edits[account.id];
    if (!edit) return;
    setSavingId(account.id);
    try {
      const res = await fetch(`/api/buchhaltung/accounts/${account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Speichern fehlgeschlagen");
      }
      // Update lokal
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, ...edit } : a)),
      );
      setEdits((prev) => {
        const { [account.id]: _, ...rest } = prev;
        void _;
        return rest;
      });
      toast.success(`Konto ${account.accountNumber} aktualisiert`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSavingId(null);
    }
  };

  const effective = (acc: LedgerAccount, key: keyof LedgerAccount): unknown => {
    return edits[acc.id]?.[key] !== undefined
      ? edits[acc.id][key]
      : acc[key];
  };

  const filtered = accounts.filter((a) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !a.accountNumber.includes(q) &&
        !a.name.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (filter === "unmarked") {
      return !a.balanceSheetSection;
    }
    if (filter === "gewst") {
      return !!a.gewStAddBackKey;
    }
    if (filter === "tax") {
      return !!a.taxKey;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Konten-Markierung HGB-Compliance"
        description="LedgerAccount-Felder für Bilanz, GewSt und Auto-Posting pflegen"
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Compliance-Felder</AlertTitle>
        <AlertDescription>
          <ul className="list-disc pl-5 space-y-1 mt-2 text-sm">
            <li>
              <strong>Bilanz-Section</strong>: bestimmt die Bilanz-Zuordnung
              (HGB §266). Wird beim Backfill aus SKR-Range gesetzt, manuell
              überschreibbar.
            </li>
            <li>
              <strong>GewSt-Schlüssel</strong>: markiert Pacht-/Zins-/Lizenz-
              Konten für die Hinzurechnung §8 GewStG.
            </li>
            <li>
              <strong>DATEV-Steuerschlüssel</strong>: Vorbelegung für Auto-Posting
              (z.B. &quot;9&quot; = 19% USt).
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Konten</CardTitle>
          <CardDescription>
            {accounts.length} Konten gesamt — {filtered.length} angezeigt
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Konto-Nr oder Name suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Konten</SelectItem>
                <SelectItem value="unmarked">
                  Ohne Bilanz-Section
                </SelectItem>
                <SelectItem value="gewst">Mit GewSt-Markierung</SelectItem>
                <SelectItem value="tax">Mit Steuerschlüssel</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Aktualisieren
            </Button>
          </div>

          {isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Keine Konten gefunden.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Konto</TableHead>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead className="w-[180px]">Bilanz-Section</TableHead>
                  <TableHead className="w-[180px]">GewSt-Schlüssel</TableHead>
                  <TableHead className="w-[100px]">Steuer-Key</TableHead>
                  <TableHead className="w-[100px] text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((acc) => {
                  const hasEdit = !!edits[acc.id];
                  const bsValue = (effective(acc, "balanceSheetSection") as string | null) ?? NONE_VALUE;
                  const gwValue = (effective(acc, "gewStAddBackKey") as string | null) ?? NONE_VALUE;
                  const tkValue = (effective(acc, "taxKey") as string | null) ?? "";

                  return (
                    <TableRow key={acc.id}>
                      <TableCell className="font-mono font-semibold">
                        {acc.accountNumber}
                      </TableCell>
                      <TableCell>
                        <div>{acc.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {acc.category}
                          {acc.isSystem && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              System
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={bsValue}
                          onValueChange={(v) =>
                            setEdit(
                              acc.id,
                              "balanceSheetSection",
                              v === NONE_VALUE ? null : v,
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_VALUE}>— keine —</SelectItem>
                            {BALANCE_SECTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={gwValue}
                          onValueChange={(v) =>
                            setEdit(
                              acc.id,
                              "gewStAddBackKey",
                              v === NONE_VALUE ? null : v,
                            )
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_VALUE}>— keine —</SelectItem>
                            {GEWST_KEYS.map((k) => (
                              <SelectItem key={k.value} value={k.value}>
                                {k.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={tkValue}
                          onChange={(e) =>
                            setEdit(acc.id, "taxKey", e.target.value || null)
                          }
                          placeholder="z.B. 9"
                          className="h-8 font-mono text-xs"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {hasEdit ? (
                          <Button
                            size="sm"
                            onClick={() => void handleSave(acc)}
                            disabled={savingId === acc.id}
                          >
                            {savingId === acc.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}
                          </Button>
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-muted-foreground/40 ml-auto" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
