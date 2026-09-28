"use client";

/**
 * Support column of the platform operator's tenant list (2026-09):
 * "Betreten" while the customer has granted access, otherwise an
 * emergency access with a mandatory reason.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AktiverZugriff {
  tenantId: string;
  art: "FREIGABE" | "NOTFALL";
  gueltigBis: string;
}

const MIN_BEGRUENDUNG = 20;

function useAktiveZugriffe() {
  return useQuery({
    queryKey: ["superadmin-support"],
    queryFn: async (): Promise<AktiverZugriff[]> => {
      const res = await fetch("/api/superadmin/support");
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()).zugriffe;
    },
    staleTime: 30_000,
  });
}

export function SupportAktion({ tenantId, tenantName, eigener }: { tenantId: string; tenantName: string; eigener: boolean }) {
  const t = useTranslations("support");
  const { data } = useAktiveZugriffe();
  const [notfallOffen, setNotfallOffen] = useState(false);
  const [begruendung, setBegruendung] = useState("");

  const betreten = useMutation({
    mutationFn: async (notfall?: { begruendung: string }) => {
      const res = await fetch("/api/superadmin/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, ...(notfall && { notfall }) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? t("betretenFehler"));
    },
    onSuccess: () => {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- entering a tenant swaps all data: full reload
      window.location.href = "/dashboard";
    },
    onError: (e) => toast.error(e.message),
  });

  if (eigener) return <span className="text-muted-foreground">—</span>;

  const zugriff = data?.find((z) => z.tenantId === tenantId);
  if (zugriff) {
    const bis = new Date(zugriff.gueltigBis).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
    return (
      <div className="flex items-center gap-2">
        <Badge variant={zugriff.art === "NOTFALL" ? "destructive" : "secondary"} className="whitespace-nowrap">
          {t(zugriff.art === "NOTFALL" ? "notfallBis" : "freigabeBis", { bis })}
        </Badge>
        <Button size="sm" variant="outline" disabled={betreten.isPending} onClick={() => betreten.mutate(undefined)}>
          <LogIn className="h-4 w-4 mr-1" />
          {t("betreten")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setNotfallOffen(true)}>
        <AlertTriangle className="h-4 w-4 mr-1" />
        {t("notfall")}
      </Button>
      <Dialog open={notfallOffen} onOpenChange={setNotfallOffen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("notfallTitel", { mandant: tenantName })}</DialogTitle>
            <DialogDescription>{t("notfallBeschreibung")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`notfall-${tenantId}`}>{t("begruendung")}</Label>
            <Textarea
              id={`notfall-${tenantId}`}
              value={begruendung}
              onChange={(e) => setBegruendung(e.target.value)}
              placeholder={t("begruendungPlatzhalter")}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{t("begruendungHinweis", { min: MIN_BEGRUENDUNG })}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotfallOffen(false)}>
              {t("abbrechen")}
            </Button>
            <Button
              variant="destructive"
              disabled={begruendung.trim().length < MIN_BEGRUENDUNG || betreten.isPending}
              onClick={() => betreten.mutate({ begruendung: begruendung.trim() })}
            >
              {t("notfallOeffnen")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
