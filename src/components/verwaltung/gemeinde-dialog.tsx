"use client";

/**
 * Create/edit dialog for municipalities. Used by /verwaltung/gemeinden and by
 * municipality pickers ("Aus der Auswahl anlegen").
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface GemeindeDaten {
  id: string;
  name: string;
  officialKey: string | null;
  state: string | null;
}

const LEER = { name: "", officialKey: "", state: "" };

export function GemeindeDialog({
  open,
  onOpenChange,
  gemeinde,
  vorbelegung,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set = edit this municipality; null/undefined = create. */
  gemeinde?: GemeindeDaten | null;
  /** Name prefill for a new municipality. */
  vorbelegung?: string;
  onSaved?: (gemeinde: { id: string; name: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(LEER);

  useEffect(() => {
    if (!open) return;
    setForm(
      gemeinde
        ? { name: gemeinde.name, officialKey: gemeinde.officialKey ?? "", state: gemeinde.state ?? "" }
        : { ...LEER, name: vorbelegung ?? "" },
    );
  }, [open, gemeinde, vorbelegung]);

  const speichern = useMutation({
    mutationFn: async (input: typeof form) => {
      const res = await fetch(gemeinde ? `/api/municipalities/${gemeinde.id}` : "/api/municipalities", {
        method: gemeinde ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: input.name,
          officialKey: input.officialKey || null,
          state: input.state || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // apiError puts the message into `error`
        throw new Error(err.error ?? err.message ?? "Speichern fehlgeschlagen");
      }
      return res.json();
    },
    onSuccess: (antwort) => {
      queryClient.invalidateQueries({ queryKey: ["/api/municipalities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/regulatory/capacity-by-municipality"] });
      toast.success(gemeinde ? "Gemeinde gespeichert" : "Gemeinde angelegt");
      const daten = antwort?.data ?? antwort;
      onOpenChange(false);
      if (daten?.id) onSaved?.({ id: daten.id, name: daten.name ?? form.name });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{gemeinde ? "Gemeinde bearbeiten" : "Gemeinde anlegen"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="m-name">Name</Label>
            <Input
              id="m-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Musterdorf"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-key">Amtlicher Gemeindeschlüssel</Label>
            <Input
              id="m-key"
              value={form.officialKey}
              onChange={(e) => setForm({ ...form, officialKey: e.target.value })}
              placeholder="03456001"
              inputMode="numeric"
            />
            <p className="text-xs text-muted-foreground">
              Acht Ziffern. Optional — aber der Steuerberater ordnet darüber
              zu, und es unterscheidet die fünfzehn Gemeinden namens
              &bdquo;Neustadt&ldquo;.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-state">Bundesland</Label>
            <Input
              id="m-state"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              placeholder="Niedersachsen"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={() => speichern.mutate(form)}
            disabled={!form.name.trim() || speichern.isPending}
          >
            {gemeinde ? "Speichern" : "Anlegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
