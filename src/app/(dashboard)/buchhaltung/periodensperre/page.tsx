"use client";

/**
 * P21: Period-Lock-Manager (Buchhaltungs-Periodensperre).
 *
 * GoBD §146 AO — Sperrt Buchungsmonate für nachträgliche Änderungen.
 * Nutzt /api/buchhaltung/period-locks Endpoints (P9).
 */

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Lock, Unlock, ShieldAlert, Loader2, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LOCALE_DE } from "@/lib/format";

interface PeriodLock {
  id: string;
  periodYear: number;
  periodMonth: number;
  lockedAt: string;
  unlockedAt: string | null;
  reason: string | null;
  lockedBy: { firstName: string | null; lastName: string | null; email: string };
  unlockedBy: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
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

function formatPeriod(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE_DE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function userName(u: PeriodLock["lockedBy"] | PeriodLock["unlockedBy"]): string {
  if (!u) return "—";
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email;
}

export default function PeriodLockManagerPage() {
  const [locks, setLocks] = useState<PeriodLock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [includeUnlocked, setIncludeUnlocked] = useState(false);

  // Lock-Dialog State
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const now = new Date();
  const [newYear, setNewYear] = useState(now.getFullYear());
  const [newMonth, setNewMonth] = useState(now.getMonth() + 1);
  const [newReason, setNewReason] = useState("");
  const [isLocking, setIsLocking] = useState(false);

  // Unlock-Dialog State
  const [unlockLockId, setUnlockLockId] = useState<string | null>(null);
  const [unlockReason, setUnlockReason] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/buchhaltung/period-locks${includeUnlocked ? "?includeUnlocked=true" : ""}`,
      );
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setLocks(json.data ?? []);
    } catch {
      toast.error("Periodensperren konnten nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeUnlocked]);

  const handleLock = async () => {
    setIsLocking(true);
    try {
      const res = await fetch("/api/buchhaltung/period-locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodYear: newYear,
          periodMonth: newMonth,
          reason: newReason || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Fehler beim Sperren");
      }
      toast.success(`${formatPeriod(newYear, newMonth)} gesperrt`);
      setLockDialogOpen(false);
      setNewReason("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sperren fehlgeschlagen");
    } finally {
      setIsLocking(false);
    }
  };

  const handleUnlock = async () => {
    if (!unlockLockId) return;
    setIsUnlocking(true);
    try {
      const res = await fetch(`/api/buchhaltung/period-locks/${unlockLockId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: unlockReason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Fehler beim Entsperren");
      }
      toast.success("Periode entsperrt — Audit-Trail wurde erstellt");
      setUnlockLockId(null);
      setUnlockReason("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Entsperren fehlgeschlagen");
    } finally {
      setIsUnlocking(false);
    }
  };

  const years = Array.from(
    { length: 6 },
    (_, i) => now.getFullYear() - 4 + i,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Periodensperre"
        description="GoBD §146 AO — Abgeschlossene Buchungsmonate vor nachträglichen Änderungen schützen"
      />

      <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <ShieldAlert className="h-5 w-5" />
            GoBD-Hinweis
          </CardTitle>
          <CardDescription className="text-amber-900/80 dark:text-amber-200/80">
            Gesperrte Perioden verhindern jegliche Buchungsänderung (neuer
            JournalEntry, DRAFT→POSTED, Storno-Buchung in der Periode).
            Stornos werden in die aktuelle offene Periode gebucht.
            Unlock ist nachvollziehbar (Audit-Trail).
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={includeUnlocked ? "default" : "outline"}
            size="sm"
            onClick={() => setIncludeUnlocked(!includeUnlocked)}
          >
            {includeUnlocked ? "Nur aktive zeigen" : "Entsperrte einbeziehen"}
          </Button>
        </div>

        <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Periode sperren
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Periode sperren</DialogTitle>
              <DialogDescription>
                Nach Sperren können keine Buchungen mehr in den gewählten Monat
                gebucht werden. Unlock ist möglich, hinterlässt aber einen
                Audit-Eintrag.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Jahr</Label>
                  <Select
                    value={String(newYear)}
                    onValueChange={(v) => setNewYear(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Monat</Label>
                  <Select
                    value={String(newMonth)}
                    onValueChange={(v) => setNewMonth(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((m, idx) => (
                        <SelectItem key={idx + 1} value={String(idx + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Begründung (optional)</Label>
                <Textarea
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder='z.B. "Monatsabschluss"'
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setLockDialogOpen(false)}
                disabled={isLocking}
              >
                Abbrechen
              </Button>
              <Button onClick={handleLock} disabled={isLocking}>
                {isLocking ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="mr-2 h-4 w-4" />
                )}
                Sperren
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : locks.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Keine gesperrten Perioden vorhanden.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gesperrt am / von</TableHead>
                  <TableHead>Entsperrt am / von</TableHead>
                  <TableHead>Begründung</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locks.map((l) => {
                  const isLocked = !l.unlockedAt;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        {formatPeriod(l.periodYear, l.periodMonth)}
                      </TableCell>
                      <TableCell>
                        {isLocked ? (
                          <Badge variant="default" className="gap-1">
                            <Lock className="h-3 w-3" />
                            Gesperrt
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Unlock className="h-3 w-3" />
                            Entsperrt
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{formatDate(l.lockedAt)}</div>
                        <div className="text-muted-foreground">
                          {userName(l.lockedBy)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {l.unlockedAt ? (
                          <>
                            <div>{formatDate(l.unlockedAt)}</div>
                            <div className="text-muted-foreground">
                              {userName(l.unlockedBy)}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className="max-w-xs truncate text-sm"
                        title={l.reason ?? undefined}
                      >
                        {l.reason ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {isLocked && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUnlockLockId(l.id)}
                          >
                            <Unlock className="mr-2 h-4 w-4" />
                            Entsperren
                          </Button>
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

      {/* Unlock-Dialog */}
      <Dialog
        open={unlockLockId !== null}
        onOpenChange={(o) => !o && setUnlockLockId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Periode entsperren?</DialogTitle>
            <DialogDescription>
              Begründung ist Pflicht — sie wird im Audit-Trail festgehalten.
              Nach dem Entsperren können wieder Buchungen in der Periode angelegt
              werden.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Label>Begründung *</Label>
            <Textarea
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              placeholder='z.B. "Korrekturbuchung gemäß StB-Anweisung vom 15.06."'
              rows={4}
              className="mt-2"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnlockLockId(null)}
              disabled={isUnlocking}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleUnlock}
              disabled={isUnlocking || unlockReason.trim().length < 3}
            >
              {isUnlocking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlock className="mr-2 h-4 w-4" />
              )}
              Entsperren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
