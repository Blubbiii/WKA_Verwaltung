"use client";

/**
 * P23: Storno-Audit-Trail (GoBD-Nachweis).
 *
 * Listet alle Storno-Buchungen (JournalEntries mit reversesJournalEntryId != null)
 * mit Verweis auf Original-Beleg, User, Begründung. Für Betriebsprüfung.
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Info, RefreshCw, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LOCALE_DE } from "@/lib/format";

interface StornoEntry {
  id: string;
  entryDate: string;
  description: string;
  reference: string | null;
  reversalReason: string | null;
  createdBy: { firstName: string | null; lastName: string | null };
  reverses: {
    id: string;
    entryDate: string;
    description: string;
    reference: string | null;
  } | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE_DE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function userName(u: StornoEntry["createdBy"]): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
}

export default function StornoAuditPage() {
  const [data, setData] = useState<StornoEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/journal-entries?year=${year}`);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      // Filter: nur Storno-Buchungen (reversesJournalEntryId != null)
      const entries: Array<{
        id: string;
        entryDate: string;
        description: string;
        reference: string | null;
        reversalReason?: string | null;
        reversesJournalEntryId?: string | null;
        createdBy?: { firstName: string | null; lastName: string | null };
      }> = json.data ?? [];

      const stornos: StornoEntry[] = [];
      for (const e of entries) {
        if (!e.reversesJournalEntryId) continue;
        // Original lesen via separater API
        let reverses = null;
        try {
          const origRes = await fetch(`/api/journal-entries/${e.reversesJournalEntryId}`);
          if (origRes.ok) {
            const origJson = await origRes.json();
            reverses = {
              id: origJson.id,
              entryDate: origJson.entryDate,
              description: origJson.description,
              reference: origJson.reference,
            };
          }
        } catch {
          // ignore — Original ggf. nicht lesbar
        }
        stornos.push({
          id: e.id,
          entryDate: e.entryDate,
          description: e.description,
          reference: e.reference,
          reversalReason: e.reversalReason ?? null,
          createdBy: e.createdBy ?? { firstName: null, lastName: null },
          reverses,
        });
      }
      setData(stornos);
    } catch {
      toast.error("Storno-Liste konnte nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Storno-Audit-Trail"
          description="GoBD-Nachweis aller Generalumkehrungen (POSTED-Journal-Stornos)"
        />
      </div>

      <Alert className="print:hidden">
        <Info className="h-4 w-4" />
        <AlertDescription>
          Liste aller Storno-Buchungen mit Verweis auf das Original. Original-
          Buchung bleibt unverändert (GoBD §146 Abs. 4 Unveränderbarkeit), Storno
          wird als POSTED-Spiegelbuchung mit getauschten Soll/Haben angelegt.
        </AlertDescription>
      </Alert>

      <Card className="print:hidden">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Wirtschaftsjahr</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-32"
            />
          </div>
          <Button onClick={() => void load()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Aktualisieren
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            Drucken
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Stornos in {year}
          </CardTitle>
          <CardDescription>{data.length} Storno-Buchung(en)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Keine Storno-Buchungen im Jahr {year}.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Storno-Datum</TableHead>
                  <TableHead>Storno-Beleg</TableHead>
                  <TableHead>Original-Datum</TableHead>
                  <TableHead>Original-Beleg</TableHead>
                  <TableHead>Original-Text</TableHead>
                  <TableHead>Storniert durch</TableHead>
                  <TableHead>Begründung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">
                      {formatDate(s.entryDate)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.reference ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.reverses ? formatDate(s.reverses.entryDate) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.reverses?.reference ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm max-w-xs truncate">
                      {s.reverses?.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {userName(s.createdBy)}
                    </TableCell>
                    <TableCell className="text-sm max-w-md truncate" title={s.reversalReason ?? undefined}>
                      {s.reversalReason ?? (
                        <Badge variant="outline" className="text-xs">
                          Keine Begründung
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
