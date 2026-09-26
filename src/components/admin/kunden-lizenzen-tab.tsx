"use client";

/**
 * Customer overview for the platform operator (2026-09): booked tariff,
 * usage against limits and licence state per customer — counts only, no
 * content. Replaces the former tenant limits, which were stored but never
 * enforced.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Settings2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import { formatDate } from "@/lib/format";
import { ZAEHLER, type Zaehler } from "@/lib/lizenz/lizenz";

interface Zeile {
  zaehler: Zaehler;
  verbrauch: number;
  grenze: number | null;
  ueber: boolean;
}

interface Kunde {
  id: string;
  name: string;
  slug: string;
  status: string;
  tarif: { id: string; name: string } | null;
  abweichung: Partial<Record<Zaehler, number | null>> | null;
  zeilen: Zeile[];
  ueberschritten: Zaehler[];
  karenzBis: string | null;
  gesperrt: boolean;
}

const OHNE = "__none__";

export function KundenLizenzenTab() {
  const t = useTranslations("admin.kundenLizenzen");
  const queryClient = useQueryClient();
  const [bearbeitet, setBearbeitet] = useState<{ kunde: Kunde; tarifId: string; abweichung: Record<Zaehler, string> } | null>(null);

  const kunden = useQuery({
    queryKey: ["kunden-lizenzen"],
    queryFn: async (): Promise<{ data: Kunde[] }> => {
      const res = await fetch("/api/superadmin/kunden-lizenzen");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
  const tarife = useQuery({
    queryKey: ["tarife"],
    queryFn: async (): Promise<{ data: { id: string; name: string }[] }> => {
      const res = await fetch("/api/superadmin/tarife");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const speichern = useMutation({
    mutationFn: async () => {
      if (!bearbeitet) return;
      const abweichung = Object.fromEntries(
        ZAEHLER.filter((z) => bearbeitet.abweichung[z].trim() !== "").map((z) => [
          z,
          bearbeitet.abweichung[z].trim() === "-" ? null : Number(bearbeitet.abweichung[z]),
        ]),
      );
      const res = await fetch(`/api/superadmin/kunden-lizenzen/${bearbeitet.kunde.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tarifId: bearbeitet.tarifId === OHNE ? null : bearbeitet.tarifId,
          abweichung: Object.keys(abweichung).length > 0 ? abweichung : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || t("saveError"));
    },
    onSuccess: () => {
      toast.success(t("saved"));
      setBearbeitet(null);
      queryClient.invalidateQueries({ queryKey: ["kunden-lizenzen"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const verbrauchText = (z: Zeile) =>
    z.zaehler === "speicherMb"
      ? `${(z.verbrauch / 1024).toFixed(1).replace(".", ",")}${z.grenze === null ? "" : ` / ${(z.grenze / 1024).toFixed(0)}`} GB`
      : `${z.verbrauch}${z.grenze === null ? "" : ` / ${z.grenze}`}`;

  const lage = (k: Kunde) =>
    k.gesperrt ? (
      <Badge variant="destructive">{t("stateLocked")}</Badge>
    ) : k.ueberschritten.length > 0 ? (
      <Badge variant="outline" className="border-amber-500 text-amber-600">
        {t("stateGrace", { datum: formatDate(new Date(k.karenzBis!)) })}
      </Badge>
    ) : k.tarif ? (
      <Badge variant="secondary">{t("stateOk")}</Badge>
    ) : (
      <Badge variant="outline">{t("stateNoTariff")}</Badge>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          rows={kunden.data?.data ?? []}
          getRowId={(k) => k.id}
          isLoading={kunden.isLoading}
          searchPlaceholder={t("search")}
          empty={{ title: t("empty") }}
          columns={[
            {
              id: "name",
              header: t("customer"),
              cell: (k) => (
                <>
                  {k.name}
                  <span className="block text-xs text-muted-foreground">{k.slug}</span>
                </>
              ),
              sortValue: (k) => k.name,
              searchValue: (k) => `${k.name} ${k.slug}`,
            },
            {
              id: "tarif",
              header: t("tariff"),
              cell: (k) => k.tarif?.name ?? <span className="text-muted-foreground">{t("unlimited")}</span>,
              sortValue: (k) => k.tarif?.name,
            },
            ...ZAEHLER.map((z) => ({
              id: z,
              header: t(`counters.${z}`),
              align: "right" as const,
              cell: (k: Kunde) => {
                const zeile = k.zeilen.find((x) => x.zaehler === z)!;
                return (
                  <span className={`tabular-nums ${zeile.ueber ? "font-semibold text-destructive" : ""}`}>
                    {verbrauchText(zeile)}
                  </span>
                );
              },
              sortValue: (k: Kunde) => k.zeilen.find((x) => x.zaehler === z)?.verbrauch,
            })),
            { id: "lage", header: t("state"), cell: lage, sortValue: (k) => (k.gesperrt ? 2 : k.ueberschritten.length > 0 ? 1 : 0) },
            {
              id: "aktion",
              header: "",
              align: "right",
              cell: (k) => (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setBearbeitet({
                      kunde: k,
                      tarifId: k.tarif?.id ?? OHNE,
                      abweichung: Object.fromEntries(
                        ZAEHLER.map((z) => {
                          const v = k.abweichung?.[z];
                          return [z, v === undefined ? "" : v === null ? "-" : String(v)];
                        }),
                      ) as Record<Zaehler, string>,
                    })
                  }
                >
                  <Settings2 className="mr-1 h-3 w-3" />
                  {t("edit")}
                </Button>
              ),
            },
          ]}
        />
      </CardContent>

      <Dialog open={!!bearbeitet} onOpenChange={(offen) => !offen && setBearbeitet(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("editTitle", { name: bearbeitet?.kunde.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("editDescription")}</DialogDescription>
          </DialogHeader>
          {bearbeitet && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="kl-tarif">{t("tariff")}</Label>
                <Select value={bearbeitet.tarifId} onValueChange={(v) => setBearbeitet({ ...bearbeitet, tarifId: v })}>
                  <SelectTrigger id="kl-tarif">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OHNE}>{t("noTariff")}</SelectItem>
                    {(tarife.data?.data ?? []).map((tr) => (
                      <SelectItem key={tr.id} value={tr.id}>
                        {tr.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm font-medium">{t("exception")}</p>
              <div className="grid grid-cols-2 gap-3">
                {ZAEHLER.map((z) => (
                  <div key={z} className="space-y-1">
                    <Label htmlFor={`kl-${z}`} className="text-xs">
                      {t(`counters.${z}`)}
                    </Label>
                    <Input
                      id={`kl-${z}`}
                      placeholder={t("fromTariff")}
                      value={bearbeitet.abweichung[z]}
                      onChange={(e) =>
                        setBearbeitet({ ...bearbeitet, abweichung: { ...bearbeitet.abweichung, [z]: e.target.value } })
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("exceptionHint")}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBearbeitet(null)}>
              {t("cancel")}
            </Button>
            <Button onClick={() => speichern.mutate()} disabled={speichern.isPending}>
              {speichern.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
