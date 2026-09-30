"use client";

/**
 * The customer's control over platform support (2026-09): grant access for
 * a chosen time, end it at once, see every grant and emergency access and
 * what the support did. Reads /api/support-zugriff (settings:read);
 * granting and ending need settings:update.
 */

import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LifeBuoy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { useConfirm } from "@/components/ui/use-confirm";
import type { Laufzeit } from "@/lib/support/regeln";

interface Eintrag {
  id: string;
  art: "FREIGABE" | "NOTFALL";
  erstellt: string;
  gueltigBis: string;
  beendetAm: string | null;
  begruendung: string | null;
  erteiltVon: string | null;
  beendetVon: string | null;
}

interface Antwort {
  aktiv: { id: string; art: "FREIGABE" | "NOTFALL"; gueltigBis: string; begruendung: string | null } | null;
  verlauf: Eintrag[];
  protokoll: { id: string; action: string; entityType: string; entityId: string; newValues: { recht?: string } | null; createdAt: string }[];
}

const SCHLUESSEL = ["support-zugriff"];
const LAUFZEITEN: Laufzeit[] = ["1h", "1d", "7d"];

const zeit = (iso: string) => new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

export function SupportFreigabe({ darfAendern }: { darfAendern: boolean }) {
  const t = useTranslations("support");
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();

  const { data, isLoading, error } = useQuery({
    queryKey: SCHLUESSEL,
    queryFn: async (): Promise<Antwort> => {
      const res = await fetch("/api/support-zugriff");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 30_000,
  });

  const aktualisieren = () => queryClient.invalidateQueries({ queryKey: SCHLUESSEL });

  const erteilen = useMutation({
    mutationFn: async (laufzeit: Laufzeit) => {
      const res = await fetch("/api/support-zugriff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ laufzeit }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? t("erteilenFehler"));
    },
    onSuccess: () => {
      aktualisieren();
      toast.success(t("erteilt"));
    },
    onError: (e) => toast.error(e.message),
  });

  const beenden = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/support-zugriff", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? t("beendenFehler"));
    },
    onSuccess: () => {
      aktualisieren();
      toast.success(t("beendet"));
    },
    onError: (e) => toast.error(e.message),
  });

  const fragenUndBeenden = async () => {
    if (await confirm({ title: t("beendenTitel"), description: t("beendenBeschreibung"), confirmLabel: t("beenden"), variant: "destructive" })) {
      beenden.mutate();
    }
  };

  const aktiv = data?.aktiv;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5" />
          {t("titel")}
        </CardTitle>
        <CardDescription>{t("beschreibung")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <p className="text-sm text-destructive">{t("ladeFehler")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {aktiv ? (
                <Badge variant={aktiv.art === "NOTFALL" ? "destructive" : "default"} className="gap-1">
                  {aktiv.art === "NOTFALL" ? <AlertTriangle className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                  {t(aktiv.art === "NOTFALL" ? "aktivNotfall" : "aktivFreigabe", { bis: zeit(aktiv.gueltigBis) })}
                </Badge>
              ) : (
                !isLoading && <Badge variant="secondary">{t("keinZugriff")}</Badge>
              )}
              {darfAendern && (
                <>
                  {LAUFZEITEN.map((l) => (
                    <Button key={l} size="sm" variant="outline" disabled={erteilen.isPending} onClick={() => erteilen.mutate(l)}>
                      {t(`freigeben.${l}`)}
                    </Button>
                  ))}
                  {aktiv && (
                    <Button size="sm" variant="destructive" disabled={beenden.isPending} onClick={fragenUndBeenden}>
                      {t("beenden")}
                    </Button>
                  )}
                </>
              )}
            </div>
            {aktiv?.art === "NOTFALL" && aktiv.begruendung && (
              <p className="text-sm">
                <span className="font-medium">{t("begruendung")}:</span> {aktiv.begruendung}
              </p>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("verlauf")}</h3>
              <DataTable
                rows={data?.verlauf ?? []}
                getRowId={(v) => v.id}
                isLoading={isLoading}
                pageSize={10}
                empty={{ icon: ShieldCheck, title: t("verlaufLeer") }}
                columns={[
                  {
                    id: "art",
                    header: t("art"),
                    cell: (v) => (
                      <Badge variant={v.art === "NOTFALL" ? "destructive" : "secondary"}>{t(`arten.${v.art}`)}</Badge>
                    ),
                  },
                  { id: "erstellt", header: t("seit"), cell: (v) => zeit(v.erstellt), sortValue: (v) => new Date(v.erstellt) },
                  {
                    id: "ende",
                    header: t("bis"),
                    cell: (v) => (v.beendetAm ? t("vorzeitigBeendet", { am: zeit(v.beendetAm) }) : zeit(v.gueltigBis)),
                  },
                  {
                    id: "wer",
                    header: t("wer"),
                    cell: (v) => (v.art === "NOTFALL" ? v.begruendung : v.erteiltVon) ?? "—",
                  },
                ]}
              />
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("protokoll")}</h3>
              <DataTable
                rows={data?.protokoll ?? []}
                getRowId={(p) => p.id}
                isLoading={isLoading}
                pageSize={10}
                empty={{ icon: LifeBuoy, title: t("protokollLeer") }}
                columns={[
                  { id: "wann", header: t("wann"), cell: (p) => zeit(p.createdAt), sortValue: (p) => new Date(p.createdAt) },
                  { id: "aktion", header: t("aktion"), cell: (p) => t.has(`aktionen.${p.action}`) ? t(`aktionen.${p.action}`) : p.action },
                  { id: "objekt", header: t("objekt"), cell: (p) => p.newValues?.recht ?? p.entityType },
                ]}
              />
            </div>
          </>
        )}
      </CardContent>
      {confirmDialog}
    </Card>
  );
}
