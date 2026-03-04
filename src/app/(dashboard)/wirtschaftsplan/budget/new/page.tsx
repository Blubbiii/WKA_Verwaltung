"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR + 1 - i);

interface ExistingBudget {
  id: string;
  year: number;
  name: string;
  status: string;
}

export default function NewBudgetPage() {
  const router = useRouter();
  const { data: existingBudgets } = useSWR<ExistingBudget[]>("/api/wirtschaftsplan/budgets", fetcher);

  const [year, setYear] = useState(CURRENT_YEAR + 1);
  const [name, setName] = useState(`Wirtschaftsplan ${CURRENT_YEAR + 1}`);
  const [notes, setNotes] = useState("");
  const [duplicateFromId, setDuplicateFromId] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Bitte einen Namen eingeben");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { year, name: name.trim(), notes: notes.trim() || null };
      if (duplicateFromId !== "none") body.duplicateFromId = duplicateFromId;

      const res = await fetch("/api/wirtschaftsplan/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Fehler");
      }

      const budget = await res.json();
      toast.success("Budgetplan erstellt");
      router.push(`/wirtschaftsplan/budget/${budget.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Erstellen");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Neuer Budgetplan</h1>
          <p className="text-muted-foreground">Jahres-Wirtschaftsplan anlegen</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plan-Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Jahr</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => {
                  const y = Number(v);
                  setYear(y);
                  setName(`Wirtschaftsplan ${y}`);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Wirtschaftsplan 2027"
              />
            </div>
          </div>

          {existingBudgets && existingBudgets.length > 0 && (
            <div className="space-y-2">
              <Label>Aus Vorjahr kopieren (optional)</Label>
              <Select value={duplicateFromId} onValueChange={setDuplicateFromId}>
                <SelectTrigger>
                  <SelectValue placeholder="Kein Vorjahr" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Leer beginnen</SelectItem>
                  {existingBudgets.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.year} — {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Alle Budgetzeilen des Vorjahresplans werden übernommen.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notizen (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Annahmen, Rahmenbedingungen, ..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={handleCreate} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Budgetplan erstellen
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
